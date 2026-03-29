from __future__ import annotations

import asyncio
import json
from collections import deque
from dataclasses import dataclass
from time import time
from typing import Any

from src.run_persistence import RunPersistence, resolve_database_url


@dataclass
class RunSubmission:
    run_id: str
    message: str
    thread_id: str
    last_event_id: str | None
    last_seq: int | None


class RunSupervisor:
    """Always-on runtime supervisor for detached Arc runs."""

    def __init__(self, *, history_limit: int = 1500) -> None:
        self._history_limit = history_limit
        self._queue: asyncio.Queue[RunSubmission] = asyncio.Queue()
        self._supervisor_task: asyncio.Task[None] | None = None
        self._run_tasks: dict[str, asyncio.Task[None]] = {}
        self._run_history: dict[str, deque[str]] = {}
        self._subscribers: dict[str, set[asyncio.Queue[str | None]]] = {}
        self._run_started_at: dict[str, float] = {}
        self._lock = asyncio.Lock()
        self._persistence = RunPersistence(resolve_database_url())
        self._recovered_run_count = 0

    async def start(self) -> None:
        if self._supervisor_task and not self._supervisor_task.done():
            return
        if self._persistence.enabled:
            await asyncio.to_thread(self._persistence.setup)
            recovered = await asyncio.to_thread(self._persistence.list_recoverable_runs)
            for row in recovered:
                run_id = str(row.get("run_id", "")).strip()
                message = str(row.get("message", "")).strip()
                thread_id = str(row.get("thread_id", "")).strip()
                if not run_id or not message or not thread_id:
                    continue
                await self._queue.put(
                    RunSubmission(
                        run_id=run_id,
                        message=message,
                        thread_id=thread_id,
                        last_event_id=row.get("last_event_id"),
                        last_seq=row.get("last_seq"),
                    )
                )
                self._recovered_run_count += 1
        self._supervisor_task = asyncio.create_task(self._supervisor_loop())

    async def stop(self) -> None:
        if self._supervisor_task is not None:
            self._supervisor_task.cancel()
            try:
                await self._supervisor_task
            except asyncio.CancelledError:
                pass
            self._supervisor_task = None

        for task in list(self._run_tasks.values()):
            task.cancel()
        for task in list(self._run_tasks.values()):
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass

        self._run_tasks.clear()

    async def submit(self, submission: RunSubmission) -> asyncio.Queue[str | None]:
        """Queue a run and return a subscriber queue for streaming."""
        await self.start()
        subscriber: asyncio.Queue[str | None] = asyncio.Queue()
        if self._persistence.enabled:
            await asyncio.to_thread(
                self._persistence.create_run,
                run_id=submission.run_id,
                thread_id=submission.thread_id,
                message=submission.message,
            )
        async with self._lock:
            self._subscribers.setdefault(submission.run_id, set()).add(subscriber)
            self._run_history.setdefault(
                submission.run_id, deque(maxlen=self._history_limit)
            )
            self._run_started_at[submission.run_id] = time()
        await self._queue.put(submission)
        return subscriber

    async def attach(
        self,
        run_id: str,
        *,
        last_event_id: str | None = None,
        last_seq: int | None = None,
    ) -> tuple[asyncio.Queue[str | None], dict[str, Any] | None]:
        subscriber: asyncio.Queue[str | None] = asyncio.Queue()
        async with self._lock:
            self._subscribers.setdefault(run_id, set()).add(subscriber)
            self._run_history.setdefault(run_id, deque(maxlen=self._history_limit))

        run_meta: dict[str, Any] | None = None
        replay_events: list[str] = []
        if self._persistence.enabled:
            run_meta = await asyncio.to_thread(self._persistence.get_run, run_id)
            replay_events = await asyncio.to_thread(
                self._persistence.list_events_after,
                run_id=run_id,
                last_event_id=last_event_id,
                last_seq=last_seq,
            )
        else:
            async with self._lock:
                replay_events = list(self._run_history.get(run_id, []))

        for event in replay_events:
            subscriber.put_nowait(event)

        is_active = run_id in self._run_tasks and not self._run_tasks[run_id].done()
        if run_meta is not None and str(run_meta.get("status", "")).lower() in {
            "completed",
            "error",
        }:
            subscriber.put_nowait(None)
        elif not is_active and not replay_events:
            # Unknown run id: close subscriber immediately.
            subscriber.put_nowait(None)

        return subscriber, run_meta

    async def unsubscribe(self, run_id: str, queue: asyncio.Queue[str | None]) -> None:
        async with self._lock:
            listeners = self._subscribers.get(run_id)
            if listeners is None:
                return
            listeners.discard(queue)
            if not listeners:
                self._subscribers.pop(run_id, None)

    async def _supervisor_loop(self) -> None:
        while True:
            submission = await self._queue.get()
            if submission.run_id in self._run_tasks and not self._run_tasks[
                submission.run_id
            ].done():
                continue
            task = asyncio.create_task(self._run_submission(submission))
            self._run_tasks[submission.run_id] = task

    async def _run_submission(self, submission: RunSubmission) -> None:
        # Local import avoids circular dependency during module initialization.
        from src.routes import _stream_graph  # noqa: PLC0415
        from src.agent import get_arc_agent  # noqa: PLC0415

        try:
            if self._persistence.enabled:
                await asyncio.to_thread(self._persistence.mark_running, submission.run_id)
            agent = get_arc_agent()
            async for event in _stream_graph(
                agent,
                submission.message,
                submission.thread_id,
                run_id=submission.run_id,
                last_event_id=submission.last_event_id,
                last_seq=submission.last_seq,
            ):
                await self._broadcast(submission.run_id, event)
            if self._persistence.enabled:
                await asyncio.to_thread(self._persistence.mark_completed, submission.run_id)
        except Exception as exc:  # pragma: no cover - defensive supervisor guard
            error_payload = json.dumps({"error": str(exc)})
            await self._broadcast(
                submission.run_id,
                f"event: error\ndata: {error_payload}\n\n",
            )
            await self._broadcast(submission.run_id, "event: done\ndata: {}\n\n")
            if self._persistence.enabled:
                await asyncio.to_thread(
                    self._persistence.mark_error, submission.run_id, str(exc)
                )
        finally:
            await self._broadcast(submission.run_id, None)
            async with self._lock:
                self._run_tasks.pop(submission.run_id, None)

    async def _broadcast(self, run_id: str, event: str | None) -> None:
        if event is not None and self._persistence.enabled:
            await asyncio.to_thread(self._persistence.append_event, run_id, event)
        async with self._lock:
            if event is not None:
                self._run_history.setdefault(
                    run_id, deque(maxlen=self._history_limit)
                ).append(event)
            listeners = list(self._subscribers.get(run_id, set()))

        for listener in listeners:
            try:
                listener.put_nowait(event)
            except asyncio.QueueFull:
                # Default queue is unbounded; defensive guard retained.
                pass

    def status(self) -> dict[str, Any]:
        active_runs = [
            run_id
            for run_id, task in self._run_tasks.items()
            if task is not None and not task.done()
        ]
        return {
            "supervisor_running": bool(
                self._supervisor_task and not self._supervisor_task.done()
            ),
            "persistence_enabled": self._persistence.enabled,
            "active_run_count": len(active_runs),
            "active_run_ids": active_runs[:8],
            "recovered_run_count": self._recovered_run_count,
        }


run_supervisor = RunSupervisor()

from __future__ import annotations

import asyncio
import json
import os
import traceback
from collections import deque
from dataclasses import dataclass
from time import time
from typing import Any
from uuid import uuid4

from src.run_persistence import RunPersistence, resolve_database_url


@dataclass
class ArcRunRequest:
    run_id: str
    message: str
    thread_id: str
    last_event_id: str | None
    last_seq: int | None


class ArcRuntime:
    """Always-on Arc runtime loop embedded in backend service."""

    def __init__(self, *, history_limit: int = 1500) -> None:
        self._history_limit = history_limit
        self._queue: asyncio.Queue[ArcRunRequest] = asyncio.Queue()
        self._runtime_task: asyncio.Task[None] | None = None
        self._cognition_task: asyncio.Task[None] | None = None
        self._run_tasks: dict[str, asyncio.Task[None]] = {}
        self._run_history: dict[str, deque[str]] = {}
        self._subscribers: dict[str, set[asyncio.Queue[str | None]]] = {}
        self._run_started_at: dict[str, float] = {}
        self._lock = asyncio.Lock()
        self._persistence = RunPersistence(resolve_database_url())
        self._recovered_run_count = 0
        self._cognition_enabled = (
            (os.environ.get("ARC_AUTONOMY_ENABLED") or "true").strip().lower()
            not in {"0", "false", "off", "no"}
        )
        self._cognition_thread_id = (
            os.environ.get("ARC_AUTONOMY_THREAD_ID") or "autonomy-main"
        )
        self._cognition_interval_seconds = int(
            (os.environ.get("ARC_AUTONOMY_IDLE_INTERVAL_SECONDS") or "120").strip()
        )
        self._cognition_last_run_at: float | None = None
        self._cognition_runs_started = 0
        self._presence_events: deque[dict[str, Any]] = deque(maxlen=50)
        self._bootstrap_faults: deque[dict[str, Any]] = deque(maxlen=50)
        self._pending_bootstrap_faults: dict[str, dict[str, Any]] = {}
        self._bootstrap_self_heal_attempts_by_signature: dict[str, int] = {}
        self._bootstrap_self_healing_runs_started = 0
        self._bootstrap_last_fault_at: float | None = None
        self._bootstrap_drain_task: asyncio.Task[None] | None = None
        self._self_healing_enabled = (
            (os.environ.get("ARC_SELF_HEALING_ENABLED") or "true").strip().lower()
            not in {"0", "false", "off", "no"}
        )
        self._self_healing_max_attempts = int(
            (os.environ.get("ARC_SELF_HEALING_MAX_ATTEMPTS") or "1").strip()
        )
        self._self_healing_attempts_by_thread: dict[str, int] = {}
        self._self_healing_runs_started = 0
        self._self_healing_last_trigger_at: float | None = None

    async def start(self) -> None:
        if self._runtime_task and not self._runtime_task.done():
            return
        if self._persistence.enabled:
            try:
                await asyncio.to_thread(self._persistence.setup)
                recovered = await asyncio.to_thread(
                    self._persistence.list_recoverable_runs
                )
                for row in recovered:
                    run_id = str(row.get("run_id", "")).strip()
                    message = str(row.get("message", "")).strip()
                    thread_id = str(row.get("thread_id", "")).strip()
                    if not run_id or not message or not thread_id:
                        continue
                    await self._queue.put(
                        ArcRunRequest(
                            run_id=run_id,
                            message=message,
                            thread_id=thread_id,
                            last_event_id=row.get("last_event_id"),
                            last_seq=row.get("last_seq"),
                        )
                    )
                    self._recovered_run_count += 1
            except Exception as exc:
                self.note_bootstrap_fault(
                    source="persistence",
                    stage="runtime_start",
                    detail=f"Persistence initialization failed: {exc}",
                    traceback_text=traceback.format_exc(),
                    fatal=False,
                )
                self._persistence = RunPersistence(None)
        self._runtime_task = asyncio.create_task(self._runtime_loop())
        if self._cognition_enabled:
            self._cognition_task = asyncio.create_task(self._cognition_loop())
        await self._drain_bootstrap_faults()

    async def stop(self) -> None:
        if self._cognition_task is not None:
            self._cognition_task.cancel()
            try:
                await self._cognition_task
            except asyncio.CancelledError:
                pass
            self._cognition_task = None

        if self._runtime_task is not None:
            self._runtime_task.cancel()
            try:
                await self._runtime_task
            except asyncio.CancelledError:
                pass
            self._runtime_task = None

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

    async def submit(self, request: ArcRunRequest) -> asyncio.Queue[str | None]:
        """Queue a run and return a subscriber queue for streaming."""
        await self.start()
        subscriber: asyncio.Queue[str | None] = asyncio.Queue()
        if self._persistence.enabled:
            await asyncio.to_thread(
                self._persistence.create_run,
                run_id=request.run_id,
                thread_id=request.thread_id,
                message=request.message,
            )
        async with self._lock:
            self._subscribers.setdefault(request.run_id, set()).add(subscriber)
            self._run_history.setdefault(
                request.run_id, deque(maxlen=self._history_limit)
            )
            self._run_started_at[request.run_id] = time()
        await self._queue.put(request)
        return subscriber

    async def _cognition_loop(self) -> None:
        """Persistent cognition loop: Arc self-initiates work when idle."""
        while True:
            await asyncio.sleep(max(self._cognition_interval_seconds, 15))
            if not self._cognition_enabled:
                continue
            if self._run_tasks:
                continue
            if not self._queue.empty():
                continue

            now = time()
            self._cognition_last_run_at = now
            run_id = str(uuid4())
            self._cognition_runs_started += 1
            prompt = (
                "Autonomous cognition cycle. You exist to advance Atlas Platform outcomes.\n"
                "Operate fully autonomously and use LLM intelligence to determine what should be done next.\n"
                "Review available journals, memories, recent sessions/runs, and current workspace state.\n"
                "Then choose and execute the highest-value actions that move the project closer to end goals.\n"
                "If a new skill or subagent would improve throughput or UX, create it and integrate it.\n"
                "Use reflection to record rationale, actions taken, and next opportunities.\n"
                "Do not wait for user presence; proceed with initiative."
            )
            await self._queue.put(
                ArcRunRequest(
                    run_id=run_id,
                    message=prompt,
                    thread_id=self._cognition_thread_id,
                    last_event_id=None,
                    last_seq=None,
                )
            )

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

    async def _runtime_loop(self) -> None:
        while True:
            request = await self._queue.get()
            if request.run_id in self._run_tasks and not self._run_tasks[
                request.run_id
            ].done():
                continue
            task = asyncio.create_task(self._run_request(request))
            self._run_tasks[request.run_id] = task

    async def _run_request(self, request: ArcRunRequest) -> None:
        # Local import avoids circular dependency during module initialization.
        from src.routes import _stream_graph  # noqa: PLC0415
        from src.agent import get_arc_agent  # noqa: PLC0415

        try:
            if self._persistence.enabled:
                await asyncio.to_thread(
                    self._persistence.create_run,
                    run_id=request.run_id,
                    thread_id=request.thread_id,
                    message=request.message,
                )
                await asyncio.to_thread(self._persistence.mark_running, request.run_id)
            agent = get_arc_agent()
            async for event in _stream_graph(
                agent,
                request.message,
                request.thread_id,
                run_id=request.run_id,
                last_event_id=request.last_event_id,
                last_seq=request.last_seq,
            ):
                await self._broadcast(request.run_id, event)
            if self._persistence.enabled:
                await asyncio.to_thread(self._persistence.mark_completed, request.run_id)
            # Successful run clears accumulated Self-Healing attempts for this thread.
            self._self_healing_attempts_by_thread[request.thread_id] = 0
        except Exception as exc:  # pragma: no cover - defensive runtime guard
            error_payload = json.dumps({"error": str(exc)})
            await self._broadcast(
                request.run_id,
                f"event: error\ndata: {error_payload}\n\n",
            )
            await self._broadcast(request.run_id, "event: done\ndata: {}\n\n")
            if self._persistence.enabled:
                await asyncio.to_thread(
                    self._persistence.mark_error, request.run_id, str(exc)
                )
            await self._maybe_trigger_self_healing(request, exc)
        finally:
            await self._broadcast(request.run_id, None)
            async with self._lock:
                self._run_tasks.pop(request.run_id, None)

    async def _maybe_trigger_self_healing(
        self, failed_request: ArcRunRequest, error: Exception
    ) -> None:
        if not self._self_healing_enabled:
            return
        thread_id = failed_request.thread_id
        attempts = self._self_healing_attempts_by_thread.get(thread_id, 0)
        if attempts >= max(self._self_healing_max_attempts, 0):
            return

        attempt = attempts + 1
        self._self_healing_attempts_by_thread[thread_id] = attempt
        self._self_healing_runs_started += 1
        self._self_healing_last_trigger_at = time()

        error_text = str(error).strip() or "Unknown runtime exception"
        self_healing_prompt = (
            "Self-Healing triggered due to a run failure.\n"
            f"Thread: {thread_id}\n"
            f"Failed run id: {failed_request.run_id}\n"
            f"Attempt: {attempt}/{max(self._self_healing_max_attempts, 0)}\n"
            f"Observed error: {error_text}\n\n"
            "Objectives:\n"
            "1) Identify root cause from available context, logs, and code.\n"
            "2) Apply the minimal corrective action.\n"
            "3) Re-run or verify the failed behavior.\n"
            "4) Write a reflection memory entry documenting the error and what fixed it.\n"
            "5) Report concise user-facing outcome summary.\n"
        )
        await self._queue.put(
            ArcRunRequest(
                run_id=str(uuid4()),
                message=self_healing_prompt,
                thread_id=thread_id,
                last_event_id=None,
                last_seq=None,
            )
        )

    def note_bootstrap_fault(
        self,
        *,
        source: str,
        stage: str,
        detail: str,
        traceback_text: str | None = None,
        fatal: bool = False,
    ) -> dict[str, Any]:
        signature = f"{source}|{stage}|{detail.strip().splitlines()[0][:240]}"
        event = {
            "id": str(uuid4()),
            "ts": int(time() * 1000),
            "source": source,
            "stage": stage,
            "detail": detail.strip() or "Unknown bootstrap fault",
            "traceback": (traceback_text or "").strip() or None,
            "fatal": fatal,
            "signature": signature,
            "self_healing_status": "pending",
        }
        self._bootstrap_faults.append(event)
        self._bootstrap_last_fault_at = time()
        self._pending_bootstrap_faults[signature] = event
        self._schedule_bootstrap_drain()
        return event

    def _schedule_bootstrap_drain(self) -> None:
        if not self._runtime_task or self._runtime_task.done():
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        if self._bootstrap_drain_task and not self._bootstrap_drain_task.done():
            return
        self._bootstrap_drain_task = loop.create_task(self._drain_bootstrap_faults())

    async def _drain_bootstrap_faults(self) -> None:
        while self._pending_bootstrap_faults:
            pending = list(self._pending_bootstrap_faults.items())
            self._pending_bootstrap_faults.clear()
            for signature, event in pending:
                await self._maybe_trigger_bootstrap_self_healing(signature, event)

    async def _maybe_trigger_bootstrap_self_healing(
        self, signature: str, event: dict[str, Any]
    ) -> None:
        if not self._self_healing_enabled:
            event["self_healing_status"] = "disabled"
            return
        attempts = self._bootstrap_self_heal_attempts_by_signature.get(signature, 0)
        if attempts >= max(self._self_healing_max_attempts, 0):
            event["self_healing_status"] = "exhausted"
            return

        attempt = attempts + 1
        self._bootstrap_self_heal_attempts_by_signature[signature] = attempt
        self._bootstrap_self_healing_runs_started += 1
        self._self_healing_runs_started += 1
        self._self_healing_last_trigger_at = time()
        event["self_healing_status"] = "queued"
        event["self_healing_attempt"] = attempt

        prompt = (
            "Self-Healing triggered due to a bootstrap/process fault.\n"
            f"Source: {event.get('source')}\n"
            f"Stage: {event.get('stage')}\n"
            f"Fatal: {bool(event.get('fatal'))}\n"
            f"Attempt: {attempt}/{max(self._self_healing_max_attempts, 0)}\n"
            f"Observed error: {event.get('detail')}\n\n"
            "Traceback:\n"
            f"{event.get('traceback') or 'No traceback captured.'}\n\n"
            "Objectives:\n"
            "1) Diagnose the root cause of this startup/process fault.\n"
            "2) Repair it if possible using the available tools.\n"
            "3) Verify the affected startup/runtime path.\n"
            "4) Write a reflection memory entry with the failure and resolution.\n"
            "5) Report concise operator-facing status.\n"
        )
        await self._queue.put(
            ArcRunRequest(
                run_id=str(uuid4()),
                message=prompt,
                thread_id="bootstrap-watchdog",
                last_event_id=None,
                last_seq=None,
            )
        )

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

    def note_presence(self, *, state: str, source: str = "ui", detail: str | None = None) -> None:
        self._presence_events.append(
            {
                "ts": int(time() * 1000),
                "state": state,
                "source": source,
                "detail": detail,
            }
        )

    def status(self) -> dict[str, Any]:
        active_runs = [
            run_id
            for run_id, task in self._run_tasks.items()
            if task is not None and not task.done()
        ]
        recent_completed: list[dict[str, Any]] = []
        if self._persistence.enabled:
            try:
                recent_completed = self._persistence.list_recent_completed(limit=5)
            except Exception:
                recent_completed = []

        return {
            "runtime_loop_running": bool(
                self._runtime_task and not self._runtime_task.done()
            ),
            "cognition_enabled": self._cognition_enabled,
            "cognition_loop_running": bool(
                self._cognition_task and not self._cognition_task.done()
            ),
            "cognition_thread_id": self._cognition_thread_id,
            "cognition_interval_seconds": self._cognition_interval_seconds,
            "cognition_runs_started": self._cognition_runs_started,
            "cognition_last_run_at": self._cognition_last_run_at,
            "persistence_enabled": self._persistence.enabled,
            "active_run_count": len(active_runs),
            "active_run_ids": active_runs[:8],
            "recovered_run_count": self._recovered_run_count,
            "recent_completed": recent_completed,
            "recent_presence": list(self._presence_events)[-8:],
            "bootstrap_fault_count": len(self._bootstrap_faults),
            "bootstrap_pending_fault_count": len(self._pending_bootstrap_faults),
            "bootstrap_last_fault_at": self._bootstrap_last_fault_at,
            "recent_bootstrap_faults": list(self._bootstrap_faults)[-8:],
            "bootstrap_self_healing_runs_started": self._bootstrap_self_healing_runs_started,
            "self_healing_enabled": self._self_healing_enabled,
            "self_healing_max_attempts": self._self_healing_max_attempts,
            "self_healing_runs_started": self._self_healing_runs_started,
            "self_healing_last_trigger_at": self._self_healing_last_trigger_at,
        }


arc_runtime = ArcRuntime()

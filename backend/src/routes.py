"""
FastAPI routes — agent invocation and lightweight UI metadata.

Streams structured SSE events to the frontend:
  - message: AI text content
  - tool_call: Agent called a tool
  - tool_result: Tool returned a result
  - todos: Todo list updated
  - status: Agent status change
  - error: Something went wrong
  - done: Stream finished
"""

from __future__ import annotations

import asyncio
import json
import traceback
from collections.abc import AsyncGenerator, Iterable
from pathlib import Path
from time import time
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.agent import get_arc_agent, get_runtime_status
from src.minimal_agent import current_minimal_model, minimal_agent
from src.model_factory import current_model_label
from src.serialization import serialize_chunk
from src.subagent_registry import registered_subagents
from src.tools.vm_health import vm_health_check

router = APIRouter()

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
IGNORED_PATH_PARTS = {
    ".git",
    ".next",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".mypy_cache",
    ".venv",
}
MAX_FILE_PREVIEW_BYTES = 32_000
MAX_TREE_ITEMS = 18
# Only fail-fast hard-stop for higher-risk tools that can cause expensive or
# side-effecting retry loops. Read-only discovery tools should not terminate
# the whole stream after repeated errors.
FAIL_FAST_TOOLS = {
    "internet_search_tool",
    "task",
    "write_file",
    "edit_file",
    "delete_file",
}
TELEMETRY_COVERAGE = {
    "model_lifecycle": ["timeline", "indicator"],
    "tool_lifecycle": ["timeline", "indicator"],
    "command_execution": ["timeline", "indicator"],
    "memory_events": ["timeline", "indicator"],
    "skills_events": ["timeline", "indicator"],
    "subagent_events": ["timeline", "indicator"],
    "backend_transport": ["timeline", "indicator"],
    "infra_telemetry": ["indicator"],
}


class InvokeRequest(BaseModel):
    message: str
    thread_id: str = "default"
    last_event_id: str | None = None
    last_seq: int | None = None


def _sse(event: str, data: Any, *, event_id: str | None = None) -> str:
    """Format a Server-Sent Event payload."""
    event_id_line = f"id: {event_id}\n" if event_id else ""
    return f"{event_id_line}event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def _event_scope(event_type: str) -> str:
    if event_type in {"message", "status"}:
        return "model"
    if event_type in {"tool_call", "tool_result"}:
        return "tool"
    if event_type == "todos":
        return "planner"
    if event_type in {"error", "done"}:
        return "backend"
    return "backend"


def _signal_class(event_type: str, payload: dict[str, Any]) -> str:
    if event_type in {"status", "message"}:
        return "model_lifecycle"
    if event_type in {"tool_call", "tool_result"}:
        tool_name = str(payload.get("name", ""))
        if tool_name == "task":
            return "subagent_events"
        if tool_name == "execute":
            return "command_execution"
        if tool_name in {"read_memory", "write_memory", "recall_memory"}:
            return "memory_events"
        if tool_name in {"create_skill", "create_subagent", "request_subagent_reload"}:
            return "skills_events"
        return "tool_lifecycle"
    if event_type in {"error", "done", "stream.heartbeat", "stream.resume_ack"}:
        return "backend_transport"
    return "backend_transport"


def _event_severity(event_type: str, payload: dict[str, Any]) -> str:
    if event_type == "error":
        return "error"
    if event_type == "tool_result":
        if bool(payload.get("error")) or str(payload.get("status", "")).lower() == "error":
            return "error"
    return "info"


def _runtime_event(
    *,
    event_type: str,
    payload: dict[str, Any],
    run_id: str,
    thread_id: str,
    seq: int,
) -> dict[str, Any]:
    return {
        "event_id": str(uuid4()),
        "seq": seq,
        "ts": int(time() * 1000),
        "run_id": run_id,
        "thread_id": thread_id,
        "scope": _event_scope(event_type),
        "type": event_type,
        "severity": _event_severity(event_type, payload),
        "signal_class": _signal_class(event_type, payload),
        # Compatibility adapter payload so old/new consumers can coexist.
        "legacy_event": event_type,
        "payload": payload,
    }


def _label_for_subagent(subagent: Any) -> str:
    labels = {
        "research-agent": "Research Agent",
        "coder": "Coder",
        "doc-extraction-agent": "Document Extraction",
        "uiux-agent": "UI / UX Agent",
    }
    name = getattr(subagent, "name", "")
    return labels.get(name, name.replace("-", " ").title())


def _subagent_model(subagent: Any, default_model: str) -> str:
    model = getattr(subagent, "model", None)
    if model is None:
        return default_model
    return str(model)


def _workspace_relative(path: Path) -> str:
    if path == WORKSPACE_ROOT:
        return "/workspace"
    return f"/workspace/{path.relative_to(WORKSPACE_ROOT).as_posix()}"


def _contains_ignored_part(path: Path) -> bool:
    return any(part in IGNORED_PATH_PARTS for part in path.parts)


def _resolve_repo_path(raw_path: str) -> Path:
    normalized = raw_path.strip()
    if normalized == "/workspace":
        relative = Path()
    elif normalized.startswith("/workspace/"):
        relative = Path(normalized.removeprefix("/workspace/"))
    else:
        relative = Path(normalized.lstrip("/"))

    candidate = (WORKSPACE_ROOT / relative).resolve()
    if WORKSPACE_ROOT not in candidate.parents and candidate != WORKSPACE_ROOT:
        raise HTTPException(status_code=400, detail="Path escapes workspace root")
    if _contains_ignored_part(candidate):
        raise HTTPException(status_code=403, detail="Path is not available in the UI")
    return candidate


def _iter_visible_entries(path: Path) -> Iterable[Path]:
    for entry in path.iterdir():
        if entry.name.startswith(".") or entry.name in IGNORED_PATH_PARTS:
            continue
        yield entry


def _build_tree(path: Path, *, depth: int) -> dict[str, Any]:
    node: dict[str, Any] = {
        "name": path.name or WORKSPACE_ROOT.name,
        "path": _workspace_relative(path),
        "type": "directory" if path.is_dir() else "file",
        "owner": "disk",
    }

    if path.is_file():
        stat = path.stat()
        node["size"] = stat.st_size
        node["modified_at"] = stat.st_mtime
        return node

    if depth <= 0:
        node["children"] = []
        return node

    entries = sorted(
        _iter_visible_entries(path),
        key=lambda entry: (entry.is_file(), entry.name.lower()),
    )
    children: list[dict[str, Any]] = []

    for entry in entries[:MAX_TREE_ITEMS]:
        try:
            children.append(_build_tree(entry, depth=depth - 1))
        except PermissionError:
            children.append(
                {
                    "name": entry.name,
                    "path": _workspace_relative(entry),
                    "type": "meta",
                    "owner": "disk",
                    "error": "Permission denied",
                }
            )

    if len(entries) > MAX_TREE_ITEMS:
        children.append(
            {
                "name": f"+{len(entries) - MAX_TREE_ITEMS} more",
                "path": f"{_workspace_relative(path)}#truncated",
                "type": "meta",
                "owner": "disk",
            }
        )

    node["children"] = children
    return node


def _health_level(snapshot: dict[str, Any]) -> str:
    cpu = float(snapshot.get("cpu_percent", 0))
    memory = float(snapshot.get("memory", {}).get("percent", 0))
    disk = float(snapshot.get("disk", {}).get("percent_used", 0))
    if cpu >= 90 or memory >= 90 or disk >= 92:
        return "critical"
    if cpu >= 70 or memory >= 75 or disk >= 82:
        return "warning"
    return "healthy"


def _extract_events(
    chunk: dict[str, Any],
    *,
    ai_last_content_by_id: dict[str, str] | None = None,
    seed_only: bool = False,
    emitted_tool_call_ids: set[str] | None = None,
    emitted_tool_result_ids: set[str] | None = None,
    emitted_tool_call_signatures: set[str] | None = None,
    emitted_tool_result_signatures: set[str] | None = None,
) -> list[tuple[str, Any]]:
    """Extract structured events from a LangGraph stream update chunk."""
    events: list[tuple[str, Any]] = []
    serialized = serialize_chunk(chunk)

    for node_name, node_data in serialized.items():
        if not isinstance(node_data, dict):
            continue

        messages = node_data.get("messages", [])
        if not isinstance(messages, list):
            messages = [messages]

        for msg in messages:
            if not isinstance(msg, dict):
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ai":
                lowered_node = str(node_name).lower()
                # Ignore middleware/pre-post agent nodes to prevent replaying
                # stale/system AI messages in the live chat stream.
                if (
                    "middleware" in lowered_node
                    or lowered_node.endswith(".before_agent")
                    or lowered_node.endswith(".after_agent")
                    or lowered_node.endswith("before_agent")
                    or lowered_node.endswith("after_agent")
                ):
                    continue

                content = msg.get("content", "")
                message_id = str(msg.get("id", "") or "")

                if ai_last_content_by_id is not None and message_id:
                    previous_content = ai_last_content_by_id.get(message_id)
                    ai_last_content_by_id[message_id] = content

                    if seed_only:
                        continue

                    if previous_content is None:
                        delta = content
                    elif content == previous_content:
                        continue
                    elif isinstance(content, str) and isinstance(previous_content, str) and content.startswith(previous_content):
                        delta = content[len(previous_content) :]
                    else:
                        delta = content
                else:
                    delta = content

                if delta:
                    events.append(
                        (
                            "message",
                            {
                                "content": delta,
                                "id": msg.get("id", ""),
                                "node": node_name,
                            },
                        )
                    )

                tool_calls = msg.get("tool_calls", [])
                for tool_call in tool_calls:
                    tool_call_id = str(tool_call.get("id", "") or "")
                    if tool_call_id and emitted_tool_call_ids is not None:
                        if tool_call_id in emitted_tool_call_ids:
                            continue
                        emitted_tool_call_ids.add(tool_call_id)
                    elif emitted_tool_call_signatures is not None:
                        # Fallback dedupe when upstream omits tool_call IDs.
                        signature = json.dumps(
                            {
                                "node": node_name,
                                "name": tool_call.get("name", ""),
                                "args": tool_call.get("args", {}),
                            },
                            sort_keys=True,
                            default=str,
                        )
                        if signature in emitted_tool_call_signatures:
                            continue
                        emitted_tool_call_signatures.add(signature)

                    events.append(
                        (
                            "tool_call",
                            {
                                "id": tool_call_id,
                                "name": tool_call.get("name", ""),
                                "args": tool_call.get("args", {}),
                                "node": node_name,
                            },
                        )
                    )

            elif msg_type == "tool":
                content = msg.get("content", "")
                name = msg.get("name", "")
                status = str(msg.get("status", ""))
                preview_text = (
                    content[:2000] if isinstance(content, str) else str(content)[:2000]
                )
                inferred_error = (
                    "error invoking tool" in preview_text.lower()
                    or "traceback" in preview_text.lower()
                    or "exception" in preview_text.lower()
                )
                normalized_status = "error" if status == "error" or inferred_error else "completed"

                if name == "write_todos":
                    try:
                        todos_data = (
                            json.loads(content) if isinstance(content, str) else content
                        )
                    except (json.JSONDecodeError, TypeError):
                        todos_data = content
                    events.append(
                        (
                            "todos",
                            {
                                "todos": todos_data,
                                "node": node_name,
                            },
                        )
                    )
                else:
                    tool_message_id = str(msg.get("id", "") or "")
                    if tool_message_id and emitted_tool_result_ids is not None:
                        if tool_message_id in emitted_tool_result_ids:
                            continue
                        emitted_tool_result_ids.add(tool_message_id)
                    elif emitted_tool_result_signatures is not None:
                        signature = json.dumps(
                            {
                                "node": node_name,
                                "tool_call_id": msg.get("tool_call_id", ""),
                                "name": name,
                                "status": normalized_status,
                                "content": preview_text,
                            },
                            sort_keys=True,
                            default=str,
                        )
                        if signature in emitted_tool_result_signatures:
                            continue
                        emitted_tool_result_signatures.add(signature)

                    events.append(
                        (
                            "tool_result",
                            {
                                "tool_call_id": msg.get("tool_call_id", ""),
                                "name": name,
                                "content": preview_text,
                                "status": normalized_status,
                                "error": inferred_error,
                                "node": node_name,
                            },
                        )
                    )

        todos = node_data.get("todos")
        if todos is not None:
            events.append(("todos", {"todos": todos, "node": node_name}))

    return events


async def _stream_graph(
    agent: Any,
    message: str,
    thread_id: str,
    *,
    last_event_id: str | None = None,
    last_seq: int | None = None,
) -> AsyncGenerator[str, None]:
    """Stream agent updates as structured Server-Sent Events."""
    config = {"configurable": {"thread_id": thread_id}}
    input_data = {"messages": [{"role": "user", "content": message}]}

    run_id = str(uuid4())
    seq = 0

    planning_payload = {"status": "planning"}
    yield _sse("status", planning_payload)
    planning_runtime = _runtime_event(
        event_type="status",
        payload=planning_payload,
        run_id=run_id,
        thread_id=thread_id,
        seq=seq,
    )
    yield _sse(
        "runtime_event",
        planning_runtime,
        event_id=planning_runtime["event_id"],
    )
    seq += 1

    if last_event_id is not None or last_seq is not None:
        resume_payload = {
            "accepted": True,
            "last_event_id": last_event_id,
            "last_seq": last_seq,
        }
        resume_runtime = _runtime_event(
            event_type="stream.resume_ack",
            payload=resume_payload,
            run_id=run_id,
            thread_id=thread_id,
            seq=seq,
        )
        yield _sse(
            "runtime_event",
            resume_runtime,
            event_id=resume_runtime["event_id"],
        )
        seq += 1

    heartbeat_payload = {"kind": "stream.heartbeat"}
    yield _sse("heartbeat", heartbeat_payload)
    heartbeat_runtime = _runtime_event(
        event_type="stream.heartbeat",
        payload=heartbeat_payload,
        run_id=run_id,
        thread_id=thread_id,
        seq=seq,
    )
    yield _sse(
        "runtime_event",
        heartbeat_runtime,
        event_id=heartbeat_runtime["event_id"],
    )
    seq += 1
    last_heartbeat_ts = time()
    ai_last_content_by_id: dict[str, str] = {}
    seeded_initial_state = False
    tool_error_counts: dict[str, int] = {}
    emitted_tool_call_ids: set[str] = set()
    emitted_tool_result_ids: set[str] = set()
    emitted_tool_call_signatures: set[str] = set()
    emitted_tool_result_signatures: set[str] = set()

    try:
        async for chunk in agent.astream(input_data, config=config, stream_mode="updates"):
            events = _extract_events(
                chunk,
                ai_last_content_by_id=ai_last_content_by_id,
                seed_only=not seeded_initial_state,
                emitted_tool_call_ids=emitted_tool_call_ids,
                emitted_tool_result_ids=emitted_tool_result_ids,
                emitted_tool_call_signatures=emitted_tool_call_signatures,
                emitted_tool_result_signatures=emitted_tool_result_signatures,
            )
            if not seeded_initial_state:
                seeded_initial_state = True
            if events:
                yielded_working = False
                for event_type, event_data in events:
                    if not yielded_working:
                        working_payload = {"status": "working"}
                        yield _sse("status", working_payload)
                        working_runtime = _runtime_event(
                            event_type="status",
                            payload=working_payload,
                            run_id=run_id,
                            thread_id=thread_id,
                            seq=seq,
                        )
                        yield _sse(
                            "runtime_event",
                            working_runtime,
                            event_id=working_runtime["event_id"],
                        )
                        seq += 1
                        yielded_working = True
                    yield _sse(event_type, event_data)
                    event_runtime = _runtime_event(
                        event_type=event_type,
                        payload=event_data,
                        run_id=run_id,
                        thread_id=thread_id,
                        seq=seq,
                    )
                    yield _sse(
                        "runtime_event",
                        event_runtime,
                        event_id=event_runtime["event_id"],
                    )
                    seq += 1
                    if event_type == "tool_result":
                        tool_name = str(event_data.get("name", "tool"))
                        is_error = bool(event_data.get("error")) or str(
                            event_data.get("status", "")
                        ).lower() == "error"
                        if is_error:
                            tool_error_counts[tool_name] = tool_error_counts.get(tool_name, 0) + 1
                            if (
                                tool_name in FAIL_FAST_TOOLS
                                and tool_error_counts[tool_name] >= 2
                            ):
                                yield _sse(
                                    "error",
                                    {
                                        "error": (
                                            f"Repeated failure in tool '{tool_name}'. "
                                            "Failing fast to prevent retry loops."
                                        )
                                    },
                                )
                                fail_fast_payload = {
                                    "error": (
                                        f"Repeated failure in tool '{tool_name}'. "
                                        "Failing fast to prevent retry loops."
                                    )
                                }
                                fail_fast_runtime = _runtime_event(
                                    event_type="error",
                                    payload=fail_fast_payload,
                                    run_id=run_id,
                                    thread_id=thread_id,
                                    seq=seq,
                                )
                                yield _sse(
                                    "runtime_event",
                                    fail_fast_runtime,
                                    event_id=fail_fast_runtime["event_id"],
                                )
                                seq += 1
                                yield _sse("done", {})
                                fail_fast_done_runtime = _runtime_event(
                                    event_type="done",
                                    payload={},
                                    run_id=run_id,
                                    thread_id=thread_id,
                                    seq=seq,
                                )
                                yield _sse(
                                    "runtime_event",
                                    fail_fast_done_runtime,
                                    event_id=fail_fast_done_runtime["event_id"],
                                )
                                return
            now = time()
            if now - last_heartbeat_ts >= 8:
                periodic_heartbeat_payload = {"kind": "stream.heartbeat"}
                yield _sse("heartbeat", periodic_heartbeat_payload)
                periodic_heartbeat_runtime = _runtime_event(
                    event_type="stream.heartbeat",
                    payload=periodic_heartbeat_payload,
                    run_id=run_id,
                    thread_id=thread_id,
                    seq=seq,
                )
                yield _sse(
                    "runtime_event",
                    periodic_heartbeat_runtime,
                    event_id=periodic_heartbeat_runtime["event_id"],
                )
                seq += 1
                last_heartbeat_ts = now
            await asyncio.sleep(0)

        done_status_payload = {"status": "done"}
        yield _sse("status", done_status_payload)
        done_status_runtime = _runtime_event(
            event_type="status",
            payload=done_status_payload,
            run_id=run_id,
            thread_id=thread_id,
            seq=seq,
        )
        yield _sse(
            "runtime_event",
            done_status_runtime,
            event_id=done_status_runtime["event_id"],
        )
        seq += 1
    except Exception as exc:  # pragma: no cover - defensive streaming path
        error_payload = {
            "error": str(exc),
            "traceback": traceback.format_exc()[-500:],
        }
        yield _sse(
            "error",
            error_payload,
        )
        error_runtime = _runtime_event(
            event_type="error",
            payload=error_payload,
            run_id=run_id,
            thread_id=thread_id,
            seq=seq,
        )
        yield _sse(
            "runtime_event",
            error_runtime,
            event_id=error_runtime["event_id"],
        )
        seq += 1

    yield _sse("done", {})
    final_done_runtime = _runtime_event(
        event_type="done",
        payload={},
        run_id=run_id,
        thread_id=thread_id,
        seq=seq,
    )
    yield _sse(
        "runtime_event",
        final_done_runtime,
        event_id=final_done_runtime["event_id"],
    )


async def stream_agent(
    message: str,
    thread_id: str,
    *,
    last_event_id: str | None = None,
    last_seq: int | None = None,
) -> AsyncGenerator[str, None]:
    """Stream the primary Arc agent."""
    arc_agent = get_arc_agent()
    async for event in _stream_graph(
        arc_agent,
        message,
        thread_id,
        last_event_id=last_event_id,
        last_seq=last_seq,
    ):
        yield event


async def stream_minimal_agent(message: str, thread_id: str) -> AsyncGenerator[str, None]:
    """Stream the standalone minimal Deep Agent."""
    async for event in _stream_graph(minimal_agent, message, thread_id):
        yield event


@router.post("/invoke/stream")
async def invoke_stream(req: InvokeRequest):
    """Stream the agent response as Server-Sent Events."""
    return StreamingResponse(
        stream_agent(
            req.message,
            req.thread_id,
            last_event_id=req.last_event_id,
            last_seq=req.last_seq,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/debug/minimal/stream")
async def invoke_minimal_stream(req: InvokeRequest):
    """Stream a docs-aligned minimal Deep Agent for debugging."""
    return StreamingResponse(
        stream_minimal_agent(req.message, req.thread_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/debug/minimal/meta")
async def minimal_meta():
    """Return minimal runtime metadata for the standalone debug UI."""
    return {
        "agent": "arc-minimal-debug",
        "model": current_minimal_model(),
        "transport": "sse",
        "stream_path": "/debug/minimal/stream",
    }


@router.get("/health")
async def health():
    return {"status": "ok", "agent": "arc"}


@router.get("/ui/meta")
async def ui_meta():
    """Return static+runtime UI metadata for the Orb shell."""
    default_model = current_model_label()
    subagents = registered_subagents()

    return {
        "identity": {
            "name": "Arc",
            "subtitle": "Agent of Agents",
            "model": default_model,
        },
        "topbar": {
            "context_window": 200_000,
            "apcms_status": "disabled",
        },
        "subagents": [
            {
                "id": getattr(subagent, "name", ""),
                "name": _label_for_subagent(subagent),
                "description": getattr(subagent, "description", ""),
                "model": _subagent_model(subagent, default_model),
                "status": "idle",
            }
            for subagent in subagents
        ],
        "skills": {
            "loaded": [
                {
                    "id": "deepagents-runtime",
                    "name": "Deep Agents Runtime",
                    "summary": "Planning, filesystem context, and delegated execution.",
                    "status": "active",
                },
                {
                    "id": "langgraph-streaming",
                    "name": "LangGraph Streaming",
                    "summary": "SSE-driven status, tool, and todo transport.",
                    "status": "active",
                },
                {
                    "id": "framer-motion",
                    "name": "Framer Motion",
                    "summary": "Custom materialization choreography for the UI shell.",
                    "status": "active",
                },
            ],
            "recommended": [
                {
                    "id": "frontend-design",
                    "name": "Frontend Design",
                    "summary": "Interaction patterns for Arc's visual language.",
                    "status": "available",
                },
                {
                    "id": "web-accessibility",
                    "name": "Web Accessibility",
                    "summary": "Keyboard-first and semantic component guidance.",
                    "status": "available",
                },
                {
                    "id": "systematic-debugging",
                    "name": "Systematic Debugging",
                    "summary": "Reproduction, instrumentation, and verification workflow.",
                    "status": "available",
                },
            ],
        },
        "memory_tiers": [
            {
                "id": "session",
                "name": "Session Memory",
                "path": "/memories/session/",
                "description": "Current task context and transient reflections.",
                "status": "planned",
            },
            {
                "id": "repo",
                "name": "Repo Memory",
                "path": "/memories/repo/",
                "description": "Project conventions, anti-patterns, and durable lessons.",
                "status": "planned",
            },
            {
                "id": "user",
                "name": "User Memory",
                "path": "/memories/",
                "description": "Long-term operator preferences and recurring patterns.",
                "status": "planned",
            },
        ],
        "slash_commands": [
            {
                "id": "plan",
                "label": "/plan",
                "description": "Manifest the live plan constellation",
            },
            {
                "id": "files",
                "label": "/files",
                "description": "Open the workspace overlay",
            },
            {
                "id": "health",
                "label": "/health",
                "description": "Refresh VM telemetry",
            },
            {
                "id": "threads",
                "label": "/threads",
                "description": "Review local thread history",
            },
            {
                "id": "tokens",
                "label": "/tokens",
                "description": "Inspect context usage",
            },
            {
                "id": "skills",
                "label": "/skills",
                "description": "Inspect loaded and available skills",
            },
            {
                "id": "memories",
                "label": "/memories",
                "description": "Review memory tiers and durability",
            },
            {
                "id": "config",
                "label": "/config",
                "description": "Open runtime configuration",
            },
        ],
        "settings": [
            {
                "section": "Runtime",
                "items": [
                    {"label": "Streaming transport", "value": "Server-Sent Events"},
                    {"label": "Primary model", "value": default_model},
                    {"label": "Planner", "value": "write_todos"},
                ],
            },
            {
                "section": "Endpoints",
                "items": [
                    {"label": "Invoke stream", "value": "/invoke/stream"},
                    {"label": "Health", "value": "/ui/health"},
                    {"label": "Workspace", "value": "/ui/workspace"},
                ],
            },
        ],
        "telemetry": {
            "version": 1,
            "event_envelope": {
                "required_fields": [
                    "event_id",
                    "seq",
                    "ts",
                    "run_id",
                    "thread_id",
                    "scope",
                    "type",
                    "severity",
                    "signal_class",
                    "legacy_event",
                    "payload",
                ],
                "sse_event_name": "runtime_event",
            },
            "coverage": TELEMETRY_COVERAGE,
        },
        "runtime": get_runtime_status(),
    }


@router.get("/ui/health")
async def ui_health():
    """Return richer VM health telemetry for the custom top bar/panels."""
    snapshot = vm_health_check.invoke({})
    return {
        "status": _health_level(snapshot),
        "snapshot": snapshot,
    }


@router.get("/ui/workspace")
async def workspace_tree(depth: int = Query(default=3, ge=1, le=5)):
    """Return a filtered workspace tree for the Files overlay."""
    return {"root": _build_tree(WORKSPACE_ROOT, depth=depth)}


@router.get("/ui/file")
async def file_preview(path: str = Query(..., min_length=1)):
    """Return a safe file preview for the context overlay."""
    candidate = _resolve_repo_path(path)
    if not candidate.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if candidate.is_dir():
        raise HTTPException(status_code=400, detail="Path points to a directory")

    raw = candidate.read_bytes()
    truncated = len(raw) > MAX_FILE_PREVIEW_BYTES
    snippet = raw[:MAX_FILE_PREVIEW_BYTES].decode("utf-8", errors="replace")
    stat = candidate.stat()

    return {
        "path": _workspace_relative(candidate),
        "content": snippet,
        "truncated": truncated,
        "size": len(raw),
        "extension": candidate.suffix,
        "modified_at": stat.st_mtime,
    }

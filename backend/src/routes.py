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
import os
import traceback
from collections.abc import AsyncGenerator, Iterable
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.agent import arc_agent
from src.serialization import serialize_chunk
from src.subagents.coder import coder_subagent
from src.subagents.doc_extraction import doc_extraction_subagent
from src.subagents.researcher import researcher_subagent
from src.subagents.uiux import uiux_subagent
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


class InvokeRequest(BaseModel):
    message: str
    thread_id: str = "default"


def _sse(event: str, data: Any) -> str:
    """Format a Server-Sent Event payload."""
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


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


def _extract_events(chunk: dict[str, Any]) -> list[tuple[str, Any]]:
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
                content = msg.get("content", "")
                if content:
                    events.append(
                        (
                            "message",
                            {
                                "content": content,
                                "id": msg.get("id", ""),
                                "node": node_name,
                            },
                        )
                    )

                tool_calls = msg.get("tool_calls", [])
                for tool_call in tool_calls:
                    events.append(
                        (
                            "tool_call",
                            {
                                "id": tool_call.get("id", ""),
                                "name": tool_call.get("name", ""),
                                "args": tool_call.get("args", {}),
                                "node": node_name,
                            },
                        )
                    )

            elif msg_type == "tool":
                content = msg.get("content", "")
                name = msg.get("name", "")

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
                    preview = (
                        content[:2000] if isinstance(content, str) else str(content)[:2000]
                    )
                    events.append(
                        (
                            "tool_result",
                            {
                                "tool_call_id": msg.get("tool_call_id", ""),
                                "name": name,
                                "content": preview,
                                "node": node_name,
                            },
                        )
                    )

        todos = node_data.get("todos")
        if todos is not None:
            events.append(("todos", {"todos": todos, "node": node_name}))

    return events


async def stream_agent(message: str, thread_id: str) -> AsyncGenerator[str, None]:
    """Stream agent updates as structured Server-Sent Events."""
    config = {"configurable": {"thread_id": thread_id}}
    input_data = {"messages": [{"role": "user", "content": message}]}

    yield _sse("status", {"status": "planning"})

    try:
        async for chunk in arc_agent.astream(
            input_data, config=config, stream_mode="updates"
        ):
            events = _extract_events(chunk)
            if events:
                yielded_working = False
                for event_type, event_data in events:
                    if not yielded_working:
                        yield _sse("status", {"status": "working"})
                        yielded_working = True
                    yield _sse(event_type, event_data)
            await asyncio.sleep(0)

        yield _sse("status", {"status": "done"})
    except Exception as exc:  # pragma: no cover - defensive streaming path
        yield _sse(
            "error",
            {
                "error": str(exc),
                "traceback": traceback.format_exc()[-500:],
            },
        )

    yield _sse("done", {})


@router.post("/invoke/stream")
async def invoke_stream(req: InvokeRequest):
    """Stream the agent response as Server-Sent Events."""
    return StreamingResponse(
        stream_agent(req.message, req.thread_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/health")
async def health():
    return {"status": "ok", "agent": "arc"}


@router.get("/ui/meta")
async def ui_meta():
    """Return static+runtime UI metadata for the Orb shell."""
    default_model = os.environ.get("AGENT_MODEL", "openrouter:minimax/minimax-m2.7")
    subagents = [
        researcher_subagent,
        coder_subagent,
        doc_extraction_subagent,
        uiux_subagent,
    ]

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

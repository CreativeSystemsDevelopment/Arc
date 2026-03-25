"""
FastAPI routes — agent invocation and streaming.

Streams structured SSE events to the frontend:
  - message: AI text content
  - tool_call: Agent called a tool
  - tool_result: Tool returned a result
  - todos: Todo list updated
  - status: Agent status change
  - error: Something went wrong
  - done: Stream finished
"""

import asyncio
import json
import traceback
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.agent import arc_agent
from src.serialization import serialize_chunk

router = APIRouter()


class InvokeRequest(BaseModel):
    message: str
    thread_id: str = "default"


def _sse(event: str, data: Any) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


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
                    events.append(("message", {
                        "content": content,
                        "id": msg.get("id", ""),
                        "node": node_name,
                    }))

                tool_calls = msg.get("tool_calls", [])
                for tc in tool_calls:
                    events.append(("tool_call", {
                        "id": tc.get("id", ""),
                        "name": tc.get("name", ""),
                        "args": tc.get("args", {}),
                        "node": node_name,
                    }))

            elif msg_type == "tool":
                content = msg.get("content", "")
                name = msg.get("name", "")

                if name == "write_todos":
                    try:
                        todos_data = json.loads(content) if isinstance(content, str) else content
                        events.append(("todos", {
                            "todos": todos_data,
                            "node": node_name,
                        }))
                    except (json.JSONDecodeError, TypeError):
                        events.append(("todos", {
                            "todos": content,
                            "node": node_name,
                        }))
                else:
                    truncated = (
                        content[:2000] if isinstance(content, str)
                        else str(content)[:2000]
                    )
                    events.append(("tool_result", {
                        "tool_call_id": msg.get("tool_call_id", ""),
                        "name": name,
                        "content": truncated,
                        "node": node_name,
                    }))

            elif msg_type == "human":
                pass

        # Check for todos in state
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
        async for chunk in arc_agent.astream(input_data, config=config, stream_mode="updates"):
            events = _extract_events(chunk)
            if events:
                first_event = True
                for event_type, event_data in events:
                    if first_event:
                        yield _sse("status", {"status": "working"})
                        first_event = False
                    yield _sse(event_type, event_data)
            await asyncio.sleep(0)

        yield _sse("status", {"status": "done"})

    except Exception as e:
        yield _sse("error", {
            "error": str(e),
            "traceback": traceback.format_exc()[-500:],
        })

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

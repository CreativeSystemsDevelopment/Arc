"""
Serialization helpers for LangGraph agent stream output.

Converts LangGraph types (Overwrite, BaseMessage, etc.) into
plain JSON-serializable dictionaries for SSE transport.
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    ToolMessage,
)


def _serialize_message(msg: BaseMessage) -> dict[str, Any]:
    """Convert a LangChain message to a plain dict."""
    data: dict[str, Any] = {
        "type": msg.type,
        "content": msg.content if isinstance(msg.content, str) else str(msg.content),
        "id": msg.id,
    }
    if isinstance(msg, AIMessage) and msg.tool_calls:
        data["tool_calls"] = [
            {
                "id": tc.get("id", ""),
                "name": tc.get("name", ""),
                "args": tc.get("args", {}),
            }
            for tc in msg.tool_calls
        ]
    if isinstance(msg, ToolMessage):
        data["tool_call_id"] = msg.tool_call_id
        data["name"] = msg.name
    return data


def serialize_chunk(obj: Any) -> Any:
    """Recursively serialize a LangGraph stream chunk into JSON-safe types."""
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj

    # Handle Overwrite (langgraph.types.Overwrite)
    if hasattr(obj, "value") and type(obj).__name__ == "Overwrite":
        return serialize_chunk(obj.value)

    if isinstance(obj, BaseMessage):
        return _serialize_message(obj)

    if isinstance(obj, dict):
        return {k: serialize_chunk(v) for k, v in obj.items()}

    if isinstance(obj, (list, tuple)):
        return [serialize_chunk(item) for item in obj]

    # Pydantic models
    if hasattr(obj, "model_dump"):
        return serialize_chunk(obj.model_dump())

    if hasattr(obj, "dict"):
        return serialize_chunk(obj.dict())

    return str(obj)

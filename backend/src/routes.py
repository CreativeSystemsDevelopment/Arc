"""
FastAPI routes — agent invocation and streaming.
"""

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.agent import arc_agent

router = APIRouter()


class InvokeRequest(BaseModel):
    message: str
    thread_id: str = "default"


async def stream_agent(message: str, thread_id: str) -> AsyncGenerator[str, None]:
    """Stream agent updates as Server-Sent Events."""
    config = {"configurable": {"thread_id": thread_id}}
    input_data = {"messages": [{"role": "user", "content": message}]}

    async for chunk in arc_agent.astream(input_data, config=config, stream_mode="updates"):
        yield f"data: {json.dumps(chunk)}\n\n"
        await asyncio.sleep(0)  # yield control to the event loop

    yield "data: [DONE]\n\n"


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

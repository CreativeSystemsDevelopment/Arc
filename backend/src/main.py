"""
Arc backend entry point.

Run with:
    uvicorn src.main:app --reload --port 8000

Or for LangGraph Studio development:
    langgraph dev --allow-blocking

Environment:
    ARC_MODE=local|neon|gcp|r2 (default: local)
"""

import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# Import agent based on ARC_MODE environment variable
arc_mode = os.environ.get("ARC_MODE", "local").lower()

if arc_mode == "neon":
    print("[Arc] Loading Neon cloud agent configuration...")
    from src.agent_neon import arc_agent  # noqa: F401
elif arc_mode == "gcp":
    print("[Arc] Loading Google Cloud agent configuration...")
    from src.agent_gcp import arc_agent  # noqa: F401
elif arc_mode == "cloud":
    print("[Arc] Loading generic cloud agent configuration...")
    from src.agent_cloud import arc_agent  # noqa: F401
else:
    print("[Arc] Loading local agent configuration...")
    from src.agent import arc_agent  # noqa: F401

from src.routes import router  # noqa: E402

app = FastAPI(
    title="Arc — Deep Agent API",
    description="Archenemies Deep Agent for complex, long-running, and open-ended tasks.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
async def root():
    """Health check with configuration info."""
    return {
        "status": "ok",
        "agent": "arc",
        "mode": arc_mode,
        "model": os.environ.get("AGENT_MODEL", "openrouter:moonshotai/kimi-k2.5"),
    }

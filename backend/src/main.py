"""
Arc backend entry point.

Run with:
    uvicorn src.main:app --reload --port 8000

Or for LangGraph Studio development:
    langgraph dev --allow-blocking

Environment:
    Single unified runtime (admin-first).
    Optional persistence env vars:
      - ARC_DATABASE_URL
      - NEON_DATABASE_URL
      - DATABASE_URL
      - GCP_DATABASE_URL
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.model_factory import current_model_label

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_FILE, override=True)

requested_mode = (os.environ.get("ARC_MODE") or "").strip().lower()
if requested_mode and requested_mode not in {"unified", "admin", "local"}:
    print(
        f"[Arc] ARC_MODE='{requested_mode}' is deprecated; "
        "loading unified admin runtime instead."
    )
else:
    print("[Arc] Loading unified admin runtime...")

from src.agent import arc_agent  # noqa: F401

from src.arc_runtime import arc_runtime  # noqa: E402
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


@app.on_event("startup")
async def startup_runtime() -> None:
    await arc_runtime.start()


@app.on_event("shutdown")
async def shutdown_runtime() -> None:
    await arc_runtime.stop()


@app.get("/")
async def root():
    """Health check with configuration info."""
    return {
        "status": "ok",
        "agent": "arc",
        "mode": "unified-admin",
        "requested_mode": requested_mode or None,
        "model": current_model_label(),
    }

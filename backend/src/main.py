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
import traceback
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_FILE, override=True)

# Fetch secrets from GCP Secret Manager
def fetch_gcp_secrets():
    try:
        from google.cloud import secretmanager
        import google.auth
        # Force default auth to use service account identity attached to VM
        credentials, project_id = google.auth.default()
        if not project_id:
            project_id = "gen-lang-client-0746582623"
            
        client = secretmanager.SecretManagerServiceClient(credentials=credentials)
        name = f"projects/{project_id}/secrets/arc-openrouter-key/versions/latest"
        response = client.access_secret_version(request={"name": name})
        payload = response.payload.data.decode("UTF-8")
        if payload:
            os.environ["OPENROUTER_API_KEY"] = payload.strip()
            print("[Arc] Loaded OpenRouter API Key from GCP Secret Manager.")
    except Exception as e:
        print(f"[Arc] ERROR: Failed to load GCP secret: {e}")
        # To avoid crash loop if GCP IAM sync is delayed, don't crash here.
        # But lang-chain will crash later if OPENROUTER_API_KEY is missing.
        if "OPENROUTER_API_KEY" not in os.environ:
            os.environ["OPENROUTER_API_KEY"] = "sk-or-placeholder"

fetch_gcp_secrets()

from src.model_factory import current_model_label

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
    try:
        await arc_runtime.start()
    except Exception as exc:
        arc_runtime.note_bootstrap_fault(
            source="fastapi",
            stage="startup_runtime",
            detail=f"Arc runtime start failed: {exc}",
            traceback_text=traceback.format_exc(),
            fatal=True,
        )
        print(f"[Arc] FATAL: Runtime start failed: {exc}")


@app.on_event("shutdown")
async def shutdown_runtime() -> None:
    try:
        await arc_runtime.stop()
    except Exception as exc:
        print(f"[Arc] ERROR: Runtime stop failed: {exc}")


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

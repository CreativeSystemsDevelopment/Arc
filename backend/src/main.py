"""
Arc backend entry point.

Run with:
    uvicorn src.main:app --reload --port 8000

Or for LangGraph Studio development:
    langgraph dev --allow-blocking
"""

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

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

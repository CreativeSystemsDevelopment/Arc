"""
Arc: Deep Zero — canonical unified runtime.

Single backend profile:
- host shell + filesystem authority (admin-first)
- optional durable store/checkpointer when a Postgres URL is configured
- no HITL approval gates for execute/delete in owner mode
"""

import os
from typing import Any

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, LocalShellBackend, StoreBackend
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.memory import InMemoryStore
from langgraph.store.postgres import PostgresStore

from src.middleware import ARC_MIDDLEWARE
from src.model_factory import build_chat_model
from src.prompt import ARC_SYSTEM_PROMPT
from src.subagents.coder import coder_subagent
from src.subagents.doc_extraction import doc_extraction_subagent
from src.subagents.researcher import researcher_subagent
from src.subagents.uiux import uiux_subagent
from src.tools.reflection import create_skill, write_reflection
from src.tools.search import internet_search_tool
from src.tools.vm_health import disk_usage, list_processes, vm_health_check

DEFAULT_WORKSPACE_ROOT = "/home/eshan/arc/Arc"
DEFAULT_MEMORY_PATH = "/memories/AGENTS.md"
DEFAULT_SKILLS_PATH = "/skills/"


def _ensure_sslmode(connection_url: str) -> str:
    """Ensure sslmode is present for managed Postgres providers."""
    normalized = connection_url.strip()
    if "sslmode=" in normalized:
        return normalized
    separator = "&" if "?" in normalized else "?"
    return f"{normalized}{separator}sslmode=require"


def _resolve_database_url() -> str | None:
    """Pick the first configured persistence URL from supported env vars."""
    candidates = (
        os.environ.get("ARC_DATABASE_URL"),
        os.environ.get("NEON_DATABASE_URL"),
        os.environ.get("DATABASE_URL"),
        os.environ.get("GCP_DATABASE_URL"),
    )
    for candidate in candidates:
        if candidate and candidate.strip():
            return _ensure_sslmode(candidate)
    return None


def _build_persistence() -> tuple[Any, Any, bool]:
    """Return (store, checkpointer, durable_enabled)."""
    database_url = _resolve_database_url()
    if database_url:
        try:
            store = PostgresStore.from_conn_string(database_url)
            checkpointer = PostgresSaver.from_conn_string(database_url)
            # Lightweight probe so startup logs clearly reflect durable availability.
            store.get(namespace=("arc",), key="startup_probe")
            print("[Arc] Unified runtime using durable Postgres persistence.")
            return store, checkpointer, True
        except Exception as exc:  # pragma: no cover - startup fallback safety
            print(f"[Arc] Postgres persistence unavailable, falling back to in-memory: {exc}")

    print("[Arc] Unified runtime using in-memory persistence.")
    return InMemoryStore(), MemorySaver(), False


def build_agent():
    """Build and return the Arc Deep Zero agent graph."""
    model = build_chat_model()
    workspace_root = os.environ.get("ARC_WORKSPACE_ROOT", DEFAULT_WORKSPACE_ROOT)
    store, checkpointer, durable_enabled = _build_persistence()

    def create_backend(runtime):
        shell_backend = LocalShellBackend(
            root_dir=workspace_root,
            virtual_mode=False,
            inherit_env=True,
        )
        # Route durable namespaces through store-backed paths while preserving
        # full host shell/filesystem access for all other operations.
        return CompositeBackend(
            default=shell_backend,
            routes={
                DEFAULT_SKILLS_PATH: StoreBackend(runtime),
                "/memories/": StoreBackend(runtime),
            },
        )

    agent = create_deep_agent(
        model=model,
        name="arc-unified-admin",
        system_prompt=ARC_SYSTEM_PROMPT,
        tools=[
            internet_search_tool,
            vm_health_check,
            disk_usage,
            list_processes,
            write_reflection,
            create_skill,
        ],
        middleware=ARC_MIDDLEWARE,
        subagents=[
            researcher_subagent,
            coder_subagent,
            doc_extraction_subagent,
            uiux_subagent,
        ],
        checkpointer=checkpointer,
        store=store,
        backend=create_backend,
        skills=[DEFAULT_SKILLS_PATH],
        memory=[DEFAULT_MEMORY_PATH],
        # Owner mode: no approval gates for shell/admin operations.
        interrupt_on={},
    )

    if durable_enabled:
        print("[Arc] Skills/memory/checkpoints persisted via Postgres.")
    else:
        print("[Arc] Skills/memory/checkpoints are process-local until a database URL is configured.")

    return agent


arc_agent = build_agent()

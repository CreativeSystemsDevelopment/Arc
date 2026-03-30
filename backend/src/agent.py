"""
Arc: Deep Zero — canonical unified runtime.

Single backend profile:
- host shell + filesystem authority (admin-first)
- optional durable store/checkpointer when a Postgres URL is configured
- no HITL approval gates for execute/delete in owner mode
"""

import os
import inspect
from contextlib import ExitStack
from pathlib import Path
from typing import Any

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, LocalShellBackend, StoreBackend
from deepagents.backends.utils import create_file_data
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.memory import InMemoryStore
from langgraph.store.postgres import PostgresStore

from src.middleware import ARC_MIDDLEWARE
from src.model_factory import build_chat_model
from src.prompt import ARC_SYSTEM_PROMPT
from src.subagent_registry import (
    clear_reload_marker,
    dynamic_subagent_manifests,
    registered_subagents,
    registry_signature,
    reload_flag_path,
    reload_requested,
)
from src.tools.reflection import create_skill, create_subagent, request_subagent_reload, write_reflection
from src.tools.search import internet_search_tool
from src.tools.vm_health import disk_usage, list_processes, vm_health_check

DEFAULT_WORKSPACE_ROOT = "/home/eshan/arc/Arc/workspace"
DEFAULT_MEMORY_PATH = "/memories/AGENTS.md"
DEFAULT_SKILLS_PATH = "/skills/"
_AGENT_CACHE: Any | None = None
_AGENT_SIGNATURE: str | None = None
_PERSISTENCE_STACK: ExitStack | None = None
_LAST_PERSISTENCE_STATUS: dict[str, Any] = {
    "mode": "in_memory",
    "durable_enabled": False,
    "database_configured": False,
    "checkpointer_mode": "memory",
    "last_error": None,
}


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


def _seed_durable_memory_if_missing(store: Any, workspace_root: str) -> None:
    """Seed AGENTS memory doc into durable store when missing."""
    try:
        existing = store.get(namespace=("filesystem",), key=DEFAULT_MEMORY_PATH)
    except Exception:
        existing = None
    if existing:
        return

    repo_root = Path(__file__).resolve().parents[2]
    candidates = [
        Path(workspace_root) / "memories" / "AGENTS.md",
        repo_root / "workspace" / "memories" / "AGENTS.md",
        repo_root / "memories" / "AGENTS.md",
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                content = candidate.read_text(encoding="utf-8")
                store.put(
                    namespace=("filesystem",),
                    key=DEFAULT_MEMORY_PATH,
                    value=create_file_data(content),
                )
                print(f"[Arc] Seeded durable memory from {candidate}.")
                return
            except Exception as exc:  # pragma: no cover - defensive seeding path
                print(f"[Arc] Failed to seed durable memory from {candidate}: {exc}")


def _build_persistence(workspace_root: str) -> tuple[Any, Any, bool]:
    """Return (store, checkpointer, durable_enabled)."""
    global _PERSISTENCE_STACK, _LAST_PERSISTENCE_STATUS
    database_url = _resolve_database_url()
    if database_url:
        stack = ExitStack()
        try:
            store_candidate = PostgresStore.from_conn_string(database_url)
            checkpointer_candidate = PostgresSaver.from_conn_string(database_url)
            store = (
                stack.enter_context(store_candidate)
                if hasattr(store_candidate, "__enter__")
                else store_candidate
            )
            checkpointer = (
                stack.enter_context(checkpointer_candidate)
                if hasattr(checkpointer_candidate, "__enter__")
                else checkpointer_candidate
            )
            if hasattr(store, "setup"):
                store.setup()
            if hasattr(checkpointer, "setup"):
                checkpointer.setup()
            checkpointer_mode = "postgres_sync"
            async_method = getattr(checkpointer, "aget_tuple", None)
            qualname = ""
            if async_method is not None:
                func = getattr(async_method, "__func__", async_method)
                qualname = getattr(func, "__qualname__", "")
            if async_method is None or inspect.iscoroutinefunction(async_method) and qualname.startswith(
                "BaseCheckpointSaver."
            ):
                print(
                    "[Arc] Sync Postgres checkpointer detected. "
                    "Run execution must use sync stream for durable checkpoints."
                )
            # Lightweight probe so startup logs clearly reflect durable availability.
            store.get(namespace=("arc",), key="startup_probe")
            _seed_durable_memory_if_missing(store, workspace_root)
            if _PERSISTENCE_STACK is not None:
                _PERSISTENCE_STACK.close()
            _PERSISTENCE_STACK = stack
            _LAST_PERSISTENCE_STATUS = {
                "mode": "postgres",
                "durable_enabled": True,
                "database_configured": True,
                "checkpointer_mode": checkpointer_mode,
                "last_error": None,
            }
            print("[Arc] Unified runtime using durable Postgres persistence.")
            print("[Arc] Durable sync Postgres checkpointer is active.")
            return store, checkpointer, True
        except Exception as exc:  # pragma: no cover - startup fallback safety
            stack.close()
            _LAST_PERSISTENCE_STATUS = {
                "mode": "in_memory",
                "durable_enabled": False,
                "database_configured": True,
                "checkpointer_mode": "memory",
                "last_error": str(exc),
            }
            print(f"[Arc] Postgres persistence unavailable, falling back to in-memory: {exc}")

    _LAST_PERSISTENCE_STATUS = {
        "mode": "in_memory",
        "durable_enabled": False,
        "database_configured": False,
        "checkpointer_mode": "memory",
        "last_error": None,
    }
    print("[Arc] Unified runtime using in-memory persistence.")
    return InMemoryStore(), MemorySaver(), False


def _build_shell_env() -> dict[str, str]:
    """Ensure shell tools resolve backend virtualenv binaries first."""
    env = dict(os.environ)
    backend_root = Path(__file__).resolve().parents[1]
    venv_path = backend_root / ".venv"
    venv_bin = venv_path / "bin"
    if venv_bin.exists():
        current_path = env.get("PATH", "")
        path_parts = [part for part in current_path.split(":") if part]
        venv_bin_str = str(venv_bin)
        path_parts = [part for part in path_parts if part != venv_bin_str]
        env["PATH"] = ":".join([venv_bin_str, *path_parts])
        env["VIRTUAL_ENV"] = str(venv_path)
    return env


def build_agent():
    """Build and return the Arc Deep Zero agent graph."""
    model = build_chat_model()
    workspace_root = os.environ.get("ARC_WORKSPACE_ROOT") or os.environ.get(
        "WORKSPACE_ROOT", DEFAULT_WORKSPACE_ROOT
    )
    store, checkpointer, durable_enabled = _build_persistence(workspace_root)

    def create_backend(runtime):
        shell_backend = LocalShellBackend(
            root_dir=workspace_root,
            virtual_mode=False,
            env=_build_shell_env(),
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

    subagents = registered_subagents()
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
            create_subagent,
            request_subagent_reload,
        ],
        middleware=ARC_MIDDLEWARE,
        subagents=subagents,
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


def get_arc_agent(force_reload: bool = False):
    """Return cached Arc agent, rebuilding when registry changes."""
    global _AGENT_CACHE, _AGENT_SIGNATURE
    current_signature = registry_signature()
    should_reload = (
        force_reload
        or _AGENT_CACHE is None
        or _AGENT_SIGNATURE != current_signature
        or reload_requested()
    )
    if should_reload:
        _AGENT_CACHE = build_agent()
        _AGENT_SIGNATURE = current_signature
        clear_reload_marker()
    return _AGENT_CACHE


def get_runtime_status() -> dict[str, Any]:
    """Return backend runtime status for UI telemetry."""
    status = dict(_LAST_PERSISTENCE_STATUS)
    status.update(
        {
            "dynamic_subagent_count": len(dynamic_subagent_manifests()),
            "reload_pending": reload_requested(),
            "reload_marker_path": str(reload_flag_path()),
        }
    )
    return status


arc_agent = get_arc_agent(force_reload=True)

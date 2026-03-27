"""
Arc: Cloud-Enabled Deep Agent

Uses cloud PostgreSQL for persistent memory and skills.
Memory persists across different machines and locations.
"""

import os

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, FilesystemBackend, StoreBackend
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.postgres import PostgresStore

from src.middleware import ARC_MIDDLEWARE
from src.prompt import ARC_SYSTEM_PROMPT
from src.subagents.coder import coder_subagent
from src.subagents.doc_extraction import doc_extraction_subagent
from src.subagents.researcher import researcher_subagent
from src.subagents.uiux import uiux_subagent
from src.tools.reflection import create_skill, write_reflection
from src.tools.search import internet_search_tool
from src.tools.vm_health import disk_usage, list_processes, vm_health_check


def build_cloud_agent():
    """Build agent with cloud persistence for memory and skills."""

    # Model configuration
    model = init_chat_model(
        os.environ.get("AGENT_MODEL", "openrouter:moonshotai/kimi-k2.5"),
        max_retries=int(os.environ.get("AGENT_MAX_RETRIES", "10")),
        timeout=int(os.environ.get("AGENT_TIMEOUT", "120")),
    )

    # Cloud database connection
    # Use Neon, Supabase, AWS RDS, or any PostgreSQL host
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://user:pass@your-db-host:5432/arc"
    )

    # Cloud store for memory and skills (persistent across devices)
    store = PostgresStore.from_conn_string(database_url)

    # Checkpointing in cloud (resume conversations anywhere)
    checkpointer = PostgresSaver.from_conn_string(database_url)

    # Composite backend:
    # - /skills/ and /memories/ → Cloud StoreBackend (persistent everywhere)
    # - Everything else → Local FilesystemBackend (temporary files)
    def create_backend(runtime):
        return CompositeBackend(
            default=FilesystemBackend(
                root_dir=os.environ.get("WORKSPACE_ROOT", "./workspace"),
                virtual_mode=True,
            ),
            routes={
                "/skills/": StoreBackend(runtime),
                "/memories/": StoreBackend(runtime),
            }
        )

    agent = create_deep_agent(
        model=model,
        name="arc-cloud",
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
        backend=create_backend,
        store=store,
        checkpointer=checkpointer,
        skills=["/skills/"],
        memory=["/memories/AGENTS.md"],
        interrupt_on={
            "delete_file": True,
            "execute": {"allowed_decisions": ["approve", "reject"]},
        },
    )

    return agent


# Alternative: Use environment variable to toggle cloud mode
if os.environ.get("ARC_CLOUD_ENABLED", "false").lower() == "true":
    arc_agent = build_cloud_agent()
else:
    # Fall back to local agent
    from src.agent import build_agent
    arc_agent = build_agent()

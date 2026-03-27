"""
Arc: Google Cloud-Powered Agent

Two options:
1. Cloud SQL (PostgreSQL) - Same as Neon, managed by GCP
2. Firestore - Serverless document database

This implementation uses Cloud SQL PostgreSQL for full LangGraph compatibility.
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


def build_gcp_agent():
    """Build agent with Google Cloud SQL PostgreSQL.
    
    Required env vars:
    - GCP_DATABASE_URL: Cloud SQL connection string
      Format: postgres://user:pass@<INSTANCE_IP>/dbname
      
    Or use Cloud SQL Proxy for local development:
    - GCP_PROJECT_ID
    - GCP_REGION
    - GCP_INSTANCE_NAME
    
    Setup:
    1. Create Cloud SQL instance (PostgreSQL 14+)
    2. Enable Cloud SQL Admin API
    3. Create database and user
    4. For local dev: install cloud-sql-proxy
    """

    model = init_chat_model(
        os.environ.get("AGENT_MODEL", "openrouter:moonshotai/kimi-k2.5"),
        max_retries=int(os.environ.get("AGENT_MAX_RETRIES", "10")),
        timeout=int(os.environ.get("AGENT_TIMEOUT", "120")),
    )

    # Get Cloud SQL connection
    database_url = os.environ.get("GCP_DATABASE_URL")
    
    if not database_url:
        # Build connection string from components
        project = os.environ["GCP_PROJECT_ID"]
        region = os.environ["GCP_REGION"]
        instance = os.environ["GCP_INSTANCE_NAME"]
        user = os.environ["GCP_DB_USER"]
        password = os.environ["GCP_DB_PASSWORD"]
        dbname = os.environ.get("GCP_DB_NAME", "arc")
        
        # For Cloud SQL Proxy (local development)
        # Proxy runs on localhost:5432
        if os.environ.get("GCP_USE_PROXY", "false").lower() == "true":
            database_url = f"postgresql://{user}:{password}@localhost:5432/{dbname}"
        else:
            # Direct connection (requires authorized networks or private IP)
            database_url = f"postgresql://{user}:{password}@<INSTANCE_IP>:5432/{dbname}"

    # Create store and checkpointer
    store = PostgresStore.from_conn_string(database_url)
    checkpointer = PostgresSaver.from_conn_string(database_url)

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
        name="arc-gcp",
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


# Alternative: Firestore backend for simple key-value storage
def build_gcp_firestore_agent():
    """Build agent with Firestore for simple persistence.
    
    Note: Firestore doesn't support the full LangGraph checkpointer interface,
    so this is best for skills/memory only, not thread persistence.
    """
    from google.cloud import firestore
    
    db = firestore.Client()
    
    # Custom Firestore store implementation would go here
    # For now, recommend using Cloud SQL for full compatibility
    
    raise NotImplementedError(
        "Firestore backend requires custom implementation. "
        "Use Cloud SQL PostgreSQL for full compatibility."
    )


arc_agent = build_gcp_agent()

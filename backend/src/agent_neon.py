"""
Arc: Neon-Powered Cloud Agent

Uses Neon PostgreSQL for:
- Thread persistence (resume anywhere)
- Skills storage (accessible from any device) - STORED IN NEON
- Memory storage (persistent across sessions) - STORED IN NEON
- Working files (local temporary storage)

Get your connection string from: https://neon.tech
Dashboard -> Connection Details -> copy "Connection string"

FALLBACK: If Neon is unreachable, automatically falls back to local storage
and notifies the user.
"""

import os
import sys

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, FilesystemBackend, StoreBackend
from deepagents.backends.utils import create_file_data
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.memory import InMemoryStore

from src.middleware import ARC_MIDDLEWARE
from src.prompt import ARC_SYSTEM_PROMPT
from src.subagents.coder import coder_subagent
from src.subagents.doc_extraction import doc_extraction_subagent
from src.subagents.researcher import researcher_subagent
from src.subagents.uiux import uiux_subagent
from src.tools.reflection import create_skill, write_reflection
from src.tools.search import internet_search_tool
from src.tools.vm_health import disk_usage, list_processes, vm_health_check


def _notify_cloud_unavailable(error_msg: str):
    """Print a clear notification that cloud storage is unavailable."""
    print("\n" + "=" * 70)
    print("WARNING: CLOUD STORAGE UNAVAILABLE")
    print("=" * 70)
    print(f"Error: {error_msg}")
    print("\nFalling back to LOCAL storage for skills and memories.")
    print("Your data will be stored locally and will NOT sync across devices.")
    print("\nTo fix this:")
    print("  1. Check your internet connection")
    print("  2. Verify NEON_DATABASE_URL is correct in .env")
    print("  3. Ensure your Neon project is active at https://console.neon.tech")
    print("  4. Check if your IP is blocked by Neon firewall settings")
    print("=" * 70 + "\n")


def _seed_initial_skills_local(workspace_root: str):
    """Seed initial skills to local filesystem."""
    skills_dir = os.path.join(workspace_root, "skills", "langgraph-patterns")
    os.makedirs(skills_dir, exist_ok=True)
    
    skill_file = os.path.join(skills_dir, "SKILL.md")
    if not os.path.exists(skill_file):
        langgraph_skill = """---
name: langgraph-patterns
description: Common LangGraph patterns for state management, checkpointing, and agent workflows. Use when implementing checkpoint savers, state reducers, persistence, or thread management in LangGraph.
---

# LangGraph Patterns

## Checkpoint Savers

### MemorySaver (Development)
```python
from langgraph.checkpoint.memory import MemorySaver
checkpointer = MemorySaver()
agent = create_deep_agent(checkpointer=checkpointer)
```

### PostgreSQL (Production - Neon)
```python
from langgraph.checkpoint.postgres import PostgresSaver
checkpointer = PostgresSaver.from_conn_string(
    "postgresql://user:pass@host.neon.tech/dbname?sslmode=require"
)
```

## Thread Management

```python
# Start/resume a thread
config = {"configurable": {"thread_id": "session-123"}}
result = agent.invoke(input, config=config)
```
"""
        with open(skill_file, 'w') as f:
            f.write(langgraph_skill)
        print(f"[Arc] Created local skill: {skill_file}")


def _seed_initial_memory_local(workspace_root: str):
    """Seed initial memory to local filesystem."""
    memories_dir = os.path.join(workspace_root, "memories")
    os.makedirs(memories_dir, exist_ok=True)
    
    memory_file = os.path.join(memories_dir, "AGENTS.md")
    if not os.path.exists(memory_file):
        memory_content = """# Arc Memory: Project Conventions

## Code Style

### Python
- Use type hints everywhere
- Ruff for linting (line length: 100)
- pytest for testing
- Follow PEP 8

### TypeScript/React
- Strict mode enabled
- No `any` types
- Functional components with hooks

## Architecture Decisions

1. **Backend**: FastAPI + Deep Agents SDK
2. **Frontend**: Next.js 15 App Router + Framer Motion
3. **Models**: OpenRouter with Kimi K2.5 default
4. **Persistence**: Neon PostgreSQL (cloud) - FALLBACK TO LOCAL

## Current Mode
WARNING: Running in LOCAL FALLBACK MODE - Cloud storage is unavailable.
Skills and memories are stored locally and will not sync across devices.

## Important Notes

- Always use absolute paths for file operations (start with `/`)
- Research before implementing (use researcher subagent)
- Write reflections after significant work
- Use write_todos for complex multi-step tasks
"""
        with open(memory_file, 'w') as f:
            f.write(memory_content)
        print(f"[Arc] Created local memory: {memory_file}")


def _seed_initial_skills_cloud(store):
    """Seed initial skills into Neon store if they don't exist."""
    try:
        # Check if skills already exist
        existing = store.get(namespace=("filesystem",), key="/skills/README.md")
        if existing:
            return  # Skills already seeded
    except:
        pass
    
    # Seed initial skill README
    skill_readme = """# Arc Skills

This directory contains skills for the Arc agent.
Skills are loaded on-demand when relevant to the current task.

## Available Skills

- `langgraph-patterns/` - Common LangGraph patterns and best practices

## Creating New Skills

1. Create a new folder: `/skills/your-skill-name/`
2. Add a `SKILL.md` file with the skill documentation
3. The agent will automatically load it when needed

## Storage
These skills are stored in Neon PostgreSQL and sync across all your devices.
"""
    
    store.put(
        namespace=("filesystem",),
        key="/skills/README.md",
        value=create_file_data(skill_readme)
    )
    
    # Seed langgraph-patterns skill
    langgraph_skill = """---
name: langgraph-patterns
description: Common LangGraph patterns for state management, checkpointing, and agent workflows. Use when implementing checkpoint savers, state reducers, persistence, or thread management in LangGraph.
---

# LangGraph Patterns

## Checkpoint Savers

### MemorySaver (Development)
```python
from langgraph.checkpoint.memory import MemorySaver
checkpointer = MemorySaver()
agent = create_deep_agent(checkpointer=checkpointer)
```

### PostgreSQL (Production - Neon)
```python
from langgraph.checkpoint.postgres import PostgresSaver
checkpointer = PostgresSaver.from_conn_string(
    "postgresql://user:pass@host.neon.tech/dbname?sslmode=require"
)
```

## Thread Management

```python
# Start/resume a thread
config = {"configurable": {"thread_id": "session-123"}}
result = agent.invoke(input, config=config)
```

## Human-in-the-Loop Pattern

```python
from langgraph.types import interrupt

def human_approval_node(state):
    result = interrupt({
        "question": "Approve this action?",
        "action": state["pending_action"]
    })
    return {"approved": result == "yes"}
```
"""
    
    store.put(
        namespace=("filesystem",),
        key="/skills/langgraph-patterns/SKILL.md",
        value=create_file_data(langgraph_skill)
    )
    
    print("[Arc] Initial skills seeded to Neon cloud storage")


def _seed_initial_memory_cloud(store):
    """Seed initial memory into Neon store if it doesn't exist."""
    try:
        # Check if memory already exists
        existing = store.get(namespace=("filesystem",), key="/memories/AGENTS.md")
        if existing:
            return  # Memory already seeded
    except:
        pass
    
    # Seed initial memory
    memory_content = """# Arc Memory: Project Conventions

## Code Style

### Python
- Use type hints everywhere
- Ruff for linting (line length: 100)
- pytest for testing
- Follow PEP 8

### TypeScript/React
- Strict mode enabled
- No `any` types
- Functional components with hooks

## Architecture Decisions

1. **Backend**: FastAPI + Deep Agents SDK
2. **Frontend**: Next.js 15 App Router + Framer Motion
3. **Models**: OpenRouter with Kimi K2.5 default
4. **Persistence**: Neon PostgreSQL (cloud) - synced everywhere!

## Important Notes

- Always use absolute paths for file operations (start with `/`)
- Research before implementing (use researcher subagent)
- Write reflections after significant work
- Use write_todos for complex multi-step tasks
- Skills and memories are stored in Neon cloud - accessible from any device!
"""
    
    store.put(
        namespace=("filesystem",),
        key="/memories/AGENTS.md",
        value=create_file_data(memory_content)
    )
    
    print("[Arc] Initial memory seeded to Neon cloud storage")


def build_neon_agent():
    """Build agent with Neon PostgreSQL backend.
    
    Falls back to local storage if Neon is unreachable.
    
    Required env vars:
    - NEON_DATABASE_URL: postgresql://user:pass@host.neon.tech/dbname?sslmode=require
    """

    model = init_chat_model(
        os.environ.get("AGENT_MODEL", "openrouter:moonshotai/kimi-k2.5"),
        max_retries=int(os.environ.get("AGENT_MAX_RETRIES", "10")),
        timeout=int(os.environ.get("AGENT_TIMEOUT", "120")),
    )

    workspace_root = os.environ.get("WORKSPACE_ROOT", "./workspace")
    
    # Try to connect to Neon
    database_url = os.environ.get("NEON_DATABASE_URL")
    cloud_mode = False
    store = None
    checkpointer = None
    
    # Azure skills are excluded from sync
    excluded_skills = {
        "appinsights-instrumentation", "azure-ai", "azure-aigateway",
        "azure-cloud-migrate", "azure-compliance", "azure-compute",
        "azure-cost-optimization", "azure-deploy", "azure-diagnostics",
        "azure-hosted-copilot-sdk", "azure-kusto", "azure-messaging",
        "azure-observability", "azure-prepare", "azure-quotas",
        "azure-rbac", "azure-resource-lookup", "azure-resource-visualizer",
        "azure-storage", "azure-validate",
    }
    
    if database_url:
        try:
            # Ensure sslmode is set (Neon requires SSL)
            if "sslmode=" not in database_url:
                separator = "&" if "?" in database_url else "?"
                database_url += f"{separator}sslmode=require"
            
            # Attempt to create store and checkpointer
            from langgraph.store.postgres import PostgresStore
            store = PostgresStore.from_conn_string(database_url)
            checkpointer = PostgresSaver.from_conn_string(database_url)
            
            # Test connection with a simple operation
            store.get(namespace=("test",), key="connection_test")
            
            # If we get here, connection is successful
            cloud_mode = True
            print("[Arc] Connected to Neon PostgreSQL cloud storage")
            
            # Seed initial skills and memory to cloud storage
            _seed_initial_skills_cloud(store)
            _seed_initial_memory_cloud(store)
            
        except Exception as e:
            # Cloud connection failed - notify user and fall back
            _notify_cloud_unavailable(str(e))
            store = None
            checkpointer = None
    else:
        _notify_cloud_unavailable("NEON_DATABASE_URL not set")
    
    # If cloud mode failed, fall back to local
    if not cloud_mode:
        print("[Arc] Falling back to LOCAL storage mode")
        
        # Use in-memory store for local mode
        store = InMemoryStore()
        checkpointer = MemorySaver()
        
        # Seed local skills and memory
        _seed_initial_skills_local(workspace_root)
        _seed_initial_memory_local(workspace_root)
    
    # Build backend configuration
    if cloud_mode:
        # Cloud mode: Use CompositeBackend with StoreBackend for skills/memories
        def create_backend(runtime):
            return CompositeBackend(
                default=FilesystemBackend(
                    root_dir=workspace_root,
                    virtual_mode=True,
                ),
                routes={
                    "/skills/": StoreBackend(runtime),
                    "/memories/": StoreBackend(runtime),
                }
            )
        skills_paths = ["/skills/"]
        memory_paths = ["/memories/AGENTS.md"]
    else:
        # Local fallback: Everything on local filesystem
        def create_backend(runtime):
            return FilesystemBackend(
                root_dir=workspace_root,
                virtual_mode=True,
            )
        # Use relative paths for local mode
        skills_paths = ["/skills/"] if os.path.exists(os.path.join(workspace_root, "skills")) else []
        memory_paths = ["/memories/AGENTS.md"] if os.path.exists(os.path.join(workspace_root, "memories", "AGENTS.md")) else []

    agent = create_deep_agent(
        model=model,
        name="arc-neon" if cloud_mode else "arc-local",
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
        skills=skills_paths,
        memory=memory_paths,
        interrupt_on={
            "delete_file": True,
            "execute": {"allowed_decisions": ["approve", "reject"]},
        },
    )

    return agent


arc_agent = build_neon_agent()

"""
Arc: Deep Zero — the core LangGraph graph.

create_deep_agent() returns a compiled LangGraph StateGraph.
Uses OpenRouter models, 4 specialized subagents, custom middleware,
VM health tools, reflection tools, and web search.
"""

import os

from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.memory import MemorySaver

from src.middleware import ARC_MIDDLEWARE
from src.prompt import ARC_SYSTEM_PROMPT
from src.subagents.coder import coder_subagent
from src.subagents.doc_extraction import doc_extraction_subagent
from src.subagents.researcher import researcher_subagent
from src.subagents.uiux import uiux_subagent
from src.tools.reflection import create_skill, write_reflection
from src.tools.search import internet_search_tool
from src.tools.vm_health import disk_usage, list_processes, vm_health_check


def build_agent():
    """Build and return the Arc Deep Zero agent graph."""

    # Configure model with OpenRouter and Kimi K2.5
    # OpenRouter model format: openrouter:provider/model-name
    model = init_chat_model(
        os.environ.get("AGENT_MODEL", "openrouter:moonshotai/kimi-k2.5"),
        max_retries=int(os.environ.get("AGENT_MAX_RETRIES", "10")),
        timeout=int(os.environ.get("AGENT_TIMEOUT", "120")),
    )

    # Configure filesystem backend for persistent file operations
    # Files are stored in the workspace directory
    backend = FilesystemBackend(
        root_dir=os.environ.get("WORKSPACE_ROOT", "."),
        virtual_mode=True,  # Agent sees paths as absolute starting from /
    )

    # Checkpointing for thread persistence and HITL
    checkpointer = MemorySaver()

    # Determine workspace root for path checks
    workspace_root = os.environ.get("WORKSPACE_ROOT", ".")
    
    agent = create_deep_agent(
        model=model,
        name="arc-deep-zero",
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
        backend=backend,
        checkpointer=checkpointer,
        # Skills directory - loads SKILL.md files on demand
        # Virtual path /skills/ maps to {workspace_root}/skills/
        skills=["/skills/"] if os.path.exists(os.path.join(workspace_root, "skills")) else [],
        # Memory files for persistent context
        # Virtual path /memories/AGENTS.md maps to {workspace_root}/memories/AGENTS.md
        memory=["/memories/AGENTS.md"] if os.path.exists(os.path.join(workspace_root, "memories", "AGENTS.md")) else [],
        # Human-in-the-loop for sensitive operations
        interrupt_on={
            "delete_file": True,  # Approve, edit, or reject
            "execute": {"allowed_decisions": ["approve", "reject"]},  # No editing commands
        },
    )

    return agent


arc_agent = build_agent()

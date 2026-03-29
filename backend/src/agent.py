"""
Arc: Deep Zero — the core LangGraph graph.

The local FastAPI backend follows the documented Deep Agents pattern:
- `create_deep_agent()` with a chat model instance
- default state-backed filesystem for HTTP/server usage
- `MemorySaver` for thread checkpoints in local development
"""

from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend
from langgraph.checkpoint.memory import MemorySaver

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


def build_agent():
    """Build and return the Arc Deep Zero agent graph."""

    # Use a model instance, but otherwise stick to the documented Deep Agents
    # server pattern: let `create_deep_agent()` manage the default state-backed
    # backend for local HTTP usage.
    model = build_chat_model()

    # Checkpointing for thread persistence and HITL
    checkpointer = MemorySaver()
    # Enable direct host shell execution for Arc's execute tool.
    # This backend intentionally exposes real filesystem + shell capabilities.
    shell_backend = LocalShellBackend(
        root_dir="/home/eshan/arc/Arc",
        virtual_mode=False,
        inherit_env=True,
    )

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
        checkpointer=checkpointer,
        backend=shell_backend,
        # Human-in-the-loop for sensitive operations
        interrupt_on={
            "delete_file": True,  # Approve, edit, or reject
        },
    )

    return agent


arc_agent = build_agent()

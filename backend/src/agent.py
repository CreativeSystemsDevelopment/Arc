"""
Arc: Deep Zero — the core LangGraph graph.

create_deep_agent() returns a compiled LangGraph StateGraph.
Uses OpenRouter models, 4 specialized subagents, custom middleware,
VM health tools, reflection tools, and web search.
"""

import os

from deepagents import create_deep_agent
from langchain.chat_models import init_chat_model

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

    model = init_chat_model(
        os.environ.get("AGENT_MODEL", "openrouter:minimax/minimax-m2.7")
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
    )

    return agent


arc_agent = build_agent()

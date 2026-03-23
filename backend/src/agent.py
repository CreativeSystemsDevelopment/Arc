"""
Arc deep agent — the core LangGraph graph.

create_deep_agent() returns a compiled LangGraph StateGraph.
Use it with streaming, checkpointers, Studio, or any LangGraph feature.
"""

import os

from langchain.chat_models import init_chat_model
from deepagents import create_deep_agent, SubAgent

from src.tools.search import internet_search_tool
from src.subagents.researcher import researcher_subagent
from src.subagents.coder import coder_subagent


def build_agent():
    """Build and return the Arc deep agent graph."""

    model = init_chat_model(
        os.environ.get("AGENT_MODEL", "anthropic:claude-sonnet-4-20250514")
    )

    system_prompt = """You are Arc, an Archenemies Deep Agent.
You are built for complex, long-running, and open-ended tasks that require
careful planning, deep research, and precise execution.

Before any non-trivial task, call write_todos to plan your steps.
Delegate deep research to the researcher sub-agent.
Delegate code writing and execution to the coder sub-agent.
Write large outputs to files immediately — never let your context overflow.
Always complete every item in your todo list before marking a task done.
"""

    agent = create_deep_agent(
        model=model,
        tools=[internet_search_tool],
        system_prompt=system_prompt,
        subagents=[researcher_subagent, coder_subagent],
    )

    return agent


# Module-level singleton — compiled once on startup
arc_agent = build_agent()

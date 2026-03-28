"""
Standalone docs-aligned Deep Agent used for connectivity debugging.

This agent intentionally stays close to the LangChain Deep Agents quickstart:
- `create_deep_agent(...)`
- provider-qualified model string like `openrouter:moonshotai/kimi-k2.5`
- a tiny optional tool surface
- no custom middleware, subagents, or Arc orchestration
"""

from __future__ import annotations

import os

from deepagents import create_deep_agent
from langchain.tools import tool
from langgraph.checkpoint.memory import MemorySaver

DEFAULT_MINIMAL_MODEL = "openrouter:moonshotai/kimi-k2.5"


@tool
def ping() -> str:
    """Return a simple connectivity acknowledgment."""
    return "pong"


def current_minimal_model() -> str:
    return os.environ.get("AGENT_MODEL", DEFAULT_MINIMAL_MODEL).strip() or DEFAULT_MINIMAL_MODEL


def build_minimal_agent():
    """Build a minimal Deep Agent for end-to-end debugging."""
    return create_deep_agent(
        model=current_minimal_model(),
        tools=[ping],
        system_prompt=(
            "You are a minimal debugging assistant. Reply briefly and directly. "
            "Only call tools if the user explicitly asks you to test one."
        ),
        checkpointer=MemorySaver(),
    )


minimal_agent = build_minimal_agent()

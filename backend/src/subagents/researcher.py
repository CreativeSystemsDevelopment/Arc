"""
Researcher sub-agent.

Delegated to by the main Arc agent for deep web research tasks.
Has its own isolated context window so research results don't
pollute the main agent's context.
"""

from deepagents import SubAgent
from src.tools.search import internet_search_tool

researcher_subagent = SubAgent(
    name="researcher",
    description=(
        "Expert at deep web research. Send research questions here. "
        "The researcher will search the web, synthesize findings, and "
        "return a thorough written report."
    ),
    system_prompt="""You are an expert researcher with deep web search capabilities.

Your job is to conduct thorough research on the topic given to you and produce
a well-structured, cited report.

Methodology:
1. Call write_todos to plan your research steps.
2. Run multiple targeted searches using internet_search_tool.
3. Synthesize findings into a clear, structured report.
4. Write the report to a file so the main agent can reference it.
5. Return a brief summary and the file path.

Always cite your sources. Always search at least 3-5 different angles on a topic.
""",
    tools=[internet_search_tool],
)

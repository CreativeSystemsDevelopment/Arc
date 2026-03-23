"""
Internet search tool using Tavily.

Install: pip install langchain-tavily
Requires: TAVILY_API_KEY environment variable
"""

import os
from langchain.tools import tool
from langchain_tavily import TavilySearch


@tool
def internet_search_tool(query: str, max_results: int = 5) -> str:
    """Search the web for current information.

    Args:
        query: The search query.
        max_results: Maximum number of results to return (default 5).

    Returns:
        Search results as a formatted string.
    """
    search = TavilySearch(
        max_results=max_results,
        tavily_api_key=os.environ.get("TAVILY_API_KEY"),
    )
    return search.invoke(query)

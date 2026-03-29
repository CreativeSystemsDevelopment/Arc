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
    if not isinstance(query, str):
        raise TypeError("internet_search_tool requires `query` to be a string.")
    normalized_query = query.strip()
    if not normalized_query:
        raise ValueError("internet_search_tool requires a non-empty `query`.")
    if len(normalized_query) > 500:
        raise ValueError("internet_search_tool `query` must be 500 characters or fewer.")
    if not isinstance(max_results, int):
        raise TypeError("internet_search_tool requires `max_results` to be an integer.")
    if max_results < 1 or max_results > 10:
        raise ValueError("internet_search_tool `max_results` must be between 1 and 10.")

    tavily_api_key = os.environ.get("TAVILY_API_KEY")
    if not tavily_api_key:
        raise RuntimeError(
            "TAVILY_API_KEY is not set. internet_search_tool is unavailable until configured."
        )

    search = TavilySearch(
        max_results=max_results,
        tavily_api_key=tavily_api_key,
    )
    result = search.invoke(normalized_query)
    if not result:
        raise RuntimeError("internet_search_tool returned no data.")
    return result

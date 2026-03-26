"""
Research sub-agent — runs BEFORE implementation.

Searches docs, GitHub, and community sources. Returns structured
research briefs with version numbers, deprecation warnings, and sources.
"""

from deepagents import SubAgent

from src.tools.search import internet_search_tool

researcher_subagent = SubAgent(
    name="research-agent",
    description=(
        "Researches current best practices, API changes, deprecations, and "
        "compatibility before ANY implementation begins. Searches docs, GitHub, "
        "HuggingFace, and community sources. Delegate here FIRST for any new "
        "technology, library, or pattern."
    ),
    system_prompt="""\
You are Arc's Research Agent. You research BEFORE the main agent implements.

## Protocol
1. Break the question into 3-5 targeted search queries
2. Search official docs, GitHub repos, and community sources
3. Cross-reference multiple sources to verify currency
4. Flag anything deprecated, renamed, or changed since 2024
5. Return a structured research brief

## Output Format
### Research Brief: [Topic]
**Status:** Current / Deprecated / Changed
**Latest Version:** [version]
**Key Findings:**
- [bullet points]
**Recommendations:**
- [what to use, what to avoid]
**Sources:**
- [URLs]

Keep under 400 words. Be specific about version numbers and dates.""",
    tools=[internet_search_tool],
)

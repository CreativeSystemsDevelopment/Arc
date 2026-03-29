"""
Reflection and skill creation tools.

Enables Arc to write reflections to long-term memory
and create new skills from identified patterns.
"""

import os
from datetime import datetime
from typing import Literal

from langchain.tools import tool

from src.subagent_registry import mark_reload_requested, scaffold_subagent


@tool
def write_reflection(
    category: Literal["skill_opportunity", "lesson_learned", "anti_pattern"],
    title: str,
    content: str,
    scope: Literal["session", "repo", "user"] = "repo",
) -> str:
    """Write a reflection to long-term memory. Call this after completing
    significant work, debugging sessions, or when you identify a pattern.

    Categories:
    - skill_opportunity: A skill/MCP that would have helped
    - lesson_learned: What worked after a struggle
    - anti_pattern: A mistake to never repeat

    Scope determines where it's stored:
    - session: /memories/session/ (current task only)
    - repo: /memories/repo/ (permanent project knowledge)
    - user: /memories/ (user preferences)
    """
    timestamp = datetime.now().isoformat()
    entry = f"\n## [{category.upper()}] {title}\n*{timestamp}*\n\n{content}\n"

    scope_map = {
        "session": "/memories/session/reflections.md",
        "repo": "/memories/repo/reflections.md",
        "user": "/memories/user_reflections.md",
    }
    return f"Reflection formatted. Write this to {scope_map[scope]}:\n{entry}"


@tool
def create_skill(
    skill_name: str,
    description: str,
    triggers: list[str],
    instructions: str,
) -> str:
    """Create a new agent skill on-demand. Use this when you identify a
    repeated pattern that could be automated with a reusable skill.

    Args:
        skill_name: kebab-case name (e.g., 'langgraph-debug')
        description: One-line description for the frontmatter
        triggers: List of trigger phrases
        instructions: Full markdown instructions for the skill
    """
    skills_root = os.environ.get("ARC_SKILLS_ROOT", "/home/eshan/arc/Arc/skills")
    skill_dir = os.path.join(skills_root, skill_name)
    os.makedirs(skill_dir, exist_ok=True)

    trigger_str = ", ".join(triggers)
    skill_content = f"""---
description: {description}
---

# {skill_name}

**Triggers:** {trigger_str}

{instructions}
"""
    skill_path = os.path.join(skill_dir, "SKILL.md")
    with open(skill_path, "w") as f:
        f.write(skill_content)
    return f"Skill created at {skill_path}"


@tool
def create_subagent(
    subagent_name: str,
    description: str,
    system_prompt: str,
    model: str | None = None,
    overwrite: bool = False,
    activate_on_next_request: bool = True,
) -> str:
    """Create a dynamic subagent scaffold that Arc can load at runtime.

    Args:
        subagent_name: Human-readable name (slug is derived automatically).
        description: One-line purpose for UI and delegation context.
        system_prompt: Full system instructions for the subagent.
        model: Optional model label for future routing metadata.
        overwrite: Replace existing scaffold files when true.
        activate_on_next_request: Mark runtime reload so the new subagent
            becomes discoverable on the next API request.
    """
    created = scaffold_subagent(
        name=subagent_name,
        description=description,
        system_prompt=system_prompt,
        model=model,
        overwrite=overwrite,
    )
    if activate_on_next_request:
        marker = mark_reload_requested(
            reason=f"create_subagent:{created['slug']}"
        )
        return (
            f"Subagent '{created['slug']}' created.\n"
            f"- Manifest: {created['manifest_path']}\n"
            f"- Prompt: {created['prompt_path']}\n"
            f"- Reload marker: {marker}\n"
            "The subagent will be available on the next Arc request."
        )
    return (
        f"Subagent '{created['slug']}' created.\n"
        f"- Manifest: {created['manifest_path']}\n"
        f"- Prompt: {created['prompt_path']}\n"
        "Reload was not requested; call request_subagent_reload when ready."
    )


@tool
def request_subagent_reload(reason: str = "manual") -> str:
    """Request dynamic subagent registry reload for subsequent requests."""
    marker = mark_reload_requested(reason=reason)
    return (
        "Subagent reload requested.\n"
        f"- Marker: {marker}\n"
        "Arc will refresh its agent graph on the next request."
    )

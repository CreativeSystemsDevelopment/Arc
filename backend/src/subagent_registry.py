"""
Dynamic subagent registry and scaffolding helpers.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any

from deepagents import SubAgent

from src.subagents.coder import coder_subagent
from src.subagents.doc_extraction import doc_extraction_subagent
from src.subagents.researcher import researcher_subagent
from src.subagents.uiux import uiux_subagent

BUILTIN_SUBAGENTS = [
    researcher_subagent,
    coder_subagent,
    doc_extraction_subagent,
    uiux_subagent,
]

DEFAULT_DYNAMIC_SUBAGENTS_DIR = "/home/eshan/arc/Arc/backend/dynamic_subagents"
DEFAULT_RELOAD_FLAG = "/tmp/arc-subagent-reload.flag"
SLUG_PATTERN = re.compile(r"[^a-z0-9-]+")


def dynamic_subagents_dir() -> Path:
    target = Path(
        os.environ.get("ARC_DYNAMIC_SUBAGENTS_DIR", DEFAULT_DYNAMIC_SUBAGENTS_DIR)
    )
    target.mkdir(parents=True, exist_ok=True)
    return target


def reload_flag_path() -> Path:
    return Path(os.environ.get("ARC_SUBAGENT_RELOAD_FLAG", DEFAULT_RELOAD_FLAG))


def _slugify(raw_name: str) -> str:
    base = raw_name.strip().lower().replace("_", "-").replace(" ", "-")
    normalized = SLUG_PATTERN.sub("-", base).strip("-")
    if not normalized:
        raise ValueError("Subagent name must include at least one alphanumeric character.")
    return normalized


def _manifest_path(slug: str) -> Path:
    return dynamic_subagents_dir() / f"{slug}.json"


def _prompt_path(slug: str) -> Path:
    return dynamic_subagents_dir() / f"{slug}.prompt.md"


def scaffold_subagent(
    *,
    name: str,
    description: str,
    system_prompt: str,
    model: str | None = None,
    overwrite: bool = False,
) -> dict[str, str]:
    """Create dynamic subagent manifest + prompt files."""
    slug = _slugify(name)
    manifest_path = _manifest_path(slug)
    prompt_path = _prompt_path(slug)
    if (manifest_path.exists() or prompt_path.exists()) and not overwrite:
        raise FileExistsError(
            f"Subagent '{slug}' already exists. Re-run with overwrite=True to replace."
        )

    now = datetime.now(timezone.utc).isoformat()
    prompt_path.write_text(system_prompt.strip() + "\n", encoding="utf-8")
    manifest_payload: dict[str, Any] = {
        "name": slug,
        "display_name": name.strip(),
        "description": description.strip(),
        "system_prompt_file": prompt_path.name,
        "created_at": now,
        "updated_at": now,
    }
    if model and model.strip():
        manifest_payload["model"] = model.strip()
    manifest_path.write_text(
        json.dumps(manifest_payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return {
        "slug": slug,
        "manifest_path": str(manifest_path),
        "prompt_path": str(prompt_path),
    }


def _load_manifest(path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(payload, dict):
        return None

    name = payload.get("name")
    display_name = payload.get("display_name")
    description = payload.get("description")
    prompt_file = payload.get("system_prompt_file")
    if (
        not isinstance(name, str)
        or not isinstance(display_name, str)
        or not isinstance(description, str)
        or not isinstance(prompt_file, str)
    ):
        return None

    prompt_path = dynamic_subagents_dir() / prompt_file
    if not prompt_path.exists():
        return None
    try:
        system_prompt = prompt_path.read_text(encoding="utf-8")
    except OSError:
        return None

    payload["system_prompt"] = system_prompt
    payload["prompt_path"] = str(prompt_path)
    payload["manifest_path"] = str(path)
    return payload


def dynamic_subagent_manifests() -> list[dict[str, Any]]:
    manifests: list[dict[str, Any]] = []
    for manifest_path in sorted(dynamic_subagents_dir().glob("*.json")):
        loaded = _load_manifest(manifest_path)
        if loaded is not None:
            manifests.append(loaded)
    return manifests


def dynamic_subagents() -> list[SubAgent]:
    agents: list[SubAgent] = []
    for payload in dynamic_subagent_manifests():
        name = str(payload.get("name"))
        description = str(payload.get("description"))
        system_prompt = str(payload.get("system_prompt", ""))
        if not system_prompt.strip():
            continue
        agents.append(
            SubAgent(
                name=name,
                description=description,
                system_prompt=system_prompt,
                tools=[],
            )
        )
    return agents


def registered_subagents() -> list[SubAgent]:
    return [*BUILTIN_SUBAGENTS, *dynamic_subagents()]


def mark_reload_requested(reason: str) -> str:
    marker = reload_flag_path()
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(
        json.dumps(
            {
                "reason": reason,
                "requested_at": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return str(marker)


def reload_requested() -> bool:
    return reload_flag_path().exists()


def clear_reload_marker() -> None:
    marker = reload_flag_path()
    if marker.exists():
        marker.unlink()


def registry_signature() -> str:
    """Hash builtin+dynamic registry state for reload detection."""
    digest = sha256()
    for builtin in BUILTIN_SUBAGENTS:
        digest.update(str(getattr(builtin, "name", "")).encode("utf-8"))
        digest.update(str(getattr(builtin, "description", "")).encode("utf-8"))

    for manifest in dynamic_subagent_manifests():
        digest.update(str(manifest.get("name", "")).encode("utf-8"))
        digest.update(str(manifest.get("description", "")).encode("utf-8"))
        digest.update(str(manifest.get("system_prompt", "")).encode("utf-8"))
        digest.update(str(manifest.get("model", "")).encode("utf-8"))

    marker = reload_flag_path()
    if marker.exists():
        digest.update(str(marker.stat().st_mtime_ns).encode("utf-8"))
    return digest.hexdigest()

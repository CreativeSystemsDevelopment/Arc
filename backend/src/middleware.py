"""
Arc middleware pipeline.

- Audit log: tracks every tool call with timing
- Research gate: reminds agent to research before implementation
- Self-maintenance: periodic health check hints
"""

import time
from datetime import datetime

from langchain.agents.middleware import wrap_tool_call

_tool_log: list[dict] = []


@wrap_tool_call
def audit_log_middleware(request, handler):
    """Log every tool call with timestamp, name, and duration."""
    entry = {
        "timestamp": datetime.now().isoformat(),
        "tool": request.name if hasattr(request, "name") else str(request),
        "args": request.args if hasattr(request, "args") else {},
    }
    _tool_log.append(entry)

    start = time.time()
    result = handler(request)
    entry["duration_ms"] = round((time.time() - start) * 1000)

    if len(_tool_log) > 500:
        _tool_log.pop(0)

    return result


_research_done: set[str] = set()


@wrap_tool_call
def research_gate_middleware(request, handler):
    """Track whether research was done before implementation tools."""
    implementation_tools = {"write_file", "edit_file", "execute"}
    tool_name = request.name if hasattr(request, "name") else ""

    if tool_name in implementation_tools and tool_name not in _research_done:
        _research_done.add(tool_name)

    result = handler(request)
    return result


_last_health_check = 0.0
HEALTH_CHECK_INTERVAL = 300


@wrap_tool_call
def self_maintenance_middleware(request, handler):
    """Periodic health check hint piggyback."""
    global _last_health_check
    now = time.time()
    result = handler(request)

    if now - _last_health_check > HEALTH_CHECK_INTERVAL:
        _last_health_check = now

    return result


ARC_MIDDLEWARE = [
    audit_log_middleware,
    research_gate_middleware,
    self_maintenance_middleware,
]

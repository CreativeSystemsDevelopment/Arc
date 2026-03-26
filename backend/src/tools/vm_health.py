"""
VM health and administration tools.

Provides system monitoring capabilities — CPU, memory, disk,
processes, and service status.
"""

import os
import shutil
from datetime import datetime
from typing import Literal

import psutil
from langchain.tools import tool


@tool
def vm_health_check() -> dict:
    """Get a complete health snapshot of this VM: CPU, memory, disk,
    load averages, and uptime. Use this proactively to monitor system health."""
    disk = shutil.disk_usage("/")
    mem = psutil.virtual_memory()
    net = psutil.net_io_counters()
    boot = datetime.fromtimestamp(psutil.boot_time())
    return {
        "cpu_percent": psutil.cpu_percent(interval=1),
        "cpu_count": psutil.cpu_count(),
        "load_avg_1m_5m_15m": list(os.getloadavg()),
        "memory": {
            "total_gb": round(mem.total / (1024**3), 2),
            "used_gb": round(mem.used / (1024**3), 2),
            "available_gb": round(mem.available / (1024**3), 2),
            "percent": mem.percent,
        },
        "disk": {
            "total_gb": round(disk.total / (1024**3), 2),
            "used_gb": round(disk.used / (1024**3), 2),
            "free_gb": round(disk.free / (1024**3), 2),
            "percent_used": round(disk.used / disk.total * 100, 1),
        },
        "network": {
            "bytes_sent_mb": round(net.bytes_sent / (1024**2), 2),
            "bytes_recv_mb": round(net.bytes_recv / (1024**2), 2),
        },
        "uptime_since": boot.isoformat(),
        "timestamp": datetime.now().isoformat(),
    }


@tool
def disk_usage(path: str = "/") -> dict:
    """Get detailed disk usage for a specific path."""
    usage = shutil.disk_usage(path)
    return {
        "path": path,
        "total_gb": round(usage.total / (1024**3), 2),
        "used_gb": round(usage.used / (1024**3), 2),
        "free_gb": round(usage.free / (1024**3), 2),
        "percent_used": round(usage.used / usage.total * 100, 1),
    }


@tool
def list_processes(
    sort_by: Literal["cpu", "memory"] = "memory", top_n: int = 10
) -> list[dict]:
    """List the top N processes by CPU or memory usage."""
    procs = []
    for p in psutil.process_iter(
        ["pid", "name", "cpu_percent", "memory_percent", "status"]
    ):
        try:
            procs.append(p.info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    key = "cpu_percent" if sort_by == "cpu" else "memory_percent"
    procs.sort(key=lambda x: x.get(key, 0) or 0, reverse=True)
    return procs[:top_n]

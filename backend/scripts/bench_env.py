"""Where a load or chaos run was measured: the machine, Docker, each service's limits (compose)
and how much of them the services used. The site prints this next to every number."""

from __future__ import annotations

import json
import os
import platform
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parents[1]
REPORTS = BACKEND.parent / "src" / "content" / "reports"
PROJECT = "runtime-city"
# Services that only run once at start (migrations): not part of the running system.
ONE_SHOT = {"orders-api-migrate", "payments-migrate"}


def docker(*args: str, timeout: float = 60) -> str:
    """Runs a docker command (fixed arguments, no shell) and returns its output."""
    result = subprocess.run(  # noqa: S603 — fixed program and arguments
        ["docker", *args],  # noqa: S607 — docker from PATH, as the developer runs it
        cwd=BACKEND,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=timeout,
        check=True,
    )
    return result.stdout


def _cpu_name() -> str:
    if sys.platform == "win32":
        import winreg  # noqa: PLC0415 — Windows only

        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
        ) as key:
            name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            return " ".join(str(name).split())
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.exists():
        for line in cpuinfo.read_text(encoding="utf-8").splitlines():
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    return platform.processor() or platform.machine()


def _memory_gb() -> float:
    if sys.platform == "win32":
        import ctypes  # noqa: PLC0415 — Windows only

        class MemoryStatus(ctypes.Structure):
            # The ctypes layout of MEMORYSTATUSEX.
            _fields_ = [
                ("length", ctypes.c_ulong),
                ("load", ctypes.c_ulong),
                ("total", ctypes.c_ulonglong),
                ("available", ctypes.c_ulonglong),
                ("total_page", ctypes.c_ulonglong),
                ("available_page", ctypes.c_ulonglong),
                ("total_virtual", ctypes.c_ulonglong),
                ("available_virtual", ctypes.c_ulonglong),
                ("available_extended", ctypes.c_ulonglong),
            ]

        status = MemoryStatus()
        status.length = ctypes.sizeof(MemoryStatus)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))
        return round(float(status.total) / 2**30, 1)
    meminfo = Path("/proc/meminfo")
    match = re.search(r"MemTotal:\s+(\d+)", meminfo.read_text(encoding="utf-8"))
    return round(int(match.group(1)) / 2**20, 1) if match else 0.0


def _limits() -> list[dict[str, Any]]:
    config = json.loads(docker("compose", "config", "--format", "json"))
    limits: list[dict[str, Any]] = []
    for name, service in sorted(config["services"].items()):
        if name in ONE_SHOT:
            continue
        deploy = service.get("deploy") or {}
        resource = (deploy.get("resources") or {}).get("limits") or {}
        memory = resource.get("memory")
        limits.append(
            {
                "service": name,
                "replicas": int(deploy.get("replicas") or 1),
                "cpus": float(resource["cpus"]) if "cpus" in resource else None,
                "memory_mb": round(int(memory) / 2**20) if memory else None,
            }
        )
    return limits


def environment(load_generator: str) -> dict[str, Any]:
    info = json.loads(docker("info", "--format", "{{json .}}"))
    return {
        "machine": {
            "cpu": _cpu_name(),
            "logical_cpus": os.cpu_count() or 0,
            "memory_gb": _memory_gb(),
            "os": platform.platform(terse=True),
        },
        "docker": {
            "engine": f"{info.get('OperatingSystem', 'Docker')} {info.get('ServerVersion', '')}",
            "cpus": int(info.get("NCPU", 0)),
            "memory_gb": round(int(info.get("MemTotal", 0)) / 2**30, 1),
        },
        "load_generator": load_generator,
        "limits": _limits(),
    }


_UNITS = {"b": 1, "kib": 2**10, "mib": 2**20, "gib": 2**30, "kb": 1e3, "mb": 1e6, "gb": 1e9}


def _bytes(text: str) -> float:
    match = re.match(r"([\d.]+)\s*([a-zA-Z]+)", text.strip())
    if not match:
        return 0.0
    return float(match.group(1)) * _UNITS.get(match.group(2).lower(), 1)


@dataclass
class ContainerPeaks:
    """The highest CPU and memory each service's containers reached while sampling."""

    cpu_pct: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    memory_mb: dict[str, float] = field(default_factory=lambda: defaultdict(float))

    def sample(self) -> None:
        output = docker("stats", "--no-stream", "--format", "{{json .}}", timeout=30)
        for line in output.splitlines():
            row = json.loads(line)
            name = str(row.get("Name", ""))
            if not name.startswith(f"{PROJECT}-"):
                continue
            # runtime-city-order-worker-2 → order-worker
            service = re.sub(r"-\d+$", "", name.removeprefix(f"{PROJECT}-"))
            cpu = float(str(row.get("CPUPerc", "0")).rstrip("%") or 0)
            memory = _bytes(str(row.get("MemUsage", "0B")).split("/")[0]) / 2**20
            self.cpu_pct[service] = max(self.cpu_pct[service], cpu)
            self.memory_mb[service] = max(self.memory_mb[service], memory)

    def report(self) -> list[dict[str, Any]]:
        return [
            {
                "service": service,
                "cpu_peak_pct": round(self.cpu_pct[service], 1),
                "memory_peak_mb": round(self.memory_mb[service]),
            }
            for service in sorted(self.cpu_pct)
        ]


def write_report(name: str, report: dict[str, Any]) -> Path:
    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / f"{name}.json"
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path

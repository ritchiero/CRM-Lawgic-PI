#!/usr/bin/env python3
"""Fuente común de nombres para la verificación de actividad IMPI."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[3]
REPRESENTATIVES_FILE = REPO_ROOT / "src" / "data" / "representativesData.ts"
TARGET_QUEUE_FILE = SCRIPT_DIR / "runtime" / "target_activity_queue.json"


def normalize_target_name(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    value = "".join(
        character
        for character in decomposed
        if unicodedata.category(character) != "Mn"
    )
    return " ".join(value.split()).lower()


def _parse_typescript(path: Path) -> list[dict[str, Any]]:
    source = path.read_text(encoding="utf-8")
    pattern = re.compile(
        r'\{\s*rank:\s*(\d+),\s*name:\s*"([^"]+)",\s*brandCount:\s*(\d+)\s*\}'
    )
    records = [
        {"rank": int(rank), "name": name, "brandCount": int(count)}
        for rank, name, count in pattern.findall(source)
    ]
    if not records:
        raise ValueError(f"No se encontraron targets en {path}")
    return records


def _parse_json(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("records") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        raise ValueError(f"La cola no contiene una lista de registros: {path}")

    parsed: list[dict[str, Any]] = []
    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict) or not str(record.get("name", "")).strip():
            raise ValueError(f"Target inválido en {path}, posición {index}")
        parsed.append({
            "rank": int(record.get("rank", index)),
            "name": " ".join(str(record["name"]).split()),
            "brandCount": int(record.get("brandCount", 0)),
        })
    if not parsed:
        raise ValueError(f"La cola de Targets está vacía: {path}")
    return parsed


def load_activity_targets(path: Path | None = None) -> list[dict[str, Any]]:
    selected = path or (TARGET_QUEUE_FILE if TARGET_QUEUE_FILE.exists() else REPRESENTATIVES_FILE)
    if selected.suffix.lower() == ".json":
        return _parse_json(selected)
    return _parse_typescript(selected)

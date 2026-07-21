#!/usr/bin/env python3
"""Combina representantes y la exportación del CRM en una cola local única."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

from activity_target_source import (
    REPRESENTATIVES_FILE,
    TARGET_QUEUE_FILE,
    load_activity_targets,
    normalize_target_name,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Construye la cola completa de Targets")
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=TARGET_QUEUE_FILE)
    return parser.parse_args()


def csv_names(path: Path) -> list[str]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        name_header = next(
            (header for header in headers if header.strip().casefold() in {"nombre", "name"}),
            None,
        )
        if not name_header:
            raise ValueError("El CSV no contiene una columna Nombre")
        return [
            " ".join(str(row.get(name_header, "")).split())
            for row in reader
            if str(row.get(name_header, "")).strip()
        ]


def main() -> int:
    args = parse_args()
    representatives = load_activity_targets(REPRESENTATIVES_FILE)
    crm_names = csv_names(args.csv)

    records: list[dict[str, object]] = []
    seen: set[str] = set()
    for representative in representatives:
        key = normalize_target_name(representative["name"])
        if key in seen:
            continue
        seen.add(key)
        records.append({
            "rank": representative["rank"],
            "name": representative["name"],
            "brandCount": representative["brandCount"],
            "origin": "representative",
        })

    next_rank = max(record["rank"] for record in records) + 1
    additional = 0
    for name in crm_names:
        key = normalize_target_name(name)
        if key in seen:
            continue
        seen.add(key)
        records.append({
            "rank": next_rank,
            "name": name,
            "brandCount": 0,
            "origin": "target",
        })
        next_rank += 1
        additional += 1

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCsv": args.csv.name,
        "crmRows": len(crm_names),
        "representativeNames": sum(record["origin"] == "representative" for record in records),
        "additionalTargetNames": additional,
        "totalUniqueSearchNames": len(records),
        "records": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({key: value for key, value in payload.items() if key != "records"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

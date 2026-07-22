#!/usr/bin/env python3
"""Reconsulta nombres canónicos que no tienen evidencia exacta publicada."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from marcia_activity_scraper import (
    ProxyPool,
    activity_level,
    count_agent_records_resilient,
    iso_now,
    normalize_key,
)

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT = SCRIPT_DIR / "runtime" / "canonical_name_corrections.jsonl"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verifica en MARCia los nombres faltantes de una auditoría canónica"
    )
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--delay", type=float, default=0.5)
    return parser.parse_args()


def load_completed(path: Path) -> set[str]:
    if not path.exists():
        return set()
    completed: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        result = json.loads(line)
        if result.get("representativeActivityVerificationStatus") == "verified":
            completed.add(normalize_key(str(result.get("name", ""))))
    return completed


def append_result(path: Path, result: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as output:
        output.write(json.dumps(result, ensure_ascii=False) + "\n")
        output.flush()


def main() -> int:
    args = parse_args()
    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    names = [" ".join(str(name).split()) for name in audit.get("missingNames", [])]
    completed = load_completed(args.output)
    pending = [name for name in names if normalize_key(name) not in completed]
    proxy_pool = ProxyPool()

    print(json.dumps({
        "auditNames": len(names),
        "alreadyCompleted": len(names) - len(pending),
        "pending": len(pending),
        "output": str(args.output),
    }, ensure_ascii=False))

    for index, name in enumerate(pending, start=1):
        count, query, source_indexed_at = count_agent_records_resilient(
            name,
            args.delay,
            proxy_pool,
        )
        result: dict[str, object] = {
            "rank": index,
            "name": name,
            "historicalBrandCount": 0,
            "representativeActivityVerified": True,
            "representativeActivityVerificationStatus": "verified",
            "representativeActivityLevel": activity_level(count),
            "representativeActivityCount": count,
            "activityClassificationBasis": "verified_marcia_exact_agent_records",
            "impiProfileCount": 1,
            "impiProfilesProcessed": 1,
            "impiRawExpedientCount": count,
            "impiUniqueExpedientCount": count,
            "representativeActivityVerifiedAt": iso_now(),
            "impiSourceIndexedAt": source_indexed_at,
            "exactAgentQuery": query,
            "profiles": [],
            "source": "marcia_exact_agent_phrase",
        }
        append_result(args.output, result)
        print(f"[{index}/{len(pending)}] {name}: {count}", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

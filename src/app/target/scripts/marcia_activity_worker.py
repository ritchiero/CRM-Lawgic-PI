#!/usr/bin/env python3
"""Supervisor continuo de MARCia y publicación por lotes."""

from __future__ import annotations

import argparse
import json
import logging
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[3]
SCRAPER = SCRIPT_DIR / "marcia_activity_scraper.py"
RESULTS = SCRIPT_DIR / "runtime" / "representative_activity_results.jsonl"
REPRESENTATIVES = REPO_ROOT / "src" / "data" / "representativesData.ts"
PUBLISHER = REPO_ROOT / "scripts" / "publish-representative-activity.cjs"


def normalize_name(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    value = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return " ".join(value.split()).lower()


def representative_names() -> set[str]:
    source = REPRESENTATIVES.read_text(encoding="utf-8")
    return {
        normalize_name(name)
        for name in re.findall(r'\{\s*rank:\s*\d+,\s*name:\s*"([^"]+)"', source)
    }


def verified_names() -> set[str]:
    if not RESULTS.exists():
        return set()
    verified: set[str] = set()
    for line in RESULTS.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        result = json.loads(line)
        if (
            result.get("representativeActivityVerified") is True
            and result.get("representativeActivityVerificationStatus") == "verified"
        ):
            verified.add(normalize_name(str(result.get("name", ""))))
    return verified


def is_complete() -> bool:
    return representative_names().issubset(verified_names())


def wait_with_updates(seconds: int) -> None:
    remaining = seconds
    while remaining > 0:
        step = min(60, remaining)
        time.sleep(step)
        remaining -= step
        if remaining:
            logging.info("Reinicio automático: faltan %s segundos.", remaining)


def publish(minimum_new: int, force: bool = False) -> None:
    command = ["node", str(PUBLISHER), "--minimum-new", str(minimum_new), "--push"]
    if force:
        command.append("--force")
    result = subprocess.run(command, cwd=REPO_ROOT, check=False)
    if result.returncode:
        logging.error("La publicación falló; se reintentará después del siguiente representante.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Procesa MARCia sin intervención")
    parser.add_argument("--publish-every", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--delay", type=float, default=0.5)
    parser.add_argument("--cooldown", type=int, default=600)
    parser.add_argument("--no-publish", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [MARCIA-WORKER] %(message)s")
    if args.publish_every < 1 or args.batch_size < 1 or args.cooldown < 1:
        raise ValueError("Los intervalos deben ser positivos")

    while not is_complete():
        result = subprocess.run(
            [
                sys.executable,
                "-u",
                str(SCRAPER),
                "--limit",
                str(args.batch_size),
                "--delay",
                str(args.delay),
            ],
            cwd=REPO_ROOT,
            check=False,
        )
        if result.returncode == 0:
            if not args.no_publish:
                publish(args.publish_every)
            continue

        logging.error(
            "La consulta salió con código %s; reintento en %s segundos.",
            result.returncode,
            args.cooldown,
        )
        wait_with_updates(args.cooldown)

    if not args.no_publish:
        publish(args.publish_every, force=True)
    logging.info("Todos los representantes quedaron consultados y publicados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

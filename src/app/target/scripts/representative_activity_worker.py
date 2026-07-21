#!/usr/bin/env python3
"""Supervisor continuo del verificador y la publicación por lotes."""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
import time
from pathlib import Path

from activity_target_source import load_activity_targets

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[3]
SCRAPER = SCRIPT_DIR / "representative_activity_scraper.py"
CHECKPOINT = SCRIPT_DIR / "runtime" / "representative_activity_checkpoint.json"
PUBLISHER = REPO_ROOT / "scripts" / "publish-representative-activity.cjs"
RESTART_WAIT_SECONDS = 600


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Procesa y publica representantes sin intervención")
    parser.add_argument("--publish-every", type=int, default=10)
    parser.add_argument("--no-publish", action="store_true")
    parser.add_argument("--delay", type=float, default=2.5)
    parser.add_argument("--cooldown", type=int, default=600)
    return parser.parse_args()


def wait_with_updates(seconds: int) -> None:
    remaining = seconds
    while remaining > 0:
        step = min(60, remaining)
        time.sleep(step)
        remaining -= step
        if remaining:
            logging.info("Reinicio automático: faltan %s segundos.", remaining)


def is_complete() -> bool:
    if not CHECKPOINT.exists():
        return False
    checkpoint = json.loads(CHECKPOINT.read_text(encoding="utf-8"))
    total = len(load_activity_targets())
    return int(checkpoint.get("next_representative_index", 0)) >= total


def publish(minimum_new: int, force: bool = False) -> None:
    command = ["node", str(PUBLISHER), "--minimum-new", str(minimum_new), "--push"]
    if force:
        command.append("--force")
    result = subprocess.run(command, cwd=REPO_ROOT, check=False)
    if result.returncode:
        logging.error("La publicación falló; se reintentará después del siguiente representante.")


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [WORKER] %(message)s")
    if args.publish_every < 1:
        raise ValueError("--publish-every debe ser positivo")

    while not is_complete():
        command = [
            sys.executable,
            "-u",
            str(SCRAPER),
            "--resume",
            "--limit",
            "1",
            "--delay",
            str(args.delay),
            "--cooldown",
            str(args.cooldown),
        ]
        result = subprocess.run(command, cwd=REPO_ROOT, check=False)
        if result.returncode == 0:
            if not args.no_publish:
                publish(args.publish_every)
            continue

        logging.error(
            "El verificador salió con código %s; checkpoint intacto. Reintento en 10 minutos.",
            result.returncode,
        )
        wait_with_updates(RESTART_WAIT_SECONDS)

    if not args.no_publish:
        publish(args.publish_every, force=True)
    logging.info("Los representantes quedaron verificados y publicados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

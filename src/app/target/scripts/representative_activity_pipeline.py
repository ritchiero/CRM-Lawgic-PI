#!/usr/bin/env python3
"""Ejecuta el conteo histórico rápido y después la auditoría actual detallada."""

from __future__ import annotations

import argparse
import logging
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[3]
MARCIA_WORKER = SCRIPT_DIR / "marcia_activity_worker.py"
MARCANET_WORKER = SCRIPT_DIR / "representative_activity_worker.py"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pipeline autónomo de actividad IMPI")
    parser.add_argument("--publish-every", type=int, default=10)
    parser.add_argument("--marcia-batch-size", type=int, default=10)
    parser.add_argument("--marcia-delay", type=float, default=0.5)
    parser.add_argument("--marcanet-delay", type=float, default=2.5)
    parser.add_argument("--cooldown", type=int, default=600)
    parser.add_argument("--no-publish", action="store_true")
    return parser.parse_args()


def run_worker(script: Path, arguments: list[str]) -> int:
    result = subprocess.run(
        [sys.executable, "-u", str(script), *arguments],
        cwd=REPO_ROOT,
        check=False,
    )
    return result.returncode


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [PIPELINE] %(message)s")
    if args.publish_every < 1 or args.marcia_batch_size < 1 or args.cooldown < 1:
        raise ValueError("Los tamaños e intervalos deben ser positivos")

    common = ["--publish-every", str(args.publish_every)]
    if args.no_publish:
        common.append("--no-publish")

    logging.info("Etapa 1/2: conteo exacto rápido en MARCia.")
    marcia_code = run_worker(
        MARCIA_WORKER,
        [
            *common,
            "--batch-size",
            str(args.marcia_batch_size),
            "--delay",
            str(args.marcia_delay),
            "--cooldown",
            str(args.cooldown),
        ],
    )
    if marcia_code:
        logging.error("MARCia terminó con código %s.", marcia_code)
        return marcia_code

    logging.info("Etapa 2/2: auditoría vigente ficha por ficha en Marcanet.")
    return run_worker(
        MARCANET_WORKER,
        [
            *common,
            "--delay",
            str(args.marcanet_delay),
            "--cooldown",
            str(args.cooldown),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main())

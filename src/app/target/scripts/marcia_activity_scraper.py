#!/usr/bin/env python3
"""Consulta actividad de apoderados en MARCia mediante frase exacta.

MARCia cuenta registros de marca para un apoderado en una sola petición. Los
nombres se normalizan sin acentos, en mayúsculas y entre comillas para evitar
la búsqueda amplia por palabras que infla los resultados.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

BASE_URL = "https://marcia.impi.gob.mx/marcas"
QUICK_URL = BASE_URL + "/search/quick"
COUNT_URL = BASE_URL + "/search/internal/result/count"
DEFAULT_TIMEOUT_SECONDS = 45
MAX_REQUEST_RETRIES = 3

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[3]
REPRESENTATIVES_FILE = REPO_ROOT / "src" / "data" / "representativesData.ts"
RUNTIME_DIR = SCRIPT_DIR / "runtime"
RESULTS_FILE = RUNTIME_DIR / "representative_activity_results.jsonl"


class MarciaError(RuntimeError):
    pass


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_key(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    value = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return " ".join(value.split()).lower()


def exact_query(value: str) -> str:
    return f'"{normalize_key(value).upper()}"'


def activity_level(count: int) -> str:
    if count >= 200:
        return "Alta"
    if count >= 75:
        return "Media"
    if count >= 25:
        return "Baja"
    return "Incipiente"


def parse_representatives(path: Path) -> list[dict[str, Any]]:
    source = path.read_text(encoding="utf-8")
    pattern = re.compile(
        r'\{\s*rank:\s*(\d+),\s*name:\s*"([^"]+)",\s*brandCount:\s*(\d+)\s*\}'
    )
    representatives = [
        {"rank": int(rank), "name": name, "brandCount": int(count)}
        for rank, name, count in pattern.findall(source)
    ]
    if not representatives:
        raise MarciaError(f"No se encontraron representantes en {path}")
    return representatives


def load_verified_names(path: Path) -> set[str]:
    if not path.exists():
        return set()
    verified: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        result = json.loads(line)
        if (
            result.get("representativeActivityVerified") is True
            and result.get("representativeActivityVerificationStatus") == "verified"
        ):
            verified.add(normalize_key(str(result.get("name", ""))))
    return verified


def parse_source_index_date(page: str) -> str | None:
    match = re.search(r"lastIndexingDate:\s*'([^']+)'", page)
    if not match:
        return None
    try:
        parsed = datetime.strptime(match.group(1), "%d %b %Y")
    except ValueError:
        return match.group(1)
    return parsed.date().isoformat()


def build_payload(query: str) -> dict[str, Any]:
    return {
        "_type": "Search$Structured",
        "query": {
            "number": None,
            "classes": None,
            "codes": None,
            "title": None,
            "titleOption": "fuzzier",
            "goodsAndServices": None,
            "name": {"name": query, "types": ["AGENT"]},
            "date": None,
            "indicators": None,
            "status": None,
            "markType": None,
            "appType": None,
            "wordSet": None,
        },
        "images": [],
    }


class MarciaClient:
    def __init__(self, delay_seconds: float) -> None:
        self.delay_seconds = delay_seconds
        self.last_request_at = 0.0
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
            ),
            "Accept-Language": "es-MX,es;q=0.9",
        })
        self.csrf_token = ""
        self.source_indexed_at: str | None = None

    def _pace(self) -> None:
        remaining = self.delay_seconds - (time.monotonic() - self.last_request_at)
        if remaining > 0:
            time.sleep(remaining)

    def _request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        last_error: Exception | None = None
        for attempt in range(MAX_REQUEST_RETRIES):
            self._pace()
            try:
                response = self.session.request(
                    method,
                    url,
                    timeout=DEFAULT_TIMEOUT_SECONDS,
                    **kwargs,
                )
                self.last_request_at = time.monotonic()
                if response.status_code in {403, 429, 502, 503, 504}:
                    raise MarciaError(f"MARCia limitó la consulta (HTTP {response.status_code})")
                response.raise_for_status()
                return response
            except (requests.RequestException, MarciaError) as error:
                last_error = error
                if attempt + 1 < MAX_REQUEST_RETRIES:
                    time.sleep(2 ** attempt)
        raise MarciaError(f"MARCia no respondió después de varios intentos: {last_error}")

    def initialize(self) -> None:
        page = self._request("GET", QUICK_URL).text
        token = re.search(r'<meta name="_csrf" content="([^"]+)"', page)
        if not token:
            raise MarciaError("MARCia no devolvió el token de consulta")
        self.csrf_token = token.group(1)
        self.source_indexed_at = parse_source_index_date(page)

    def count_agent_records(self, name: str) -> tuple[int, str]:
        if not self.csrf_token:
            self.initialize()
        query = exact_query(name)
        response = self._request(
            "POST",
            COUNT_URL,
            headers={
                "X-XSRF-TOKEN": self.csrf_token,
                "Content-Type": "application/json;charset=UTF-8",
            },
            json=build_payload(query),
        )
        body = response.json()
        count = body.get("count")
        if not isinstance(count, int) or count < 0:
            raise MarciaError(f"MARCia devolvió un conteo inválido para {name}: {body}")
        return count, query


def append_result(result: dict[str, Any]) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    with RESULTS_FILE.open("a", encoding="utf-8") as output:
        output.write(json.dumps(result, ensure_ascii=False) + "\n")
        output.flush()
        os.fsync(output.fileno())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verifica apoderados con MARCia")
    parser.add_argument("--name")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--delay", type=float, default=0.5)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [MARCIA] %(message)s")
    if args.limit is not None and args.limit < 1:
        raise ValueError("--limit debe ser positivo")

    representatives = parse_representatives(REPRESENTATIVES_FILE)
    verified = load_verified_names(RESULTS_FILE)
    if args.name:
        selected = [
            representative
            for representative in representatives
            if normalize_key(representative["name"]) == normalize_key(args.name)
        ]
        if not selected:
            raise MarciaError(f"No se encontró el representante: {args.name}")
    else:
        selected = [
            representative
            for representative in representatives
            if normalize_key(representative["name"]) not in verified
        ]
    if args.limit is not None:
        selected = selected[: args.limit]
    if not selected:
        logging.info("No hay representantes pendientes.")
        return 0

    client = MarciaClient(args.delay)
    client.initialize()
    logging.info(
        "Fuente MARCia inicializada; corte declarado: %s.",
        client.source_indexed_at or "no informado",
    )

    for representative in selected:
        count, query = client.count_agent_records(representative["name"])
        result = {
            "rank": representative["rank"],
            "name": representative["name"],
            "historicalBrandCount": representative["brandCount"],
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
            "impiSourceIndexedAt": client.source_indexed_at,
            "exactAgentQuery": query,
            "profiles": [],
            "source": "marcia_exact_agent_phrase",
        }
        append_result(result)
        logging.info(
            "#%s %s: %s (%s registros exactos).",
            representative["rank"],
            representative["name"],
            result["representativeActivityLevel"],
            count,
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (MarciaError, requests.RequestException, ValueError, json.JSONDecodeError) as error:
        logging.error("%s", error)
        raise SystemExit(1) from error

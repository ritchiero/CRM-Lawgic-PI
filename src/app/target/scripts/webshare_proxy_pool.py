#!/usr/bin/env python3
"""Carga y rota proxies Webshare sin persistir credenciales en el repo."""

from __future__ import annotations

import getpass
import logging
import os
import random
import subprocess
from typing import Any
from urllib.parse import quote

import requests

WEBSHARE_API_URL = (
    "https://proxy.webshare.io/api/v2/proxy/list/"
    "?mode=direct&page=1&page_size=100"
)
WEBSHARE_KEYCHAIN_SERVICES = (
    "lawgic.webshare.api1",
    "lawgic.webshare.api2",
)
DEFAULT_TIMEOUT_SECONDS = 45


def _keychain_secret(service: str) -> str | None:
    """Obtiene una llave local sin escribirla en el repositorio ni en logs."""
    try:
        result = subprocess.run(
            [
                "/usr/bin/security",
                "find-generic-password",
                "-a",
                getpass.getuser(),
                "-s",
                service,
                "-w",
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    secret = result.stdout.strip()
    return secret or None


def webshare_api_tokens() -> list[str]:
    """Carga llaves desde entorno (servidor) o Keychain (worker local)."""
    candidates: list[str] = []
    combined = os.environ.get("WEBSHARE_API_TOKENS", "")
    candidates.extend(part.strip() for part in combined.split(","))
    candidates.extend(
        os.environ.get(variable, "").strip()
        for variable in ("WEBSHARE_API_TOKEN_1", "WEBSHARE_API_TOKEN_2")
    )
    candidates.extend(
        secret
        for service in WEBSHARE_KEYCHAIN_SERVICES
        if (secret := _keychain_secret(service))
    )

    unique: list[str] = []
    for token in candidates:
        if token and token not in unique:
            unique.append(token)
    return unique


def _proxy_url(item: dict[str, Any]) -> str | None:
    address = item.get("proxy_address")
    port = item.get("port")
    username = item.get("username")
    password = item.get("password")
    if (
        item.get("valid") is False
        or not isinstance(address, str)
        or not isinstance(port, int)
        or not isinstance(username, str)
        or not isinstance(password, str)
    ):
        return None
    credentials = f"{quote(username, safe='')}:{quote(password, safe='')}"
    return f"http://{credentials}@{address}:{port}"


def load_webshare_proxies() -> list[str]:
    proxies: list[str] = []
    for account_number, token in enumerate(webshare_api_tokens(), start=1):
        next_url: str | None = WEBSHARE_API_URL
        account_proxies: list[str] = []
        try:
            while next_url:
                response = requests.get(
                    next_url,
                    headers={"Authorization": f"Token {token}"},
                    timeout=DEFAULT_TIMEOUT_SECONDS,
                )
                response.raise_for_status()
                body = response.json()
                results = body.get("results", [])
                if not isinstance(results, list):
                    raise ValueError("Webshare devolvió una lista inválida")
                account_proxies.extend(
                    proxy
                    for item in results
                    if isinstance(item, dict) and (proxy := _proxy_url(item))
                )
                candidate_next = body.get("next")
                next_url = candidate_next if isinstance(candidate_next, str) else None
        except (requests.RequestException, ValueError) as error:
            logging.warning(
                "Webshare API %s no pudo actualizarse (%s).",
                account_number,
                type(error).__name__,
            )
            continue
        proxies.extend(account_proxies)
        logging.info(
            "Webshare API %s disponible: %s proxies válidos.",
            account_number,
            len(account_proxies),
        )

    unique = list(dict.fromkeys(proxies))
    random.SystemRandom().shuffle(unique)
    return unique


class ProxyPool:
    def __init__(self) -> None:
        self.proxies = load_webshare_proxies()
        self.position = 0

    def next(self) -> str | None:
        if not self.proxies:
            return None
        proxy = self.proxies[self.position % len(self.proxies)]
        self.position += 1
        return proxy

    def attempts(self, maximum: int) -> int:
        return min(maximum, len(self.proxies)) if self.proxies else 1

    def __len__(self) -> int:
        return len(self.proxies)

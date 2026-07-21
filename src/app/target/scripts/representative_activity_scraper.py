#!/usr/bin/env python3
"""Verifica actividad de apoderados en Acervo Marcas con pausa y reanudación.

El proceso recorre todas las fichas internas que devuelve una búsqueda por
apoderado, descarga el reporte PDF de cada ficha, extrae los expedientes y
calcula tanto la suma bruta como el total único.

Ejemplos:
    python3 representative_activity_scraper.py --name "Eduardo Kleinberg Druker"
    python3 representative_activity_scraper.py --all --resume
    python3 representative_activity_scraper.py --all --resume --no-wait
"""

from __future__ import annotations

import argparse
import html
import io
import json
import logging
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import requests
import urllib3
from PyPDF2 import PdfReader

from activity_target_source import load_activity_targets
from webshare_proxy_pool import ProxyPool

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://acervomarcas.impi.gob.mx:8181"
SEARCH_URL = BASE_URL + "/marcanet/vistas/common/datos/bsqApoderadoCompleto.pgi"
FORM_NAME = "frmResulApo"
SEARCH_TABLE = "frmResulApo:resultadoPromovente"
EXPEDIENT_TABLE = "frmResulApo:resultadoExpediente"

SCRIPT_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = SCRIPT_DIR / "runtime"
CHECKPOINT_FILE = RUNTIME_DIR / "representative_activity_checkpoint.json"
RESULTS_FILE = RUNTIME_DIR / "representative_activity_results.jsonl"

DEFAULT_DELAY_SECONDS = 2.5
DEFAULT_COOLDOWN_SECONDS = 600
DEFAULT_TIMEOUT_SECONDS = 60
PAGE_SIZE = 10
MAX_REQUEST_RETRIES = 3

BLOCK_MARKERS = (
    "10 minutos",
    "diez minutos",
    "demasiadas consultas",
    "demasiadas solicitudes",
    "intente nuevamente más tarde",
    "intente mas tarde",
    "temporalmente bloqueado",
    "service unavailable",
    "rate limit",
)

EXPEDIENT_PATTERN = re.compile(
    r"(?:"
    r"(?:"
    r"REGISTRO\s+DE\s+MARCA|"
    r"SOLICITUD\s+DE\s+REGISTRO(?:\s+DE\s+MARCA)?|"
    r"REGISTRO\s+DE\s+AVISO(?:\s+COMERCIAL)?|"
    r"PUBLICACI[ÓO]N\s+DE\s+NOMBRE\s+COMERCIAL"
    r")\s*[A-ZÁÉÍÓÚÜÑ/ .()_\-]*?"
    r"|"
    r"(?:"
    r"MARCA(?:NOMINATIVA|MIXTA|DISEÑO|TRIDIMENSIONAL|HOLOGR[ÁA]FICA|SONORA|OLFATIVA)|"
    r"(?:COMERCIAL|AVISO)NOMINATIVA"
    r")"
    r")\s+(\d{4,})",
    re.IGNORECASE,
)


class VerificationError(RuntimeError):
    pass


class RestartRepresentative(RuntimeError):
    """La sesión debe recrearse después de la pausa obligatoria."""


@dataclass
class SearchState:
    url: str
    body: str
    view_state: str
    profile_count: int
    page_start: int = 0


@dataclass
class ProfileData:
    index: int
    address: str
    raw_expedient_count: int
    expedients: set[str]
    parser: str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def activity_level(count: int) -> str:
    if count >= 200:
        return "Alta"
    if count >= 75:
        return "Media"
    if count >= 25:
        return "Baja"
    return "Incipiente"


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value).replace("\xa0", " ")
    return " ".join(value.split())


def extract_view_state(body: str) -> str:
    full_page = re.findall(
        r'name="javax\.faces\.ViewState"[^>]*value="([^"]+)"', body
    )
    if full_page:
        return html.unescape(full_page[-1])

    partial = re.findall(
        r'<update id="[^"]*javax\.faces\.ViewState[^"]*"><!\[CDATA\[([^]]+)',
        body,
    )
    if partial:
        return partial[-1]
    raise VerificationError("IMPI no devolvió javax.faces.ViewState")


def extract_total_records(body: str) -> list[int]:
    return [int(value.replace(",", "")) for value in re.findall(
        r"Total\s+de\s+registros\s*=\s*([\d,]+)", body, re.IGNORECASE
    )]


def extract_visible_expedients(body: str) -> set[str]:
    return set(re.findall(
        r'id="frmResulApo:resultadoExpediente:\d+:[^"]+"[^>]*href="#"[^>]*>\s*(\d+)\s*</a>',
        body,
    ))


class ImpiClient:
    def __init__(
        self,
        delay_seconds: float,
        cooldown_seconds: int,
        no_wait: bool,
        on_cooldown: Callable[[str, datetime], None],
        proxy_url: str | None = None,
    ) -> None:
        self.delay_seconds = delay_seconds
        self.cooldown_seconds = cooldown_seconds
        self.no_wait = no_wait
        self.on_cooldown = on_cooldown
        self.proxy_url = proxy_url
        self.last_request_at = 0.0
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
            ),
            "Accept-Language": "es-MX,es;q=0.9",
            "Connection": "keep-alive",
        })
        if proxy_url:
            self.session.proxies.update({"http": proxy_url, "https": proxy_url})

    def _pace(self) -> None:
        remaining = self.delay_seconds - (time.monotonic() - self.last_request_at)
        if remaining > 0:
            time.sleep(remaining)

    def _blocked(self, response: requests.Response) -> bool:
        if response.status_code in {403, 429, 502, 503, 504}:
            return True
        content_type = response.headers.get("content-type", "").lower()
        if "text" not in content_type and "html" not in content_type and "xml" not in content_type:
            return False
        sample = response.text[:120_000].lower()
        return any(marker in sample for marker in BLOCK_MARKERS)

    def _cooldown(self, reason: str) -> None:
        if self.proxy_url:
            logging.warning("Salida de proxy bloqueada (%s); rotación inmediata.", reason)
            raise RestartRepresentative("proxy_blocked")

        until = utc_now() + timedelta(seconds=self.cooldown_seconds)
        self.on_cooldown(reason, until)
        logging.warning(
            "IMPI pidió pausa: %s. Reanudación automática a las %s.",
            reason,
            until.isoformat(),
        )
        if self.no_wait:
            raise RestartRepresentative("cooldown_pending")

        remaining = self.cooldown_seconds
        while remaining > 0:
            step = min(60, remaining)
            time.sleep(step)
            remaining -= step
            if remaining:
                logging.info("Pausa IMPI: faltan %s segundos.", remaining)
        raise RestartRepresentative("cooldown_completed")

    def request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        last_error: Exception | None = None
        for attempt in range(MAX_REQUEST_RETRIES):
            self._pace()
            try:
                response = self.session.request(
                    method,
                    url,
                    verify=False,
                    timeout=DEFAULT_TIMEOUT_SECONDS,
                    **kwargs,
                )
                self.last_request_at = time.monotonic()
                if self._blocked(response):
                    self._cooldown(f"HTTP {response.status_code}")
                response.raise_for_status()
                return response
            except RestartRepresentative:
                raise
            except requests.RequestException as error:
                last_error = error
                wait = 2 ** attempt
                logging.warning(
                    "Error de red (%s/%s): %s",
                    attempt + 1,
                    MAX_REQUEST_RETRIES,
                    type(error).__name__,
                )
                time.sleep(wait)
        error_type = type(last_error).__name__ if last_error else "desconocido"
        raise VerificationError(
            f"IMPI no respondió después de varios intentos ({error_type})"
        )

    def search(self, name: str) -> SearchState:
        initial = self.request("GET", SEARCH_URL)
        view_state = extract_view_state(initial.text)
        form_match = re.search(
            r'<form id="frmBsqApo"[^>]*action="([^"]+)"', initial.text
        )
        if not form_match:
            raise VerificationError("No se encontró el formulario de búsqueda por apoderado")
        action_url = requests.compat.urljoin(initial.url, html.unescape(form_match.group(1)))
        result = self.request("POST", action_url, data={
            "frmBsqApo": "frmBsqApo",
            "frmBsqApo:titularId": name,
            "frmBsqApo:swtNombre_input": "on",
            "frmBsqApo:busquedaId": "frmBsqApo:busquedaId",
            "javax.faces.ViewState": view_state,
        })
        totals = extract_total_records(result.text)
        if not totals:
            if "Sin resultados" in result.text:
                return SearchState(result.url, result.text, extract_view_state(result.text), 0)
            raise VerificationError("La búsqueda no devolvió el total de fichas")
        return SearchState(
            url=result.url,
            body=result.text,
            view_state=extract_view_state(result.text),
            profile_count=totals[0],
            page_start=0,
        )

    def paginate(
        self,
        url: str,
        view_state: str,
        table_id: str,
        first: int,
    ) -> tuple[str, str]:
        response = self.request(
            "POST",
            url,
            headers={
                "Faces-Request": "partial/ajax",
                "X-Requested-With": "XMLHttpRequest",
            },
            data={
                "javax.faces.partial.ajax": "true",
                "javax.faces.source": table_id,
                "javax.faces.partial.execute": table_id,
                "javax.faces.partial.render": table_id,
                table_id: table_id,
                table_id + "_pagination": "true",
                table_id + "_first": str(first),
                table_id + "_rows": str(PAGE_SIZE),
                table_id + "_skipChildren": "true",
                table_id + "_encodeFeature": "true",
                FORM_NAME: FORM_NAME,
                "javax.faces.ViewState": view_state,
            },
        )
        return response.text, extract_view_state(response.text)

    def open_profile(self, state: SearchState, index: int) -> tuple[str, str]:
        desired_page_start = (index // PAGE_SIZE) * PAGE_SIZE
        if state.page_start != desired_page_start:
            state.body, state.view_state = self.paginate(
                state.url,
                state.view_state,
                SEARCH_TABLE,
                desired_page_start,
            )
            state.page_start = desired_page_start

        ids = re.findall(
            r'id="(frmResulApo:resultadoPromovente:\d+:[^"]+)"[^>]*href="#"',
            state.body,
        )
        source_id = next(
            (identifier for identifier in ids if f":{index}:" in identifier),
            None,
        )
        if not source_id:
            raise VerificationError(f"No se encontró la ficha IMPI #{index + 1}")

        detail = self.request("POST", state.url, data={
            FORM_NAME: FORM_NAME,
            source_id: source_id,
            "javax.faces.ViewState": state.view_state,
        })
        if "Expedientes asociados al apoderado" not in detail.text:
            raise VerificationError(f"La ficha IMPI #{index + 1} no abrió su cartera")
        return detail.text, extract_view_state(detail.text)

    def download_profile_pdf(self, url: str, body: str, view_state: str) -> bytes:
        link_match = re.search(
            r'<a[^>]*onclick="mojarra\.jsfcljs[^\"]*\{\'([^\']+)\':\'[^\']+\'\}[^\"]*"[^>]*>'
            r"[\s\S]{0,500}?Descargar datos de la consulta",
            body,
            re.IGNORECASE,
        )
        if not link_match:
            raise VerificationError("No se encontró la descarga de la ficha")
        download_id = link_match.group(1)
        response = self.request("POST", url, data={
            FORM_NAME: FORM_NAME,
            download_id: download_id,
            "javax.faces.ViewState": view_state,
        })
        if not response.content.startswith(b"%PDF"):
            raise VerificationError(
                "La descarga de la ficha no devolvió un PDF válido "
                f"({response.headers.get('content-type', 'sin tipo')})"
            )
        return response.content

    def extract_pdf_expedients(
        self,
        pdf: bytes,
    ) -> tuple[set[str], list[int], int, list[int]]:
        reader = PdfReader(io.BytesIO(pdf))
        expedients: set[str] = set()
        row_indexes: list[int] = []
        match_count = 0
        page_match_counts: list[int] = []
        for page in reader.pages[1:]:
            text = page.extract_text() or ""
            page_matches = list(EXPEDIENT_PATTERN.finditer(text))
            page_match_counts.append(len(page_matches))
            match_count += len(page_matches)
            for match in page_matches:
                expedients.add(match.group(1))
                line_end = text.find("\n", match.end())
                if line_end < 0:
                    line_end = len(text)
                row_tail = text[match.end():line_end]
                numbers = re.findall(r"\b(\d+)\b", row_tail)
                if numbers:
                    row_indexes.append(int(numbers[-1]))
        return expedients, row_indexes, match_count, page_match_counts

    def recover_small_pdf_gap(
        self,
        url: str,
        body: str,
        view_state: str,
        displayed_row_indexes: list[int],
        page_match_counts: list[int],
        expected: int,
    ) -> tuple[set[str], str, int]:
        """Consulta sólo las zonas donde el extractor perdió una fila del PDF.

        Jasper recorta el índice visual después de la fila 999, así que esos
        índices no permiten ubicar faltantes grandes. Las páginas del PDF sí
        conservan el orden: una página con una fila menos que sus vecinas
        delata la zona afectada. Se consulta una ventana de diez filas a cada
        lado para absorber el pequeño desfase acumulado.
        """
        page_starts = {0}

        # Jasper recorta la columna del índice a tres caracteres: 1000 se ve
        # como 100 y 10000 también como 100. Los dos reinicios 999 -> 100
        # separan los rangos; dentro de cada rango se cuentan los grupos que
        # deberían contener 1, 10 o 100 filas respectivamente.
        index_segments: list[list[int]] = [[]]
        for displayed in displayed_row_indexes:
            current = index_segments[-1]
            if current and current[-1] >= 900 and 90 <= displayed <= 150:
                index_segments.append([])
                current = index_segments[-1]
            current.append(displayed)

        expected_segments = 1 + int(expected >= 1_000) + int(expected >= 10_000)
        if len(index_segments) == expected_segments:
            ranges = [(1, min(expected, 999), 1)]
            if expected >= 1_000:
                ranges.append((1_000, min(expected, 9_999), 10))
            if expected >= 10_000:
                ranges.append((10_000, expected, 100))

            for segment, (start_row, end_row, group_size) in zip(index_segments, ranges):
                observed: dict[int, int] = {}
                for displayed in segment:
                    observed[displayed] = observed.get(displayed, 0) + 1
                for group_start in range(start_row, end_row + 1, group_size):
                    group_end = min(end_row, group_start + group_size - 1)
                    key = group_start if group_size == 1 else group_start // group_size
                    expected_in_group = group_end - group_start + 1
                    if observed.get(key, 0) < expected_in_group:
                        page_starts.update(
                            range(
                                ((group_start - 1) // PAGE_SIZE) * PAGE_SIZE,
                                group_end,
                                PAGE_SIZE,
                            )
                        )
        else:
            # Respaldo para un PDF cuyo índice no pueda segmentarse: consulta
            # ventanas alrededor de páginas con una fila menos que sus vecinas.
            cumulative_rows = 0
            for page_index, page_count in enumerate(page_match_counts):
                nearby = page_match_counts[
                    max(0, page_index - 4):min(len(page_match_counts), page_index + 5)
                ]
                nearby_max = max(nearby, default=page_count)
                if nearby_max - page_count == 1:
                    window_start = max(0, cumulative_rows - PAGE_SIZE)
                    window_end = min(expected, cumulative_rows + page_count + PAGE_SIZE)
                    page_starts.update(
                        range(
                            (window_start // PAGE_SIZE) * PAGE_SIZE,
                            window_end,
                            PAGE_SIZE,
                        )
                    )
                cumulative_rows += page_count

        expedients = extract_visible_expedients(body)
        latest_view_state = view_state
        for first in sorted(page_starts):
            if first == 0:
                page_body = body
            else:
                page_body, latest_view_state = self.paginate(
                    url,
                    latest_view_state,
                    EXPEDIENT_TABLE,
                    first,
                )
            expedients.update(extract_visible_expedients(page_body))
        return expedients, latest_view_state, len(page_starts)

    def recover_missing_rows(
        self,
        url: str,
        body: str,
        view_state: str,
        missing_rows: set[int],
    ) -> tuple[set[str], str]:
        expedients: set[str] = set()
        latest_view_state = view_state
        page_starts = sorted({((row - 1) // PAGE_SIZE) * PAGE_SIZE for row in missing_rows})
        for first in page_starts:
            if first == 0:
                page_body = body
            else:
                page_body, latest_view_state = self.paginate(
                    url,
                    latest_view_state,
                    EXPEDIENT_TABLE,
                    first,
                )
            expedients.update(extract_visible_expedients(page_body))
        return expedients, latest_view_state

    def enumerate_profile_expedients(
        self,
        url: str,
        body: str,
        view_state: str,
        expected: int,
    ) -> tuple[set[str], str]:
        expedients = extract_visible_expedients(body)
        latest_view_state = view_state
        for first in range(PAGE_SIZE, expected, PAGE_SIZE):
            page_body, latest_view_state = self.paginate(
                url,
                latest_view_state,
                EXPEDIENT_TABLE,
                first,
            )
            expedients.update(extract_visible_expedients(page_body))
        return expedients, latest_view_state

    def return_to_results(self, state: SearchState, body: str, view_state: str) -> SearchState:
        button_match = re.search(
            r'<button id="([^"]+)"[^>]*>[\s\S]{0,500}?Regresar a los resultados[\s\S]*?</button>',
            body,
            re.IGNORECASE,
        )
        if not button_match:
            raise VerificationError("No se encontró el botón para volver a las fichas")
        button_id = button_match.group(1)
        result = self.request("POST", state.url, data={
            FORM_NAME: FORM_NAME,
            button_id: button_id,
            "javax.faces.ViewState": view_state,
        })
        page_match = re.search(
            rf'id:"{re.escape(SEARCH_TABLE)}"[\s\S]{{0,500}}?page:(\d+)',
            result.text,
        )
        return SearchState(
            url=result.url,
            body=result.text,
            view_state=extract_view_state(result.text),
            profile_count=state.profile_count,
            page_start=(int(page_match.group(1)) * PAGE_SIZE) if page_match else 0,
        )

    def read_profile(self, state: SearchState, index: int) -> tuple[ProfileData, SearchState]:
        body, view_state = self.open_profile(state, index)
        totals = extract_total_records(body)
        if not totals:
            raise VerificationError(f"La ficha #{index + 1} no indicó cuántos expedientes contiene")
        raw_count = totals[0]
        address_match = re.search(
            r'>\s*Direcci[óo]n\s*</td>\s*<td[^>]*>([\s\S]*?)</td>',
            body,
            re.IGNORECASE,
        )
        address = clean_text(address_match.group(1)) if address_match else ""

        parser = "pdf"
        pdf = self.download_profile_pdf(state.url, body, view_state)
        expedients, pdf_row_indexes, pdf_match_count, page_match_counts = (
            self.extract_pdf_expedients(pdf)
        )
        # Jasper omite ocasionalmente la primera fila en el texto del PDF;
        # la primera página HTML permite recuperarla sin otra consulta.
        expedients.update(extract_visible_expedients(body))
        latest_view_state = view_state
        if pdf_match_count != raw_count:
            pdf_gap = raw_count - pdf_match_count
            targeted_gap_limit = min(500, max(100, round(raw_count * 0.02)))
            missing_rows = set(range(1, raw_count + 1)) - set(pdf_row_indexes)
            if 0 < pdf_gap <= targeted_gap_limit and raw_count > 1_000:
                parser = "pdf_with_targeted_html_recovery"
                original_unique_count = len(expedients)
                recovered, latest_view_state, page_count = self.recover_small_pdf_gap(
                    state.url,
                    body,
                    view_state,
                    pdf_row_indexes,
                    page_match_counts,
                    raw_count,
                )
                expedients.update(recovered)
                logging.warning(
                    "Ficha %s: el PDF omitió %s filas; se revisaron %s páginas HTML "
                    "dirigidas y se recuperaron %s expedientes únicos.",
                    index + 1,
                    pdf_gap,
                    page_count,
                    len(expedients) - original_unique_count,
                )
            elif (
                raw_count <= 1_000
                and missing_rows
                and len(missing_rows) <= max(25, round(raw_count * 0.02))
            ):
                logging.warning(
                    "Ficha %s: el PDF produjo %s/%s; recuperando %s filas desde %s páginas HTML.",
                    index + 1,
                    len(expedients),
                    raw_count,
                    len(missing_rows),
                    len({((row - 1) // PAGE_SIZE) * PAGE_SIZE for row in missing_rows}),
                )
                parser = "pdf_with_html_recovery"
                recovered, latest_view_state = self.recover_missing_rows(
                    state.url,
                    body,
                    view_state,
                    missing_rows,
                )
                expedients.update(recovered)
            elif 0 < pdf_gap <= 25:
                raise VerificationError(
                    f"Ficha {index + 1}: el PDF omitió temporalmente "
                    f"{pdf_gap} fila(s); se requiere otra sesión"
                )
            elif raw_count <= 1_000:
                logging.warning(
                    "Ficha %s: el PDF produjo %s/%s expedientes; usando paginación HTML completa.",
                    index + 1,
                    pdf_match_count,
                    raw_count,
                )
                parser = "html_fallback"
                expedients, latest_view_state = self.enumerate_profile_expedients(
                    state.url,
                    body,
                    view_state,
                    raw_count,
                )
            else:
                raise VerificationError(
                    f"Ficha {index + 1}: el PDF difiere por {pdf_gap} filas en una "
                    "cartera grande; se reintentará con una sesión nueva"
                )
        if not expedients and raw_count:
            raise VerificationError(
                f"Ficha {index + 1}: no se pudo extraer ningún expediente"
            )

        result_state = self.return_to_results(state, body, latest_view_state)
        return ProfileData(index, address, raw_count, expedients, parser), result_state


class ActivityRunner:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        self.proxy_pool = ProxyPool()
        if len(self.proxy_pool):
            logging.info(
                "Rotación Webshare activa para Marcanet con %s proxies.",
                len(self.proxy_pool),
            )
        else:
            logging.warning("Sin proxies Webshare; Marcanet usará conexión directa.")
        self.checkpoint = self.load_checkpoint() if args.resume else {
            "version": 1,
            "next_representative_index": 0,
            "current": None,
        }

    def load_checkpoint(self) -> dict[str, Any]:
        if not CHECKPOINT_FILE.exists():
            return {"version": 1, "next_representative_index": 0, "current": None}
        return json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))

    def save_checkpoint(self) -> None:
        CHECKPOINT_FILE.write_text(
            json.dumps(self.checkpoint, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def on_cooldown(self, reason: str, until: datetime) -> None:
        self.checkpoint["representativeActivityVerificationStatus"] = "cooldown"
        self.checkpoint["cooldown_reason"] = reason
        self.checkpoint["cooldown_until"] = until.isoformat()
        self.save_checkpoint()

    def append_result(self, result: dict[str, Any]) -> None:
        with self.args.output.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(result, ensure_ascii=False) + "\n")

    def process_representative(
        self,
        representative: dict[str, Any],
        representative_index: int,
    ) -> dict[str, Any]:
        current = self.checkpoint.get("current")
        if not current or current.get("name") != representative["name"]:
            current = {
                "representative_index": representative_index,
                "rank": representative["rank"],
                "name": representative["name"],
                "historical_brand_count": representative["brandCount"],
                "next_profile_index": 0,
                "profile_count": None,
                "raw_expedient_count": 0,
                "unique_expedients": [],
                "profiles": [],
                "started_at": iso_now(),
            }
            self.checkpoint["current"] = current
            self.save_checkpoint()

        verification_restarts = 0
        while True:
            client = ImpiClient(
                delay_seconds=self.args.delay,
                cooldown_seconds=self.args.cooldown,
                no_wait=self.args.no_wait,
                on_cooldown=self.on_cooldown,
                proxy_url=self.proxy_pool.next(),
            )
            try:
                state = client.search(representative["name"])
                current["profile_count"] = state.profile_count
                unique_expedients = set(current.get("unique_expedients", []))
                start_profile = int(current.get("next_profile_index", 0))

                logging.info(
                    "#%s %s: %s fichas; retomando en %s/%s.",
                    representative["rank"],
                    representative["name"],
                    state.profile_count,
                    start_profile,
                    state.profile_count,
                )

                for profile_index in range(start_profile, state.profile_count):
                    profile, state = client.read_profile(state, profile_index)
                    unique_expedients.update(profile.expedients)
                    current["next_profile_index"] = profile_index + 1
                    current["raw_expedient_count"] = int(current["raw_expedient_count"]) + profile.raw_expedient_count
                    current["unique_expedients"] = sorted(unique_expedients, key=int)
                    current["profiles"].append({
                        "index": profile.index + 1,
                        "address": profile.address,
                        "expedient_count": profile.raw_expedient_count,
                        "parser": profile.parser,
                    })
                    current["updated_at"] = iso_now()
                    verification_restarts = 0
                    self.checkpoint["representativeActivityVerificationStatus"] = "in_progress"
                    self.checkpoint.pop("cooldown_until", None)
                    self.checkpoint.pop("cooldown_reason", None)
                    self.save_checkpoint()
                    logging.info(
                        "%s: ficha %s/%s, bruto %s, únicos %s.",
                        representative["name"],
                        profile_index + 1,
                        state.profile_count,
                        current["raw_expedient_count"],
                        len(unique_expedients),
                    )

                unique_count = len(unique_expedients)
                return {
                    "rank": representative["rank"],
                    "name": representative["name"],
                    "historicalBrandCount": representative["brandCount"],
                    "representativeActivityVerified": True,
                    "representativeActivityVerificationStatus": "verified",
                    "representativeActivityLevel": activity_level(unique_count),
                    "representativeActivityCount": unique_count,
                    "activityClassificationBasis": "verified_unique_expedients",
                    "impiProfileCount": state.profile_count,
                    "impiProfilesProcessed": state.profile_count,
                    "impiRawExpedientCount": int(current["raw_expedient_count"]),
                    "impiUniqueExpedientCount": unique_count,
                    "representativeActivityVerifiedAt": iso_now(),
                    "profiles": current["profiles"],
                    "source": "acervo_marcanet_apoderado",
                }
            except RestartRepresentative as reason:
                if self.args.no_wait:
                    raise
                logging.info("Creando una sesión nueva después de la pausa (%s).", reason)
                continue
            except VerificationError as error:
                verification_restarts += 1
                maximum_restarts = min(8, len(self.proxy_pool)) if len(self.proxy_pool) else 2
                if verification_restarts <= maximum_restarts:
                    logging.warning(
                        "Reintentando la ficha actual con una sesión nueva (%s/%s): %s",
                        verification_restarts,
                        maximum_restarts,
                        type(error).__name__,
                    )
                    time.sleep(3)
                    continue
                raise

    def run(self, representatives: list[dict[str, Any]]) -> int:
        start = int(self.checkpoint.get("next_representative_index", 0)) if self.args.resume else 0
        selected = representatives[start:]
        if not self.args.all and self.args.limit is not None:
            selected = selected[: self.args.limit]

        for offset, representative in enumerate(selected):
            representative_index = start + offset
            try:
                result = self.process_representative(representative, representative_index)
            except RestartRepresentative:
                logging.warning(
                    "Checkpoint guardado. Vuelve a ejecutar con --resume después de la hora indicada."
                )
                return 75
            except Exception as error:
                logging.exception("No se pudo verificar %s", representative["name"])
                result = {
                    "rank": representative["rank"],
                    "name": representative["name"],
                    "historicalBrandCount": representative["brandCount"],
                    "representativeActivityVerified": False,
                    "representativeActivityVerificationStatus": "failed",
                    "representativeActivityLevel": activity_level(representative["brandCount"]),
                    "representativeActivityCount": representative["brandCount"],
                    "activityClassificationBasis": "historical_brand_count",
                    "verificationError": str(error),
                    "representativeActivityVerifiedAt": iso_now(),
                    "source": "acervo_marcanet_apoderado",
                }

            self.append_result(result)
            if (
                result["representativeActivityVerificationStatus"] == "failed"
                and not self.args.all
            ):
                self.checkpoint["representativeActivityVerificationStatus"] = "failed"
                self.checkpoint["last_error"] = result.get("verificationError")
                self.save_checkpoint()
                logging.warning(
                    "Verificación incompleta para %s: %s",
                    result["name"],
                    result.get("verificationError", "error desconocido"),
                )
                return 1

            self.checkpoint = {
                "version": 1,
                "next_representative_index": representative_index + 1,
                "current": None,
                "last_result": {
                    "name": result["name"],
                    "status": result["representativeActivityVerificationStatus"],
                    "completed_at": iso_now(),
                },
            }
            self.save_checkpoint()
            if result["representativeActivityVerificationStatus"] == "verified":
                logging.info(
                    "Finalizado %s: %s (%s expedientes únicos).",
                    result["name"],
                    result["representativeActivityLevel"],
                    result["representativeActivityCount"],
                )
            else:
                logging.warning(
                    "Verificación incompleta para %s: %s",
                    result["name"],
                    result.get("verificationError", "error desconocido"),
                )
        return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verifica la actividad completa de representantes en Acervo Marcas"
    )
    parser.add_argument("--name", help="Procesar únicamente este nombre")
    parser.add_argument("--all", action="store_true", help="Procesar los 1,000 representantes")
    parser.add_argument("--resume", action="store_true", help="Retomar el checkpoint existente")
    parser.add_argument("--limit", type=int, default=1, help="Máximo a procesar sin --all")
    parser.add_argument("--start-rank", type=int, default=1)
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS)
    parser.add_argument("--cooldown", type=int, default=DEFAULT_COOLDOWN_SECONDS)
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="Guardar checkpoint y salir en vez de esperar el cooldown",
    )
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path, default=RESULTS_FILE)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)

    representatives = load_activity_targets(args.input)
    if args.name:
        matching = [
            representative for representative in representatives
            if representative["name"].casefold() == args.name.casefold()
        ]
        if not matching:
            raise VerificationError(f"{args.name} no está en la lista de representantes")
        representatives = matching
        args.all = False
        args.limit = 1
    else:
        representatives = [
            representative for representative in representatives
            if representative["rank"] >= args.start_rank
        ]

    runner = ActivityRunner(args)
    return runner.run(representatives)


if __name__ == "__main__":
    sys.exit(main())

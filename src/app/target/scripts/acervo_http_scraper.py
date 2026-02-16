#!/usr/bin/env python3
"""
Acervo Marcas HTTP Scraper - Descarga masiva de expedientes
55x mas rapido que Selenium. Usa HTTP POST directo.

Uso:
    python3 acervo_http_scraper.py --start 3548715 --end 3087000 --workers 5
    python3 acervo_http_scraper.py --resume
    python3 acervo_http_scraper.py --test 3548715
"""
import argparse, json, logging, os, re, sys, time, urllib3
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from logging.handlers import RotatingFileHandler
from threading import Lock
import requests
from bs4 import BeautifulSoup

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

SEARCH_URL = "https://acervomarcas.impi.gob.mx:8181/marcanet/vistas/common/datos/bsqExpedienteCompleto.pgi"
DEFAULT_START = 3548715
DEFAULT_END = 3087000
DEFAULT_WORKERS = 5
DEFAULT_DELAY = 0.5
CHECKPOINT_EVERY = 100
VIEWSTATE_REFRESH = 50
MAX_RETRIES = 3
RETRY_BACKOFF = 2
ERROR_PAUSE = 300
MAX_CONSEC_ERRORS = 5

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, "logs")
CHECKPOINT_FILE = os.path.join(BASE_DIR, "http_checkpoint.json")
RESULTS_DIR = os.path.join(BASE_DIR, "results")
FB_CREDS = os.path.join(BASE_DIR, "service-account.json")
FB_COLLECTION = "expedientes"

def setup_logging():
    os.makedirs(LOG_DIR, exist_ok=True)
    lg = logging.getLogger("acervo_http")
    lg.setLevel(logging.INFO)
    fh = RotatingFileHandler(os.path.join(LOG_DIR, "http_scraper.log"), maxBytes=10*1024*1024, backupCount=5)
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    lg.addHandler(fh)
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    lg.addHandler(ch)
    return lg

logger = setup_logging()
db = None

def init_firestore():
    global db
    if not os.path.exists(FB_CREDS):
        logger.warning(f"No {FB_CREDS}. Solo JSON local.")
        return False
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        cred = credentials.Certificate(FB_CREDS)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        logger.info("Firebase OK")
        return True
    except Exception as e:
        logger.error(f"Firebase init error: {e}")
        return False

def write_firestore(exp_num, data):
    if db is None:
        return False
    try:
        db.collection(FB_COLLECTION).document(str(exp_num)).set(data, merge=True)
        return True
    except Exception as e:
        logger.error(f"Firestore write {exp_num}: {e}")
        return False

def parse_html(html):
    soup = BeautifulSoup(html, "html.parser")
    data = {"datos_generales": {}, "titular": {}, "apoderado": {}, "establecimiento": {}, "productos_servicios": "", "tramite": {}}
    for table in soup.find_all("table"):
        ttext = table.get_text()[:500].upper()
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 2:
                continue
            k = cells[0].get_text(strip=True).rstrip(":").strip()
            v = cells[1].get_text(strip=True)
            if not k or not v:
                continue
            ku = k.upper()
            if ku in ("EXPEDIENTE", "NO. DE EXPEDIENTE", "NUMERO DE EXPEDIENTE"):
                data["datos_generales"]["expediente"] = v
            elif ku in ("DENOMINACION", "SIGNO DISTINTIVO", "MARCA"):
                data["datos_generales"]["denominacion"] = v
            elif ku in ("CLASE", "CLASE NIZA"):
                data["datos_generales"]["clase"] = v
            elif ku in ("TIPO DE SIGNO", "TIPO SIGNO", "TIPO"):
                data["datos_generales"]["tipo_signo"] = v
            elif ku in ("FECHA DE PRESENTACION", "FECHA PRESENTACION"):
                data["datos_generales"]["fecha_presentacion"] = v
            elif ku in ("FECHA DE REGISTRO", "FECHA REGISTRO", "FECHA DE CONCESION"):
                data["datos_generales"]["fecha_registro"] = v
            elif ku in ("SITUACION", "SITUACION DEL EXPEDIENTE", "STATUS"):
                data["datos_generales"]["situacion"] = v
            elif ku in ("VIGENCIA", "FECHA DE VIGENCIA"):
                data["datos_generales"]["vigencia"] = v
            elif "TITULAR" in ku or ku == "NOMBRE DEL TITULAR":
                if not data["titular"].get("nombre"):
                    data["titular"]["nombre"] = v
            elif "DOMICILIO" in ku and "TITULAR" in ttext:
                data["titular"]["domicilio"] = v
            elif ku == "NACIONALIDAD":
                data["titular"]["nacionalidad"] = v
            elif "APODERADO" in ku:
                if not data["apoderado"].get("nombre"):
                    data["apoderado"]["nombre"] = v
            elif "DOMICILIO" in ku and "APODERADO" in ttext:
                data["apoderado"]["domicilio"] = v
            elif ku in ("ESTABLECIMIENTO",):
                data["establecimiento"]["nombre"] = v
            elif ku in ("UBICACION",):
                data["establecimiento"]["ubicacion"] = v
            elif ku in ("PRODUCTOS", "SERVICIOS", "PRODUCTOS O SERVICIOS"):
                data["productos_servicios"] = v
            elif ku in ("TRAMITE", "TIPO DE TRAMITE"):
                data["tramite"]["tipo"] = v
            elif ku in ("NUMERO DE TRAMITE", "NO. TRAMITE"):
                data["tramite"]["numero"] = v
    has = bool(data["datos_generales"].get("expediente") or data["datos_generales"].get("denominacion") or data["titular"].get("nombre"))
    return data, has

class HttpScraper:
    def __init__(self, start_exp, end_exp, num_workers=DEFAULT_WORKERS, delay=DEFAULT_DELAY):
        self.start_exp = start_exp
        self.end_exp = end_exp
        self.num_workers = num_workers
        self.delay = delay
        self.lock = Lock()
        self.found = 0
        self.not_found = 0
        self.errors = 0
        self.processed = 0
        self.consecutive_errors = 0
        self.start_time = None
        self.last_checkpoint = start_exp
        os.makedirs(LOG_DIR, exist_ok=True)
        os.makedirs(RESULTS_DIR, exist_ok=True)

    def get_session(self):
        s = requests.Session()
        s.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-MX,es;q=0.9",
            "Connection": "keep-alive",
        })
        s.verify = False
        return s

    def get_viewstate(self, session):
        try:
            r = session.get(SEARCH_URL, timeout=30)
            r.raise_for_status()
            m = re.search(r'javax\.faces\.ViewState.*?value="([^"]+)"', r.text)
            if m:
                return m.group(1)
            logger.error("ViewState not found")
            return None
        except Exception as e:
            logger.error(f"ViewState error: {e}")
            return None

    def query_expediente(self, session, viewstate, exp_num):
        form = {
            "frmBsqExp": "frmBsqExp",
            "frmBsqExp:expedienteId": str(exp_num),
            "frmBsqExp:busquedaId2": "",
            "javax.faces.ViewState": viewstate,
        }
        try:
            r = session.post(SEARCH_URL, data=form, timeout=30, allow_redirects=True)
            r.raise_for_status()
            return r.text, r.status_code
        except Exception as e:
            logger.error(f"Query error exp {exp_num}: {e}")
            return None, 0

    def save_checkpoint(self, current_exp, force=False):
        with self.lock:
            cp = {
                "last_expediente": current_exp,
                "start_exp": self.start_exp,
                "end_exp": self.end_exp,
                "found": self.found,
                "not_found": self.not_found,
                "errors": self.errors,
                "processed": self.processed,
                "timestamp": datetime.now().isoformat(),
                "workers": self.num_workers,
            }
            with open(CHECKPOINT_FILE, "w") as f:
                json.dump(cp, f, indent=2)
            self.last_checkpoint = current_exp

    @staticmethod
    def load_checkpoint():
        if os.path.exists(CHECKPOINT_FILE):
            with open(CHECKPOINT_FILE, "r") as f:
                return json.load(f)
        return None

    def save_result_json(self, exp_num, data, found):
        batch_num = (self.start_exp - exp_num) // 10000
        batch_file = os.path.join(RESULTS_DIR, f"batch_{batch_num:04d}.jsonl")
        record = {"expediente": exp_num, "found": found, "data": data, "timestamp": datetime.now().isoformat()}
        with self.lock:
            with open(batch_file, "a") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def update_stats(self, found=False, error=False):
        with self.lock:
            self.processed += 1
            if error:
                self.errors += 1
                self.consecutive_errors += 1
            elif found:
                self.found += 1
                self.consecutive_errors = 0
            else:
                self.not_found += 1
                self.consecutive_errors = 0

    def print_progress(self):
        elapsed = time.time() - self.start_time
        total = self.start_exp - self.end_exp
        with self.lock:
            rate = self.processed / elapsed * 60 if elapsed > 0 else 0
            pct = self.processed / total * 100 if total > 0 else 0
            rem = (total - self.processed) / rate if rate > 0 else 0
            logger.info(f"Prog: {self.processed}/{total} ({pct:.1f}%) | Enc:{self.found} NoEnc:{self.not_found} Err:{self.errors} | {rate:.1f}/min | ~{rem:.0f}min")

    def worker(self, worker_id, expedientes):
        session = self.get_session()
        viewstate = self.get_viewstate(session)
        if not viewstate:
            logger.error(f"W{worker_id}: No ViewState")
            return
        logger.info(f"W{worker_id}: {len(expedientes)} expedientes")
        qs = 0
        for exp_num in expedientes:
            pause = False
            with self.lock:
                if self.consecutive_errors >= MAX_CONSEC_ERRORS:
                    pause = True
                    self.consecutive_errors = 0
            if pause:
                logger.warning(f"W{worker_id}: Pausa {ERROR_PAUSE}s por errores")
                time.sleep(ERROR_PAUSE)
            qs += 1
            if qs >= VIEWSTATE_REFRESH:
                session = self.get_session()
                viewstate = self.get_viewstate(session)
                if not viewstate:
                    time.sleep(5)
                    viewstate = self.get_viewstate(session)
                    if not viewstate:
                        self.update_stats(error=True)
                        continue
                qs = 0
            ok = False
            for att in range(MAX_RETRIES):
                html, st = self.query_expediente(session, viewstate, exp_num)
                if html and st == 200:
                    data, has = parse_html(html)
                    if has:
                        data["expediente_num"] = exp_num
                        data["scraped_at"] = datetime.now().isoformat()
                        data["source"] = "http_scraper"
                        write_firestore(exp_num, data)
                        self.save_result_json(exp_num, data, True)
                        self.update_stats(found=True)
                    else:
                        self.save_result_json(exp_num, {}, False)
                        self.update_stats(found=False)
                    ok = True
                    break
                else:
                    w = RETRY_BACKOFF * (2 ** att)
                    logger.warning(f"W{worker_id}|{exp_num}: retry {att+1} wait {w}s")
                    time.sleep(w)
                    if att == 1:
                        session = self.get_session()
                        viewstate = self.get_viewstate(session)
                        qs = 0
            if not ok:
                self.update_stats(error=True)
                logger.error(f"W{worker_id}|{exp_num}: FALLO")
            if self.processed > 0 and self.processed % CHECKPOINT_EVERY == 0:
                self.save_checkpoint(exp_num)
                self.print_progress()
            time.sleep(self.delay)
        logger.info(f"W{worker_id}: Done")

    def run(self):
        self.start_time = time.time()
        total = self.start_exp - self.end_exp
        logger.info("=" * 60)
        logger.info(f"INICIO HTTP SCRAPING: {self.start_exp}->{self.end_exp} ({total} exp)")
        logger.info(f"Workers:{self.num_workers} Delay:{self.delay}s Firebase:{db is not None}")
        logger.info("=" * 60)
        exps = list(range(self.start_exp, self.end_exp, -1))
        cs = len(exps) // self.num_workers
        chunks = []
        for i in range(self.num_workers):
            a = i * cs
            b = len(exps) if i == self.num_workers - 1 else (i + 1) * cs
            chunks.append(exps[a:b])
        with ThreadPoolExecutor(max_workers=self.num_workers) as ex:
            futs = [ex.submit(self.worker, i, c) for i, c in enumerate(chunks)]
            for f in as_completed(futs):
                try:
                    f.result()
                except Exception as e:
                    logger.error(f"Worker err: {e}")
        self.save_checkpoint(self.end_exp, force=True)
        el = time.time() - self.start_time
        logger.info("=" * 60)
        logger.info(f"DONE | Proc:{self.processed} Enc:{self.found} NoEnc:{self.not_found} Err:{self.errors}")
        logger.info(f"Time:{el/3600:.1f}h Speed:{self.processed/max(el,1)*60:.1f}/min")
        logger.info("=" * 60)


def main():
    p = argparse.ArgumentParser(description="Acervo Marcas HTTP Scraper")
    p.add_argument("--start", type=int, default=DEFAULT_START)
    p.add_argument("--end", type=int, default=DEFAULT_END)
    p.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    p.add_argument("--delay", type=float, default=DEFAULT_DELAY)
    p.add_argument("--resume", action="store_true")
    p.add_argument("--test", type=int)
    p.add_argument("--no-firebase", action="store_true")
    a = p.parse_args()
    if a.test:
        logger.info(f"=== TEST {a.test} ===")
        sc = HttpScraper(a.test, a.test - 1, 1)
        sess = sc.get_session()
        vs = sc.get_viewstate(sess)
        if not vs:
            sys.exit(1)
        html, st = sc.query_expediente(sess, vs, a.test)
        if html:
            data, has = parse_html(html)
            if has:
                logger.info("ENCONTRADO:")
                logger.info(json.dumps(data, indent=2, ensure_ascii=False))
            else:
                logger.info(f"No encontrado: {a.test}")
                with open(os.path.join(LOG_DIR, f"debug_{a.test}.html"), "w") as f:
                    f.write(html)
        return
    if not a.no_firebase:
        init_firestore()
    start = a.start
    end = a.end
    if a.resume:
        cp = HttpScraper.load_checkpoint()
        if cp:
            start = cp["last_expediente"]
            end = cp.get("end_exp", a.end)
            logger.info(f"Resume from {start} (prev:{cp['processed']})")
        else:
            logger.warning("No checkpoint found")
    scraper = HttpScraper(start, end, a.workers, a.delay)
    try:
        scraper.run()
    except KeyboardInterrupt:
        logger.info("Interrupted. Saving checkpoint...")
        scraper.save_checkpoint(scraper.last_checkpoint, force=True)
    except Exception as e:
        logger.error(f"Fatal: {e}")
        scraper.save_checkpoint(scraper.last_checkpoint, force=True)
        raise


if __name__ == "__main__":
    main()

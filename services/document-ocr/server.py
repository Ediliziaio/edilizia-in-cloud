"""Private one-page PDF OCR API for construction safety documents."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore
import hmac
import json
import os
import shutil
import subprocess


MAX_BYTES = 22 * 1024 * 1024
CAPACITY = BoundedSemaphore(2)


def trascrivi(pdf: bytes) -> str:
    with TemporaryDirectory(prefix="psc-ocr-") as directory:
        root = Path(directory)
        input_file = root / "originale.pdf"
        sidecar = root / "trascrizione.txt"
        copia = root / "copia.pdf"
        input_file.write_bytes(pdf)
        subprocess.run(
            [
                "ocrmypdf", "--language", "ita", "--pages", "1", "--jobs", "1",
                "--force-ocr", "--rotate-pages", "--deskew", "--optimize", "0",
                "--output-type", "pdf", "--tesseract-timeout", "14", "--sidecar",
                str(sidecar), str(input_file), str(copia),
            ],
            cwd=root, stdin=subprocess.DEVNULL, capture_output=True, check=True, timeout=22,
        )
        trascrizione = sidecar.read_text(encoding="utf-8").strip()
        if not trascrizione or "[OCR skipped" in trascrizione:
            return ""
        try:
            layout = subprocess.run(
                ["pdftotext", "-f", "1", "-l", "1", "-layout", "-enc", "UTF-8", str(copia), "-"],
                cwd=root, stdin=subprocess.DEVNULL, capture_output=True, check=True, timeout=2,
            )
            return layout.stdout.decode("utf-8").strip() or trascrizione
        except (OSError, ValueError, subprocess.SubprocessError):
            return trascrizione


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(8)

    def log_message(self, _format, *_args):
        # Document data and authorization headers never enter the request log.
        return

    def invia(self, status, body):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        self.invia(200 if self.path == "/healthz" else 404, {"ok": self.path == "/healthz"})

    def do_POST(self):
        if self.path != "/ocr":
            return self.invia(404, {"errore": "Percorso inesistente"})
        token = os.environ.get("OCR_SERVIZIO_TOKEN", "")
        auth = self.headers.get("Authorization", "")
        if not token or not hmac.compare_digest(auth.encode(), f"Bearer {token}".encode()):
            return self.invia(401, {"errore": "Accesso negato"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if not 5 <= size <= MAX_BYTES:
            return self.invia(413, {"errore": "Dimensione del PDF non valida"})
        if self.headers.get_content_type() != "application/pdf":
            return self.invia(415, {"errore": "È richiesta una pagina PDF"})
        if not CAPACITY.acquire(blocking=False):
            return self.invia(503, {"errore": "Servizio OCR occupato"})
        try:
            pdf = self.rfile.read(size)
            if len(pdf) != size or not pdf.startswith(b"%PDF-"):
                return self.invia(400, {"errore": "Pagina PDF non valida"})
            testo = trascrivi(pdf)
            self.invia(200, {"testo": testo, "completa": bool(testo) and "[OCR skipped" not in testo})
        except (OSError, ValueError, subprocess.SubprocessError):
            self.invia(422, {"errore": "Pagina non trascrivibile"})
        finally:
            CAPACITY.release()


if __name__ == "__main__":
    if not os.environ.get("OCR_SERVIZIO_TOKEN") or not shutil.which("ocrmypdf"):
        raise SystemExit("Configura OCR_SERVIZIO_TOKEN e installa OCRmyPDF con Tesseract italiano.")
    ThreadingHTTPServer(("", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()

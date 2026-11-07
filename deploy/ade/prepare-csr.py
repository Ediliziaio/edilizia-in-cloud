"""Prepare candidate AdE CSRs on the VPS. Never submit or activate them.

No third-party Python dependencies. Existing keys are verified, never replaced.
The public AdE example does not specify the portal's client/server/SAN rules.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

SOURCE_URL = "https://www.fatturapa.gov.it/export/documenti/esempio_csr.pdf"
SOURCE_SHA256 = "499dd30dca36cbe1e66ecc7319b62781403bfa5e7e63214c452049808b4d5284"
NAMES = [(environment, role) for environment in ("test", "production") for role in ("client", "server")]


def openssl(*args, data=None):
    result = subprocess.run(["openssl", *args], input=data, capture_output=True, check=True)
    return result.stdout


def validate_pair(root, environment, role, country, code):
    stem = environment + "-" + role
    key, csr = root / (stem + ".key"), root / (stem + ".csr")
    for path in (key, csr):
        if path.is_symlink() or not path.is_file():
            raise ValueError("Missing or unsafe CSR/key file: " + path.name)
    if stat.S_IMODE(key.stat().st_mode) & 0o077:
        raise ValueError("Private key permissions must exclude group and other users")
    openssl("req", "-in", str(csr), "-noout", "-verify")
    subject = openssl("req", "-in", str(csr), "-noout", "-subject", "-nameopt", "RFC2253").decode().strip()
    if subject != f"subject=CN=SDI-{code},C={country}":
        raise ValueError("CSR subject differs from the proposed subscriber")
    private_public = openssl("pkey", "-in", str(key), "-pubout", "-outform", "DER")
    csr_public_pem = openssl("req", "-in", str(csr), "-noout", "-pubkey")
    csr_public = openssl("pkey", "-pubin", "-outform", "DER", data=csr_public_pem)
    if private_public != csr_public:
        raise ValueError("CSR and private key do not match")
    key_text = openssl("pkey", "-pubin", "-text", "-noout", data=csr_public_pem).decode()
    if "Public-Key: (2048 bit)" not in key_text or "Exponent: 65537" not in key_text:
        raise ValueError("Expected an RSA 2048-bit public key")
    return {"environment": environment, "role": role, "csr": csr.name,
            "csr_sha256": hashlib.sha256(csr.read_bytes()).hexdigest(),
            "public_key_sha256": hashlib.sha256(csr_public).hexdigest()}


def prepare(output, country, code):
    if not re.fullmatch(r"[A-Z]{2}", country) or not re.fullmatch(r"(?:[0-9]{11}|[A-Z0-9]{16})", code):
        raise ValueError("Use a two-letter country and an 11-digit or 16-character proposed fiscal identifier")
    output = Path(output)
    if output.is_symlink():
        raise ValueError("Output directory must not be a symbolic link")
    if output.exists():
        if not output.is_dir() or stat.S_IMODE(output.stat().st_mode) & 0o077:
            raise ValueError("Existing output directory must be private (0700)")
        manifest = json.loads((output / "manifest.json").read_text())
        if (manifest.get("country"), manifest.get("proposed_subscriber_code")) != (country, code):
            raise ValueError("Existing keys belong to another proposed subject; choose a new directory")
        records = [validate_pair(output, environment, role, country, code) for environment, role in NAMES]
        if records != manifest.get("requests") or len({r["public_key_sha256"] for r in records}) != 4:
            raise ValueError("Existing CSR manifest or key separation does not match")
        return manifest

    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    output.mkdir(mode=0o700)
    previous_umask = os.umask(0o077)
    try:
        for environment, role in NAMES:
            stem = environment + "-" + role
            openssl("genrsa", "-out", str(output / (stem + ".key")), "2048")
            openssl("req", "-new", "-sha256", "-key", str(output / (stem + ".key")),
                    "-out", str(output / (stem + ".csr")), "-subj", f"/C={country}/CN=SDI-{code}")
        records = [validate_pair(output, environment, role, country, code) for environment, role in NAMES]
        if len({r["public_key_sha256"] for r in records}) != 4:
            raise ValueError("Expected four distinct key pairs")
        manifest = {"schema_version": 1, "status": "DRAFT_NOT_SUBMITTED",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "country": country, "proposed_subscriber_code": code,
                    "subject": f"C={country}, CN=SDI-{code}", "algorithm": "RSA", "bits": 2048,
                    "source_url": SOURCE_URL, "source_sha256": SOURCE_SHA256,
                    "portal_identity_verified": False, "portal_client_server_rules_verified": False,
                    "requests": records}
        (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (output / "LEGGIMI.txt").write_text(
            "BOZZE CSR - NON INVIATE - NESSUN CERTIFICATO RILASCIATO\n\n"
            f"Identificativo PROPOSTO: {country}{code}; soggetto CSR: SDI-{code}.\n"
            "Confrontarlo con l'identificativo fiscale del Sottoscrittore nella pratica AdE.\n"
            "Il codice proposto proviene dalla partita IVA fornita dall'utente: non attesta il codice fiscale personale.\n\n"
            "Quattro coppie indipendenti: client/server, test/production. Il numero di CSR da caricare\n"
            "e le regole specifiche per client, server, hostname e SAN vanno verificati nel portale.\n"
            "L'esempio pubblico AdE documenta RSA 2048 e CN SDI-identificativo; non tratta questi dettagli.\n"
            "Le CSR candidate non contengono SAN, EKU o dati anagrafici inventati.\n"
            "Se il portale richiede soggetti o estensioni diversi, rigenerare solo le CSR corrispondenti\n"
            "usando le stesse chiavi custodite sulla VPS. Non caricare automaticamente tutte le bozze.\n\n"
            "I file .key sono chiavi PRIVATE: devono restare sulla VPS e non essere caricati nel portale.\n"
            "Le sole CSR .csr sono le richieste pubbliche. manifest.json contiene i relativi SHA-256.\n"
            "Non sono certificati né prove di accreditamento. Il gateway resta non accreditato.\n\n"
            f"Fonte: {SOURCE_URL}\nSHA-256 PDF: {SOURCE_SHA256}\n")
        return manifest
    finally:
        os.umask(previous_umask)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--country", required=True)
    parser.add_argument("--proposed-subscriber-code", required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.output, args.country, args.proposed_subscriber_code), indent=2))

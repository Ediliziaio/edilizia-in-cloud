#!/usr/bin/env python3
"""
upload-render-references.py — EiC Render AI v8.3
Carica le 43 foto reference nel bucket Supabase Storage `render-references`.

Struttura bucket:
  render-references/
    colors/         — mazzette colori (PVC classica + Touch + colori massa)
    profiles/       — esempi profili (nodo simmetrico, asimmetrico, maniglia centrale)
    handles/        — modelli maniglie
    accessories/    — cassonetti, bottone tapparella, etc.
    examples/       — installazioni reali, prima/dopo, render studio

Prerequisiti:
  pip install supabase --break-system-packages
  export SUPABASE_URL="https://<project-ref>.supabase.co"
  export SUPABASE_SERVICE_ROLE_KEY="eyJ..."

Uso:
  python3 scripts/upload-render-references.py [SOURCE_DIR]

Default SOURCE_DIR: ~/Downloads/Nuova cartella con elementi/
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: pacchetto 'supabase' non installato.")
    print("Installa con: pip install supabase --break-system-packages")
    sys.exit(1)


BUCKET = "render-references"
DEFAULT_SOURCE = Path.home() / "Downloads" / "Nuova cartella con elementi"

# File da escludere (duplicati, file di sistema, archivi)
EXCLUDE = {
    ".DS_Store",
    "Thumbs.db",
    "546-Rovere-Spazzolato-Naturale-Finitura-Touch-effetto-spazzolato (1).webp",
    "EIC-RENDER-REFACTOR-v8.2.zip",
    "EIC-RENDER-REFACTOR-v8.3.zip",
    "COME_USARE_IL_PACK.md",
}


def categorize(filename: str) -> str:
    """Mappa il filename alla sottocartella corretta nel bucket."""
    if filename.startswith("Maniglia-"):
        return "handles"
    if filename.startswith("Profilo-"):
        return "profiles"
    if filename.startswith("Bottone-") or filename.startswith("Cassonetto-"):
        return "accessories"
    if filename.startswith(("Cucina-", "Finestra-", "Portafinestra-", "Prima-Dopo-")):
        return "examples"
    # Default: tutti i file con codice prodotto (1006-, 1009-, etc.)
    # oppure "Bianco-/Avorio-..." sono mazzette colori
    return "colors"


def detect_mime(filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    return {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "avif": "image/avif",
        "gif": "image/gif",
    }.get(ext, "application/octet-stream")


def ensure_bucket(client: Client) -> None:
    """Crea il bucket se non esiste, e impostalo pubblico."""
    try:
        existing = [b for b in client.storage.list_buckets() if b.name == BUCKET]
        if not existing:
            print(f"📦 Creo bucket '{BUCKET}' (public)...")
            client.storage.create_bucket(BUCKET, options={"public": True})
        else:
            print(f"📦 Bucket '{BUCKET}' già esistente.")
    except Exception as e:
        print(f"⚠️  Impossibile verificare/creare bucket via API: {e}")
        print("   Probabilmente serve creare a mano da Dashboard → Storage → New bucket → 'render-references' (Public).")


def upload_file(client: Client, local_path: Path, remote_path: str) -> tuple[bool, Optional[str]]:
    """Carica un singolo file, ritorna (success, errore?)."""
    try:
        with open(local_path, "rb") as f:
            data = f.read()
        client.storage.from_(BUCKET).upload(
            remote_path,
            data,
            {
                "content-type": detect_mime(local_path.name),
                "upsert": "true",
            },
        )
        return True, None
    except Exception as e:
        # Su upsert già esistente, alcune versioni della libreria lanciano eccezione
        err = str(e)
        if "Duplicate" in err or "already exists" in err.lower():
            # Prova update esplicito
            try:
                with open(local_path, "rb") as f:
                    data = f.read()
                client.storage.from_(BUCKET).update(
                    remote_path,
                    data,
                    {"content-type": detect_mime(local_path.name)},
                )
                return True, None
            except Exception as e2:
                return False, f"update fallito: {e2}"
        return False, err


def main():
    # Args
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.is_dir():
        print(f"ERROR: cartella non trovata: {source}")
        sys.exit(1)

    # Env
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        print("ERROR: imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY")
        print('Es: export SUPABASE_URL="https://abc.supabase.co"')
        print('    export SUPABASE_SERVICE_ROLE_KEY="eyJ..."')
        sys.exit(1)

    client = create_client(supabase_url, supabase_key)
    ensure_bucket(client)

    # Enumera file
    files = sorted(
        p for p in source.iterdir()
        if p.is_file() and p.name not in EXCLUDE and not p.name.startswith(".")
    )

    print(f"\n📁 Sorgente: {source}")
    print(f"📊 {len(files)} file da caricare\n")

    # Distribuzione per categoria
    by_cat: dict[str, list[Path]] = {}
    for f in files:
        cat = categorize(f.name)
        by_cat.setdefault(cat, []).append(f)
    for cat, items in by_cat.items():
        print(f"   {cat:>12}: {len(items)} file")
    print()

    # Upload
    ok_count = 0
    err_count = 0
    errors: list[tuple[str, str]] = []

    for f in files:
        cat = categorize(f.name)
        remote = f"{cat}/{f.name}"
        success, err = upload_file(client, f, remote)
        if success:
            print(f"  ✓ {remote}")
            ok_count += 1
        else:
            print(f"  ✗ {remote}   → {err}")
            err_count += 1
            errors.append((remote, err or "unknown"))

    print(f"\n{'─' * 60}")
    print(f"✅ {ok_count} caricati  |  ❌ {err_count} errori")
    if errors:
        print("\nDettagli errori:")
        for path, err in errors:
            print(f"  - {path}: {err}")

    # Stampa URL di esempio
    if ok_count > 0:
        first_ok = next((f.name for f in files if (categorize(f.name), True)), None)
        if first_ok:
            cat = categorize(first_ok)
            base_url = f"{supabase_url}/storage/v1/object/public/{BUCKET}"
            print(f"\n🌐 URL pubblico esempio:")
            print(f"   {base_url}/{cat}/{first_ok}")
            print(f"\n💡 Imposta env nei progetti:")
            print(f'   VITE_RENDER_REFERENCES_BASE_URL="{base_url}"')
            print(f'   RENDER_REFERENCES_BASE_URL="{base_url}"  # Supabase edge function secret')

    sys.exit(0 if err_count == 0 else 1)


if __name__ == "__main__":
    main()

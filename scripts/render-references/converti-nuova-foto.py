#!/usr/bin/env python3
"""Converte UNA foto nuova nel formato del motore dei render (stesse regole delle 310 foto del 04/10/2026).

Uso:
  python3 scripts/render-references/converti-nuova-foto.py <foto.png|jpg> <cartella> <Nome-Della-Foto> [--forma]

  <cartella>  quella del verticale in public/render-references: bathroom, floors, facades, roofs, shutters,
              pergolas, pools, doors, exterior, lighting (luci: binario della stanza)
  <Nome-Della-Foto>  parole con l'iniziale maiuscola separate da trattini, senza accenti e senza estensione
  --forma     foto di FORMA (tipo di doccia, di pergola…): scrive «<Nome>-BN.webp» in bianco e nero (900 px).
              Senza --forma è di MATERIA: «<Nome>.webp» a colori (800 px).
Scrive sempre anche la miniatura a colori per l'interfaccia (320 px) in thumbs/<cartella>/<Nome>.webp.

Non sovrascrive mai un file che esiste già (le edge function tengono una cache che non scade): se il nome è
preso, si ferma. Poi: aggiungi la voce nella tabella del verticale (shared/render-references/…References.ts) con un
testo inglese ≤ 160 caratteri scritto guardando la foto, e lancia i test del verticale.
"""
import os, sys
from PIL import Image, ImageOps

LATO = {"BN": 900, "COLORE": 800, "THUMB": 320}
QUALITA = {"BN": 74, "COLORE": 72, "THUMB": 70}
CARTELLE = ["bathroom", "floors", "facades", "roofs", "shutters", "pergolas", "pools", "doors", "exterior", "lighting"]
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "render-references")


def scrivi(im, rel, tipo, grigio):
    dest = os.path.join(RADICE, rel)
    if os.path.exists(dest):
        sys.exit(f"esiste già: {rel} — scegli un altro nome (mai sovrascrivere un file pubblicato)")
    x = im.copy()
    w, h = x.size
    k = LATO[tipo] / max(w, h)
    if k < 1:
        x = x.resize((round(w * k), round(h * k)), Image.LANCZOS)
    if grigio:
        x = ImageOps.grayscale(x).convert("RGB")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    x.save(dest, "WEBP", quality=QUALITA[tipo], method=6)
    print(f"scritto {rel} ({os.path.getsize(dest) // 1024} KB)")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    forma = "--forma" in sys.argv
    if len(args) != 3:
        sys.exit(__doc__)
    sorgente, cartella, nome = args
    if cartella not in CARTELLE:
        sys.exit(f"cartella sconosciuta «{cartella}»: usa una tra {', '.join(CARTELLE)}")
    if nome.endswith(".webp") or nome.endswith("-BN") or " " in nome:
        sys.exit("il nome va senza estensione, senza «-BN» (lo aggiungo io con --forma) e senza spazi")
    im = ImageOps.exif_transpose(Image.open(sorgente)).convert("RGB")
    if forma:
        scrivi(im, f"{cartella}/{nome}-BN.webp", "BN", True)
    else:
        scrivi(im, f"{cartella}/{nome}.webp", "COLORE", False)
    scrivi(im, f"thumbs/{cartella}/{nome}.webp", "THUMB", False)


main()

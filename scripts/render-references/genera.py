#!/usr/bin/env python3
"""Genera da mappa.py: i file WebP del motore (B/N per la forma, colori per la materia), le miniature a colori
per la UI e il manifest. Uso: genera.py <radice public/render-references> [--solo-manifest]"""
import json, os, re, sys, unicodedata, collections
from PIL import Image, ImageOps
import mappa

SRC = os.environ.get("RENDER_FOTO_SRC", "./sorgente/")   # cartella con i 310 PNG originali
NOMI = [l.rstrip("\n") for l in open(os.path.join(os.path.dirname(__file__) or ".", "nomi-ordinati.txt"), encoding="utf-8")]
LATO = {"BN": 900, "COLORE": 800, "THUMB": 320}
QUALITA = {"BN": 74, "COLORE": 72, "THUMB": 70}

def slug(nome):
    n = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    n = re.sub(r"\(\d+\)", " ", n)
    n = re.sub(r"[^A-Za-z0-9]+", " ", n).strip()
    return "-".join(w[:1].upper() + w[1:] for w in n.split())

def main(radice, solo_manifest=False):
    usi = collections.defaultdict(list)          # n -> [(modulo, dim, valore, classe)]
    for modulo, dim, valore, foto, classe in mappa.M:
        for n in foto: usi[n].append((modulo, dim, valore, classe))
    # nomi unici: se due foto danno lo stesso slug (es. "(1)"), la seconda prende -2
    visti, slug_di = collections.Counter(), {}
    for n in range(1, len(NOMI) + 1):
        base = slug(NOMI[n - 1]); visti[base] += 1
        slug_di[n] = base if visti[base] == 1 else f"{base}-{visti[base]}"
    foto = {}
    for n in sorted(usi):
        primo = usi[n][0][0]; cartella = mappa.CARTELLA[primo]
        classi = {u[3] for u in usi[n]}
        s = slug_di[n]
        foto[n] = {
            "src": NOMI[n - 1], "slug": s, "cartella": cartella,
            "colore": f"{cartella}/{s}.webp" if "MATERIA" in classi else None,
            "bn": f"{cartella}/{s}-BN.webp" if "FORMA" in classi else None,
            "thumb": f"thumbs/{cartella}/{s}.webp",
        }
    voci = []
    for modulo, dim, valore, nums, classe in mappa.M:
        chiave = "bn" if classe == "FORMA" else "colore"
        voci.append({"modulo": modulo, "dim": dim, "valore": valore, "classe": classe,
                     "file": [foto[n][chiave] for n in nums], "thumb": [foto[n]["thumb"] for n in nums]})
    manifest = {"foto": {str(n): f for n, f in foto.items()}, "voci": voci}
    os.makedirs(radice, exist_ok=True)
    json.dump(manifest, open(os.path.join(os.path.dirname(__file__) or ".", "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if solo_manifest:
        print("manifest:", len(foto), "foto,", len(voci), "voci"); return
    tot = collections.Counter(); byte = collections.Counter()
    for n, f in foto.items():
        im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, NOMI[n - 1] + ".png"))).convert("RGB")
        def scrivi(rel, tipo, grigio):
            x = im.copy(); w, h = x.size; k = LATO[tipo] / max(w, h)
            if k < 1: x = x.resize((round(w * k), round(h * k)), Image.LANCZOS)
            if grigio: x = ImageOps.grayscale(x).convert("RGB")
            dest = os.path.join(radice, rel); os.makedirs(os.path.dirname(dest), exist_ok=True)
            x.save(dest, "WEBP", quality=QUALITA[tipo], method=6); tot[tipo] += 1; byte[tipo] += os.path.getsize(dest)
        if f["colore"]: scrivi(f["colore"], "COLORE", False)
        if f["bn"]: scrivi(f["bn"], "BN", True)
        scrivi(f["thumb"], "THUMB", False)
    for t in ("BN", "COLORE", "THUMB"):
        print(f"{t:7s} {tot[t]:4d} file  {byte[t]/1024/1024:6.1f} MB  media {byte[t]/max(tot[t],1)/1024:5.0f} KB")
    print(f"TOTALE  {sum(tot.values())} file  {sum(byte.values())/1024/1024:.1f} MB")

if __name__ == "__main__":
    main(sys.argv[1], "--solo-manifest" in sys.argv)

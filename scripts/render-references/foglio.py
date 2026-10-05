#!/usr/bin/env python3
"""Foglio contatto di un modulo: per ogni voce del manifest la foto principale (miniatura a colori) con
«dimensione = valore» e il nome del file del motore. Serve a scrivere etichette giuste guardando le foto.

Uso:  python3 scripts/render-references/foglio.py <modulo> [uscita.jpg] [--dim=<dimensione>]
Moduli: bagno pavimento facciata tetto persiane pergola piscina porta_interna porta_blindata esterno stanza
Si apre con lo strumento Read (le immagini si leggono). Più di ~24 voci vanno su più fogli (uscita-1.jpg, -2.jpg…).
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.join(QUI, "..", "..", "public", "render-references")
COLONNE, LATO, TESTO, PER_FOGLIO = 4, 256, 44, 24

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opz = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
    if not args:
        sys.exit(__doc__)
    modulo = args[0]
    uscita = args[1] if len(args) > 1 else f"foglio-{modulo}.jpg"
    manifest = json.load(open(os.path.join(QUI, "manifest.json"), encoding="utf-8"))
    voci = [v for v in manifest["voci"] if v["modulo"] == modulo and (not opz.get("dim") or v["dim"] == opz["dim"])]
    if not voci:
        sys.exit(f"nessuna voce per il modulo «{modulo}»")
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    fogli = [voci[i:i + PER_FOGLIO] for i in range(0, len(voci), PER_FOGLIO)]
    for n, blocco in enumerate(fogli, 1):
        righe = (len(blocco) + COLONNE - 1) // COLONNE
        W, H = COLONNE * LATO, righe * (LATO + TESTO)
        tela = Image.new("RGB", (W, H), (245, 245, 245))
        d = ImageDraw.Draw(tela)
        for i, v in enumerate(blocco):
            x, y = (i % COLONNE) * LATO, (i // COLONNE) * (LATO + TESTO)
            miniatura = os.path.join(RADICE, v["thumb"][0])
            try:
                im = Image.open(miniatura).convert("RGB")
                im.thumbnail((LATO - 6, LATO - 6))
                tela.paste(im, (x + 3 + (LATO - 6 - im.width) // 2, y + 3))
            except OSError:
                d.text((x + 8, y + 8), "(manca)", fill=(200, 0, 0), font=font)
            d.text((x + 4, y + LATO + 2), f"{v['dim']} = {v['valore']} [{v['classe'][0]}x{len(v['file'])}]", fill=(0, 0, 0), font=font)
            d.text((x + 4, y + LATO + 20), os.path.basename(v["file"][0])[:38], fill=(90, 90, 90), font=font)
        dest = uscita if len(fogli) == 1 else uscita.replace(".jpg", f"-{n}.jpg")
        tela.save(dest, quality=82)
        print("scritto", dest, f"({len(blocco)} voci)")

main()

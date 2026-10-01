#!/usr/bin/env python3
"""Ritaglia la miniatura di un modello per il selettore dei preventivatori.

Uso: python scripts/miniatura-selettore.py <foto-sorgente> <area>-<id> [spostamento]

Ritaglia la sorgente a 2:3 al centro (più lo spostamento in pixel per centrare il
soggetto), la porta a 480x720 e la salva in public/quote-picker/<area>-<id>.webp.
Non tocca mai la sorgente. Avvisa se il file supera i 90 KB.
"""
import os
import sys
from PIL import Image

if len(sys.argv) < 3:
    sys.exit(__doc__)
sorgente, nome = sys.argv[1], sys.argv[2]
spostamento = int(sys.argv[3]) if len(sys.argv) > 3 else 0
dest = os.path.join("public", "quote-picker", f"{nome}.webp")

im = Image.open(sorgente).convert("RGB")
w, h = im.size
nw = round(h * 2 / 3)
if nw <= w:
    x = max(0, min(w - nw, (w - nw) // 2 + spostamento))
    im = im.crop((x, 0, x + nw, h))
else:  # sorgente più stretta di 2:3: taglio in altezza
    nh = round(w * 3 / 2)
    y = max(0, min(h - nh, (h - nh) // 2 + spostamento))
    im = im.crop((0, y, w, y + nh))
im = im.resize((480, 720), Image.LANCZOS)
im.save(dest, "WEBP", quality=72, method=6)
kb = os.path.getsize(dest) // 1024
print(f"{dest}: {kb} KB" + ("  ⚠️ oltre i 90 KB, abbassa la qualità" if kb >= 90 else ""))

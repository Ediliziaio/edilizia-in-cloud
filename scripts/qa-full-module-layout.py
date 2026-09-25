"""Structural checks and contact sheets of every page in production-rendered module PDFs."""
from pathlib import Path
import subprocess
import json
import sys
import pdfplumber
from PIL import Image, ImageDraw
root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "full-module-qa"
results = {}
issues = []
render_pages = "--no-render" not in sys.argv
sources = sorted(root.glob(sys.argv[2] if len(sys.argv) > 2 else "*.pdf"))
if not sources:
    raise SystemExit(f"Nessun PDF trovato in {root}")
for source in sources:
    target = root / source.stem
    if render_pages:
        target.mkdir(exist_ok=True)
    with pdfplumber.open(source) as pdf:
        results[source.name] = {"pages": len(pdf.pages), "texts": []}
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            results[source.name]["texts"].append(text)
            if len(text.strip()) < 20:
                issues.append([source.name, i + 1, "empty page"])
            for w in page.extract_words():
                if w["x0"] < 0 or w["x1"] > page.width + 1 or w["top"] < 0 or w["bottom"] > page.height + 1:
                    issues.append([source.name, i + 1, "text outside page", w["text"]])
        fulltext = "\n".join(results[source.name]["texts"])
        if source.stem.endswith("sconto-100") and not any(zero in fulltext for zero in ("€ 0,00", "0,00 €")):
            issues.append([source.name, "100% discount missing zero total"])
        if source.stem.endswith("prezzo-manuale") and not any(total in fulltext for total in ("€ 1.098,00", "1.098,00 €")):
            issues.append([source.name, "manual price 1000 -10% +22% IVA incorrect"])
    if not render_pages:
        print(f"CHECK {source.name}: {results[source.name]['pages']} pages", flush=True)
        continue
    subprocess.run(["pdftoppm", "-scale-to", "850", "-png", str(source), str(target / "page")], check=True)
    # Poppler does not remove pages from a previous, longer export.
    # Select only this PDF's page numbers, never stale PNGs from old runs.
    page_count = results[source.name]["pages"]
    padding = len(str(page_count))
    pictures = [target / f"page-{number:0{padding}d}.png" for number in range(1, page_count + 1)]
    for start in range(0, len(pictures), 8):
        sheet = Image.new("RGB", (1680, 1280), "#e7ebef")
        draw = ImageDraw.Draw(sheet)
        for i, picture in enumerate(pictures[start:start+8]):
            img = Image.open(picture)
            img.thumbnail((390, 575))
            x, y = (i % 4) * 420 + 15, (i // 4) * 640 + 25
            sheet.paste(img, (x, y))
            draw.text((x, y+580), f"{source.stem} - {start+i+1}", fill="black")
        sheet.save(target / f"contact-{start//8+1}.jpg")
print(json.dumps({"pages": {name: data["pages"] for name, data in results.items()}, "issues": issues}, ensure_ascii=False))
(root / "layout-report.json").write_text(json.dumps({"results": results, "issues": issues}, ensure_ascii=False, indent=2))
if issues:
    raise SystemExit(1)

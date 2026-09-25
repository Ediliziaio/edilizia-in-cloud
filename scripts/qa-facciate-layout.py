"""Geometry on all Facciate PDFs; Poppler/contact sheets on six BASE PDFs for separate human visual review.
Usage: python scripts/qa-facciate-layout.py ../facciate-native-qa
Passing geometry does NOT assert visual approval. Inspect every generated contact sheet.
"""
from pathlib import Path
import json
import subprocess
import sys
import pdfplumber
from PIL import Image, ImageDraw

root = Path(sys.argv[1])
report = {"files": [], "issues": [], "base_pages_rendered": 0, "visual_review": "NOT performed by this script"}
sources = sorted(root.glob("facciate-*.pdf"))
if not sources:
    raise SystemExit("No Facciate PDFs found")
for source in sources:
    with pdfplumber.open(source) as pdf:
        pages = []
        for number, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            pages.append({"number": number, "images": len(page.images), "characters": len(text)})
            if len(text.strip()) < 40:
                report["issues"].append([source.name, number, "near-empty page"])
            for word in page.extract_words():
                if word["x0"] < 0 or word["x1"] > page.width + 1 or word["top"] < 0 or word["bottom"] > page.height + 1:
                    report["issues"].append([source.name, number, "text outside page", word["text"]])
        report["files"].append({"file": source.name, "pages": pages})
        count = len(pdf.pages)
    if not source.stem.endswith("-base"):
        continue
    target = root / "visual" / source.stem
    target.mkdir(parents=True, exist_ok=True)
    subprocess.run(["pdftoppm", "-scale-to", "1100", "-png", str(source), str(target / "page")], check=True)
    report["base_pages_rendered"] += count
    padding = len(str(count))
    for start in range(0, count, 6):
        sheet = Image.new("RGB", (1800, 1700), "#e9edef")
        draw = ImageDraw.Draw(sheet)
        for offset, number in enumerate(range(start + 1, min(count, start + 6) + 1)):
            picture = Image.open(target / f"page-{number:0{padding}d}.png")
            picture.thumbnail((570, 805))
            x, y = (offset % 3) * 600 + 15, (offset // 3) * 850 + 15
            sheet.paste(picture, (x, y))
            draw.text((x, y + 810), f"{source.stem}: {number}/{count}", fill="black")
        sheet.save(target / f"contact-{start // 6 + 1}.jpg", quality=90)
(root / "facciate-layout.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({"PDFs": len(sources), "base_pages_rendered": report["base_pages_rendered"], "issues": report["issues"]}))
if report["issues"]:
    raise SystemExit(1)

"""Inspect application PDFs and produce contact sheets for visual QA (no external data)."""
from pathlib import Path
import subprocess
import pdfplumber
from PIL import Image, ImageOps, ImageDraw

root = Path(__file__).resolve().parents[2] / "module-pdf-qa"
issues = []
counts = {}
for file in sorted(root.glob("*.pdf")):
    with pdfplumber.open(file) as pdf:
        counts[file.name] = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            words = page.extract_words()
            if not words:
                issues.append((file.name, i + 1, "empty page"))
            for word in words:
                if word["x0"] < -1 or word["x1"] > page.width + 1 or word["top"] < -1 or word["bottom"] > page.height + 1:
                    issues.append((file.name, i + 1, "text outside page", word["text"]))
    # Render each cover with Poppler, for inspection in batches.
    subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-scale-to", "550", "-png", "-singlefile", str(file), str(root / file.stem)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
files = sorted(root.glob("*.pdf"))
for batch in range(0, len(files), 12):
    selected = files[batch:batch + 12]
    sheet = Image.new("RGB", (1200, 1740), "#e8ebef")
    draw = ImageDraw.Draw(sheet)
    for i, file in enumerate(selected):
        picture = Image.open(root / (file.stem + ".png"))
        picture.thumbnail((280, 390))
        x, y = (i % 4) * 300 + 10, (i // 4) * 570 + 25
        sheet.paste(picture, (x, y))
        draw.text((x, y + 405), file.stem, fill="black")
    sheet.save(root / f"contact-{batch // 12 + 1}.jpg")
print("PDF counts:", counts)
print("Layout issues:", issues)
if issues:
    raise SystemExit(1)

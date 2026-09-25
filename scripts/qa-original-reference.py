"""Read supplied reference PDFs and render every page with Poppler for visual QA."""
from pathlib import Path
import subprocess
import json
import pdfplumber
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2] / "original-reference-qa"
root.mkdir(exist_ok=True)
inventory = {}
for name in ("Serramenti", "Fotovoltaico", "Bagni", "Ristrutturazione"):
    source = Path("/Users/agenteai/Downloads") / f"{name}-prova.pdf"
    target = root / name
    target.mkdir(exist_ok=True)
    with pdfplumber.open(source) as pdf:
        inventory[name] = [{"page": i + 1, "text": page.extract_text() or ""} for i, page in enumerate(pdf.pages)]
    subprocess.run(["pdftoppm", "-scale-to", "700", "-png", str(source), str(target / "page")], check=True)
    pictures = sorted(target.glob("page-*.png"))
    for batch in range(0, len(pictures), 8):
        sheet = Image.new("RGB", (1680, 1280), "#e7ebef")
        draw = ImageDraw.Draw(sheet)
        for i, picture in enumerate(pictures[batch:batch + 8]):
            img = Image.open(picture)
            img.thumbnail((390, 575))
            x, y = (i % 4) * 420 + 15, (i // 4) * 640 + 25
            sheet.paste(img, (x, y))
            draw.text((x, y + 580), f"{name} - pagina {batch+i+1}", fill="black")
        sheet.save(target / f"contact-{batch//8+1}.jpg")
    print(name, len(pictures), "pagine")
(root / "inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2))

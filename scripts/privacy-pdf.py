"""Genera il PDF dalla pagina React esportata da node scripts/privacy-html.mjs.

Dipendenze di authoring: beautifulsoup4, reportlab. Nessun accesso al database.
"""
from pathlib import Path
import re
from xml.sax.saxutils import escape
from bs4 import BeautifulSoup
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

font_dir = Path("/System/Library/Fonts/Supplemental")
if (font_dir / "Arial.ttf").exists():
    for name, filename in [("Legal", "Arial.ttf"), ("Legal-Bold", "Arial Bold.ttf"), ("Legal-Italic", "Arial Italic.ttf"), ("Legal-BoldItalic", "Arial Bold Italic.ttf")]:
        pdfmetrics.registerFont(TTFont(name, str(font_dir / filename)))
    pdfmetrics.registerFontFamily("Legal", normal="Legal", bold="Legal-Bold", italic="Legal-Italic", boldItalic="Legal-BoldItalic")
    font = "Legal"
else:
    font = "Helvetica"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="BodyLegal", fontName=font, fontSize=9.5, leading=14, spaceAfter=7, alignment=TA_LEFT))
styles.add(ParagraphStyle(name="CellLegal", parent=styles["BodyLegal"], fontSize=8, leading=11, spaceAfter=0))
for name, size, lead in [("Title", 21, 26), ("Heading2", 14, 19), ("Heading3", 11, 15)]:
    styles[name].fontName = "Legal-Bold" if font == "Legal" else "Helvetica-Bold"
    styles[name].fontSize = size
    styles[name].leading = lead
    styles[name].spaceBefore = 14
    styles[name].spaceAfter = 8
    styles[name].textColor = colors.HexColor("#24344c")

soup = BeautifulSoup(Path("tmp/pdfs/privacy.html").read_text(), "html.parser")
article = soup.find("article")
assert article

def inline(node):
    if isinstance(node, str):
        return escape(re.sub(r"\s+", " ", node)).replace("–", "-").replace("—", "-")
    content = "".join(inline(child) for child in node.children)
    if node.name == "br": return "<br/>"
    if node.name in ("strong", "b"): return f"<b>{content}</b>"
    if node.name in ("em", "i"): return f"<i>{content}</i>"
    if node.name == "a":
        href = escape(node.get("href", ""), {'"': '&quot;'})
        return f'<a href="{href}" color="#245b91">{content}</a>' if href.startswith("https://") else content
    return content

story = []
for node in article.children:
    if not getattr(node, "name", None): continue
    if node.name in ("h1", "h2", "h3"):
        if node.get("id") == "dati-account-google": story.append(PageBreak())
        style = {"h1": "Title", "h2": "Heading2", "h3": "Heading3"}[node.name]
        story.append(Paragraph(inline(node), styles[style]))
    elif node.name in ("p", "div"):
        story.append(Paragraph(inline(node), styles["BodyLegal"]))
    elif node.name in ("ul", "ol"):
        for index, li in enumerate(node.find_all("li", recursive=False), 1):
            label = f"{index}." if node.name == "ol" else "•"
            style = ParagraphStyle(name="ListLegal", parent=styles["BodyLegal"], leftIndent=13, bulletIndent=0)
            story.append(Paragraph(inline(li), style, bulletText=label))
        story.append(Spacer(1, 4))
    elif node.name == "table":
        rows = [[Paragraph(inline(cell), styles["CellLegal"]) for cell in row.find_all(["td", "th"], recursive=False)] for row in node.find_all("tr")]
        if rows:
            width = A4[0] - 92
            table = Table(rows, colWidths=[width / len(rows[0])] * len(rows[0]), repeatRows=1, hAlign="LEFT")
            table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#edf2f7")),
                ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#cdd6df")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.extend([table, Spacer(1, 10)])
    else:
        raise ValueError(f"Blocco non gestito: {node.name}")

def page(canvas, doc):
    canvas.saveState()
    canvas.setFont(font, 8)
    canvas.setFillColor(colors.HexColor("#667085"))
    canvas.drawString(46, 29, "Edilizia in Cloud | Privacy Policy | 26 ottobre 2026")
    canvas.drawRightString(A4[0] - 46, 29, f"Pagina {doc.page}")
    canvas.restoreState()

target = Path("public/legal/Edilizia-in-Cloud_Privacy-Policy.pdf")
SimpleDocTemplate(str(target), pagesize=A4, leftMargin=46, rightMargin=46, topMargin=42, bottomMargin=48,
                  title="Edilizia in Cloud - Privacy Policy", author="Domus Group S.r.l.").build(story, onFirstPage=page, onLaterPages=page)
print(target)

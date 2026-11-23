"""Draw the 2D model on white paper. Keep each DXF in its own worker process."""

import json
import re
import sys
from math import atan2, degrees, isfinite
from pathlib import Path
from xml.etree import ElementTree

import ezdxf
from ezdxf import recover
from ezdxf.addons.drawing import Frontend, RenderContext, config, layout, svg


NUMERO_QUOTA = re.compile(r"[0-9]+(?:[.,][0-9]+)?(?:\s*(?:mm|cm|m))?", re.IGNORECASE)


def quote_di_controllo(documento):
    nascosti = {layer.dxf.name.casefold() for layer in documento.layers if layer.is_off() or layer.is_frozen()}
    candidati = []
    for entita in documento.modelspace().query("DIMENSION"):
        if entita.dimtype not in (0, 1) or entita.dxf.get("invisible", 0) or entita.dxf.layer.casefold() in nascosti:
            continue
        testo = entita.dxf.get("text", "")
        if testo == " ":
            continue
        if not testo.strip() or testo == "<>":
            blocco = entita.get_geometry_block()
            testi = [e.plain_text().strip() for e in blocco or () if e.dxftype() in ("TEXT", "MTEXT")]
            if len(testi) != 1:
                continue
            testo = testi[0]
        testo = " ".join(testo.split())
        if len(testo) > 22 or not NUMERO_QUOTA.fullmatch(testo):
            continue
        p = entita.dxf.get("defpoint2", None)
        q = entita.dxf.get("defpoint3", None)
        centro = entita.dxf.get("text_midpoint", None) or entita.dxf.get("defpoint", None)
        if p is None or q is None or centro is None:
            continue
        lunghezza = abs(entita.get_measurement())
        angolo = entita.dxf.get("angle", 0) if entita.dimtype == 0 else degrees(atan2(q.y - p.y, q.x - p.x))
        if not all(isfinite(v) for v in (angolo, centro.x, centro.y, lunghezza)) or not 0 < lunghezza <= 1e10:
            continue
        candidati.append({
            "id": entita.dxf.handle, "testo": testo, "lunghezza": float(lunghezza),
            "angolo": round(angolo % 180, 3) % 180, "punto": [round(centro.x, 6), round(centro.y, 6)],
        })
    # Conserva misure di entrambe le direzioni anche nei fogli con molte quote in fila.
    direzioni = [[], []]
    for quota in sorted(candidati, key=lambda q: -q["lunghezza"]):
        direzione = direzioni[0 if quota["angolo"] < 45 or quota["angolo"] >= 135 else 1]
        if len(direzione) < 10 and not any(
            q["testo"] == quota["testo"] and abs(q["lunghezza"] - quota["lunghezza"]) <= 1e-6 * quota["lunghezza"]
            and abs(q["angolo"] - quota["angolo"]) <= 1 and abs(q["punto"][0] - quota["punto"][0]) <= quota["lunghezza"]
            and abs(q["punto"][1] - quota["punto"][1]) <= quota["lunghezza"] for q in direzione
        ):
            direzione.append(quota)
    return sorted(direzioni[0] + direzioni[1], key=lambda q: -q["lunghezza"])


def draw(source: Path, target: Path, metadata: Path) -> None:
    try:
        document = ezdxf.readfile(source)
    except ezdxf.DXFStructureError:
        document, _ = recover.readfile(source)

    backend = svg.SVGBackend()
    settings = config.Configuration(
        background_policy=config.BackgroundPolicy.WHITE,
        color_policy=config.ColorPolicy.BLACK,
        hatch_policy=config.HatchPolicy.SHOW_OUTLINE,
        image_policy=config.ImagePolicy.IGNORE,
        lineweight_scaling=0.65,
    )
    Frontend(RenderContext(document), backend, config=settings).draw_layout(document.modelspace())
    if not backend.records:
        raise ValueError("No visible model space geometry")
    # A fixed paper size bounds DXF coordinates before rasterizing the drawing.
    page = layout.Page(280, 280, margins=layout.Margins.all(3))
    root = backend.get_xml_root_element(page)
    root.set("width", "4096")
    root.set("height", "4096")
    ElementTree.ElementTree(root).write(target, encoding="utf-8", xml_declaration=True)
    matrix = backend.transformation_matrix
    translation = matrix.transform((0, 0, 0))
    dx = matrix.transform_direction((1, 0, 0))
    dy = matrix.transform_direction((0, 1, 0))
    metadata.write_text(json.dumps({
        "unita": document.units,
        "trasformazione": [translation.x, translation.y, dx.x, dy.y],
        "quote": quote_di_controllo(document),
    }), encoding="utf-8")


if __name__ == "__main__":
    draw(*(Path(arg) for arg in sys.argv[1:4]))

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


UNITA_CM = {1: 2.54, 2: 30.48, 4: 0.1, 5: 1, 6: 100}
NOME_STANZA = re.compile(
    r"\b(soggiorno|sogg|pranzo|living|cucin\w*|angolo cottura|letto|camer\w*|bagn\w*|wc|disimpegno|dis|ingresso|"
    r"ripostiglio|rip|cantin\w*|garage|box|studio|lavanderia|corridoio|atrio)\b\.?", re.IGNORECASE)
AREA_SCRITTA = re.compile(r"(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:m2|m²|mq)\.?")
QUOTA_PIANO = re.compile(r"^\s*([+-])\s*(\d{1,2}[.,]\d{2})\s*$")
NOMI_PIANI = {0: "Piano terra", 1: "Piano primo", 2: "Piano secondo", 3: "Piano terzo", 4: "Piano quarto", 5: "Piano quinto"}
SOLO_INTERRATO = re.compile(r"\b(cantin\w*|garage|box|locale tecnico|deposito|autorimessa)\b", re.IGNORECASE)


def _segmenti(entita, cm):
    from ezdxf.path import make_path  # noqa: PLC0415
    tipo = entita.dxftype()
    if tipo == "LINE":
        vertici = [entita.dxf.start, entita.dxf.end]
    elif tipo == "LWPOLYLINE" or (tipo == "POLYLINE" and entita.is_2d_polyline):
        vertici = list(make_path(entita).flattening(max(1 / cm, 0.00001)))
    else:
        return []
    return [((p.x * cm, p.y * cm), (q.x * cm, q.y * cm)) for p, q in zip(vertici, vertici[1:]) if p != q]


def proponi_piani(documento, massimo=6):
    """Prova l'unità dichiarata e poi metri, centimetri e millimetri: molti DWG dichiarano i
    millimetri e sono disegnati in metri (Callimaco). Vince l'unità con piante di misura
    plausibile (da 4 a 150 m di lato) e più nomi di stanza dentro."""
    prove = [documento.units] + [u for u in (6, 5, 4) if u != documento.units]
    migliore = None
    for unita in prove:
        esito = _proponi_piani(documento, UNITA_CM.get(unita), massimo)
        if not esito:
            continue
        lati = [max(r[2] - r[0], r[3] - r[1]) * UNITA_CM[unita] / 100 for r in (p["rettangolo"] for p in esito["piani"])]
        if not all(4 <= lato <= 150 for lato in lati):
            continue
        # A scala sbagliata le piante si fondono in un gruppo solo: conta prima quante se ne separano.
        punteggio = (esito["nomi"], -len(esito["piani"]), unita == documento.units)
        if migliore is None or punteggio > migliore[0]:
            migliore = (punteggio, {**esito, "unita": unita})
    if migliore is None:
        return None
    esito = migliore[1]
    esito.pop("nomi")
    return esito


def _proponi_piani(documento, cm, massimo, distanza=150):
    """Le piante della tavola, trovate da sole (24/11/2026).

    Le linee di ogni layer candidato ai muri si raggruppano (vicine entro 1,5 m): un gruppo è una
    pianta se contiene nomi di stanza; prospetti e sezioni hanno muri ma nessun nome. Il layer dei
    muri è quello che dà più piante con più nomi. La quota viene da una scritta «+6.98» nella pianta;
    dove manca, il piano più grande è il terra e gli altri salgono di un interpiano (quello letto,
    o 3 m). Un piano con solo cantine o box va sotto terra. È una proposta: l'utente conferma.
    """
    from shapely import LineString, Point, box, union_all  # noqa: PLC0415
    if not cm:
        return None
    nascosti = {layer.dxf.name.casefold() for layer in documento.layers if layer.is_off() or layer.is_frozen()}
    per_layer, testi = {}, []
    for e in documento.modelspace():
        if e.dxf.layer.casefold() in nascosti or e.dxf.get("invisible", 0):
            continue
        if e.dxftype() in ("TEXT", "MTEXT"):
            testo = " ".join((e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text).split())
            if testo and len(testo) <= 40:
                p = e.dxf.insert
                testi.append((Point(p.x * cm, p.y * cm), testo))
            continue
        per_layer.setdefault(e.dxf.layer, []).extend(_segmenti(e, cm))
    nomi = [(p, t) for p, t in testi if NOME_STANZA.search(t)]
    superfici = [(p, float(m[1].replace(",", "."))) for p, t in testi if (m := AREA_SCRITTA.fullmatch(t.lower())) and 0.8 <= float(m[1].replace(",", ".")) <= 220]
    if not nomi:
        return None
    candidati = sorted(((sum(LineString(s).length for s in v), k, v) for k, v in per_layer.items() if len(v) >= 40), reverse=True)[:8]
    migliore = None
    for _, layer, segmenti in candidati:
        if len(segmenti) > 40_000:
            continue
        gruppi = union_all([LineString(s).buffer(distanza, quad_segs=2) for s in segmenti])
        piante, coperti = [], set()
        for g in getattr(gruppi, "geoms", [gruppi]):
            zona = box(*g.bounds)
            dentro = [(i, t) for i, (p, t) in enumerate(nomi) if zona.covers(p)]
            x0, y0, x1, y1 = g.bounds
            # Almeno 30 m² di ingombro, lati fra 4 e 150 m: più grande è una planimetria o un foglio intero.
            if not dentro or g.area < 300_000 or not 400 <= max(x1 - x0, y1 - y0) <= 15_000:
                continue
            # Le superfici scritte delle stanze non possono superare l'ingombro: a scala sbagliata sì.
            scritte = sum(m for p, m in superfici if zona.covers(p))
            if scritte > 1.3 * zona.area / 10_000:
                continue
            piante.append((g, [t for _, t in dentro]))
            coperti.update(i for i, _ in dentro)
        # Più nomi di stanza dentro piante distinte; a parità, meno pezzi (le finestre fanno briciole).
        punteggio = (len(coperti), -len(piante))
        if piante and (migliore is None or punteggio > migliore[0]):
            migliore = (punteggio, layer, piante)
    if migliore is None:
        return None
    _, layer, piante = migliore
    piante = sorted(piante, key=lambda c: -c[0].area)[:massimo]
    proposte = []
    for g, dentro in piante:
        zona = box(*g.bounds)
        quote = sorted({round(float(m[2].replace(",", ".")) * (1 if m[1] == "+" else -1) * 100)
                        for p, t in testi if zona.covers(p) and (m := QUOTA_PIANO.match(t))})
        quota = next((q for q in quote if -600 <= q <= 3000), None)
        interrato = all(SOLO_INTERRATO.search(t) for t in dentro)
        proposte.append({"g": g, "quota": quota, "interrato": interrato})
    note = sorted(p["quota"] for p in proposte if p["quota"] and p["quota"] > 0)
    interpiano = 300
    if note:
        livelli_noti = max(1, round(note[0] / 300))
        interpiano = round(note[0] / livelli_noti)
    fuori_terra = [p for p in proposte if not p["interrato"]]
    prese = {p["quota"] for p in proposte if p["quota"] is not None}
    for p in fuori_terra:  # dal più grande: terra, poi i piani liberi in salita
        if p["quota"] is None:
            livello = 0
            while livello * interpiano in prese:
                livello += 1
            p["quota"] = livello * interpiano
            prese.add(p["quota"])
    for p in proposte:
        if p["quota"] is None:
            p["quota"] = -interpiano
            while p["quota"] in prese:
                p["quota"] -= interpiano
            prese.add(p["quota"])
    risultato = []
    for p in sorted(proposte, key=lambda p: p["quota"]):
        livello = round(p["quota"] / interpiano) if interpiano else 0
        nome = NOMI_PIANI.get(livello) or ("Cantina" if p["interrato"] else "Piano interrato" if livello < 0 else f"Piano {livello}")
        x0, y0, x1, y1 = p["g"].bounds
        risultato.append({"nome": nome, "quota": p["quota"], "rettangolo": [round(v / cm, 4) for v in (x0, y0, x1, y1)]})
    return {"layerMuri": layer, "piani": risultato, "nomi": migliore[0][0]}


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
    try:
        piani = proponi_piani(document)
    except Exception:  # noqa: BLE001 — la proposta è un aiuto: se fallisce si ritaglia a mano
        piani = None
    metadata.write_text(json.dumps({
        "unita": document.units,
        "trasformazione": [translation.x, translation.y, dx.x, dy.y],
        "quote": quote_di_controllo(document),
        **({"pianiProposti": piani} if piani else {}),
    }), encoding="utf-8")


if __name__ == "__main__":
    draw(*(Path(arg) for arg in sys.argv[1:4]))

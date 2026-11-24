"""Read walls, openings, rooms and stair runs from selected CAD regions."""

from __future__ import annotations

import base64
import gzip
import json
import re
import sys
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field, replace
from math import atan2, cos, degrees, hypot, isfinite, radians, sin
from statistics import median

import ezdxf
from ezdxf import bbox, recover
from ezdxf.addons.drawing import Frontend, RenderContext, config, recorder
from ezdxf.path import Command, make_path
from shapely import LineString, Point, Polygon, STRtree, box, set_precision, union_all
from shapely.geometry.polygon import orient
from shapely.affinity import translate
from shapely.ops import polygonize, split


PARETI = re.compile(r"\b(walls?|mur[ois]?s?|murex|murint|masonry|pared(?:es)?|paredes?|alvenaria|pareti)\d*\b")
NON_PARETI = re.compile(r"\b(dim|dims|cotas?|quote|hatch|architrav\w*|proiez\w*|bajo|basso|low|parapett\w*)\b")
ASSI = re.compile(r"\b(axis|axes|grid|ejes?|assi|eixos?|trame)\b")
LAYER_SCALE = re.compile(r"\b(stairs?|staircase|scal[ae]|escaleras?|escadas?)\d*\b")
PORTE = re.compile(r"door|puert|porta|\bporte\b")
FINESTRE = re.compile(r"infiss|window|windov|wind\d|ventana|janela|finestr|fenetre")
PORTEFINESTRE = re.compile(r"portafinestr|french doors?|porte fenetre")
DESTINAZIONI = [
    (r"bedroom|master bed|dormitor|recamar|habitaci|camera|\bletto\b", "camera"),
    (r"bath|bano|lavatory|\bwc\b|sanitario|bagno", "bagno"),
    (r"kitchen|cucina|cocina|cozinha", "cucina"),
    (r"living|dining|family room|soggiorno|\bsogg\b|pranzo|breakfast|\bsala\b|estancia|comedor", "soggiorno"),
    (r"garag|cochera|carport", "garage"),
    (r"pant\b|pantry|closet|vestidor|ripostiglio|^rip$|guardaro|^(his|hers)$", "ripostiglio"),
    (r"cantin", "cantina"),
    (r"foyer|ingresso|vestibul|recepcion", "ingresso"),
    (r"hallway|pasillo|disimpegno|^dis$|^disimp$|corridoio", "disimpegno"),
    (r"studio|study|estudio|oficina|office", "studio"),
    (r"laundry|lavadero|lavander", "lavanderia"),
    (r"balcon|balcao", "balcone"),
    (r"terrac|terraz", "terrazzo"),
]
UNITA_CM = {1: 2.54, 2: 30.48, 4: 0.1, 5: 1, 6: 100}
MAX_TRATTI = 6000


class LetturaIncompleta(ValueError):
    pass


def semplice(text):
    return " ".join(re.sub(r"[^a-z\d]+", " ", unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()).split())


def base(angolo):
    a = radians(angolo)
    return (cos(a), sin(a)), (-sin(a), cos(a))


def prodotto(a, b):
    return a[0] * b[0] + a[1] * b[1]


def punto(t, d, angolo):
    asse, normale = base(angolo)
    return (t * asse[0] + d * normale[0], t * asse[1] + d * normale[1])


@dataclass
class Asse:
    angolo: float
    centro: float
    inizio: float
    fine: float
    spessore: float = 0

    def estremi(self):
        return punto(self.inizio, self.centro, self.angolo), punto(self.fine, self.centro, self.angolo)


def proietta(p, q):
    angolo = round(degrees(atan2(q[1] - p[1], q[0] - p[0])) * 2) / 2 % 180
    asse, normale = base(angolo)
    return Asse(angolo, (prodotto(p, normale) + prodotto(q, normale)) / 2, *sorted((prodotto(p, asse), prodotto(q, asse))))


def segmenti(entita, cm):
    tipo = entita.dxftype()
    if tipo == "LINE":
        vertici = (entita.dxf.start, entita.dxf.end)
    elif tipo == "LWPOLYLINE" or (tipo == "POLYLINE" and entita.is_2d_polyline):
        vertici = list(make_path(entita).flattening(max(1 / cm, 0.00001)))
    else:
        return
    for p, q in zip(vertici, vertici[1:]):
        segmento = (p.x * cm, p.y * cm), (q.x * cm, q.y * cm)
        if all(isfinite(c) for estremo in segmento for c in estremo):
            yield segmento


def accoppia_facce(tratti):
    facce = [proietta(p, q) for p, q in tratti]
    linee = [LineString([p, q]) for p, q in tratti]
    vicine = STRtree(linee)
    coppie = []
    for i, faccia in enumerate(facce):
        for j in vicine.query(linee[i], predicate="dwithin", distance=72):
            if j <= i:
                continue
            altra = facce[j]
            if altra.angolo != faccia.angolo:
                continue
            spessore = abs(faccia.centro - altra.centro)
            inizio, fine = max(faccia.inizio, altra.inizio), min(faccia.fine, altra.fine)
            if 7.99 <= spessore <= 72.01 and fine - inizio >= max(25, min(faccia.fine - faccia.inizio, altra.fine - altra.inizio) * 0.30):
                coppie.append((spessore, inizio, fine, (faccia.centro + altra.centro) / 2, faccia.angolo, i, j))
                if len(coppie) > 40000:
                    raise LetturaIncompleta("Troppe linee sovrapposte. Indica il layer dei muri o seleziona un ritaglio più piccolo.")

    # A face can have different partners across its length, but only one at each point.
    occupati = {}
    muri = []
    for spessore, inizio, fine, centro, angolo, i, j in sorted(coppie, key=lambda f: (f[0], f[1] - f[2])):
        liberi = [(inizio, fine)]
        for indice in (i, j):
            for a, b in occupati.get(indice, []):
                restanti = []
                for x, y in liberi:
                    restanti.extend([(x, y)] if b <= x or a >= y else [(x, a), (b, y)])
                liberi = [(x, y) for x, y in restanti if y - x >= 23]
        for a, b in liberi:
            muri.append(Asse(angolo, centro, a, b, spessore))
            for indice in (i, j):
                occupati.setdefault(indice, []).append((a, b))
    return unisci_assi(muri)


def unisci_assi(muri):
    gruppi = []
    for m in sorted(muri, key=lambda a: (a.angolo, a.centro, a.inizio)):
        gruppo = next((g for g in gruppi if g[0].angolo == m.angolo and abs(g[0].centro - m.centro) <= 4 and abs(g[0].spessore - m.spessore) <= 9), None)
        if gruppo is None:
            gruppi.append([m])
        else:
            gruppo.append(m)
    output = []
    for gruppo in gruppi:
        riferimento = max(gruppo, key=lambda m: m.fine - m.inizio)
        intervalli = []
        for m in sorted(gruppo, key=lambda a: a.inizio):
            if intervalli and m.inizio <= intervalli[-1][1] + 9:
                intervalli[-1][1] = max(m.fine, intervalli[-1][1])
            else:
                intervalli.append([m.inizio, m.fine])
        output.extend(Asse(riferimento.angolo, riferimento.centro, a, b, riferimento.spessore) for a, b in intervalli if b - a >= 30)
    return output


def raggi_ante_cad(inserto, cm):
    # A door swing contributes two radial options. The adjacent walls resolve the closed one.
    for arco in inserto.virtual_entities():
        if (arco.dxftype() != "ARC" or not 55 <= arco.dxf.radius * cm <= 185
                or not 70 <= (arco.dxf.end_angle - arco.dxf.start_angle) % 360 <= 110):
            continue
        c = arco.ocs().to_wcs(arco.dxf.center)
        p = (c.x * cm, c.y * cm)
        yield tuple((p, (q.x * cm, q.y * cm)) for q in (arco.start_point, arco.end_point))


def candidati_porte(inserto, cm):
    ante = list(raggi_ante_cad(inserto, cm))
    if len(ante) == 1:
        yield from ante[0]


def coppie_ante(ante):
    """Maniglie coincidenti, cardini opposti e due battenti aperti verso lo stesso lato."""
    raggi = [(i, j, *r) for i, a in enumerate(ante) for j, r in enumerate(a)]
    estremi = [Point(q) for _, _, _, q in raggi]
    indice = STRtree(estremi)
    for k, (i, j, p, q) in enumerate(raggi):
        for altro in indice.query(estremi[k], predicate="dwithin", distance=2):
            l, s, p2, q2 = raggi[altro]
            if l <= i:
                continue
            d, d2 = proietta(p, q), proietta(p2, q2)
            if d.angolo != d2.angolo or abs(d.centro - d2.centro) > 2:
                continue
            chiuso = (q[0] - p[0], q[1] - p[1])
            if prodotto(chiuso, (q2[0] - p2[0], q2[1] - p2[1])) >= 0:
                continue
            _, normale = base(d.angolo)
            lato1 = prodotto(ante[i][1 - j][1], normale) - prodotto(p, normale)
            lato2 = prodotto(ante[l][1 - s][1], normale) - prodotto(p2, normale)
            if lato1 * lato2 > 0:
                yield [(p, p2)]


def candidato_finestra(inserto, cm):
    """Measure the frame in its own axes, including rotated blocks."""
    scatola = bbox.extents([inserto], fast=True)
    if not scatola.has_data:
        return []
    campioni = [
        p for e in inserto.virtual_entities()
        for s in segmenti(e, cm) for p in s
    ]
    if len(campioni) < 2:
        campioni = [
            (x * cm, y * cm) for x in (scatola.extmin.x, scatola.extmax.x)
            for y in (scatola.extmin.y, scatola.extmax.y)
        ]
    angolo = inserto.dxf.get("rotation", 0)
    for orientamento in (angolo, angolo + 90):
        asse, normale = base(orientamento)
        x = [prodotto(p, asse) for p in campioni]
        y = [prodotto(p, normale) for p in campioni]
        estensione, profondita = max(x) - min(x), max(y) - min(y)
        if 35 <= estensione <= 450 and estensione > 2 * profondita:
            centro = (max(y) + min(y)) / 2
            return [(punto(min(x), centro, orientamento), punto(max(x), centro, orientamento))]
    return []


def raggi_porta_esplosa(arco, linee_porte, cm):
    if not 55 <= arco.dxf.radius * cm <= 185 or not 70 <= (arco.dxf.end_angle - arco.dxf.start_angle) % 360 <= 110:
        return []
    c = arco.ocs().to_wcs(arco.dxf.center)
    p = (c.x * cm, c.y * cm)
    estremi = [(q.x * cm, q.y * cm) for q in (arco.start_point, arco.end_point)]
    # A swing on an explicit door layer still needs the drawn leaf.
    if not any(
        Point(p).distance(Point(c1)) <= 4 and Point(q).distance(Point(c2)) <= 4
        for q in estremi for a, b in linee_porte for c1, c2 in ((a, b), (b, a))
    ):
        return []
    return [(p, q) for q in estremi]


def tracce_finestre(entita, zona, cm):
    # Alcune tavole CAD esplodono il telaio in due linee parallele sul layer delle finestre.
    tracce = defaultdict(list)
    for e in entita:
        if not FINESTRE.search(semplice(e.dxf.layer)):
            continue
        for p, q in segmenti(e, cm):
            if not 35 <= hypot(q[0] - p[0], q[1] - p[1]) <= 450 or not zona.covers(LineString((p, q))):
                continue
            r = proietta(p, q)
            tracce[r.angolo].append(r)
    for angolo, span in tracce.items():
        span.sort(key=lambda r: r.inizio)
        for i, prima in enumerate(span):
            for j in range(i + 1, len(span)):
                dopo = span[j]
                if dopo.inizio - prima.inizio > 3:
                    break
                if not 1 <= abs(dopo.centro - prima.centro) <= 16 or abs(dopo.fine - prima.fine) > 3:
                    continue
                linea = Asse(angolo, (prima.centro + dopo.centro) / 2,
                             (prima.inizio + dopo.inizio) / 2, (prima.fine + dopo.fine) / 2)
                yield "finestra", [linea.estremi()]
                break


def candidati_aperture(entita, zona, cm):
    linee_porte = [
        (p, q) for e in entita if PORTE.search(semplice(e.dxf.layer))
        for p, q in segmenti(e, cm) if zona.covers(LineString((p, q)))
    ]
    ante, altre_aperture = [], []
    for e in entita:
        layer = semplice(e.dxf.layer)
        if e.dxftype() == "INSERT":
            posizione = e.dxf.insert
            nome = semplice(e.dxf.name)
            if PORTEFINESTRE.search(nome):
                tipo, raggi = "portafinestra", candidato_finestra(e, cm) or list(candidati_porte(e, cm))
            elif FINESTRE.search(nome) or (FINESTRE.search(layer) and not PORTE.search(layer) and not PORTE.search(nome)):
                tipo, raggi = "finestra", candidato_finestra(e, cm)
            elif PORTE.search(nome) or (PORTE.search(layer) and not FINESTRE.search(layer)):
                if zona.covers(Point(posizione.x * cm, posizione.y * cm)):
                    raggi_del_blocco = list(raggi_ante_cad(e, cm))
                    ante.extend(raggi_del_blocco)
                    if len(raggi_del_blocco) == 1:
                        altre_aperture.append(("porta", raggi_del_blocco[0]))
                continue
            else:
                continue
        elif e.dxftype() == "ARC" and PORTE.search(layer):
            posizione = e.ocs().to_wcs(e.dxf.center)
            tipo, raggi = "porta", raggi_porta_esplosa(e, linee_porte, cm)
        else:
            continue
        if not zona.covers(Point(posizione.x * cm, posizione.y * cm)):
            continue
        altre_aperture.append((tipo, raggi))
    for doppia in coppie_ante(ante):
        yield "porta_doppia", doppia
    yield from altre_aperture
    yield from tracce_finestre(entita, zona, cm)


def stipiti_vicini(p, direzione, normale, indice):
    estremo = Point(p)
    for i in indice.query(estremo, predicate="dwithin", distance=6):
        a, b = indice.geometries[i].coords
        spessore = hypot(a[0] - b[0], a[1] - b[1])
        if not 8 <= spessore <= 72 or abs(prodotto(a, direzione) - prodotto(b, direzione)) > 1:
            continue
        centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if estremo.distance(Point(centro)) <= 6:
            yield prodotto(centro, direzione), prodotto(centro, normale), spessore


def porta_tra_stipiti(raggi, indice):
    """Recover an evidenced opening when the short jambs have no paired wall axis."""
    candidati = {}
    for p, q in raggi:
        angolo = proietta(p, q).angolo
        direzione, normale = base(angolo)
        for x, y, spessore in stipiti_vicini(p, direzione, normale, indice):
            for altro_x, altro_y, altro_spessore in stipiti_vicini(q, direzione, normale, indice):
                if abs(y - altro_y) > 2 or abs(spessore - altro_spessore) > 3:
                    continue
                a, b = sorted((x, altro_x))
                if not 55 <= b - a <= 190:
                    continue
                centro = (y + altro_y) / 2
                misura = (spessore + altro_spessore) / 2
                chiave = tuple(round(v, 2) for v in (angolo, centro, a, b, misura))
                candidati[chiave] = Asse(angolo, centro, a, b, misura)
    # Both swing directions can match in a crowded drawing. Keep that case open.
    if len(candidati) == 1:
        return next(iter(candidati.values()))


def abbina_aperture(entita, muri, zona, cm, tratti=()):
    risultati = []
    stipiti = STRtree([LineString(s) for s in tratti]) if tratti else None
    for tipo, raggi in candidati_aperture(entita, zona, cm):
        opzioni = []
        for p, q in raggi:
            direzione = proietta(p, q)
            for indice, muro in enumerate(muri):
                asse_vano = direzione
                if muro.angolo != direzione.angolo:
                    scarto = abs(muro.angolo - direzione.angolo)
                    if tipo != "porta" or min(scarto, 180 - scarto) > 6:
                        continue
                    asse, normale = base(muro.angolo)
                    asse_vano = Asse(muro.angolo, (prodotto(p, normale) + prodotto(q, normale)) / 2,
                                     *sorted((prodotto(p, asse), prodotto(q, asse))))
                if abs(muro.centro - asse_vano.centro) > muro.spessore / 2 + 12:
                    continue
                a, b = asse_vano.inizio, asse_vano.fine
                # The swing measures the leaf. Allow a small tolerance for the frame.
                sovrapposto = max(0, min(b, muro.fine) - max(a, muro.inizio))
                scarto_mezzeria = abs(muro.centro - asse_vano.centro)
                if sovrapposto >= (b - a) * 0.86 and a >= muro.inizio - 5 and b <= muro.fine + 5:
                    opzioni.append((22 + scarto_mezzeria, indice, max(a, muro.inizio), min(b, muro.fine), None, muro.angolo))
                    continue
                if tipo in ("porta", "portafinestra"):
                    distanza_stipite = min(abs(a - muro.fine), abs(b - muro.inizio))
                    if distanza_stipite <= 13 and sovrapposto <= 12 and scarto_mezzeria <= 8:
                        opzioni.append((22 + distanza_stipite * 0.8 + scarto_mezzeria, indice, a, b, indice, muro.angolo))
                if not -7 <= a - muro.fine <= 26:
                    continue
                for dopo, vicino in enumerate(muri):
                    if vicino.angolo != muro.angolo or abs(vicino.centro - muro.centro) > 6 or not -7 <= vicino.inizio - b <= 26:
                        continue
                    if tipo == "porta_doppia" and (abs(a - muro.fine) > 12 or abs(vicino.inizio - b) > 12):
                        continue
                    costo = (abs(a - muro.fine) + abs(vicino.inizio - b)) * 0.45 + scarto_mezzeria * 1.5
                    opzioni.append((costo, indice, a, b, dopo, muro.angolo))
        opzioni.sort(key=lambda o: o[0])
        # Two documented jambs also disambiguate a swing with only one adjacent wall.
        if tipo == "porta" and stipiti is not None and (not opzioni or opzioni[0][1] == opzioni[0][4]):
            porta = porta_tra_stipiti(raggi, stipiti)
            if porta is not None:
                risultati.append((porta, porta.inizio, porta.fine, tipo, True))
                continue
        if not opzioni:
            continue
        costo, indice, a, b, dopo, angolo = opzioni[0]
        if costo > 35 or any(o[5] != angolo and o[0] - costo < 7 for o in opzioni[1:]):
            continue
        if dopo == indice:
            riferimento = muri[indice]
            da = min(a - 1, riferimento.fine) if abs(a - riferimento.fine) <= 13 else a - 1
            fino = max(b + 1, riferimento.inizio) if abs(b - riferimento.inizio) <= 13 else b + 1
            risultati.append((Asse(angolo, riferimento.centro, da, fino, riferimento.spessore), a, b, tipo, True))
        elif dopo is not None:
            prima, seconda = muri[indice], muri[dopo]
            if tipo == "porta_doppia" and seconda.inizio > prima.fine:
                a, b = prima.fine, seconda.inizio
            basso, alto = min(prima.fine, a - 1), max(seconda.inizio, b + 1)
            risultati.append((Asse(angolo, prima.centro, basso, alto, prima.spessore), a, b, tipo, True))
        else:
            risultati.append((muri[indice], a, b, tipo, False))
    return risultati


def collega_incroci(muri, aperture):
    """Bring wall-face pairs to their common axis at nearby L or T junctions."""
    linee = [LineString(m.estremi()) for m in muri]
    vicine = STRtree(linee)
    limiti = {}
    for m, a, b, _ in aperture:
        valori = limiti.get(id(m), (a, b))
        limiti[id(m)] = min(valori[0], a), max(valori[1], b)
    correzioni = []
    for i, muro in enumerate(muri):
        asse, normale = base(muro.angolo)
        inizio, fine = muro.inizio, muro.fine
        intorno = vicine.query(linee[i], predicate="dwithin", distance=62)
        for lato, estremita in enumerate((inizio, fine)):
            costo_minimo, scelto = float("inf"), estremita
            for j in intorno:
                if i == j:
                    continue
                altro = muri[j]
                u, v = base(altro.angolo)
                fattore = prodotto(asse, v)
                if abs(fattore) < 0.25:
                    continue
                t = (altro.centro - muro.centro * prodotto(normale, v)) / fattore
                s = prodotto(punto(t, muro.centro, muro.angolo), u)
                da_altro = max(altro.inizio - s, s - altro.fine, 0)
                da_estremo = abs(t - estremita)
                if da_estremo > altro.spessore / 2 + 14 or da_altro > muro.spessore / 2 + 14 or da_estremo > (fine - inizio) * 0.45:
                    continue
                vincolo = limiti.get(id(muro))
                if vincolo and ((lato == 0 and t > vincolo[0] - 0.5) or (lato == 1 and t < vincolo[1] + 0.5)):
                    continue
                costo = da_estremo + da_altro * 1.4
                if costo < costo_minimo:
                    costo_minimo, scelto = costo, t
            if lato == 0:
                inizio = scelto
            else:
                fine = scelto
        correzioni.append((inizio, fine) if fine - inizio >= 24 else (muro.inizio, muro.fine))
    for muro, (inizio, fine) in zip(muri, correzioni):
        muro.inizio, muro.fine = inizio, fine


def accorpa_assi_sovrapposti(muri, aperture):
    """Riusa la muratura che coincide con il tratto creato per ospitare un vano."""
    per_angolo = defaultdict(list)
    accorpati = {}
    for muro in sorted(muri, key=lambda m: m.inizio):
        vicini = per_angolo[muro.angolo]
        stesso = next((m for m in vicini if m.fine > muro.inizio + 0.01
                       and abs(m.centro - muro.centro) <= 0.05
                       and abs(m.spessore - muro.spessore) <= 0.05), None)
        if stesso is None:
            vicini.append(muro)
            continue
        stesso.fine = max(stesso.fine, muro.fine)
        accorpati[id(muro)] = stesso
    muri[:] = [m for m in muri if id(m) not in accorpati]
    aperture[:] = [(accorpati.get(id(m), m), a, b, tipo) for m, a, b, tipo in aperture]


def inserisci_varco(asse, centri, muri, aperture, tipo="varco"):
    basso, alto = centri
    centro, spessore = (basso + alto) / 2, alto - basso
    adiacenti = [m for m in muri if m.angolo == asse.angolo and abs(m.centro - centro) <= 1
                 and abs(m.spessore - spessore) <= 3
                 and asse.inizio - 2 <= m.fine and m.inizio <= asse.fine + 2]
    inizio = min([asse.inizio - 1.2, *(m.inizio for m in adiacenti)])
    fine = max([asse.fine + 1.2, *(m.fine for m in adiacenti)])
    muro = Asse(asse.angolo, centro, inizio, fine, spessore)
    toccati = {id(m) for m in adiacenti}
    muri[:] = [m for m in muri if id(m) not in toccati]
    muri.append(muro)
    aperture[:] = [(muro if id(m) in toccati else m, a, b, tipo) for m, a, b, tipo in aperture]
    aperture.append((muro, asse.inizio, asse.fine, tipo))


def leggi_testi(entita, zona, cm):
    nomi, aree = [], []
    for e in entita:
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        p = e.dxf.insert
        posizione = Point(p.x * cm, p.y * cm)
        if not zona.covers(posizione):
            continue
        testo = " ".join(e.plain_text().split())[:80]
        if RIGA_LEGENDA.match(testo):
            continue  # «INT. 07 - SUL … + terrazzo» è la legenda dell'alloggio, non il nome di una stanza
        chiave = semplice(testo)
        posizione_locale = next((valore for pattern, valore in DESTINAZIONI if re.search(pattern, chiave)), None)
        if posizione_locale and not re.search(r"\b(planta|nivel|facade|sezione|elevacion|level)\b", chiave):
            if not any(n == testo and p.distance(posizione) <= 2 for p, n, _ in nomi):
                nomi.append((posizione, testo, posizione_locale))
        quantita = re.fullmatch(r"(\d{1,3}(?:[.,]\d{1,3})?)(?:\s*(m2|m²|mq)\.?)?", testo.lower())
        if quantita and (quantita[2] or semplice(e.dxf.layer) in ("ar", "area", "aree", "superfici", "areas")):
            m2 = float(quantita[1].replace(",", "."))
            if 0.8 <= m2 <= 220:
                aree.append((posizione, m2))
    return nomi, aree


SIGLA_INFISSO = re.compile(r"^\s*L\s*(\d{2,3})\b")


def leggi_sigle_infissi(entita, zona, cm):
    """Le sigle degli infissi scritte accanto ai vani: «L 170 / Hf 140 / Hs 94» (larghezza, altezza
    della finestra, davanzale) o «L 99 / Hp 210» (altezza della porta o portafinestra), in cm."""
    sigle = []
    for e in entita:
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        p = e.dxf.insert
        posizione = Point(p.x * cm, p.y * cm)
        if not zona.covers(posizione):
            continue
        testo = e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text
        larghezza = SIGLA_INFISSO.match(testo)
        if not larghezza:
            continue
        valore = lambda nome: (m := re.search(rf"\b{nome}\s*(\d{{2,3}})", testo)) and int(m.group(1))
        sigle.append({"punto": posizione, "larghezza": int(larghezza.group(1)), "hf": valore("Hf"), "hp": valore("Hp"), "hs": valore("Hs")})
    return sigle


SIGLA_UNITA = re.compile(r"^\s*int\.?\s*0*(\d{1,2})\s*$", re.IGNORECASE)
COMUNI = re.compile(r"atrio|scal[ae]\b|condomin|androne|parti comuni|pianerottol", re.IGNORECASE)


def leggi_sigle_unita(entita, zona, cm):
    """Le sigle delle unità («int. 04») scritte sulla tavola, di solito accanto all'ingresso."""
    sigle = []
    for e in entita:
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        p = e.dxf.insert
        posizione = Point(p.x * cm, p.y * cm)
        testo = " ".join((e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text).split())
        m = SIGLA_UNITA.match(testo)
        if m and zona.covers(posizione):
            sigle.append((posizione, f"Int. {int(m.group(1)):02d}"))
    return sigle


RIGA_LEGENDA = re.compile(
    r"^\s*int\.?\s*0*(\d{1,2})\s*[-–]\s*S\.?U\.?L\.?\s*(?:mq\.?|m²)?\s*([\d.,]+)\s*[-–]\s*([a-zà]+)\s*"
    r"\(\s*S\.?\s*U\.?\s*(?:mq\.?|m²)?\s*([\d.,]+)\s*\)\s*(.*)$", re.IGNORECASE)


def numero_legenda(testo):
    """«55.20», «55,20», «1.055,20»: la virgola, se c'è, è il separatore dei decimali."""
    testo = testo.strip(".,")
    if "," in testo:
        testo = testo.replace(".", "").replace(",", ".")
    return float(testo)


def leggi_legenda_unita(entita):
    """Le righe della legenda degli alloggi, ovunque nella tavola:
    «INT. 04 - SUL MQ. 55.20 - BILOCALE (S.U.44.00) +balcone+ terrazzo coperto».
    Sono i dati dichiarati dal progettista: la pianta li deve ritrovare, non sostituire."""
    unita = {}
    for e in entita:
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        testo = " ".join((e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text).split())
        m = RIGA_LEGENDA.match(testo)
        if not m:
            continue
        try:
            sul, su = numero_legenda(m.group(2)), numero_legenda(m.group(4))
        except ValueError:
            continue
        pertinenze = [p.strip(" .,;").lower() for p in re.split(r"\+|,", m.group(5)) if p.strip(" .,;")]
        nome = f"Int. {int(m.group(1)):02d}"
        unita[nome] = {"nome": nome, "sulMq": sul, "suMq": su, "tipo": m.group(3).capitalize(), "pertinenze": pertinenze}
    return [unita[k] for k in sorted(unita)]


ALTEZZA_LOCALE = re.compile(r"^\s*h\s*[=.:]?\s*(\d{3})\s*\*?\s*$|^\s*h\s*[=.:]?\s*([23][.,]\d{2})\s*m?\s*$", re.IGNORECASE)


def leggi_altezze_locali(entita, zona, cm):
    """Le altezze nette scritte nelle stanze: «H 313», «h = 2,70». Sotto i 2,20 m è una porta o un
    sottoscala, non un'altezza di stanza; le sigle complete degli infissi («L 99 H 241») non c'entrano."""
    altezze = []
    for e in entita:
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        p = e.dxf.insert
        posizione = Point(p.x * cm, p.y * cm)
        if not zona.covers(posizione):
            continue
        m = ALTEZZA_LOCALE.match(" ".join((e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text).split()))
        if not m:
            continue
        h = int(m.group(1)) if m.group(1) else round(float(m.group(2).replace(",", ".")) * 100)
        if 220 <= h <= 600:
            altezze.append((posizione, h))
    return altezze


def altezza_del_piano(quota, quote, richiesta, solaio=30):
    """L'altezza netta di un piano dalla quota del piano sopra (interpiano meno il solaio), se è
    plausibile; altrimenti quella indicata nella richiesta. L'ultimo piano prende quella del
    piano sotto, se c'è."""
    sopra = [q for q in quote if q > quota]
    sotto = [q for q in quote if q < quota]
    if sopra:
        netta = min(sopra) - quota - solaio
    elif sotto:
        netta = quota - max(sotto) - solaio
    else:
        return richiesta
    return round(netta) if 240 <= netta <= 450 else richiesta


def unita_dei_locali(locali, muri, aperture, sigle, sottile=16, distanza=600):
    """Raggruppa le stanze in unità e dà a ogni gruppo la sigla più vicina.

    Due stanze stanno nella stessa unità se le separa un tramezzo sottile (fino a 16 cm), niente,
    o una porta; i muri spessi fra unità e i vani comuni (atrio, scala) separano. Una sigla per
    gruppo, la più vicina, entro 6 m. Un gruppo senza sigla resta da assegnare: attaccarlo al
    vicino sbagliava (Callimaco, 24/11/2026: la camera dell'int. 04 finiva nell'int. 06).
    """
    if not sigle:
        return {}
    nomi = [" ".join(n for _, n, _ in l.etichette) for l in locali]
    privati = [i for i, n in enumerate(nomi) if not COMUNI.search(n)]
    padre = {i: i for i in privati}

    def radice(i):
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    vani = [LineString((punto(a, m.centro, m.angolo), punto(b, m.centro, m.angolo))) for m, a, b, tipo in aperture if tipo != "finestra"]
    assi = [(LineString(m.estremi()), m.spessore) for m in muri]
    for x, i in enumerate(privati):
        for j in privati[x + 1:]:
            a, b = locali[i].contorno, locali[j].contorno
            g = a.distance(b)
            if g > 40:
                continue
            fascia = a.buffer(g / 2 + 3).intersection(b.buffer(g / 2 + 3))
            if fascia.is_empty or fascia.area / (g + 6) < 40:
                continue
            spessori = [sp for linea, sp in assi if linea.intersects(fascia)]
            porta = any(v.intersects(fascia) for v in vani)
            if porta or not spessori or min(spessori) <= sottile:
                padre[radice(i)] = radice(j)
    gruppi = defaultdict(list)
    for i in privati:
        gruppi[radice(i)].append(i)
    poligoni = {r: union_all([locali[i].contorno for i in idx]) for r, idx in gruppi.items()}
    coppie = sorted((poligoni[r].distance(p), r, k) for r in poligoni for k, (p, _) in enumerate(sigle))
    presi_g, presi_s, esito = set(), set(), {}
    for d, r, k in coppie:
        if d > distanza or r in presi_g or k in presi_s:
            continue
        presi_g.add(r)
        presi_s.add(k)
        for i in gruppi[r]:
            esito[i] = sigle[k][1]
    return esito


ESTERNO_UNITA = re.compile(r"balcon|terrazz|loggia|portico|giardin|cortile", re.IGNORECASE)


def completa_unita_con_legenda(locali, unita, legenda, vicino=40, tolleranza=0.12):
    """Le stanze rimaste senza unità vanno all'unità confinante solo se la legenda lo consente:
    la superficie utile misurata non deve superare quella dichiarata («S.U. 44,00») oltre il 12%.

    Senza questo vincolo la stanza finiva al vicino sbagliato (la camera dell'int. 04 nell'int. 06);
    col vincolo l'int. 06, già pieno, la rifiuta. Fra più unità possibili vince quella a cui manca
    la superficie più vicina all'area della stanza; si ripete finché qualcosa cambia.
    """
    dichiarata = {u["nome"]: u["suMq"] for u in legenda}
    if not dichiarata:
        return unita
    esito = dict(unita)
    nomi = [" ".join(n for _, n, _ in l.etichette) for l in locali]
    privati = [i for i, n in enumerate(nomi) if not COMUNI.search(n) and not ESTERNO_UNITA.search(n)]
    aree = {i: locali[i].contorno.area / 10_000 for i in privati}
    misurata = defaultdict(float)
    for i, u in esito.items():
        if i in aree:
            misurata[u] += aree[i]
    while True:
        scelte = []
        for i in privati:
            if i in esito:
                continue
            for j, u in esito.items():
                if u not in dichiarata or locali[i].contorno.distance(locali[j].contorno) > vicino:
                    continue
                manca = dichiarata[u] - misurata[u]
                if aree[i] <= manca + dichiarata[u] * tolleranza:
                    scelte.append((abs(manca - aree[i]), i, u))
        if not scelte:
            return esito
        _, i, u = min(scelte)
        esito[i] = u
        misurata[u] += aree[i]


LAYER_VERDE = re.compile(r"verde|prato|giardin|green|grass|aiuol", re.IGNORECASE)
LAYER_ALBERI = re.compile(r"alber|tree", re.IGNORECASE)
LAYER_CONFINE = re.compile(r"lotto|confine|recinz|perimetr|property|boundary", re.IGNORECASE)
PISCINA = re.compile(r"\bpiscin", re.IGNORECASE)


def _contorno_chiuso(e, cm):
    """I contorni chiusi di una polilinea o di un tratteggio, in cm."""
    try:
        if e.dxftype() == "LWPOLYLINE" and e.closed:
            percorsi = [make_path(e)]
        elif e.dxftype() == "HATCH":
            from ezdxf import path as percorso  # noqa: PLC0415
            percorsi = list(percorso.from_hatch(e))
        else:
            return []
    except (ezdxf.DXFError, ValueError, TypeError, IndexError):
        return []
    poligoni = []
    for p in percorsi:
        punti = [(v.x * cm, v.y * cm) for v in p.flattening(max(5 / cm, 1e-5))]
        if len(punti) >= 3:
            poligono = Polygon(punti).buffer(0)
            if poligono.geom_type == "Polygon" and poligono.area > 0:
                poligoni.append(poligono)
    return poligoni


def allinea_blocco_edificio(entita, muri_terra, layer, cm):
    """Nella planimetria generale l'edificio è spesso un blocco con le stesse pareti del piano
    terra (Callimaco: A$C3119025d sul layer MRT). Si cerca il blocco le cui pareti, spostate,
    cadono sulle pareti del piano terra: lo spostamento porta il lotto nelle coordinate della pianta."""
    if not muri_terra or not layer:
        return None
    assi = [LineString(m.estremi()) for m in muri_terra]
    rete = union_all(assi).buffer(max(m.spessore for m in muri_terra) / 2 + 10)
    gx0, gy0, gx1, gy1 = union_all(assi).bounds
    migliore = None
    for e in entita:
        if e.dxftype() != "INSERT":
            continue
        try:
            pezzi = [v for v in e.virtual_entities() if v.dxf.layer.casefold() == layer.casefold()]
        except (ezdxf.DXFError, ValueError, TypeError, AttributeError, IndexError):
            continue
        tratti = [s for v in pezzi for s in segmenti(v, cm) or ()]
        if len(tratti) < 30:
            continue
        bx0, by0, bx1, by1 = union_all([LineString(t) for t in tratti]).bounds
        if abs((bx1 - bx0) - (gx1 - gx0)) > 0.05 * (gx1 - gx0) + 60 or abs((by1 - by0) - (gy1 - gy0)) > 0.05 * (gy1 - gy0) + 60:
            continue
        dx, dy = gx0 - bx0, gy0 - by0
        sopra = sum(rete.covers(Point((p[0] + q[0]) / 2 + dx, (p[1] + q[1]) / 2 + dy)) for p, q in tratti) / len(tratti)
        if sopra >= 0.7 and (migliore is None or sopra > migliore[2]):
            migliore = (dx, dy, sopra, (bx0, by0, bx1, by1))
    return migliore


def leggi_sistemazioni(entita, muri_terra, layer, cm, raggio=8000):
    """Il lotto della planimetria generale nelle coordinate del piano terra: verde, piscine,
    alberi e confine. Restituisce None se l'edificio non si ritrova nella planimetria."""
    allineamento = allinea_blocco_edificio(entita, muri_terra, layer, cm)
    if not allineamento:
        return None
    dx, dy, quota, (bx0, by0, bx1, by1) = allineamento
    zona = box(bx0 - raggio, by0 - raggio, bx1 + raggio, by1 + raggio)
    edificio = box(bx0, by0, bx1, by1)
    sposta = lambda g: translate(g, dx, dy)  # noqa: E731
    verdi, piscine, alberi, confini, testi = [], [], [], [], []
    chiusi = []
    for e in entita:
        tipo = e.dxftype()
        nome_layer = e.dxf.layer
        if tipo in ("TEXT", "MTEXT"):
            p = e.dxf.insert
            punto_testo = Point(p.x * cm, p.y * cm)
            if zona.covers(punto_testo):
                testi.append((punto_testo, " ".join((e.plain_text() if tipo == "MTEXT" else e.dxf.text).split())))
            continue
        if tipo == "INSERT" and (LAYER_ALBERI.search(nome_layer) or LAYER_ALBERI.search(e.dxf.name)):
            p = e.ocs().to_wcs(e.dxf.insert)  # blocchi specchiati: il punto è nel loro sistema
            punto_albero = Point(p.x * cm, p.y * cm)
            if zona.covers(punto_albero) and not edificio.covers(punto_albero):
                alberi.append((punto_albero, 300))
            continue
        if tipo == "CIRCLE" and LAYER_ALBERI.search(nome_layer):
            c = e.ocs().to_wcs(e.dxf.center)
            punto_albero, r = Point(c.x * cm, c.y * cm), e.dxf.radius * cm
            # Un cerchio piccolo è il tronco (Callimaco: 25 cm): la chioma la si dà di 3 m.
            if 10 <= r <= 600 and zona.covers(punto_albero) and not edificio.covers(punto_albero):
                alberi.append((punto_albero, round(r * 2) if r >= 80 else 300))
            continue
        for poligono in _contorno_chiuso(e, cm):
            if not zona.covers(poligono.representative_point()):
                continue
            if LAYER_VERDE.search(nome_layer) and poligono.area >= 20_000:
                verdi.append(poligono)
            elif LAYER_CONFINE.search(nome_layer) and poligono.covers(edificio.centroid):
                confini.append(poligono)
            else:
                chiusi.append(poligono)
    def stessa(a, b):
        return a.symmetric_difference(b).area <= 0.05 * max(a.area, b.area)
    for p, testo in testi:
        if not PISCINA.search(testo):
            continue
        vasche = sorted((c for c in chiusi if 80_000 <= c.area <= 1_500_000 and c.distance(p) <= 300), key=lambda c: c.distance(p))
        if vasche and not any(stessa(v, vasche[0]) for v in piscine):
            piscine.append(vasche[0])
    # Una vasca uguale a una già riconosciuta (stessa misura, rettangolare) è un'altra piscina,
    # anche senza scritta: a Callimaco la scritta c'è su una sola delle due.
    for vasca in list(piscine):
        for c in chiusi:
            rettangolare = c.area >= 0.95 * c.minimum_rotated_rectangle.area
            if rettangolare and abs(c.area - vasca.area) <= 0.05 * vasca.area and not any(stessa(c, v) or c.intersects(v) for v in piscine):
                piscine.append(c)
    # Gli stessi alberi disegnati due volte (cerchio e blocco) restano uno.
    unici = []
    for p, d in alberi:
        if all(p.distance(q) > 60 for q, _ in unici):
            unici.append((p, d))
    # Lo stesso verde come polilinea e come tratteggio resta uno; una vasca non è un prato.
    verdi = [v for i, v in enumerate(verdi) if not any(stessa(v, w) for w in verdi[:i]) and not any(stessa(v, vasca) for vasca in piscine)]
    if confini:
        lotto = max(confini, key=lambda c: c.area)
        stimato = False
    elif verdi or piscine:
        # Nessun confine disegnato: il rettangolo che tiene edificio, verde e vasche. Gli alberi no:
        # quelli del viale stanno fuori (Callimaco: con gli alberi il lotto veniva 8.150 m², non 2.600).
        lotto = union_all([edificio, *verdi, *piscine]).envelope
        stimato = True
    else:
        return None
    unici = [(p, d) for p, d in unici if lotto.buffer(200).covers(p)]
    return {
        "lotto": sposta(lotto), "lottoStimato": stimato, "verdi": [sposta(v) for v in verdi],
        "piscine": [sposta(v) for v in piscine], "alberi": [(sposta(p), d) for p, d in unici], "allineamento": round(quota, 3),
    }


def misure_da_sigle(vani, sigle, distanza=250):
    """A ogni vano la sigla più vicina con una larghezza compatibile, una sigla per vano."""
    coppie = []
    for i, (centro, larghezza) in enumerate(vani):
        for j, s in enumerate(sigle):
            d = centro.distance(s["punto"])
            if d <= distanza and abs(s["larghezza"] - larghezza) <= max(20, 0.2 * larghezza):
                coppie.append((d, i, j))
    presi_v, presi_s, esito = set(), set(), {}
    for d, i, j in sorted(coppie):
        if i in presi_v or j in presi_s:
            continue
        presi_v.add(i)
        presi_s.add(j)
        esito[i] = sigle[j]
    return esito


def varchi_tra_stipiti(linee, tratti, minimo=130):
    """A long stroke counts as a candidate only when it terminates at two matching jambs."""
    facce = [proietta(p, q) for p, q in tratti]
    geometrie = [LineString((p, q)) for p, q in tratti]
    vicine = STRtree(geometrie)
    for p, q, _ in linee:
        n = hypot(q[0] - p[0], q[1] - p[1])
        if not minimo <= n <= 620:
            continue
        asse = proietta(p, q)
        _, normale = base(asse.angolo)
        stipiti = []
        for estremo in (p, q):
            limiti = []
            for i in vicine.query(Point(estremo), predicate="dwithin", distance=1):
                faccia = facce[i]
                if abs(faccia.angolo - asse.angolo) != 90 or not 16 <= faccia.fine - faccia.inizio <= 72:
                    continue
                limiti.append(sorted(prodotto(pt, normale) for pt in tratti[i]))
            stipiti.append(limiti)
        for primo in stipiti[0]:
            if any(max(abs(a - b) for a, b in zip(primo, secondo)) <= 3 for secondo in stipiti[1]):
                yield asse, primo
                break


def vani_senza_segno(tratti, gia_trovati=(), infissi=(), minimo=55, massimo=135):
    """Porte disegnate come semplice interruzione del muro: due spalle affrontate, niente in mezzo.

    Molte tavole di progetto non disegnano l'anta: la porta è solo il muro che si interrompe.
    Le due spalle sono tratti corti (lo spessore del muro) paralleli, allineati sulle stesse
    facce, a una distanza da porta; fra le due non passa nessun altro tratto di muro.
    """
    spalle = [(i, proietta(p, q)) for i, (p, q) in enumerate(tratti) if 8 <= hypot(q[0] - p[0], q[1] - p[1]) <= 72]
    geometrie = [LineString((p, q)) for p, q in tratti]
    indice = STRtree(geometrie)
    presi = [LineString(a.estremi()) for a, _ in gia_trovati]
    # Un vano attraversato da un segno degli infissi è una finestra, non una porta.
    telai = [LineString((p, q)) for p, q in infissi]
    indice_telai = STRtree(telai) if telai else None
    per_angolo = defaultdict(list)
    for i, s in spalle:
        per_angolo[s.angolo].append((i, s))
    visti = set()
    for gruppo in per_angolo.values():
        for x, (i, a) in enumerate(gruppo):
            for j, b in gruppo[x + 1:]:
                if not minimo <= abs(a.centro - b.centro) <= massimo:
                    continue
                if abs(a.inizio - b.inizio) > 3 or abs(a.fine - b.fine) > 3:
                    continue
                pa = tuple((u + v) / 2 for u, v in zip(*tratti[i]))
                pb = tuple((u + v) / 2 for u, v in zip(*tratti[j]))
                vano = LineString((pa, pb))
                interno = vano.interpolate(2).buffer(0.5).union(vano.interpolate(vano.length - 2).buffer(0.5))
                tra = LineString((vano.interpolate(2).coords[0], vano.interpolate(vano.length - 2).coords[0]))
                if any(k not in (i, j) and geometrie[k].intersects(tra) for k in indice.query(tra)):
                    continue
                if any(v.distance(vano.centroid) < 20 for v in presi):
                    continue
                if indice_telai is not None and len(indice_telai.query(vano.buffer(6), predicate="intersects")):
                    continue
                # Muro pieno fra due finestre: le sue facce, parallele al vano, lo coprono.
                asse_vano = proietta(pa, pb)
                fascia = vano.buffer((a.fine - a.inizio) / 2 + 2, cap_style="flat")
                coperto = 0.0
                for k in indice.query(fascia):
                    if k in (i, j):
                        continue
                    f = proietta(*tratti[k])
                    if f.angolo == asse_vano.angolo:
                        coperto = max(coperto, geometrie[k].intersection(fascia).length)
                if coperto >= 0.5 * vano.length:
                    continue
                asse = proietta(pa, pb)
                _, normale = base(asse.angolo)
                facce = tuple(sorted(prodotto(pt, normale) for pt in tratti[i]))
                chiave = (asse.angolo, round(asse.centro), round(asse.inizio), round(asse.fine))
                if chiave in visti:
                    continue
                visti.add(chiave)
                yield asse, facce


def finestre_tra_stipiti(varchi):
    """Two parallel strokes between the same physical jambs identify a frame."""
    candidati = [(a, c) for a, c in varchi if a.fine - a.inizio <= 450]
    per_parete = defaultdict(list)
    for a, c in candidati:
        per_parete[a.angolo, round(sum(c) / 2)].append((a, c))
    for gruppo in per_parete.values():
        riconosciuti = []
        for a, c in gruppo:
            if any(abs(b.inizio - a.inizio) <= 3 and abs(b.fine - a.fine) <= 3 for b in riconosciuti):
                continue
            if any(
                2 <= abs(a.centro - b.centro) <= min(c[1] - c[0] - 3, 28)
                and abs(b.inizio - a.inizio) <= 3 and abs(b.fine - a.fine) <= 3
                and max(abs(x - y) for x, y in zip(c, altri)) <= 3
                for b, altri in gruppo
            ):
                riconosciuti.append(a)
                yield a, c


def leggi_quote(entita, zona, cm):
    quote = []
    for e in entita:
        if e.dxftype() != "DIMENSION" or e.dimtype not in (0, 1):
            continue
        a, b, linea = (e.dxf.get(campo, None) for campo in ("defpoint2", "defpoint3", "defpoint"))
        if any(p is None for p in (a, b, linea)):
            continue
        p, q, origine_linea = [(v.x * cm, v.y * cm) for v in (a, b, linea)]
        if not all(isfinite(x) for v in (p, q, origine_linea) for x in v) or not zona.covers(LineString((p, q, origine_linea))):
            continue
        if e.dimtype == 0:
            asse, _ = base(e.dxf.get("angle", 0))
            lunghezza = prodotto((q[0] - p[0], q[1] - p[1]), asse)
            q = (p[0] + asse[0] * lunghezza, p[1] + asse[1] * lunghezza)
        lunghezza = hypot(q[0] - p[0], q[1] - p[1])
        if not 10 <= lunghezza <= 12000:
            continue
        normale = (-(q[1] - p[1]) / lunghezza, (q[0] - p[0]) / lunghezza)
        scostamento = prodotto((origine_linea[0] - p[0], origine_linea[1] - p[1]), normale)
        if abs(scostamento) > 3000:
            continue
        testo = " ".join(e.dxf.get("text", "").split())[:100]
        if e.dxf.get("text", "") == " ":
            continue
        quote.append((p, q, scostamento, testo if testo != "<>" else ""))
        if len(quote) >= 220:
            break
    return quote


def contorni_facce(tratti, varchi):
    """Close wall faces in their drawn positions, including small CAD drafting gaps."""
    linee, connettori = rete_facce(tratti, varchi)
    return poligoni_da_facce(linee + connettori)


def rete_facce(tratti, varchi):
    facce = defaultdict(list)
    linee = [LineString((p, q)) for p, q in tratti]
    for p, q in tratti:
        m = proietta(p, q)
        asse, _ = base(m.angolo)
        primo, ultimo = sorted((p, q), key=lambda v: prodotto(v, asse))
        facce[m.angolo, round(m.centro * 2) / 2].append((m.inizio, m.fine, primo, ultimo))
    for intervalli in facce.values():
        fine, uscita = None, None
        for i, f, ingresso, ultimo in sorted(intervalli):
            if fine is not None and 0.02 < i - fine <= 125:
                linee.append(LineString((uscita, ingresso)))
            if fine is None or f > fine:
                fine, uscita = f, ultimo
    for asse, centri in varchi:
        for centro in centri:
            linee.append(LineString(Asse(asse.angolo, centro, asse.inizio, asse.fine).estremi()))

    # A face or jamb can end just short of the next stroke. Add a local
    # connection in the surface graph without shifting any wall geometry.
    indice = STRtree(linee)
    connettori = []
    for i, linea in enumerate(linee):
        for vertice in (linea.coords[0], linea.coords[-1]):
            estremo = Point(vertice)
            vicine = [linee[j] for j in indice.query(estremo, predicate="dwithin", distance=1.1) if j != i]
            vicina = min(vicine, key=estremo.distance, default=None)
            if vicina is not None and estremo.distance(vicina) > 0.015:
                connettori.append(LineString((estremo, vicina.interpolate(vicina.project(estremo)))))
    return linee, connettori


def poligoni_da_facce(linee):
    rete = union_all(linee, grid_size=0.01)
    return polygonize(getattr(rete, "geoms", [rete]))


def raccordi_muratura(muri, tratti):
    """Completa spessori che cambiano lungo una parete, solo fra due sezioni documentate."""
    linee = [LineString(t) for t in tratti]
    indice = STRtree(linee)
    solido = union_all([LineString(m.estremi()).buffer(m.spessore / 2, cap_style="flat") for m in muri])
    recuperati = []
    for angolo in (0, 90):
        sezioni = []
        for m in muri:
            if m.angolo != angolo:
                continue
            for t in (m.inizio, m.fine):
                estremi = [punto(t, m.centro + lato * m.spessore / 2, angolo) for lato in (-1, 1)]
                if all(len(indice.query(Point(p), predicate="dwithin", distance=0.06)) for p in estremi):
                    sezioni.append(set_precision(LineString(estremi), 0.01))
        if len(sezioni) < 2:
            continue
        indice_sezioni = STRtree(sezioni)
        asse = angolo // 90
        for poligono in poligoni_da_facce(linee + sezioni):
            minimo, massimo = poligono.bounds[asse], poligono.bounds[asse + 2]
            if poligono.interiors or not 24 <= massimo - minimo <= 300:
                continue
            appoggi = {s.bounds[asse] for i in indice_sezioni.query(poligono)
                       if (s := sezioni[i]).intersection(poligono.boundary).length >= s.length * 0.9}
            if not {minimo, massimo} <= appoggi or poligono.difference(solido).area < 20:
                continue
            limiti = sorted({p[asse] for p in poligono.exterior.coords})
            fasce = []
            for da, a in zip(limiti, limiti[1:]):
                x, y, X, Y = poligono.bounds
                taglio = poligono.intersection(box(da, y, a, Y) if angolo == 0 else box(x, da, X, a))
                parti = [taglio] if isinstance(taglio, Polygon) else [
                    g for g in getattr(taglio, "geoms", []) if isinstance(g, Polygon)
                ]
                if len(parti) != 1:
                    break
                parte = parti[0]
                basso, alto = parte.bounds[1 - asse], parte.bounds[3 - asse]
                if not 7.99 <= alto - basso <= 85 or abs(parte.area - (a - da) * (alto - basso)) > 0.02:
                    break
                if parte.difference(solido).area >= 20:
                    centro = (alto + basso) / 2 * (1 if angolo == 0 else -1)
                    fasce.append(Asse(angolo, centro, da, a, alto - basso))
            else:
                recuperati.extend(fasce)
    return recuperati


@dataclass
class LocaleLetto:
    contorno: Polygon
    etichette: list
    superficie: float | None = None
    aperto: bool = False


def stanze_dai_nomi(muri, aperture, locali, nomi, aree, zona, involucro=100, vicino=80):
    """Le stanze con un nome e una superficie scritti che il riconoscimento delle facce non ha
    chiuso (ingressi, disimpegni, ripostigli: contorni con un tratto mancante o un vano senza segno).

    Si riempie lo spazio libero fra le pareti ricostruite, con i vani chiusi, dentro la sagoma
    dell'edificio (pareti dilatate e riempite: le porte d'ingresso non fanno uscire la stanza),
    tolte le stanze già trovate. Un pezzo è accettato solo se la sua area torna con quella scritta
    (±20%, o 0,8 m² per i vani piccoli): se due nomi cadono nello stesso pezzo (un bagno e il suo
    disimpegno senza la porta disegnata) diventano una stanza sola, con le due superfici sommate.
    Callimaco, 24/11/2026: ripostiglio, ingresso, bagno e disimpegni del primo piano.
    """
    liberi = [(p, n, t) for p, n, t in nomi if not any(l.contorno.covers(p) for l in locali)]
    if not liberi or not muri:
        return []
    pieni = [LineString((punto(m.inizio, m.centro, m.angolo), punto(m.fine, m.centro, m.angolo))).buffer(max(m.spessore, 4) / 2, cap_style=2)
             for m in muri if m.fine > m.inizio]
    pieni += [LineString((punto(a, m.centro, m.angolo), punto(b, m.centro, m.angolo))).buffer(max(m.spessore, 4) / 2 + 1, cap_style=2)
              for m, a, b, _ in aperture if b > a]
    solido = union_all(pieni)
    sagoma = solido.buffer(involucro, join_style=2).buffer(-involucro, join_style=2)
    sagoma = union_all([Polygon(g.exterior) for g in getattr(sagoma, "geoms", [sagoma]) if g.geom_type == "Polygon"])
    occupato = union_all([l.contorno for l in locali]).buffer(3) if locali else Polygon()
    libero = sagoma.intersection(zona).difference(solido).difference(occupato)
    pezzi = [g for g in getattr(libero, "geoms", [libero]) if g.geom_type == "Polygon" and g.area > 0]
    usate = {id(a) for a, _ in aree if any(l.contorno.covers(a) for l in locali)}
    nuovi = []
    for pezzo in pezzi:
        dentro = [e for e in liberi if pezzo.covers(e[0])]
        if not dentro:
            continue
        superfici = []
        for p, _, _ in dentro:
            vicine = sorted((a.distance(p), id(a), mq) for a, mq in aree if id(a) not in usate and a.distance(p) <= vicino)
            if not vicine:
                break
            usate.add(vicine[0][1])
            superfici.append(vicine[0][2])
        if len(superfici) != len(dentro):
            continue
        attesa = sum(superfici)
        if abs(pezzo.area / 10_000 - attesa) > max(attesa * 0.2, 0.8):
            continue
        # La destinazione della parte più grande dà il tipo alla stanza.
        ordinate = [e for _, e in sorted(zip(superfici, dentro), key=lambda c: -c[0])]
        nuovi.append(LocaleLetto(Polygon(pezzo.exterior), ordinate, round(attesa, 2)))
    return nuovi


def separa_ambienti_aperti(spazio, etichette, misure):
    """Extend a drawn wall edge to measure two named open areas without adding a wall."""
    estensione = hypot(spazio.bounds[2] - spazio.bounds[0], spazio.bounds[3] - spazio.bounds[1]) * 2
    vertici = list(spazio.exterior.coords)
    candidati = []
    for a, b in zip(vertici, vertici[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        lunghezza = hypot(dx, dy)
        if lunghezza < 36:
            continue
        dx, dy = dx * estensione / lunghezza, dy * estensione / lunghezza
        parti = split(spazio, LineString(((a[0] - dx, a[1] - dy), (b[0] + dx, b[1] + dy)))).geoms
        if len(parti) != 2:
            continue
        locali, scarti = [], []
        for parte in parti:
            testi = [e for e in etichette if parte.contains(e[0])]
            riferimenti = [mq for p, mq in misure if parte.contains(p)]
            if not testi or len(riferimenti) != 1:
                break
            mq = riferimenti[0]
            errore = abs(parte.area / 10000 - mq) / mq
            if errore > 0.08:
                break
            locali.append(LocaleLetto(parte, testi, mq, True))
            scarti.append(errore)
        if len(locali) == 2 and sum(len(l.etichette) for l in locali) == len(etichette):
            candidati.append((sum(scarti), locali))
    if not candidati:
        return []
    candidati.sort(key=lambda c: c[0])
    errore, scelti = candidati[0]
    if any(
        any(a.contorno.symmetric_difference(b.contorno).area > a.contorno.area * 0.03
            for a in scelti for b in altre if a.etichette[0] == b.etichette[0])
        for scarto, altre in candidati[1:] if scarto - errore <= 0.02
    ):
        return []
    return scelti


def combina_vani_comunicanti(poligoni, aperture, nomi, aree):
    """A single area annotation can cover a room and its enclosed accessory space."""
    indice = STRtree(poligoni)
    comunicanti = []
    for muro, a, b, tipo in aperture:
        if tipo not in ("porta", "porta_doppia"):
            continue
        vano = LineString((punto(a, muro.centro, muro.angolo), punto(b, muro.centro, muro.angolo)))
        centro = vano.interpolate(0.5, normalized=True)
        for i in indice.query(centro, predicate="covered_by"):
            soglia = poligoni[i]
            if not 0.04 <= soglia.area / 10000 < 0.8 or soglia.intersection(vano).length < 0.8 * vano.length:
                continue
            affacciati = [
                int(j) for j in indice.query(soglia, predicate="touches")
                if 0.8 <= poligoni[j].area / 10000 <= 220
                and poligoni[j].intersection(soglia).length >= 0.8 * vano.length
            ]
            if len(affacciati) == 2:
                comunicanti.append((soglia, *affacciati))

    for soglia, primo, secondo in comunicanti:
        parti = [poligoni[primo], poligoni[secondo]]
        dati = [[mq for p, mq in aree if parte.covers(p)] for parte in parti]
        if sorted(map(len, dati)) != [0, 1]:
            continue
        principale = 0 if dati[0] else 1
        accessorio = parti[1 - principale]
        if accessorio.area > 60_000 or any(accessorio.covers(p) for p, _, _ in nomi):
            continue
        id_accessorio = (primo, secondo)[1 - principale]
        if sum(id_accessorio in (i, j) for _, i, j in comunicanti) != 1:
            continue
        mq = dati[principale][0]
        unione = union_all([*parti, soglia], grid_size=0.01)
        if isinstance(unione, Polygon) and unione.is_valid and not unione.interiors \
                and len(unione.exterior.coords) <= 100 and abs(unione.area / 10000 - mq) <= 0.05:
            etichette = [e for e in nomi if parti[principale].covers(e[0])]
            yield LocaleLetto(unione.simplify(0.10), etichette, mq)


def riconosci_locali(muri, tratti, varchi, nomi, aree, aperture, poligoni=None):
    solido = union_all([LineString(m.estremi()).buffer(m.spessore / 2, cap_style="square", join_style="mitre") for m in muri])
    risultati = []
    if poligoni is None:
        poligoni = list(contorni_facce(tratti, varchi)) if aree else []
    for locale in combina_vani_comunicanti(poligoni, aperture, nomi, aree):
        risultati.append((-0.21, [locale]))
    # A single source area is enough to locate a closed, unnamed room.
    for spazio in poligoni:
        m2 = spazio.area / 10000
        if not 0.8 <= m2 <= 220 or not spazio.is_valid or spazio.interiors or len(spazio.exterior.coords) > 100:
            continue
        etichette = [e for e in nomi if spazio.covers(e[0])]
        misure = [(p, m) for p, m in aree if spazio.covers(p)]
        if len(misure) == 1:
            _, mq = misure[0]
            scarto = abs(mq - m2) / mq
            if scarto <= 0.16:
                risultati.append((scarto - 0.20, [LocaleLetto(spazio.simplify(0.10), etichette, mq)]))

    for tolleranza in (9, 24, 35, 50, 65, 90, 115, 125, 135, 145, 155):
        if tolleranza > 50 and not aree:
            break
        poligoni = solido.buffer(tolleranza, join_style="mitre").buffer(-tolleranza, join_style="mitre")
        for poligono in getattr(poligoni, "geoms", [poligoni]):
            for bordo in poligono.interiors:
                spazio = Polygon(bordo).simplify(2, preserve_topology=True)
                m2 = spazio.area / 10000
                if not 0.8 <= m2 <= 220 or not spazio.is_valid or len(spazio.exterior.coords) > 100:
                    continue
                misure = [(p, m) for p, m in aree if spazio.covers(p)]
                etichette = [(p, n, tipo) for p, n, tipo in nomi if spazio.covers(p)]
                if len(etichette) >= 2 and len(misure) == 2:
                    dichiarati = sum(m for _, m in misure)
                    scarto = abs(m2 - dichiarati) / dichiarati
                    if scarto <= 0.08:
                        divisi = separa_ambienti_aperti(spazio, etichette, misure)
                        if divisi:
                            risultati.append((0.10 + scarto + tolleranza / 2000, divisi))
                if tolleranza > 115:
                    continue
                indicatori = [(p, m) for p, m in misure if len(misure) == 1 and abs(m - m2) / m <= 0.16]
                if indicatori:
                    p, mq = min(indicatori, key=lambda a: abs(a[1] - m2))
                    etichetta = min(etichette, key=lambda a: a[0].distance(p), default=None)
                    punteggio = abs(mq - m2) / mq + tolleranza / 1800
                elif etichette and tolleranza <= 35 and not misure:
                    etichetta = etichette[0]
                    punteggio = 0.21 + tolleranza / 300
                    mq = None
                else:
                    continue
                risultati.append((punteggio, [LocaleLetto(spazio, [etichetta] if etichetta else [], mq)]))
    locali = []
    for _, proposti in sorted(risultati, key=lambda r: r[0]):
        if any(a.contorno.intersection(b.contorno).area > min(a.contorno.area, b.contorno.area) * 0.08
               for a in proposti for b in locali):
            continue
        locali.extend(proposti)
    return locali


def completa_ingressi_aperti(locali, muri, tratti, varchi, nomi, aree, aperture):
    """Recupera gli ingressi scritti nella tavola anche quando fanno parte di uno spazio aperto."""
    ingressi = [e for e in nomi if e[2] in ("ingresso", "disimpegno")
                and not any(l.contorno.covers(e[0]) for l in locali)]
    if not locali or not ingressi:
        return []
    chiusure_vani = [
        (Asse(m.angolo, m.centro, a, b), (m.centro - m.spessore / 2, m.centro + m.spessore / 2))
        for m, a, b, _ in aperture
    ]
    occupato = union_all([l.contorno for l in locali] + [
        LineString(m.estremi()).buffer(m.spessore / 2, cap_style="flat") for m in muri
    ]).buffer(0.15)
    aggiunti = []
    for spazio in contorni_facce(tratti, varchi + chiusure_vani):
        if not 2 <= spazio.area / 10000 <= 220 or not any(spazio.covers(e[0]) for e in ingressi):
            continue
        residuo = spazio.difference(occupato, grid_size=0.01)
        for parte in getattr(residuo, "geoms", [residuo]):
            if not isinstance(parte, Polygon) or not 2 <= parte.area / 10000 <= 50:
                continue
            etichette = [e for e in nomi if parte.covers(e[0])]
            if len(etichette) != 1 or etichette[0] not in ingressi or any(parte.covers(p) for p, _ in aree):
                continue
            # I piccoli pilastri interni possono restare sopra il solaio.
            contorno = Polygon(parte.exterior).simplify(1, preserve_topology=True)
            if contorno.is_valid and len(contorno.exterior.coords) <= 100 and abs(contorno.area - parte.area) <= 1000:
                aggiunti.append(LocaleLetto(contorno, etichette))
    return aggiunti


def portoni_garage(varchi, locali):
    garage = [l for l in locali if any(tipo == "garage" for _, _, tipo in l.etichette)]
    for asse, centri in varchi:
        larghezza = asse.fine - asse.inizio
        # Two parallel strokes indicate a frame, not a single garage door blade.
        if larghezza < 200 or any(
            altro is not asse and altro.angolo == asse.angolo and abs(altro.centro - asse.centro) <= 12
            and abs(altro.inizio - asse.inizio) <= 3 and abs(altro.fine - asse.fine) <= 3
            for altro, _ in varchi
        ):
            continue
        affacciati = []
        for locale in garage:
            bordo = locale.contorno.boundary.buffer(0.5)
            for centro in centri:
                fronte = LineString(Asse(asse.angolo, centro, asse.inizio, asse.fine).estremi())
                if bordo.intersection(fronte).length >= 0.9 * larghezza:
                    affacciati.append((locale, centro))
        if len(affacciati) == 1:
            locale, centro = affacciati[0]
            yield locale, asse, centri, centro


def includi_battuta_portone(locale, asse, stipiti, fronte, locali):
    if not stipiti[0] < asse.centro < stipiti[1] or abs(asse.centro - fronte) < 2:
        return
    rientranza = Polygon([
        punto(asse.inizio, fronte, asse.angolo), punto(asse.fine, fronte, asse.angolo),
        punto(asse.fine, asse.centro, asse.angolo), punto(asse.inizio, asse.centro, asse.angolo),
    ])
    if any(l is not locale and l.contorno.intersection(rientranza).area > 1 for l in locali):
        return
    unione = union_all([locale.contorno, rientranza], grid_size=0.01)
    if isinstance(unione, Polygon) and unione.is_valid and not unione.interiors and len(unione.exterior.coords) <= 100:
        locale.contorno = unione.simplify(0.10)


@dataclass
class RiscontroDwg:
    tipo: str
    tratti: list
    locale: LocaleLetto | None = None
    dopo: Polygon | None = None


def riscontri_chiusure(prima, dopo, connettori):
    """Only suggest closed, recognizable rooms with a drawn gap on their new perimeter."""
    for locale in prima:
        if locale.superficie is None:
            continue
        candidati = [l for l in dopo if l.superficie == locale.superficie
                     and l.contorno.intersection(locale.contorno).area >= 0.85 * max(l.contorno.area, locale.contorno.area)]
        if len(candidati) != 1:
            continue
        nuovo = candidati[0].contorno
        if abs(nuovo.area - locale.contorno.area) < 500:
            continue
        bordo_nuovo = nuovo.boundary.buffer(0.12)
        bordo_prima = locale.contorno.boundary.buffer(0.12)
        chiusure = {chiave_tratto(tratto): tratto for tratto in connettori if tratto.length >= 0.1
                    and bordo_nuovo.covers(tratto) and not bordo_prima.covers(tratto)}
        if chiusure:
            yield candidati[0], RiscontroDwg("chiusura", list(chiusure.values())[:8], locale, nuovo)


def chiave_tratto(linea):
    return tuple(sorted(tuple(round(c, 2) for c in p) for p in linea.coords))


def riscontri_sovrapposizioni(tratti):
    """Measure coincident wall strokes. An intersection at one point is not an overlap."""
    distinte, viste = {}, {}
    for t in tratti:
        linea = LineString(t)
        chiave = tuple(sorted(t))
        if chiave in distinte and linea.length >= 12:
            viste.setdefault(chiave_tratto(linea), linea)
        distinte.setdefault(chiave, linea)
    linee = list(distinte.values())
    indice = STRtree(linee)
    for i, linea in enumerate(linee):
        for j in indice.query(linea, predicate="intersects"):
            if j <= i:
                continue
            comune = linea.intersection(linee[j])
            if isinstance(comune, LineString) and comune.length >= 12:
                viste.setdefault(chiave_tratto(comune), comune)
    for tratto in sorted(viste.values(), key=lambda t: -t.length)[:24]:
        yield RiscontroDwg("sovrapposizione", [tratto])


def riferimenti_tratto(tratto, indice, fonti):
    candidati = sorted(indice.query(tratto, predicate="dwithin", distance=0.05),
                      key=lambda i: (-fonti[i][0].intersection(tratto).length, fonti[i][1]))
    coincidenti = [i for i in candidati if fonti[i][0].intersection(tratto).length >= 0.9 * tratto.length]
    distinti = {}
    for i in coincidenti or candidati:
        _, handle, layer = fonti[i]
        distinti.setdefault(handle, {"handle": handle, "layer": layer[:120]})
        if len(distinti) == 4:
            break
    return list(distinti.values())


def contorni_senza_etichette(muri, aperture):
    """Suggerisce solo contorni chiusi dalla muratura, con una porta affacciata sul vano."""
    porte = []
    for muro, a, b, tipo in aperture:
        if tipo not in ("porta", "porta_doppia"):
            continue
        c = punto((a + b) / 2, muro.centro, muro.angolo)
        _, n = base(muro.angolo)
        h = muro.spessore / 2 + 6
        porte.append((Point(c), Point(c[0] - h * n[0], c[1] - h * n[1]),
                      Point(c[0] + h * n[0], c[1] + h * n[1]), h))
    if not porte:
        return []
    solido = union_all(
        [LineString(m.estremi()).buffer(m.spessore / 2, cap_style="square") for m in muri], grid_size=0.25,
    )
    locali = []
    for unione in getattr(solido, "geoms", [solido]):
        for bordo in getattr(unione, "interiors", []):
            spazio = Polygon(bordo).simplify(1, preserve_topology=True)
            if not 0.8 <= spazio.area / 10000 <= 220 or not spazio.is_valid or len(spazio.exterior.coords) > 100:
                continue
            if spazio.buffer(-30).is_empty or spazio.intersection(solido).area > spazio.area * 0.02:
                continue
            if any(spazio.boundary.distance(c) <= h and spazio.covers(p) != spazio.covers(q) for c, p, q, h in porte):
                locali.append(LocaleLetto(spazio, []))
    return sorted(locali, key=lambda l: (l.contorno.bounds[0], -l.contorno.bounds[3]))


def frecce(linee):
    geometrie = [LineString((p, q)) for p, q, _ in linee]
    albero = STRtree(geometrie)
    for p, q, _ in linee:
        if not 80 <= hypot(q[0] - p[0], q[1] - p[1]) <= 620:
            continue
        for coda, punta in ((p, q), (q, p)):
            a = atan2(punta[1] - coda[1], punta[0] - coda[0])
            u, v = (cos(a), sin(a)), (-sin(a), cos(a))
            ali = []
            for i in albero.query(Point(punta), predicate="dwithin", distance=1.5):
                s, t, _ = linee[i]
                vicino, lontano = sorted((s, t), key=lambda z: hypot(z[0] - punta[0], z[1] - punta[1]))
                if hypot(vicino[0] - punta[0], vicino[1] - punta[1]) > 1.5:
                    continue
                d = lontano[0] - punta[0], lontano[1] - punta[1]
                lungo, lato = prodotto(d, u), prodotto(d, v)
                if -22 <= lungo <= -4 and 2 <= abs(lato) <= 16:
                    ali.append((lungo, lato))
            if any(abs(a - b) + abs(x + y) <= 3 and x * y < 0 for a, x in ali for b, y in ali):
                yield coda, punta, u, v


def scale_rette(linee):
    for coda, punta, u, v in frecce(linee):
        inizio, fine = prodotto(coda, u), prodotto(punta, u)
        mezzeria = prodotto(punta, v)
        per_layer = defaultdict(list)
        for p, q, layer in linee:
            t, s = prodotto(p, u), prodotto(q, u)
            a, b = sorted((prodotto(p, v), prodotto(q, v)))
            if abs(t - s) <= 1.5 and b - a >= 18 and inizio - 45 <= t <= fine + 320 and a >= mezzeria - 100 and b <= mezzeria + 100:
                per_layer[layer].append((round((t + s) / 2, 1), a, b))
        for tratti in per_layer.values():
            interi = [(a, b) for t, a, b in tratti if abs((a + b) / 2 - mezzeria) <= 9 and 65 <= b - a <= 170 and t <= fine]
            if len(interi) < 5:
                continue
            a, b = median([i for i, _ in interi]), median([f for _, f in interi])
            posizioni = sorted({t for t, x, y in tratti if a - 3 <= x <= y <= b + 3 and min(abs(x - a), abs(y - b)) <= 3})
            sequenze = []
            for t in posizioni:
                if not sequenze or t - sequenze[-1][-1] > 42:
                    sequenze.append([t])
                elif t - sequenze[-1][-1] >= 14:
                    sequenze[-1].append(t)
            for serie in sequenze:
                if 6 <= len(serie) <= 41 and serie[0] <= fine <= serie[-1] + 32:
                    passi = [y - x for x, y in zip(serie, serie[1:])]
                    if max(passi) - min(passi) <= 4:
                        yield [((t * u[0] + a * v[0], t * u[1] + a * v[1]), (t * u[0] + b * v[0], t * u[1] + b * v[1])) for t in serie]


def distanza_alzata(a, b):
    return max(hypot(p[0] - q[0], p[1] - q[1]) for p, q in zip(a, b))


def scale_curve(archi, linee, sopra):
    for i, (centro, raggio, inizio, fine) in enumerate(archi):
        for c, r, _, _ in archi[i + 1:]:
            if not 65 <= abs(raggio - r) <= 170 or hypot(centro[0] - c[0], centro[1] - c[1]) > 3:
                continue
            esterno, interno = max(raggio, r), min(raggio, r)
            apertura = (fine - inizio) % 360
            if not 28 <= apertura <= 200:
                continue

            def alzate(tratti):
                per_layer = defaultdict(list)
                for p, q, layer in tratti:
                    estremi = sorted((p, q), key=lambda z: hypot(z[0] - centro[0], z[1] - centro[1]), reverse=True)
                    delte = [(z[0] - centro[0], z[1] - centro[1]) for z in estremi]
                    if abs(hypot(*delte[0]) - esterno) > 4.5 or abs(hypot(*delte[1]) - interno) > 4.5:
                        continue
                    a, b = [degrees(atan2(y, x)) for x, y in delte]
                    t = (a - inizio + 10) % 360
                    if 0 <= t <= apertura + 20 and abs((a - b + 180) % 360 - 180) <= 3:
                        per_layer[layer].append((t, tuple(estremi)))
                return per_layer

            da_terra, da_sopra = alzate(linee), alzate(sopra)
            for layer, candidati in da_terra.items():
                if len(candidati) < 6:
                    continue
                aggiunte = da_sopra.get(layer, [])
                if sum(any(distanza_alzata(a, b) <= 4.5 for _, a in candidati) for _, b in aggiunte) >= 3:
                    candidati = candidati + aggiunte
                serie = []
                for t, ab in sorted(candidati):
                    if not serie or 1.5 <= t - serie[-1][0] <= 15:
                        serie.append((t, ab))
                    elif t - serie[-1][0] > 15:
                        break
                if len(serie) < 6:
                    continue
                # A straight approach fixes the direction and connects to the radial treads.
                for verso in (serie, serie[::-1]):
                    _, primo = verso[0]
                    precedente = verso[1][1]
                    sequenza = [primo]
                    for _ in range(12):
                        a, b = sequenza[-1]
                        c, d = precedente
                        vie = []
                        for p, q, l in linee:
                            if l != layer:
                                continue
                            for x, y in ((p, q), (q, p)):
                                passi = [hypot(i[0] - j[0], i[1] - j[1]) for i, j in ((a, x), (b, y))]
                                avanti = (a[0] + b[0] - c[0] - d[0], a[1] + b[1] - c[1] - d[1])
                                delta = (x[0] + y[0] - a[0] - b[0], x[1] + y[1] - a[1] - b[1])
                                divario = hypot(x[0] - y[0] - a[0] + b[0], x[1] - y[1] - a[1] + b[1])
                                if min(passi) >= 12 and max(passi) <= 41 and divario <= 12 and prodotto(avanti, delta) > 0:
                                    vie.append((sum(passi), (x, y)))
                        if not vie:
                            break
                        precedente = sequenza[-1]
                        sequenza.append(min(vie)[1])
                    if len(sequenza) >= 3:
                        yield list(reversed(sequenza[1:])) + [ab for _, ab in verso]
                        break


def sovrapposizione_scale(a, b):
    return sum(any(min(distanza_alzata(p, q), distanza_alzata(p, q[::-1])) <= 4 for q in b) for p in a)


def scale_da_riscontrare(linee, modellate):
    """Localizza le rampe disegnate sul layer delle scale, anche senza una freccia leggibile."""
    gruppi = []
    for p, q, layer in linee:
        if not LAYER_SCALE.search(semplice(layer)):
            continue
        gradino = proietta(p, q)
        if not 65 <= gradino.fine - gradino.inizio <= 170:
            continue
        gruppo = next((g for g in gruppi if g[0].angolo == gradino.angolo and
                       abs(g[0].inizio - gradino.inizio) <= 3 and abs(g[0].fine - gradino.fine) <= 3), None)
        if gruppo is None:
            gruppi.append([gradino])
        else:
            gruppo.append(gradino)

    impronte = []
    for gruppo in gruppi:
        sequenze = []
        for gradino in sorted(gruppo, key=lambda a: a.centro):
            if not sequenze or gradino.centro - sequenze[-1][-1].centro > 42:
                sequenze.append([gradino])
            elif gradino.centro - sequenze[-1][-1].centro >= 14:
                sequenze[-1].append(gradino)
        for serie in sequenze:
            if not 5 <= len(serie) <= 41:
                continue
            passi = [b.centro - a.centro for a, b in zip(serie, serie[1:])]
            if max(passi) - min(passi) > 4:
                continue
            alzate = [a.estremi() for a in serie]
            if any(sovrapposizione_scale(alzate, m) >= 4 for m in modellate):
                continue
            # Due rampe affiancate dello stesso vano ricevono un solo richiamo.
            impronte.append(LineString([p for alzata in alzate for p in alzata]).convex_hull.buffer(24))
    unione = union_all(impronte)
    return [zona.representative_point() for zona in sorted(getattr(unione, "geoms", [unione]), key=lambda z: z.bounds)
            if not zona.is_empty]


def assi_vicini(entita, zona, cm):
    x, y, X, Y = zona.bounds
    assi = [set(), set()]
    for e in entita:
        if e.dxftype() != "LINE" or not ASSI.search(semplice(e.dxf.layer)):
            continue
        for p, q in segmenti(e, cm):
            # Grids can protrude beyond the crop. Require most of the selected span.
            if abs(p[0] - q[0]) <= 1 and x <= p[0] <= X and min(p[1], q[1]) < (y + Y) / 2 < max(p[1], q[1]) and abs(p[1] - q[1]) > (Y - y) * 0.5:
                assi[0].add(round(p[0], 1))
            elif abs(p[1] - q[1]) <= 1 and y <= p[1] <= Y and min(p[0], q[0]) < (x + X) / 2 < max(p[0], q[0]) and abs(p[0] - q[0]) > (X - x) * 0.5:
                assi[1].add(round(p[1], 1))
    return [sorted(a)[:50] for a in assi]


def scostamento(prima, seconda):
    if min(len(prima), len(seconda)) < 3:
        return None
    proposte = []
    for a in prima:
        for b in seconda:
            delta = b - a
            combaciano = sum(any(abs(p + delta - q) <= 1.2 for q in seconda) for p in prima)
            proposte.append((combaciano, delta))
    conteggio, delta = max(proposte, key=lambda v: v[0])
    if conteggio < min(len(prima), len(seconda)) * 0.75:
        return None
    if any(k == conteggio and abs(d - delta) > 2 for k, d in proposte):
        return None
    return delta


def profili_ortogonali(muri):
    """Lunghezze dei tratti sulle stesse direttrici, senza contare due volte le sovrapposizioni."""
    fasce = [defaultdict(list), defaultdict(list)]
    for muro in muri:
        if muro.fine - muro.inizio < 150:
            continue
        if muro.angolo == 90:
            fasce[0][round(-muro.centro)].append((muro.inizio, muro.fine))
        elif muro.angolo == 0:
            fasce[1][round(muro.centro)].append((muro.inizio, muro.fine))
    profili = []
    for fascia in fasce:
        uniti = {}
        for asse, intervalli in fascia.items():
            tratti = []
            for a, b in sorted(intervalli):
                if tratti and a <= tratti[-1][1]:
                    tratti[-1] = (tratti[-1][0], max(b, tratti[-1][1]))
                else:
                    tratti.append((a, b))
            uniti[asse] = tratti
        piu_lunghi = sorted(uniti, key=lambda a: (-sum(f - i for i, f in uniti[a]), a))[:24]
        profili.append({a: uniti[a] for a in piu_lunghi})
    return profili


def candidati_scostamento(prima, seconda):
    if min(len(prima), len(seconda)) < 3:
        return []
    differenze = sorted({b - a for a in prima for b in seconda})
    proposte = set()
    for d in differenze:
        coppie = [(a, b) for a in prima for b in seconda if abs(a + d - b) <= 2]
        if min(len({a for a, _ in coppie}), len({b for _, b in coppie})) >= 3:
            proposte.add(median(b - a for a, b in coppie))
    # Una pianta con moduli molto ripetuti può fornire troppe traslazioni plausibili.
    return sorted(proposte) if len(proposte) <= 24 else []


def copertura_pareti(prima, seconda, trasversale, longitudinale):
    totale = min(sum(f - i for tratti in profilo.values() for i, f in tratti) for profilo in (prima, seconda))
    coppie = sorted((abs(a + trasversale - b), a, b) for a in prima for b in seconda if abs(a + trasversale - b) <= 2)
    visitati_a, visitati_b = set(), set()
    copertura = 0
    for _, a, b in coppie:
        if a in visitati_a or b in visitati_b:
            continue
        comune = sum(
            max(0, min(f + longitudinale, fine) - max(i + longitudinale, inizio))
            for i, f in prima[a] for inizio, fine in seconda[b]
        )
        if comune >= 100:
            visitati_a.add(a)
            visitati_b.add(b)
            copertura += comune
    if len(visitati_a) < 3 or max(visitati_a) - min(visitati_a) < 200:
        return 0
    return copertura / totale


def allinea_pareti(prima, seconda):
    """Propone una traslazione solo con riscontro su entrambi gli assi e un esito univoco."""
    (ax, ay), (bx, by) = profili_ortogonali(prima), profili_ortogonali(seconda)
    risultati = []
    for dx in candidati_scostamento(ax, bx):
        for dy in candidati_scostamento(ay, by):
            x = copertura_pareti(ax, bx, dx, dy)
            y = copertura_pareti(ay, by, dy, dx)
            if min(x, y) >= 0.40 and x + y >= 1.12:
                risultati.append((x + y, dx, dy))
    if not risultati:
        return None
    punteggio, dx, dy = max(risultati)
    if any(p >= punteggio - 0.08 and hypot(x - dx, y - dy) > 4 for p, x, y in risultati):
        return None
    return dx, dy


@dataclass
class PianoLetto:
    muri: list
    aperture: list
    locali: list
    testi: list
    quote: list
    griglia: list
    linee: list
    archi: list
    riscontri: list
    fonti: list
    sigle: list = field(default_factory=list)
    sigle_unita: list = field(default_factory=list)
    nomi_letti: int = 0
    altezze: list = field(default_factory=list)


def leggi_piano(entita, regione, cm, layer, controllo=False):
    zona = box(*(x * cm for x in regione["rettangolo"]))
    tratti, linee, archi, fonti = [], [], [], []
    for e in entita:
        originale = e.dxf.layer
        gruppo = semplice(originale)
        parete = originale.casefold() == layer.casefold() if layer else (
            PARETI.search(gruppo) and not NON_PARETI.search(gruppo) and not ASSI.search(gruppo)
        )
        if e.dxftype() == "ARC" and parete:
            c = e.ocs().to_wcs(e.dxf.center)
            centro, raggio = (c.x * cm, c.y * cm), e.dxf.radius * cm
            if 80 <= raggio <= 1500 and zona.covers(Point(centro)):
                archi.append((centro, raggio, e.dxf.start_angle, e.dxf.end_angle))
            continue
        if not parete and e.dxftype() != "LINE" and not FINESTRE.search(gruppo):
            continue
        for p, q in segmenti(e, cm):
            if hypot(q[0] - p[0], q[1] - p[1]) < 3 or not zona.covers(LineString([p, q])):
                continue
            if controllo and e.dxf.handle:
                fonti.append((LineString((p, q)), e.dxf.handle, originale))
            if parete:
                tratti.append((p, q))
                if len(tratti) > MAX_TRATTI:
                    raise LetturaIncompleta("Ritaglia una sola pianta o indica il layer dei muri.")
            elif not ASSI.search(gruppo):
                linee.append((p, q, originale.casefold()))
    muri = accoppia_facce([(p, q) for p, q in tratti if hypot(q[0] - p[0], q[1] - p[1]) >= 18])
    if len(muri) < 3 or sum(m.fine - m.inizio for m in muri) < 300:
        raise LetturaIncompleta("Muri insufficienti nel ritaglio. Controlla l’unità e il layer dei muri oppure apri la tavola da ricalcare.")
    aperture = abbina_aperture(entita, muri, zona, cm, tratti)
    nomi, aree = leggi_testi(entita, zona, cm)
    tracce_utili = [(p,q,layer) for p,q,layer in linee if not NON_PARETI.search(semplice(layer))]
    stipiti = list(varchi_tra_stipiti(tracce_utili, tratti, minimo=45))
    varchi = [(a,c) for a,c in stipiti if a.fine - a.inizio >= 130] if nomi and aree else []
    varchi.extend((Asse(m.angolo, m.centro, a, b), (m.centro - m.spessore / 2, m.centro + m.spessore / 2))
                  for m, a, b, tipo, _ in aperture if tipo == "porta_doppia")
    vani_aperti = list(vani_senza_segno(tratti, stipiti + varchi, [(p, q) for p, q, l in linee if FINESTRE.search(semplice(l))])) if nomi and aree else []
    varchi.extend(vani_aperti)
    pertinenti = []
    for muro, a, b, tipo, ponte in aperture:
        if any(muro.angolo == preso.angolo and abs(muro.centro - preso.centro) < 6 and min(b, f) - max(a, i) > (b - a) * 0.45 for preso, i, f, _ in pertinenti):
            continue
        if ponte:
            muri.append(muro)
        pertinenti.append((muro, a, b, tipo))
    riscontri = []
    if controllo and aree:
        rete, connettori = rete_facce(tratti, varchi)
        locali = riconosci_locali(muri, tratti, varchi, nomi, aree, pertinenti, list(poligoni_da_facce(rete + connettori)))
        if connettori:
            prima = riconosci_locali(muri, tratti, varchi, nomi, aree, pertinenti, list(poligoni_da_facce(rete)))
            chiusure = {id(candidato): r for candidato, r in riscontri_chiusure(prima, locali, connettori)}
            locali = [chiusure[id(l)].locale if id(l) in chiusure else l for l in locali]
            riscontri.extend(chiusure.values())
    else:
        locali = riconosci_locali(muri, tratti, varchi, nomi, aree, pertinenti)
    for a, (c1, c2) in finestre_tra_stipiti(stipiti):
        if any(
            m.angolo == a.angolo and abs(m.centro - (c1 + c2) / 2) <= 8
            and min(f, a.fine) - max(i, a.inizio) >= 0.65 * (a.fine - a.inizio)
            for m, i, f, _ in pertinenti
        ):
            continue
        inserisci_varco(a, (c1, c2), muri, pertinenti, "finestra")
    for a, (c1, c2) in vani_aperti:
        if any(m.angolo == a.angolo and abs(m.centro - (c1 + c2) / 2) <= 8
               and min(f, a.fine) - max(i, a.inizio) >= 0.65 * (a.fine - a.inizio) for m, i, f, _ in pertinenti):
            continue
        inserisci_varco(a, (c1, c2), muri, pertinenti, "porta")
    garage_da_rivedere = {}
    for locale, a, (c1, c2), fronte in portoni_garage(varchi, locali):
        if controllo:
            # Keep all battute of one room together so the correction has one before/after contour.
            _, candidato, tratti_portoni = garage_da_rivedere.setdefault(id(locale), (locale, replace(locale), []))
            area_prima = candidato.contorno.area
            includi_battuta_portone(candidato, a, (c1, c2), fronte, [l for l in locali if l is not locale])
            if candidato.contorno.area - area_prima > 1:
                tratti_portoni.append(LineString(a.estremi()))
        else:
            includi_battuta_portone(locale, a, (c1, c2), fronte, locali)
        if any(m.angolo == a.angolo and abs(m.centro - (c1 + c2) / 2) <= 4 and min(f, a.fine) - max(i, a.inizio) >= 0.75 * (a.fine - a.inizio) for m, i, f, _ in pertinenti):
            continue
        inserisci_varco(a, (c1, c2), muri, pertinenti)
    if controllo:
        portoni = [RiscontroDwg("portoni", tratti_cad[:8], locale, candidato.contorno)
                   for locale, candidato, tratti_cad in garage_da_rivedere.values() if tratti_cad]
        # Two different proposed contours of a single room would be alternatives, not additive fixes.
        riscontri = portoni + [r for r in riscontri if id(r.locale) not in garage_da_rivedere] + list(riscontri_sovrapposizioni(tratti))
    raccordi = raccordi_muratura(muri, tratti)
    collega_incroci(muri, pertinenti)
    muri.extend(raccordi)
    if not locali and not nomi and not aree:
        locali = contorni_senza_etichette(muri, pertinenti)
    locali.extend(completa_ingressi_aperti(locali, muri, tratti, stipiti + varchi, nomi, aree, pertinenti))
    if nomi and aree:
        locali.extend(stanze_dai_nomi(muri, pertinenti, locali, nomi, aree, zona))
    nomi_usati = {id(p) for l in locali for p, _, _ in l.etichette}
    testi = [(p, nome) for p, nome, _ in nomi if id(p) not in nomi_usati]
    testi.extend((p, f"{mq:g} m²".replace(".", ",")) for p, mq in aree if not any(
        mq == l.superficie and l.contorno.covers(p) for l in locali
    ))
    return PianoLetto(muri, pertinenti, locali, testi, leggi_quote(entita, zona, cm), assi_vicini(entita, zona, cm), linee, archi, riscontri[:48], fonti,
                      leggi_sigle_infissi(entita, zona, cm), leggi_sigle_unita(entita, zona, cm), len(nomi),
                      leggi_altezze_locali(entita, zona, cm))


def leggi_scale(letti, altezza):
    riconosciute = {}
    precedenti = []
    ordinati = sorted(letti, key=lambda l: l[1]["quota"])
    for i, (n, regione, piano, (ox, oy), allineamento) in enumerate(ordinati):
        prossimo = ordinati[i + 1] if i + 1 < len(ordinati) else None
        interpiano = prossimo[1]["quota"] - regione["quota"] if prossimo else altezza
        sopra = []
        in_griglia = allineamento in ("primo", "assi")
        if prossimo and in_griglia and prossimo[4] in ("primo", "assi"):
            dx, dy = ox - prossimo[3][0], oy - prossimo[3][1]
            sopra = [((p[0] + dx, p[1] + dy), (q[0] + dx, q[1] + dy), layer) for p, q, layer in prossimo[2].linee]
        scale = []
        for nome, alzate in [
            *(("Scala curva", s) for s in scale_curve(piano.archi, piano.linee, sopra)),
            *(("Scala rettilinea", s) for s in scale_rette(piano.linee)),
        ]:
            if not 6 <= len(alzate) <= 41:
                continue
            relative = [tuple((p[0] - ox, p[1] - oy) for p in a) for a in alzate]
            if any(sovrapposizione_scale(relative, a) >= 4 for a in (precedenti if in_griglia else [])):
                continue
            if any(sovrapposizione_scale(relative, a) >= 4 for _, a, _ in scale):
                continue
            scale.append((nome, relative, interpiano or altezza))
        riconosciute[n] = scale
        if in_griglia:
            precedenti = [a for _, a, _ in scale]
    return riconosciute


def elemento_scala(nome, alzate, dislivello, identificativo):
    xs, ys = zip(*(p for a in alzate for p in a))
    x, y, X, Y = min(xs), min(ys), max(xs), max(ys)
    cx, cy = (x + X) / 2, (y + Y) / 2
    return {
        "id": identificativo, "tipo": "scala", "etichetta": nome, "posizione": {"x": round(cx, 2), "y": round(cy, 2)},
        "rotazione": 0, "larghezza": round(X - x, 2), "profondita": round(Y - y, 2), "altezza": dislivello,
        "stato": "esistente", "origine": "da_documento", "origineMisure": {"altezza": "stimata"},
        "alzateCad": [[{"x": round((px - cx) / (X - x), 6), "y": round((py - cy) / (Y - y), 6)} for px, py in alzata] for alzata in alzate],
    }


def registra_tavola(documento):
    backend = recorder.Recorder()
    impostazioni = config.Configuration(
        background_policy=config.BackgroundPolicy.WHITE,
        color_policy=config.ColorPolicy.BLACK,
        hatch_policy=config.HatchPolicy.SHOW_OUTLINE,
        image_policy=config.ImagePolicy.IGNORE,
    )
    Frontend(RenderContext(documento), backend, config=impostazioni).draw_layout(documento.modelspace())
    return backend.player()


def layer_del_piano(tavola, rettangolo, cm, origine, limite):
    ox, oy = origine
    x, y, X, Y = rettangolo

    def xy(p):
        return round((p.x * cm - ox) * 100), round((p.y * cm - oy) * 100)

    def coordinate(p, origine=(0, 0)):
        return " ".join(format((v - o) / 100, ".2f").rstrip("0").rstrip(".") for v, o in zip(p, origine))

    def polilinea(punti, chiusa=False):
        primo, *vertici = map(xy, punti)
        d = ["M" + coordinate(primo)]
        for prima, dopo in zip([primo, *vertici], vertici):
            d.append("l" + coordinate(dopo, prima))
        return "".join(d) + ("Z" if chiusa else "")

    def percorso(p, chiuso=False):
        # I segmenti relativi rendono ripetibili le forme di quote e caratteri,
        # permettendo di comprimere gli stessi tracciati senza ridurre la precisione.
        corrente = xy(p.start)
        d = ["M" + coordinate(corrente)]
        for cmd in p.commands():
            fine = xy(cmd.end)
            if cmd.type == Command.MOVE_TO:
                d.append(("ZM" if chiuso else "M") + coordinate(fine))
            elif cmd.type == Command.LINE_TO:
                d.append("l" + coordinate(fine, corrente))
            elif cmd.type == Command.CURVE3_TO:
                d.append(f"q{coordinate(xy(cmd.ctrl), corrente)} {coordinate(fine, corrente)}")
            elif cmd.type == Command.CURVE4_TO:
                d.append(f"c{coordinate(xy(cmd.ctrl1), corrente)} {coordinate(xy(cmd.ctrl2), corrente)} {coordinate(fine, corrente)}")
            corrente = fine
        return "".join(d) + ("Z" if chiuso else "")

    gruppi = defaultdict(lambda: ([], []))
    caratteri = 0
    for record, props in tavola.recordings():
        limiti = record.bbox()
        if not limiti.has_data or limiti.extmax.x < x or limiti.extmin.x > X or limiti.extmax.y < y or limiti.extmin.y > Y:
            continue
        campitura = False
        if isinstance(record, recorder.PointsRecord):
            vertici = record.points.vertices()
            if not vertici:
                continue
            campitura = len(vertici) > 2
            d = polilinea(vertici if len(vertici) > 1 else [vertici[0], vertici[0]], campitura)
        elif isinstance(record, recorder.SolidLinesRecord):
            d = "".join(polilinea((a, b)) for a, b in recorder.take2(record.lines.vertices()))
        elif isinstance(record, recorder.PathRecord):
            d = percorso(record.path)
        elif isinstance(record, recorder.FilledPathsRecord):
            campitura = True
            d = "".join(percorso(p, True) for p in record.paths if len(p))
        else:
            continue
        if not d:
            continue
        caratteri += len(d)
        if caratteri > 6_000_000 or (len(gruppi) >= 256 and props.layer not in gruppi):
            return None
        gruppi[props.layer][int(campitura)].append(d)

    def compatta(tracciato):
        if len(tracciato) <= 8_192:
            return tracciato
        dati = gzip.compress(tracciato.encode("ascii"), compresslevel=5, mtime=0)
        compresso = "gz:" + base64.b64encode(dati).decode("ascii")
        return compresso if len(compresso) < len(tracciato) else tracciato

    layer = []
    dimensione = 0
    for nome, (linee, campiture) in sorted(gruppi.items(), key=lambda p: p[0].casefold()):
        linee, campiture = "".join(linee), "".join(campiture)
        if max(len(linee), len(campiture)) > 3_000_000:
            return None
        linee, campiture = compatta(linee), compatta(campiture)
        dimensione += len(linee) + len(campiture)
        if dimensione > limite:
            return None
        layer.append({"nome": nome, "linee": linee, "campiture": campiture})
    if layer:
        return {
            "riquadro": {"x": round(x * cm - ox, 3), "y": round(y * cm - oy, 3),
                         "larghezza": round((X - x) * cm, 3), "altezza": round((Y - y) * cm, 3)},
            "layer": layer,
        }


def ricostruisci(documento, opzioni):
    cm = UNITA_CM[opzioni["unita"]]
    altezza = opzioni["altezza"]
    layer = opzioni.get("layerMuri", "")
    nascosti = {layer.dxf.name.casefold() for layer in documento.layers if layer.is_off() or layer.is_frozen()}
    tipi = ("LINE", "LWPOLYLINE", "POLYLINE", "INSERT", "TEXT", "MTEXT", "ARC", "DIMENSION")
    entita = [e for e in documento.modelspace() if e.dxftype() in tipi
              and not e.dxf.get("invisible", 0) and e.dxf.layer.casefold() not in nascosti]
    letti, livelli, riepilogo = [], [], []
    base_prima, griglia_prima, muri_prima = None, None, None
    for numero, regione in enumerate(opzioni["piani"]):
        try:
            piano = leggi_piano(entita, regione, cm, layer, opzioni.get("controlloGeometria", False))
        except LetturaIncompleta as errore:
            raise LetturaIncompleta(f"{regione['nome']}. {errore}") from errore
        x, y, X, Y = [v * cm for v in regione["rettangolo"]]
        allineamento = "primo" if numero == 0 else "ritaglio"
        ox, oy = x, y
        if base_prima is None:
            base_prima, griglia_prima, muri_prima = (x, y), piano.griglia, piano.muri
        else:
            dx, dy = [scostamento(prima, attuale) for prima, attuale in zip(griglia_prima, piano.griglia)]
            if dx is not None and dy is not None:
                ox, oy = base_prima[0] + dx, base_prima[1] + dy
                allineamento = "assi"
            else:
                spostamento = allinea_pareti(muri_prima, piano.muri)
                if spostamento:
                    ox, oy = base_prima[0] + spostamento[0], base_prima[1] + spostamento[1]
                    allineamento = "pareti"
        letti.append((numero, regione, piano, (ox, oy), allineamento))
        riepilogo.append({
            "origine": [round(x - ox, 3), round(Y - oy, 3)],
            "larghezza": round(X - x, 3), "altezza": round(Y - y, 3), "allineamento": allineamento,
            "contorniDaVerificare": sum(not l.etichette and l.superficie is None for l in piano.locali),
            # Quanti nomi di stanza scritti sulla tavola sono finiti dentro una stanza chiusa.
            "nomiScritti": piano.nomi_letti,
            "nomiInStanze": len({id(p) for l in piano.locali for p, _, _ in l.etichette}),
        })

    scale = leggi_scale(letti, altezza)
    try:
        tavola = registra_tavola(documento)
    except (ezdxf.DXFError, ValueError, IndexError, TypeError, OverflowError):
        tavola = None
    altezza_richiesta = altezza
    legenda = leggi_legenda_unita(entita)
    quote_piani = sorted({r["quota"] for _, r, _, _, _ in letti})
    piano_terra = min((q for q in quote_piani if q >= 0), default=quote_piani[0] if quote_piani else None)
    for numero, regione, piano, (ox, oy), _ in letti:
        # I riscontri tra piani usano i tratti della tavola prima della normalizzazione per l’editor.
        accorpa_assi_sovrapposti(piano.muri, piano.aperture)
        altezza = altezza_del_piano(regione["quota"], quote_piani, altezza_richiesta)

        def pos(p):
            return {"x": round(p[0] - ox, 2), "y": round(p[1] - oy, 2)}

        def contorno(poligono):
            return [pos(p) for p in list(orient(poligono, sign=1).exterior.coords)[:-1]]

        prefisso = f"cad-{numero + 1}"
        id_muri = {id(m): f"{prefisso}-m{i}" for i, m in enumerate(piano.muri, 1)}
        stato = {"muri": [], "aperture": [], "locali": [], "elementi": [], "quote": [], "testi": []}
        linee = {id(m): LineString(m.estremi()) for m in piano.muri}
        bordo = union_all(list(linee.values())).convex_hull.boundary
        for m in piano.muri:
            p, q = m.estremi()
            esterno = linee[id(m)].interpolate(0.5, normalized=True).distance(bordo) <= 12
            stato["muri"].append({
                "id": id_muri[id(m)], "p1": pos(p), "p2": pos(q), "spessore": round(m.spessore, 2), "altezza": altezza,
                "tipo": "esterno" if esterno else "tramezzo", "stato": "esistente", "origine": "da_documento",
                "origineMisure": {"altezza": "stimata"}, "funzioneDaVerificare": True,
            })
        # Le sigle scritte accanto ai vani danno altezza e davanzale veri.
        sigle = misure_da_sigle([(Point(punto((a + b) / 2, m.centro, m.angolo)), b - a) for m, a, b, _ in piano.aperture], piano.sigle)
        for i, (m, a, b, tipo) in enumerate(piano.aperture, 1):
            larghezza = round(b - a, 2)
            if larghezza <= 0:
                continue
            sigla = sigle.get(i - 1)
            alta = sigla and (sigla["hf"] or sigla["hp"])
            if sigla and tipo == "finestra" and sigla["hp"] and not sigla["hs"]:
                tipo = "portafinestra"
            davanzale = (sigla["hs"] if sigla and sigla["hs"] and tipo == "finestra" else None)
            misure = {k: v for k, v in {"altezza": None if alta else "stimata", "davanzale": None if davanzale is not None or tipo != "finestra" and alta else "stimata"}.items() if v}
            stato["aperture"].append({
                "id": f"{prefisso}-a{i}", "muroId": id_muri[id(m)], "tipo": "porta" if tipo == "porta_doppia" else tipo,
                "offset": max(0, round(a - m.inizio, 2)), "larghezza": larghezza,
                "altezza": min(alta, altezza) if alta else min(120, altezza - 90) if tipo == "finestra" else min(210, altezza),
                "davanzale": davanzale if davanzale is not None else 90 if tipo == "finestra" else 0,
                "manovra": "battente" if tipo in ("porta", "porta_doppia", "portafinestra") else "nessuna",
                **({"ante": 2} if tipo == "porta_doppia" else {}),
                "stato": "esistente", "origine": "da_documento", **({"origineMisure": misure} if misure else {}),
            })
        unita = completa_unita_con_legenda(piano.locali, unita_dei_locali(piano.locali, piano.muri, piano.aperture, piano.sigle_unita), legenda)
        for i, l in enumerate(piano.locali, 1):
            etichette = sorted(l.etichette, key=lambda e: (e[0].x, -e[0].y))
            nome = " / ".join(dict.fromkeys(n for _, n, _ in etichette)) if etichette else (
                f"Locale da verificare {i}" if l.superficie is None else f"Locale {i}"
            )
            destinazione = next((tipo for _, _, tipo in etichette if tipo == "cucina"), etichette[0][2] if etichette else "altro")
            locale = {
                "id": f"{prefisso}-l{i}", "nome": nome, "destinazione": destinazione, "altezza": altezza,
                "contorno": contorno(l.contorno), "origine": "stimata",
            }
            if l.superficie is not None:
                locale["superficieDichiarataMq"] = l.superficie
            # «H 313» scritto nella stanza è la sua altezza netta (anche un controsoffitto).
            altezza_scritta = next((h for p, h in piano.altezze if l.contorno.covers(p)), None)
            if altezza_scritta and altezza_scritta <= altezza + 60:
                locale["altezza"] = altezza_scritta
            if i - 1 in unita:
                locale["unita"] = unita[i - 1]
            if l.aperto:
                locale["aperto"] = True
            stato["locali"].append(locale)
        stato["testi"] = [{"id": f"{prefisso}-t{i}", "posizione": pos((p.x, p.y)), "testo": nome} for i, (p, nome) in enumerate(piano.testi, 1)]
        stato["quote"] = [
            {
                "id": f"{prefisso}-q{i}", "p1": pos(p), "p2": pos(q), "scostamento": round(scostamento, 2),
                "origine": "da_documento", **({"testoOriginale": testo} if testo else {}),
            }
            for i, (p, q, scostamento, testo) in enumerate(piano.quote, 1)
        ]
        stato["elementi"] = [elemento_scala(nome, alzate, h, f"{prefisso}-s{i}") for i, (nome, alzate, h) in enumerate(scale[numero], 1)]
        # Le posizioni di questo controllo restano nelle coordinate del DXF.
        scale_in_tavola = scale_da_riscontrare(piano.linee, [
            [tuple((p[0] + ox, p[1] + oy) for p in a) for a in alzate] for _, alzate, _ in scale[numero]
        ])
        riepilogo[numero]["scaleDaVerificare"] = len(scale_in_tavola)
        stato["testi"].extend({
            "id": f"{prefisso}-scala-riscontro-{i}",
            "posizione": pos((p.x, p.y)),
            "testo": "Scala in tavola · verificare quote e verso",
        } for i, p in enumerate(scale_in_tavola, 1))
        # Il lotto della planimetria generale va sul piano terra, nelle sue coordinate.
        if regione["quota"] == piano_terra and layer:
            # Qui servono anche cerchi (alberi) e tratteggi (verde), che la lettura delle piante scarta.
            esterni = [e for e in documento.modelspace() if e.dxftype() in tipi + ("CIRCLE", "HATCH")
                       and not e.dxf.get("invisible", 0) and e.dxf.layer.casefold() not in nascosti]
            sistemazioni = leggi_sistemazioni(esterni, piano.muri, layer, cm)
            if sistemazioni:
                def contorno_area(poligono):
                    return [pos(p) for p in list(orient(poligono, sign=1).exterior.coords)[:-1]]
                aree = [{"id": f"{prefisso}-lotto", "tipo": "lotto",
                         "nome": "Lotto (da verificare)" if sistemazioni["lottoStimato"] else "Lotto",
                         "contorno": contorno_area(sistemazioni["lotto"]), "recinzione": True, "stato": "esistente"}]
                aree += [{"id": f"{prefisso}-verde{i}", "tipo": "prato", "nome": "Verde", "contorno": contorno_area(v)}
                         for i, v in enumerate(sistemazioni["verdi"], 1)]
                stato["aree"] = aree
                for i, vasca in enumerate(sistemazioni["piscine"], 1):
                    rettangolo = vasca.minimum_rotated_rectangle
                    vertici = list(rettangolo.exterior.coords)[:4]
                    lati = [LineString([vertici[k], vertici[(k + 1) % 4]]) for k in range(2)]
                    lungo = max(lati, key=lambda l: l.length)
                    angolo = degrees(atan2(lungo.coords[1][1] - lungo.coords[0][1], lungo.coords[1][0] - lungo.coords[0][0]))
                    centro = rettangolo.centroid
                    stato["elementi"].append({
                        "id": f"{prefisso}-piscina{i}", "tipo": "piscina", "posizione": pos((centro.x, centro.y)),
                        "rotazione": round(angolo % 180, 1), "larghezza": round(lungo.length), "profondita": round(min(l.length for l in lati)),
                        # Nello stato di fatto tutto è esistente: la variante decide cosa si costruisce.
                        "altezza": 140, "origine": "da_documento",
                    })
                for i, (punto_albero, diametro) in enumerate(sistemazioni["alberi"], 1):
                    stato["elementi"].append({
                        "id": f"{prefisso}-albero{i}", "tipo": "albero", "posizione": pos((punto_albero.x, punto_albero.y)),
                        "rotazione": 0, "larghezza": diametro, "profondita": diametro, "origine": "da_documento",
                    })
                riepilogo[numero]["lotto"] = {
                    "allineamento": sistemazioni["allineamento"], "stimato": sistemazioni["lottoStimato"], "verdi": len(sistemazioni["verdi"]),
                    "piscine": len(sistemazioni["piscine"]), "alberi": len(sistemazioni["alberi"]),
                }
        livello = {
            "id": prefisso, "nome": regione["nome"], "quota": regione["quota"], "fatto": stato, "proposte": [],
        }
        if tavola is not None:
            layer_tavola = layer_del_piano(tavola, regione["rettangolo"], cm, (ox, oy), 1_400_000 // len(letti))
            if layer_tavola:
                livello["tavolaDwg"] = layer_tavola
        if piano.riscontri:
            id_locali = {id(l): f"{prefisso}-l{i}" for i, l in enumerate(piano.locali, 1)}
            indice_fonti = STRtree([linea for linea, _, _ in piano.fonti])
            riscontri = []
            for i, riscontro in enumerate(piano.riscontri, 1):
                tratti = [{"a": pos(t.coords[0]), "b": pos(t.coords[-1]), "fonti": riferimenti_tratto(t, indice_fonti, piano.fonti)}
                          for t in riscontro.tratti]
                voce = {"id": f"{prefisso}-c{i}", "tipo": riscontro.tipo, "stato": "da_rivedere", "tratti": tratti}
                if riscontro.locale:
                    voce["modifica"] = {
                        "localeId": id_locali[id(riscontro.locale)],
                        "prima": contorno(riscontro.locale.contorno), "dopo": contorno(riscontro.dopo),
                    }
                riscontri.append(voce)
            livello["controlloDwg"] = riscontri
        livelli.append(livello)
    documento_letto = {"schema": 1, "unita": "cm", "scala": 100, "livelli": livelli}
    if legenda:
        documento_letto["unitaDichiarate"] = legenda
    return {"documento": documento_letto, "piani": riepilogo}


def main(source, request, target):
    try:
        documento = ezdxf.readfile(source)
    except ezdxf.DXFStructureError:
        documento, _ = recover.readfile(source)
    with open(request, encoding="utf-8") as file:
        opzioni = json.load(file)
    try:
        risultato = ricostruisci(documento, opzioni)
    except LetturaIncompleta as errore:
        risultato = {"errore": str(errore)}
    with open(target, "w", encoding="utf-8") as file:
        json.dump(risultato, file, ensure_ascii=False, allow_nan=False)


if __name__ == "__main__":
    main(*sys.argv[1:4])

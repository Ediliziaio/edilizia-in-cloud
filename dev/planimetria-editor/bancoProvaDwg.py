"""Banco di prova del convertitore DWG (24/11/2026).

Misura quanto la pianta ricostruita ritrova i dati che il progettista ha SCRITTO sulla tavola,
senza bisogno di un risultato preparato a mano: ogni DWG porta con sé il proprio controllo.

- nomi di stanza scritti che cadono dentro una stanza chiusa;
- stanze con la superficie scritta il cui contorno torna con quella superficie (±10%);
- unità della legenda («INT. 04 … (S.U. 44,00)») la cui superficie utile misurata torna (±12%);
- finestre e portefinestre con le misure vere (dalle sigle «L 170 / Hf 140 / Hs 94»).

Uso:
    python bancoProvaDwg.py tavola.dxf regioni.json [minimi.json]

`minimi.json` (facoltativo) fissa i punteggi sotto cui non si deve scendere, es.
{"nomi": 0.75, "superfici": 0.8, "unita": 0.5}: esce con 1 se uno peggiora. I DWG dei clienti non
stanno nel repository; i minimi stanno accanto a loro.
"""
import json
import sys

import ezdxf
from ezdxf import recover
from shapely.geometry import Polygon

from ricostruisciDxf import ricostruisci

COMUNI = ("atrio", "scal", "condomin", "androne", "pianerottol")
ESTERNI = ("balcone", "terrazz", "loggia", "portico", "giardino", "cortile")


def area(locale):
    return Polygon([(p["x"], p["y"]) for p in locale["contorno"]]).area / 10_000


def interno(locale):
    nome = locale["nome"].lower()
    return not any(p in nome for p in ESTERNI + COMUNI)


def punteggio(risultato):
    doc = risultato["documento"]
    piani = risultato["piani"]
    esito = {"piani": [], "unita": []}
    scritti = sum(p.get("nomiScritti", 0) for p in piani)
    trovati = sum(p.get("nomiInStanze", 0) for p in piani)
    con_superficie = tornano = finestre = misurate = 0
    misurata_per_unita = {}
    for livello, piano in zip(doc["livelli"], piani):
        locali = livello["fatto"]["locali"]
        for l in locali:
            dichiarata = l.get("superficieDichiarataMq")
            if dichiarata:
                con_superficie += 1
                tornano += abs(area(l) - dichiarata) <= dichiarata * 0.10
            if l.get("unita") and interno(l):
                misurata_per_unita[l["unita"]] = misurata_per_unita.get(l["unita"], 0) + area(l)
        for a in livello["fatto"]["aperture"]:
            if a["tipo"] in ("finestra", "portafinestra"):
                finestre += 1
                misurate += "altezza" not in a.get("origineMisure", {})
        esito["piani"].append({
            "nome": livello["nome"], "stanze": len(locali),
            "nomi": f'{piano.get("nomiInStanze", 0)}/{piano.get("nomiScritti", 0)}',
            "daVerificare": piano.get("contorniDaVerificare", 0),
        })
    dichiarate = doc.get("unitaDichiarate", [])
    unita_ok = 0
    for u in dichiarate:
        misurata = round(misurata_per_unita.get(u["nome"], 0), 2)
        ok = abs(misurata - u["suMq"]) <= u["suMq"] * 0.12
        unita_ok += ok
        esito["unita"].append({"nome": u["nome"], "dichiarataSU": u["suMq"], "misurata": misurata, "torna": ok})
    quota = lambda a, b: round(a / b, 3) if b else None  # noqa: E731
    esito["punteggi"] = {
        "nomi": quota(trovati, scritti),
        "superfici": quota(tornano, con_superficie),
        "unita": quota(unita_ok, len(dichiarate)),
        "finestreMisurate": quota(misurate, finestre),
    }
    esito["conteggi"] = {"nomi": [trovati, scritti], "superfici": [tornano, con_superficie],
                         "unita": [unita_ok, len(dichiarate)], "finestre": [misurate, finestre]}
    return esito


def main(tavola, regioni, minimi=None):
    try:
        documento = ezdxf.readfile(tavola)
    except ezdxf.DXFStructureError:
        documento, _ = recover.readfile(tavola)
    with open(regioni, encoding="utf-8") as f:
        opzioni = json.load(f)
    esito = punteggio(ricostruisci(documento, opzioni))
    print(json.dumps(esito, ensure_ascii=False, indent=1))
    if minimi:
        with open(minimi, encoding="utf-8") as f:
            soglie = json.load(f)
        peggiorati = {k: (esito["punteggi"].get(k), v) for k, v in soglie.items() if (esito["punteggi"].get(k) or 0) < v}
        if peggiorati:
            print("Peggiorato:", peggiorati, file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))

"""Rigenera il registro da due file XLSX pubblici (richiede openpyxl).

ISTAT: https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx
AgID, dataset Enti (CC BY 4.0): https://indicepa.gov.it/ipa-dati/dataset/enti

Uso: python3 scripts/planimetrie/aggiorna-comuni.py comuni.xlsx enti.xlsx
"""

import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from openpyxl import load_workbook


def righe(percorso):
    libro = load_workbook(percorso, read_only=True, data_only=True)
    try:
        iteratore = iter(libro.worksheets[0].values)
        intestazioni = [str(s).strip() for s in next(iteratore)]
        for riga in iteratore:
            yield dict(zip(intestazioni, riga))
    finally:
        libro.close()


def normalizza(testo):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFD", str(testo or "").lower()))


def sito_istituzionale(valore):
    if not isinstance(valore, str) or re.search(r"\s|[\\<>]", valore.strip()):
        return None
    testo = valore.strip()
    try:
        url = urlsplit(testo if "://" in testo else f"https://{testo}")
        if url.scheme not in {"http", "https"} or not url.hostname or url.netloc != url.hostname:
            return None
        dominio = url.hostname.encode("idna").decode()
    except (ValueError, UnicodeError):
        return None
    if not re.fullmatch(r"(?:[a-z0-9-]+\.)+[a-z]{2,}", dominio):
        return None
    if dominio.removeprefix("www.").split(".")[-2] in {"facebook", "instagram", "youtube", "wikipedia"}:
        return None
    return urlunsplit(("https", dominio, url.path.rstrip("/"), url.query, ""))


def genera(istat, ipa):
    enti = defaultdict(list)
    for r in righe(ipa):
        if r["Codice_Categoria"] != "L6":
            continue
        descrizione = str(r["Denominazione_ente"] or "").strip()
        if normalizza(descrizione) == "romacapitale":
            nome = "Roma"
        else:
            prefisso = re.match(r"^comune\s+(?:(?:di|del|della|dello|dei|delle)\s+|d['’])?", descrizione, re.I)
            if not prefisso:
                continue
            nome = descrizione[prefisso.end():]
        enti[normalizza(nome)].append(r)

    registro = defaultdict(list)
    codici = set()
    for r in righe(istat):
        codice = r["Codice Comune formato alfanumerico"]
        catasto = r["Codice Catastale del Comune"]
        regione = r["Denominazione Regione"]
        nome = r["Denominazione (Italiana e straniera)"]
        provincia = r["Sigla automobilistica"]
        if not codice or not re.fullmatch(r"\d{6}", codice) or codice in codici or not nome or not regione:
            raise ValueError(f"Comune ISTAT inatteso: {codice!r} {nome!r}")
        codici.add(codice)
        nomi = {normalizza(n) for n in [nome, r["Denominazione in italiano"], r["Denominazione altra lingua"]] if n}
        siti = set()
        for chiave in nomi:
            for e in enti[chiave]:
                identificato = (str(e["Codice_comune_ISTAT"] or "").zfill(6) == codice
                    or e["Codice_catastale_comune"] == catasto
                    or str(e["Codice_IPA"]).casefold() == f"c_{catasto}".casefold())
                if identificato and (sito := sito_istituzionale(e["Sito_istituzionale"])):
                    siti.add(sito)
        registro[regione].append([codice, nome, provincia, catasto, *(siti if len(siti) == 1 else [])])
    if len(registro) != 20 or len(codici) < 7800:
        raise ValueError("L’elenco ISTAT sembra incompleto.")
    return registro


if __name__ == "__main__":
    registro = genera(*sys.argv[1:])
    destinazione = Path(__file__).resolve().parents[2] / "src/lib/planimetrie/comuniUrbanistica.json"
    regioni = []
    for regione, comuni in sorted(registro.items()):
        righe_json = ",\n".join("    " + json.dumps(c, ensure_ascii=False) for c in sorted(comuni, key=lambda c: c[1].casefold()))
        regioni.append(f"  {json.dumps(regione, ensure_ascii=False)}: [\n{righe_json}\n  ]")
    destinazione.write_text("{\n" + ",\n".join(regioni) + "\n}\n", encoding="utf-8")
    print(f"{sum(map(len, registro.values()))} Comuni; {sum(len(c) == 5 for lista in registro.values() for c in lista)} siti IPA.")

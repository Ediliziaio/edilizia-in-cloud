"""Structural/coherence checks on the standalone manual, not runtime validation."""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("manual", type=Path)
args = parser.parse_args()
text = args.manual.read_text()
assert text.count("INIZIO DEL MASTER PROMPT") == text.count("FINE DEL MASTER PROMPT") == 1
body = text.split("INIZIO DEL MASTER PROMPT", 1)[1].split("FINE DEL MASTER PROMPT", 1)[0]
pattern = r"^([0-9]{1,2})\. ([A-ZÀ-Ý0-9 /'(),:;–—+.-]+)$"
headings = list(re.finditer(pattern, body, re.M))
assert [int(h[1]) for h in headings] == list(range(1, 94))
index = text.split("INDICE DEGLI 93 CAPITOLI", 1)[1].split("ISTRUZIONI PER L'USO", 1)[0]
assert [(int(n), title) for n, title in re.findall(pattern, index, re.M)] == [(int(h[1]), h[2]) for h in headings]
chapters = {int(h[1]): body[h.end():headings[i + 1].start() if i + 1 < len(headings) else len(body)] for i, h in enumerate(headings)}
root = Path(__file__).resolve().parent
cases = json.loads((root / "casi-accettazione.v2.json").read_text())["cases"]
assert [c["number"] for c in cases] == list(range(1, 171))
assert len({c["id"] for c in cases}) == 170
for chapter, start, end in [(67, 1, 47), (61, 48, 100), (79, 101, 140), (92, 141, 170)]:
    found = {int(n): title for n, title in re.findall(r"^([0-9]+)\. (.+)$", chapters[chapter], re.M) if start <= int(n) <= end}
    assert list(found) == list(range(start, end + 1)), (chapter, list(found))
    for n in range(start, end + 1):
        assert found[n].strip() == cases[n - 1]["requirement"].strip(), (chapter, n)
assert "93 capitoli, dieci piloti e 170 casi" in text
assert "INDICE DEGLI 87" not in text
assert "Versione 5.0" in text
assert "Colonne: B0 baseline" in chapters[88]
assert "non si stimano automaticamente come acquisti/percentuale fisica" in chapters[89]
assert "Created_at della commessa" in chapters[90]
assert "Sola manodopera" in chapters[91]
assert "non persiste automaticamente baseline" in chapters[93]
policy = json.loads((root / "performance-policy.v1.json").read_text())
assert policy["runtime_activation"] is False
assert len(policy["template_profiles"]) == 5
assert not any(c["status"] == "end_to_end_passed" for c in cases)
print("OK: 93 capitoli/indice, 170 casi coerenti col registro, dieci piloti, limiti runtime e policy espliciti; non è una certificazione esaustiva del dominio")

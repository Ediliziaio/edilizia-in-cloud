"""Controllo indipendente dei DXF delle esportazioni con ezdxf.

    python -I scripts/planimetrie/valida-dxf.py file.dxf [disegno.png]   # in un venv con ezdxf (e matplotlib per il png)

Legge il file in modo rigoroso, fa l'audit e stampa le entità per layer.
Esce con 1 se l'audit trova errori.
"""
import collections, json, sys
import ezdxf

path = sys.argv[1]
doc = ezdxf.readfile(path)
auditor = doc.audit()
print("versione:", doc.dxfversion, "| unità ($INSUNITS):", doc.header.get("$INSUNITS"), "| codepage:", doc.header.get("$DWGCODEPAGE"))
print("audit: errori =", len(auditor.errors), "| correzioni =", len(auditor.fixes))
for e in auditor.errors:
    print("  ERRORE", e.message)
conti = collections.Counter((e.dxf.layer, e.dxftype()) for e in doc.modelspace())
per_layer = collections.Counter()
for (l, _), n in conti.items():
    per_layer[l] += n
print("entità per layer:", json.dumps(dict(sorted(per_layer.items()))))
for (l, t), n in sorted(conti.items()):
    print(f"  {l:12s} {t:11s} {n}")
testi = [e.dxf.text for e in doc.modelspace().query("TEXT")]
print("testi con m²:", [t for t in testi if "m²" in t][:3])
if len(sys.argv) > 2:
    import matplotlib
    matplotlib.use("Agg")
    from ezdxf.addons.drawing import matplotlib as mpl
    mpl.qsave(doc.modelspace(), sys.argv[2], bg="#FFFFFF", dpi=150)
    print("disegno:", sys.argv[2])
sys.exit(1 if auditor.errors else 0)

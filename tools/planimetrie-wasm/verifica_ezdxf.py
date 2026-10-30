# Controllo indipendente di un DXF con ezdxf (Python): versione, audit, entità, layer, PNG.
# Uso (in un virtualenv con `pip install ezdxf matplotlib`):
#   python verifica_ezdxf.py uscita/trilocale.dxf uscita/trilocale.png
import sys, ezdxf
from ezdxf.addons.drawing import matplotlib as dm
from collections import Counter
path, png = sys.argv[1], sys.argv[2]
doc = ezdxf.readfile(path)
print("versione", doc.dxfversion, "INSUNITS", doc.header.get("$INSUNITS"))
aud = doc.audit()
print("audit: errori", len(aud.errors), "correzioni", len(aud.fixes))
for e in aud.errors[:10]: print("  E", e.message)
for f in aud.fixes[:10]: print("  F", f.message)
msp = doc.modelspace()
print("entità:", dict(Counter(e.dxftype() for e in msp)))
print("layer:", [l.dxf.name for l in doc.layers])
print("stili quota:", [s.dxf.name for s in doc.dimstyles])
dm.qsave(msp, png, bg="#FFFFFF", dpi=150)
print("png:", png)

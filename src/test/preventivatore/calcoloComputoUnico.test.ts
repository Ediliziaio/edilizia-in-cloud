import { describe, it, expect } from "vitest";
import { calcTotaliComputo, calcRigaImporto, calcMargineRiga, calcPrezzoVoce } from "@/lib/preventivi/calcoliComputo";
import * as bagni from "@/lib/bagni/calcoli";
import * as clm from "@/lib/climatizzazione/calcoli";
import * as ele from "@/lib/elettrico/calcoli";
import * as idr from "@/lib/termoidraulico/calcoli";
import * as pav from "@/lib/pavimenti/calcoli";
import * as pis from "@/lib/piscine/calcoli";
import * as rst from "@/lib/ristrutturazione/calcoli";
import * as tet from "@/lib/tetti/calcoli";

// Il calcolo del computo è uno solo: gli otto moduli lo rimandano, non ne hanno una copia propria.
const MODULI = { bagni, clm, ele, idr, pav, pis, rst, tet };

describe("calcolo del computo unico", () => {
  it.each(Object.entries(MODULI))("%s usa il calcolo condiviso", (_nome, m) => {
    expect(m.calcTotaliComputo).toBe(calcTotaliComputo);
    expect(m.calcRigaImporto).toBe(calcRigaImporto);
    expect(m.calcMargineRiga).toBe(calcMargineRiga);
    expect(m.calcPrezzoVoce).toBe(calcPrezzoVoce);
  });

  it("arrotonda riga per riga e le somme tornano al centesimo", () => {
    const riga = (q: number, p: number) => ({ capitolo_nome: "A", quantita: q, prezzo_unitario: p, sconto_pct: 0, costo_materiali: 1, costo_manodopera: 1 });
    // 3 × 0,335 = 1,005 → 1,01 a riga; tre righe uguali = 3,03, non 3,015 arrotondato a 3,02.
    const t = calcTotaliComputo([riga(3, 0.335), riga(3, 0.335), riga(3, 0.335)], { sconto_pct: 0, iva_pct: 10 });
    expect(t.sommaVoci).toBe(3.03);
    expect(t.imponibile + t.iva).toBeCloseTo(t.totale, 10);
  });

  it("senza beni significativi non divide l'IVA", () => {
    const t = calcTotaliComputo(
      [{ capitolo_nome: "A", quantita: 1, prezzo_unitario: 1000, sconto_pct: 0, costo_materiali: 500, costo_manodopera: 100 }],
      { sconto_pct: 0, iva_pct: 10, iva_beni_significativi: true },
    );
    expect(t.ivaRipartita).toBeUndefined();
    expect(t.totale).toBe(1100);
  });
});

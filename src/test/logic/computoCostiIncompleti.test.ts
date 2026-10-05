// Gli otto computi edili: una riga venduta senza costo non è un margine del 100%
// (05/10/2026). Il margine diventa «non disponibile» (null), come nel
// fotovoltaico e nei serramenti, e l'editor mostra «Costi incompleti».
import { describe, expect, it } from "vitest";
import * as bagni from "@/lib/bagni/calcoli";
import * as ristrutturazione from "@/lib/ristrutturazione/calcoli";
import * as tetti from "@/lib/tetti/calcoli";
import * as climatizzazione from "@/lib/climatizzazione/calcoli";
import * as elettrico from "@/lib/elettrico/calcoli";
import * as termoidraulico from "@/lib/termoidraulico/calcoli";
import * as pavimenti from "@/lib/pavimenti/calcoli";
import * as piscine from "@/lib/piscine/calcoli";

// Ogni modulo ha la propria copia: le stesse prove girano su tutte.
const MODULI = [
  ["bagni", bagni],
  ["ristrutturazione", ristrutturazione],
  ["tetti", tetti],
  ["climatizzazione", climatizzazione],
  ["elettrico", elettrico],
  ["termoidraulico", termoidraulico],
  ["pavimenti", pavimenti],
  ["piscine", piscine],
] as const;

const riga = (extra: Partial<bagni.ComputoRigaInput> = {}): bagni.ComputoRigaInput => ({
  capitolo_nome: "Opere", quantita: 1, prezzo_unitario: 0, sconto_pct: 0, costo_materiali: 0, costo_manodopera: 0, ...extra,
});

describe.each(MODULI)("costi incompleti nel computo (%s)", (_nome, m) => {
  it("una riga venduta senza costo: margine null, non il 100%", () => {
    const t = m.calcTotaliComputo(
      [
        riga({ quantita: 10, prezzo_unitario: 50, costo_materiali: 20, costo_manodopera: 10 }), // 500, costo 300
        riga({ quantita: 1, prezzo_unitario: 1000 }), // venduta senza costo
      ],
      { sconto_pct: 0, iva_pct: 22 },
    );
    expect(t.imponibile).toBe(1500);
    expect(t.costoTot).toBe(300);
    expect(t.margineEur).toBeNull();
    expect(t.marginePct).toBeNull();
    expect(t.costiCompleti).toBe(false);
    expect(t.righeSenzaCosto).toBe(1);
  });

  it("solo righe senza costo: niente margine (prima usciva 100%)", () => {
    const t = m.calcTotaliComputo([riga({ quantita: 2, prezzo_unitario: 300 })], { sconto_pct: 0, iva_pct: 10 });
    expect(t.margineEur).toBeNull();
    expect(t.marginePct).toBeNull();
  });

  it("costi completi: il margine c'è, come prima", () => {
    const t = m.calcTotaliComputo(
      [riga({ quantita: 10, prezzo_unitario: 50, costo_materiali: 20, costo_manodopera: 10 })],
      { sconto_pct: 10, iva_pct: 22 },
    );
    expect(t.costiCompleti).toBe(true);
    expect(t.margineEur).toBeCloseTo(150, 6); // 450 − 300
    expect(t.marginePct).toBeCloseTo(33.333, 2);
  });

  it("una riga a 0 € senza costo (nota, voce da completare) non toglie il margine", () => {
    const t = m.calcTotaliComputo(
      [riga({ quantita: 1, prezzo_unitario: 100, costo_materiali: 60 }), riga({ quantita: 1, prezzo_unitario: 0 })],
      { sconto_pct: 0, iva_pct: 22 },
    );
    expect(t.margineEur).toBeCloseTo(40, 6);
  });

  it("col prezzo scritto a mano conta ogni riga con una quantità", () => {
    const completo = m.calcTotaliComputo([riga({ quantita: 2, costo_materiali: 1000, costo_manodopera: 500 })], {
      sconto_pct: 0, iva_pct: 22, prezzo_manuale: 5000,
    });
    expect(completo.margineEur).toBe(2000);
    const incompleto = m.calcTotaliComputo(
      [riga({ quantita: 2, costo_materiali: 1000 }), riga({ quantita: 3 })],
      { sconto_pct: 0, iva_pct: 22, prezzo_manuale: 5000 },
    );
    expect(incompleto.margineEur).toBeNull();
    expect(incompleto.righeSenzaCosto).toBe(1);
  });

  it("calcMargineRiga: senza costo null, con costo importo − costo × quantità", () => {
    expect(m.calcMargineRiga(riga({ quantita: 3, prezzo_unitario: 100 }))).toEqual({ margineEur: null, marginePct: null });
    expect(m.calcMargineRiga(riga({ quantita: 3, prezzo_unitario: 100, costo_materiali: 40, costo_manodopera: 20 })))
      .toEqual({ margineEur: 120, marginePct: 40 });
    // Senza importo non c'è percentuale; il costo resta.
    expect(m.calcMargineRiga(riga({ quantita: 2, costo_manodopera: 15 }))).toEqual({ margineEur: -30, marginePct: null });
  });
});

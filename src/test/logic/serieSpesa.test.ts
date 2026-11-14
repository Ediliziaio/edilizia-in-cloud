import { describe, expect, it } from "vitest";
import { serieSpesaPianoReale } from "@/lib/orders/generali/serieSpesa";
import type { RigaReale, VocePiano } from "@/lib/orders/generali/pianoConti";

/** «Speso contro piano» della Panoramica (14/11/2026). */
let n = 0;
const voce = (categoria: string, importo: number, mese: string | null, durataMesi = 1, nota: string | null = null): VocePiano => ({
  id: `v${++n}`, tipo: "costo", categoria: categoria as VocePiano["categoria"], descrizione: categoria, importo, mese, durataMesi,
  figliaId: null, categorieCosto: [], aFinire: null, nota, ordine: n, origineId: null,
});
const reale = (importo: number, data: string | null): RigaReale => ({
  id: `r${++n}`, fonte: "costo", rifId: null, orderId: "g", data, tipo: "costo", chiave: "terreno", categoria: null, descrizione: "x", importo, voceId: null,
});

describe("speso contro piano", () => {
  it("cumula piano e speso mese per mese; lo speso si ferma a oggi", () => {
    const s = serieSpesaPianoReale(
      [voce("terreno", 300, "2026-10"), voce("costruzione", 600, "2026-12", 3), { ...voce("vendite", 999, "2026-10"), tipo: "ricavo" }],
      [reale(100, "2026-09-15"), reale(250, "2026-11-02")],
      "2026-11-14",
    );
    expect(s.punti.map((p) => [p.mese, p.piano, p.speso])).toEqual([
      ["2026-09", 0, 100], ["2026-10", 300, 100], ["2026-11", 300, 350],
      ["2026-12", 500, null], ["2027-01", 700, null], ["2027-02", 900, null],
    ]);
    expect([s.spesoOggi, s.pianoOggi, s.differenza, s.pianoTotale]).toEqual([350, 300, 50, 900]);
  });

  it("conta le stime mancanti con la stessa regola del percorso, e non inventa punti senza dati", () => {
    const s = serieSpesaPianoReale([voce("oneri", 0, "2027-01", 1, "[EIC:DA_STIMARE]"), voce("allacci", 0, "2027-01")], [], "2026-11-01");
    expect(s.vociSenzaImporto).toBe(1);
    expect(s.punti).toEqual([]);
  });
});

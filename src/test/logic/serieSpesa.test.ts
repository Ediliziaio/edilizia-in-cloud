import { describe, expect, it } from "vitest";
import { serieConfronto } from "@/lib/orders/generali/serieSpesa";
import type { RigaReale, VocePiano } from "@/lib/orders/generali/pianoConti";

/** «Previsto contro reale» della Panoramica: costi, ricavi, margine (14/11/2026). */
let n = 0;
const voce = (categoria: string, importo: number, mese: string | null, durataMesi = 1, nota: string | null = null, tipo: "costo" | "ricavo" = "costo"): VocePiano => ({
  id: `v${++n}`, tipo, categoria: categoria as VocePiano["categoria"], descrizione: categoria, importo, mese, durataMesi,
  figliaId: null, categorieCosto: [], aFinire: null, nota, ordine: n, origineId: null,
});
const reale = (importo: number, data: string | null, tipo: "costo" | "ricavo" = "costo"): RigaReale => ({
  id: `r${++n}`, fonte: "costo", rifId: null, orderId: "g", data, tipo, chiave: "terreno", categoria: null, descrizione: "x", importo, voceId: null,
});

describe("previsto contro reale", () => {
  it("cumula costi, ricavi e margine mese per mese; il reale si ferma a oggi", () => {
    const s = serieConfronto(
      [voce("terreno", 300, "2026-10"), voce("costruzione", 600, "2026-12", 3), voce("vendite", 1000, "2027-01", 1, null, "ricavo")],
      [reale(100, "2026-09-15"), reale(250, "2026-11-02"), reale(80, "2026-11-20", "ricavo")],
      "2026-11-14",
    );
    expect(s.punti.map((p) => [p.mese, p.costiPiano, p.costiReale, p.ricaviPiano, p.ricaviReale, p.marginePiano, p.margineReale])).toEqual([
      ["2026-09", 0, 100, 0, 0, 0, -100],
      ["2026-10", 300, 100, 0, 0, -300, -100],
      ["2026-11", 300, 350, 0, 80, -300, -270],
      ["2026-12", 500, null, 0, null, -500, null],
      ["2027-01", 700, null, 1000, null, 300, null],
      ["2027-02", 900, null, 1000, null, 100, null],
    ]);
    expect(s.totali.costi).toEqual({ realeOggi: 350, pianoOggi: 300, pianoTotale: 900, differenza: 50 });
    expect(s.totali.ricavi).toEqual({ realeOggi: 80, pianoOggi: 0, pianoTotale: 1000, differenza: 80 });
    expect(s.totali.margine).toEqual({ realeOggi: -270, pianoOggi: -300, pianoTotale: 100, differenza: 30 });
  });

  it("conta le stime mancanti e i ricavi senza mese, e non inventa punti senza dati", () => {
    const s = serieConfronto(
      [voce("oneri", 0, "2027-01", 1, "[EIC:DA_STIMARE]"), voce("allacci", 0, "2027-01"), voce("vendite", 500, null, 1, null, "ricavo")],
      [],
      "2026-11-01",
    );
    expect(s.vociSenzaImporto).toBe(1);
    expect(s.ricaviSenzaMese).toBe(1);
    expect(s.punti).toEqual([]);
  });
});

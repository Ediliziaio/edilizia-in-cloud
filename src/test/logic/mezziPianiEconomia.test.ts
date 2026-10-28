import { describe, it, expect } from "vitest";
import { economiaPianiMezzi, type FontiMezzi } from "@/lib/mezzi/economiaPiani";
import type { PianoMezzo, CostoPianoMezzo } from "@/lib/mezzi/pianoCantiere";
const piano = (id = "p"): PianoMezzo => ({
  id,
  company_id: "c",
  order_id: "o",
  mezzo_id: "m",
  fase_ids: [],
  dal: "2026-11-02",
  al: "2026-11-06",
  quantita: 1,
  note: null,
  annullato: false,
});
const costo: CostoPianoMezzo = {
  tariffa: 100,
  base: "giorno",
  extra: 70,
  fornitore: null,
};
const fonti: FontiMezzi = {
  fonti: [
    {
      id: "f",
      tipo: "costo",
      nome: "Fattura noleggio",
      importo: 570,
      supplier_id: null,
      data: null,
    },
  ],
  legami: [
    { id: "l", piano_id: "p", fonte_id: "f", tipo: "costo", importo: 570 },
  ],
};
describe("Economia mezzi: budget e classificazione del consuntivo", () => {
  it("570 previsti e 570 in fattura restano due valori a confronto, mai 1140 di spesa", () => {
    const e = economiaPianiMezzi([piano()], { p: costo }, fonti);
    expect(e.previsto).toBe(570);
    expect(e.registrato).toBe(570);
    expect(e.righe[0].scostamento).toBe(0);
    expect(e).not.toHaveProperty("costiDaAggiungere");
  });
  it("spesa parziale non modifica il preventivo", () => {
    const e = economiaPianiMezzi(
      [piano()],
      { p: costo },
      { ...fonti, legami: [{ ...fonti.legami[0], importo: 200 }] },
    );
    expect(e.previsto).toBe(570);
    expect(e.registrato).toBe(200);
  });
  it("quote dello stesso documento su più risorse sommate una volta", () => {
    const e = economiaPianiMezzi(
      [piano(), piano("p2")],
      { p: costo, p2: costo },
      {
        ...fonti,
        legami: [
          { ...fonti.legami[0], importo: 300 },
          { ...fonti.legami[0], id: "l2", piano_id: "p2", importo: 270 },
        ],
      },
    );
    expect(e.registrato).toBe(570);
    expect(e.invalidi).toBe(0);
  });
  it("se una fattura/nota credito riduce la fonte sotto le quote avvisa, non inventa il costo", () => {
    const e = economiaPianiMezzi(
      [piano()],
      { p: costo },
      { ...fonti, fonti: [{ ...fonti.fonti[0], importo: 400 }] },
    );
    expect(e.invalidi).toBe(1);
    expect(e.registrato).toBe(0);
  });
  it("costo spostato su altra commessa o OdA annullato richiede riconciliazione", () => {
    const e = economiaPianiMezzi(
      [piano()],
      { p: costo },
      { fonti: [], legami: fonti.legami },
    );
    expect(e.invalidi).toBe(1);
  });
  it("annullare il piano non cancella le spese realmente sostenute", () => {
    const e = economiaPianiMezzi(
      [{ ...piano(), annullato: true }],
      { p: costo },
      fonti,
    );
    expect(e.previsto).toBe(0);
    expect(e.registrato).toBe(570);
  });
  it("budget aperto non diventa zero noto", () => {
    const e = economiaPianiMezzi(
      [{ ...piano(), al: null }],
      { p: costo },
      fonti,
    );
    expect(e.righe[0].previsto).toBeNull();
    expect(e.senzaPreventivo).toBe(1);
  });
  it("costi oltre preventivo visibili come scostamento", () => {
    const e = economiaPianiMezzi(
      [piano()],
      { p: costo },
      {
        fonti: [{ ...fonti.fonti[0], importo: 700 }],
        legami: [{ ...fonti.legami[0], importo: 700 }],
      },
    );
    expect(e.righe[0].scostamento).toBe(130);
  });
  it("fonti OdA classificate come unico importo quando la fattura sostituisce il valore ordine", () => {
    const e = economiaPianiMezzi(
      [piano()],
      { p: costo },
      {
        fonti: [{ ...fonti.fonti[0], tipo: "oda", importo: 600 }],
        legami: [{ ...fonti.legami[0], tipo: "oda", importo: 570 }],
      },
    );
    expect(e.registrato).toBe(570);
    expect(e.invalidi).toBe(0);
  });
});

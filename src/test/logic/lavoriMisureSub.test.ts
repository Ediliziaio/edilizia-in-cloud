import { describe, it, expect } from "vitest";
import {
  importoVociSub,
  riepilogoVoceSub,
  misurePerSalSub,
  quantitaSub,
  type MisuraSub,
  type VoceSub,
} from "@/lib/subappaltatori/lavoriMisure";
const voce: VoceSub = {
  id: "v",
  fase_id: null,
  descrizione: "Bagno",
  base: "corpo",
  unita: "quota",
  quantita: 1,
  prezzo: 1000,
};
const m = (id: string, patch: Partial<MisuraSub> = {}): MisuraSub => ({
  id,
  quadro_id: "q",
  voce_id: "v",
  data_rilievo: "2026-10-27",
  quantita_dichiarata: 0.6,
  quantita_riconosciuta: 0.5,
  prezzo_unitario: 1000,
  importo_riconosciuto: 500,
  stato: "riconosciuta",
  riferimento: "Rilievo DEMO",
  nota_verifica: "Verifica DEMO",
  nota_annullamento: null,
  revisione: 2,
  sal_id: null,
  created_at: "2026-10-27",
  verificato_il: "2026-10-27",
  ...patch,
});
describe("lavori e misure subappalto", () => {
  it("separa dichiarato, riconosciuto e contabilizzato senza usare le percentuali del calendario", () => {
    const r = riepilogoVoceSub(voce, [
      m("1", { sal_id: "sal" }),
      m("2", { quantita_riconosciuta: 0.2, importo_riconosciuto: 200 }),
      m("3", {
        stato: "dichiarata",
        quantita_riconosciuta: null,
        importo_riconosciuto: null,
      }),
      m("4", { stato: "annullata" }),
    ]);
    expect(r.riconosciuta).toBe(0.7);
    expect(r.residua).toBeCloseTo(0.3);
    expect(r.importoRiconosciuto).toBe(700);
    expect(r.nonContabilizzato).toBe(200);
    expect(r.daVerificare).toBe(1);
  });
  it("somma importi di basi diverse, senza sommare mq con ore o quote", () => {
    expect(
      importoVociSub([
        voce,
        {
          ...voce,
          id: "mq",
          base: "misura",
          unita: "mq",
          quantita: 12.5,
          prezzo: 25,
        },
        {
          ...voce,
          id: "ore",
          base: "ore",
          unita: "h",
          quantita: 8,
          prezzo: 30,
        },
      ]),
    ).toBe(1552.5);
    expect(quantitaSub(0.25, voce)).toBe("25%");
    expect(quantitaSub(8, { base: "ore", unita: "h" })).toBe("8 h");
  });
  it("esclude SAL doppi, quantità non riconosciute e righe già contabilizzate", () => {
    const righe = [
      m("1"),
      m("2", { sal_id: "sal" }),
      m("3", { stato: "dichiarata" }),
    ];
    expect(misurePerSalSub(righe, ["1"]).importo).toBe(500);
    for (const ids of [[], ["1", "1"], ["2"], ["3"], ["inesistente"]])
      expect(() => misurePerSalSub(righe, ids)).toThrow();
  });
});

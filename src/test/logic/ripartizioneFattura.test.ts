import { describe, expect, it } from "vitest";
import { fatturaVerificata, problemaRipartizione, quoteDaVoci, quoteDelCosto, quoteLordeInNette, residuoDaAssegnare, vociFattura } from "@/lib/fatturazione/ripartizioneFattura";

describe("verifica di una fattura", () => {
  it("chi sceglie vince, in tutti e due i sensi", () => {
    expect(fatturaVerificata({ stato: "letta" })).toBe(false);
    expect(fatturaVerificata({ stato: "contabilizzata" })).toBe(true);
    expect(fatturaVerificata({ stato: "contabilizzata", verifica_manuale: "da_verificare" })).toBe(false);
    expect(fatturaVerificata({ stato: "letta", verifica_manuale: "verificata" })).toBe(true);
  });
});

describe("quote di un costo", () => {
  it("legge la ripartizione, o la commessa a cui è intestato", () => {
    expect(quoteDelCosto({ order_id: "a", allocations: [] })).toEqual([{ order_id: "a", pct: 100 }]);
    expect(quoteDelCosto({ order_id: null, allocations: [{ order_id: "a", pct: 40, importo: 400, righe: [1] }, { order_id: "b", pct: 60 }] })).toEqual([
      { order_id: "a", pct: 40, importo: 400, righe: [1] }, { order_id: "b", pct: 60 },
    ]);
    expect(quoteDelCosto({ order_id: null, allocations: null })).toEqual([]);
    expect(quoteDelCosto(null)).toEqual([]);
  });
});

describe("voci della fattura", () => {
  const voci = vociFattura([
    { numero_linea: 1, descrizione: "Moduli", imponibile: 1000 },
    { numero_linea: 2, descrizione: "Trasporto", imponibile: 200 },
    { numero_linea: 3, descrizione: "Anticipo", imponibile: -100 },
    { numero_linea: 4, descrizione: "Nota", imponibile: 0 },
  ]);
  it("salta le voci a zero e tiene gli anticipi", () => expect(voci.map((v) => v.numero)).toEqual([1, 2, 3]));
  it("somma per commessa, anticipi compresi", () => {
    expect(quoteDaVoci(voci, { 1: "a", 2: "b", 3: "a" })).toEqual([{ order_id: "a", importo: 900, righe: [1, 3] }, { order_id: "b", importo: 200, righe: [2] }]);
  });
  it("una voce senza commessa resta fuori", () => expect(quoteDaVoci(voci, { 1: "a" })).toEqual([{ order_id: "a", importo: 1000, righe: [1] }]));
});

describe("controlli prima di salvare", () => {
  it("dice cosa non va", () => {
    expect(problemaRipartizione([{ order_id: "", importo: 1 }], 100)).toMatch(/Scegli/);
    expect(problemaRipartizione([{ order_id: "a", importo: 0 }], 100)).toMatch(/importo/);
    expect(problemaRipartizione([{ order_id: "a", importo: 1 }, { order_id: "a", importo: 1 }], 100)).toMatch(/due volte/);
    expect(problemaRipartizione([{ order_id: "a", importo: 101 }], 100)).toMatch(/superano/);
    expect(problemaRipartizione([{ order_id: "a", importo: 60 }, { order_id: "b", importo: 40 }], 100)).toBeNull();
    expect(problemaRipartizione([], 100)).toBeNull();
  });
  it("il residuo: una nota di credito ha l'imponibile negativo", () => {
    expect(residuoDaAssegnare([{ order_id: "a", importo: 60 }], 100)).toBe(40);
    expect(residuoDaAssegnare([{ order_id: "a", importo: 60 }], -100)).toBe(40);
  });
});

describe("dal totale con IVA all'imponibile", () => {
  it("converte in proporzione", () => {
    expect(quoteLordeInNette([{ order_id: "a", importo: 610 }], 1220, 1000)).toEqual([{ order_id: "a", importo: 500 }]);
  });
  it("se è tutto assegnato i centesimi tornano esatti", () => {
    const q = quoteLordeInNette([{ order_id: "a", importo: 333.33 }, { order_id: "b", importo: 333.33 }, { order_id: "c", importo: 333.34 }], 1000, 819.67);
    expect(q.reduce((n, x) => n + x.importo, 0)).toBeCloseTo(819.67, 2);
  });
  it("le altre informazioni restano, e senza importi non inventa", () => {
    expect(quoteLordeInNette([{ order_id: "a", importo: 122, righe: [1] }], 244, 200)[0]).toEqual({ order_id: "a", importo: 100, righe: [1] });
    expect(quoteLordeInNette([{ order_id: "a", importo: 5 }], 0, 0)).toEqual([{ order_id: "a", importo: 5 }]);
  });
});

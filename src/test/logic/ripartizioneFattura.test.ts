import { describe, expect, it } from "vitest";
import { bolleDellaFattura, fatturaVerificata, problemaRipartizione, quoteDaVoci, quoteDelCosto, quoteLordeInNette, residuoDaAssegnare, vociFattura } from "@/lib/fatturazione/ripartizioneFattura";

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

describe("fattura divisa bolla per bolla", () => {
  const voci = [
    { numero: 44, descrizione: "CLS RCK 30", imponibile: 952 },
    { numero: 45, descrizione: "126 CLS RCK35 S4 XC1XC2", imponibile: 468 },
    { numero: 46, descrizione: "Pompa", imponibile: 300 },
    { numero: 47, descrizione: "Cubiere", imponibile: 10 },
    { numero: 48, descrizione: "Trasporto", imponibile: 50 },
  ];
  const ddt = [
    { testo: "2026-DT05-0004727", data: "2026-09-15", righe: [45] },
    { testo: "2026-DT03-0001841", data: "2026-09-16", righe: [46, 47, 46] },
    { testo: "2026-DT01-0004164", data: "2026-09-09", righe: [44, 48] },
    { testo: "2026-DT01-0004165", data: "2026-09-09", righe: [48] },
  ];
  it("raggruppa le voci per bolla e propone la commessa della bolla caricata ", () => {
    const { bolle, vociSenzaBolla } = bolleDellaFattura(voci, ddt, [
      { numero_ddt: "2026-DT05-0004727", data_ddt: "2026-09-15", ddt_ricezione_id: "b1", order_id: "cantiere" },
      { numero_ddt: "2026-DT03-0001841", data_ddt: "2026-09-16", ddt_ricezione_id: null, order_id: null },
    ]);
    expect(bolle.map((b) => [b.numero, b.voci, b.imponibile, b.commessaProposta])).toEqual([
      ["2026-DT05-0004727", [45], 468, "cantiere"],
      ["2026-DT03-0001841", [46, 47], 310, null],
      // La 48 è citata da due bolle: non si sa di chi sia.
      ["2026-DT01-0004164", [44], 952, null],
    ]);
    expect(vociSenzaBolla).toEqual([48]);
  });
  it("scegliere la commessa di una bolla assegna tutte le sue voci", () => {
    const { bolle } = bolleDellaFattura(voci, ddt);
    const scelte = Object.fromEntries(bolle[1].voci.map((n) => [n, "c1"]));
    expect(quoteDaVoci(voci, scelte)).toEqual([expect.objectContaining({ order_id: "c1", importo: 310, righe: [46, 47] })]);
  });
  it("DDT senza righe indicate: niente da raggruppare", () => {
    expect(bolleDellaFattura(voci, [{ testo: "1", data: null, righe: [] }]).bolle).toEqual([]);
  });
});

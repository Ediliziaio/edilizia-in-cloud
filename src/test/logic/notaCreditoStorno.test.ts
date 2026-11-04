// @vitest-environment jsdom
/**
 * Nota di credito ricevuta → fattura da stornare (04/11/2026, caso F). I numeri dei riferimenti vengono da note vere
 * di Bonarrigo e Renova. Il comportamento su rate e costo sta nel database ed è provato in transazione annullata.
 */
import { describe, expect, it } from "vitest";
import {
  capienza, importoNotaCredito, numeroNormalizzato, problemaQuote, proponiStorno, quotaIniziale, riassumiStorni, riferimentiDaXml,
  type FatturaCandidata,
} from "@/lib/fatturazione/notaCreditoStorno";
import type { LettoreXml } from "../../../supabase/functions/_shared/fatturapaReader";

const f = (id: string, numero: string, totale: number, extra: Partial<FatturaCandidata> = {}): FatturaCandidata =>
  ({ id, numero_fattura: numero, data_fattura: "2026-01-10", totale_documento: totale, ...extra });

describe("il numero della fattura citata", () => {
  it.each([
    ["FATTURA nr. 20/2026", "20/2026"],
    ["Fattura n. 20/2026", "20/2026"],
    ["FT 12", "12"],
    ["n° 7/FE", "7/FE"],
    ["FPR 13/26", "FPR13/26"],
    ["  0916534503 ", "0916534503"],
    ["ITMP/25/02647", "ITMP/25/02647"],
  ])("%s → %s", (scritto, atteso) => expect(numeroNormalizzato(scritto)).toBe(atteso));

  it("gli zeri davanti non si toccano: 0012 e 12 possono essere fatture diverse", () => {
    expect(numeroNormalizzato("0012")).not.toBe(numeroNormalizzato("12"));
  });
  it("una sigla non è una parola da togliere", () => {
    expect(numeroNormalizzato("NC 12")).toBe("NC12");
    expect(numeroNormalizzato("FTE12")).toBe("FTE12");
  });
});

describe("la proposta non collega mai una fattura incerta", () => {
  it("riferimento univoco: la propone con l'importo della nota", () => {
    const r = proponiStorno([{ numero: "FPR 13/26", data: null }], [f("a", "FPR 13/26", 1352), f("b", "FPR 14/26", 500)], { importo: 1352 });
    expect(r).toEqual({ proposte: [{ fatturaId: "a", importo: 1352 }], irrisolti: [] });
  });
  it("trova anche chi scrive «FATTURA nr. 20/2026» nel riferimento", () => {
    const r = proponiStorno([{ numero: "FATTURA nr. 20/2026", data: null }], [f("a", "20/2026", 1000)], { importo: 1000 });
    expect(r.proposte).toEqual([{ fatturaId: "a", importo: 1000 }]);
  });
  it("non c'è: nessuna proposta, e lo dice", () => {
    const r = proponiStorno([{ numero: "492", data: null }], [f("a", "491", 100)], { importo: 100 });
    expect(r.proposte).toEqual([]);
    expect(r.irrisolti).toEqual([{ riferimento: { numero: "492", data: null }, motivo: "non_trovata", candidati: [] }]);
  });
  it("due fatture con lo stesso numero e nessuna data: scegli tu", () => {
    const r = proponiStorno([{ numero: "1", data: null }], [f("a", "1", 100, { data_fattura: "2025-02-01" }), f("b", "1", 100, { data_fattura: "2026-02-01" })], { importo: 100 });
    expect(r.proposte).toEqual([]);
    expect(r.irrisolti[0]).toMatchObject({ motivo: "piu_fatture", candidati: ["a", "b"] });
  });
  it("la data del riferimento scioglie il dubbio", () => {
    const r = proponiStorno([{ numero: "1", data: "2026-02-01" }], [f("a", "1", 100, { data_fattura: "2025-02-01" }), f("b", "1", 100, { data_fattura: "2026-02-01" })], { importo: 100 });
    expect(r.proposte).toEqual([{ fatturaId: "b", importo: 100 }]);
  });
  it("una fattura successiva alla nota non può essere quella stornata", () => {
    const r = proponiStorno([{ numero: "1", data: null }], [f("a", "1", 100, { data_fattura: "2025-02-01" }), f("b", "1", 100, { data_fattura: "2026-12-01" })], { importo: 100, data: "2026-03-01" });
    expect(r.proposte).toEqual([{ fatturaId: "a", importo: 100 }]);
  });
  it("niente riferimenti, niente proposte", () => {
    expect(proponiStorno([], [f("a", "1", 100)], { importo: 100 })).toEqual({ proposte: [], irrisolti: [] });
  });
  it("la data non basta da sola: con la stessa data resta il dubbio", () => {
    const r = proponiStorno([{ numero: "1", data: "2026-01-10" }], [f("a", "1", 100), f("b", "1 ", 50)], { importo: 100 });
    expect(r.irrisolti[0].motivo).toBe("piu_fatture");
  });
});

describe("gli importi proposti", () => {
  it("una nota più grande della fattura non la sfonda: il resto rimane da assegnare", () => {
    // Nota 67/E da 6.722,20 che cita la 57/E da 1.769,00: caso vero.
    const r = proponiStorno([{ numero: "57/E", data: null }], [f("a", "57/E", 1769)], { importo: 6722.2 });
    expect(r.proposte).toEqual([{ fatturaId: "a", importo: 1769 }]);
  });
  it("più riferimenti: coprono la nota nell'ordine", () => {
    const r = proponiStorno([{ numero: "A", data: null }, { numero: "B", data: null }], [f("a", "A", 100), f("b", "B", 100)], { importo: 150 });
    expect(r.proposte).toEqual([{ fatturaId: "a", importo: 100 }, { fatturaId: "b", importo: 50 }]);
  });
  it("cinque note sulla stessa fattura: tiene conto di quanto è già stornato", () => {
    const fattura = f("a", "V25215599", 667.95, { stornato: 549 });
    expect(capienza(fattura)).toBe(118.95);
    expect(proponiStorno([{ numero: "V25215599", data: null }], [fattura], { importo: 366 }).proposte).toEqual([{ fatturaId: "a", importo: 118.95 }]);
  });
  it("una fattura già stornata del tutto non si propone", () => {
    expect(proponiStorno([{ numero: "A", data: null }], [f("a", "A", 100, { stornato: 100 })], { importo: 50 }).proposte).toEqual([]);
  });
  it("il segno della nota non conta", () => {
    expect(proponiStorno([{ numero: "A", data: null }], [f("a", "A", 100)], { importo: -31.39 }).proposte[0].importo).toBe(31.39);
  });
  it("a mano: la quota è quanto manca alla nota, fino a quanto la fattura può ricevere", () => {
    expect(quotaIniziale(f("a", "A", 100), 150, 0)).toBe(100);
    expect(quotaIniziale(f("a", "A", 100), 150, 100)).toBe(50);
    expect(quotaIniziale(f("a", "A", 100), 150, 150)).toBe(0);
  });
});

describe("quanto vale una nota, con entrambi i segni", () => {
  it.each([
    [{ totale_documento: 61 }, 61],
    [{ totale_documento: -61 }, 61],
    [{ totale_documento: "-31.39" }, 31.39],
    [{ totale_documento: 0, imponibile_totale: -50, iva_totale: -11 }, 61],
    [{ totale_documento: 122, ritenuta_importo: 20 }, 102],
    [{ totale_documento: -122, ritenuta_importo: -20 }, 102],
    [{}, 0],
  ])("%j → %d", (nota, atteso) => expect(importoNotaCredito(nota)).toBe(atteso));
});

describe("le quote da salvare", () => {
  it("devono esserci, essere positive e stare nella fattura e nella nota", () => {
    expect(problemaQuote([], 100)).toMatch(/almeno una/);
    expect(problemaQuote([{ importo: 0, capienza: 100 }], 100)).toMatch(/importo/);
    expect(problemaQuote([{ importo: 120, capienza: 100 }], 200)).toMatch(/supera/);
    expect(problemaQuote([{ importo: 80, capienza: 100 }, { importo: 80, capienza: 100 }], 100)).toMatch(/superano/);
  });
  it("assegnare solo una parte della nota è permesso", () => {
    expect(problemaQuote([{ importo: 60, capienza: 100 }], 100)).toBeNull();
  });
  it("tollera il centesimo di arrotondamento", () => {
    expect(problemaQuote([{ importo: 100.01, capienza: 100 }], 100.01)).toBeNull();
  });
});

describe("il riepilogo per la pagina", () => {
  it("somma per nota e per fattura senza errori di virgola", () => {
    const { perNota, perFattura } = riassumiStorni([
      { nota_id: "n1", fattura_id: "a", importo: 0.1, credito_residuo: 0 },
      { nota_id: "n1", fattura_id: "b", importo: 0.2, credito_residuo: "0.05" },
      { nota_id: "n2", fattura_id: "a", importo: "10.00", credito_residuo: 0 },
    ]);
    expect(perNota.get("n1")).toEqual({ fatture: ["a", "b"], importo: 0.3, credito: 0.05 });
    expect(perFattura.get("a")).toEqual({ note: ["n1", "n2"], importo: 10.1 });
  });
});

describe("il riferimento letto dal file", () => {
  it("file mancante o illeggibile: nessun riferimento, nessun errore", () => {
    const parser = new DOMParser() as unknown as LettoreXml;
    expect(riferimentiDaXml(null, parser)).toEqual([]);
    expect(riferimentiDaXml("<non-xml", parser)).toEqual([]);
  });
});

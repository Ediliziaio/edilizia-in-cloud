import { describe, it, expect } from "vitest";
import {
  detectCsvSeparator,
  matrixToCells,
  parseCsvMatrix,
  parseLooseNumber,
  parsePositiveInt,
} from "@/features/serramenti-listini/utils/matrixImport";

/**
 * STEP 5 — Test parser import matrice Excel/CSV.
 *
 * Copre:
 *  - parseLooseNumber: formati IT/EN, valuta, spazi
 *  - parsePositiveInt: tolleranza decimali/negativi
 *  - detectCsvSeparator: priorità ; > , > \t
 *  - parseCsvMatrix: quote, righe vuote, CRLF
 *  - matrixToCells: schema pivot, warnings, edge cases (dupes, out-of-range)
 */

describe("parseLooseNumber", () => {
  it("accetta numeri decimali puri", () => {
    expect(parseLooseNumber(1234.56)).toBe(1234.56);
    expect(parseLooseNumber("1234.56")).toBe(1234.56);
  });

  it("formato IT: migliaia con punto, decimali con virgola", () => {
    expect(parseLooseNumber("1.234,56")).toBe(1234.56);
    expect(parseLooseNumber("12.345,67")).toBe(12345.67);
  });

  it("formato EN: migliaia con virgola, decimali con punto", () => {
    expect(parseLooseNumber("1,234.56")).toBe(1234.56);
  });

  it("formato IT solo decimale con virgola", () => {
    expect(parseLooseNumber("123,45")).toBe(123.45);
  });

  it("rimuove simbolo valuta e spazi", () => {
    expect(parseLooseNumber("€ 1.234,00")).toBe(1234);
    expect(parseLooseNumber("  123.45  ")).toBe(123.45);
  });

  it("ritorna null su input non numerico", () => {
    expect(parseLooseNumber("abc")).toBe(null);
    expect(parseLooseNumber("")).toBe(null);
    expect(parseLooseNumber(null)).toBe(null);
    expect(parseLooseNumber(undefined)).toBe(null);
    expect(parseLooseNumber(NaN)).toBe(null);
    expect(parseLooseNumber(Infinity)).toBe(null);
  });
});

describe("parsePositiveInt", () => {
  it("arrotonda decimali", () => {
    expect(parsePositiveInt("1200.6")).toBe(1201);
    expect(parsePositiveInt("1200,4")).toBe(1200);
  });

  it("scarta negativi e zero", () => {
    expect(parsePositiveInt("-100")).toBe(null);
    expect(parsePositiveInt("0")).toBe(null);
  });

  it("scarta non numerici", () => {
    expect(parsePositiveInt("Larghezza")).toBe(null);
    expect(parsePositiveInt("")).toBe(null);
  });
});

describe("detectCsvSeparator", () => {
  it("preferisce ; quando più frequente", () => {
    expect(detectCsvSeparator("a;b;c,d")).toBe(";");
  });

  it("fallback a , quando nessun ;", () => {
    expect(detectCsvSeparator("a,b,c,d")).toBe(",");
  });

  it("rileva tab quando massimo", () => {
    expect(detectCsvSeparator("a\tb\tc\td")).toBe("\t");
  });

  it("default , su riga senza separatori", () => {
    expect(detectCsvSeparator("singlecol")).toBe(",");
  });
});

describe("parseCsvMatrix", () => {
  it("parse base con ;", () => {
    const text = "a;b;c\n1;2;3\n4;5;6";
    expect(parseCsvMatrix(text)).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("gestisce quote che contengono separatore", () => {
    const text = 'x,"a,b",c\n1,2,3';
    expect(parseCsvMatrix(text)).toEqual([
      ["x", "a,b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("salta righe vuote", () => {
    const text = "a,b\n\n1,2\n\n";
    expect(parseCsvMatrix(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("gestisce CRLF", () => {
    const text = "a,b\r\n1,2\r\n";
    expect(parseCsvMatrix(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("matrixToCells — schema pivot", () => {
  it("parse matrice 2x2 standard", () => {
    const raw = [
      ["", "1000", "1200"],
      ["800", "100.00", "120.50"],
      ["1000", "130", "155"],
    ];
    const r = matrixToCells(raw);
    expect(r.xValues).toEqual([1000, 1200]);
    expect(r.yValues).toEqual([800, 1000]);
    expect(r.cells).toEqual([
      { valore_x: 1000, valore_y: 800, prezzo_listino: 100 },
      { valore_x: 1200, valore_y: 800, prezzo_listino: 120.5 },
      { valore_x: 1000, valore_y: 1000, prezzo_listino: 130 },
      { valore_x: 1200, valore_y: 1000, prezzo_listino: 155 },
    ]);
    expect(r.warnings).toEqual([]);
  });

  it("skippa celle vuote o ≤ 0", () => {
    const raw = [
      ["", "1000", "1200"],
      ["800", "", "120"],
      ["1000", "0", "155"],
    ];
    const r = matrixToCells(raw);
    expect(r.cells).toEqual([
      { valore_x: 1200, valore_y: 800, prezzo_listino: 120 },
      { valore_x: 1200, valore_y: 1000, prezzo_listino: 155 },
    ]);
    expect(r.xValues).toEqual([1200]);
    expect(r.yValues).toEqual([800, 1000]);
  });

  it("ignora header X non numerico (colonna etichettata)", () => {
    const raw = [
      ["L×H", "1000", "larghezza_custom", "1500"],
      ["800", "100", "999", "150"],
    ];
    const r = matrixToCells(raw);
    expect(r.cells).toEqual([
      { valore_x: 1000, valore_y: 800, prezzo_listino: 100 },
      { valore_x: 1500, valore_y: 800, prezzo_listino: 150 },
    ]);
  });

  it("warning per valore out-of-range ma cella comunque salvata", () => {
    const raw = [
      ["", "6000"],
      ["6000", "200"],
    ];
    const r = matrixToCells(raw);
    expect(r.cells.length).toBe(1);
    expect(r.warnings.some((w) => /Larghezza 6000/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /Altezza 6000/.test(w))).toBe(true);
  });

  it("scarta prezzi assurdi > MAX_PRICE_EUR con warning", () => {
    const raw = [
      ["", "1000"],
      ["1000", "9999999"],
    ];
    const r = matrixToCells(raw);
    expect(r.cells.length).toBe(0);
    expect(r.warnings.some((w) => /fuori scala/.test(w))).toBe(true);
  });

  it("ritorna warnings + empty su file vuoto", () => {
    const r = matrixToCells([]);
    expect(r.cells).toEqual([]);
    expect(r.warnings).toContain("File vuoto");
  });

  it("ritorna warnings + empty su header senza X numeriche", () => {
    const raw = [["", "labelA", "labelB"]];
    const r = matrixToCells(raw);
    expect(r.cells).toEqual([]);
    expect(r.warnings.some((w) => /Nessuna larghezza/.test(w))).toBe(true);
  });

  it("applica parsing IT (€ 1.234,50)", () => {
    const raw = [
      ["", "1000"],
      ["800", "€ 1.234,50"],
    ];
    const r = matrixToCells(raw);
    expect(r.cells).toEqual([
      { valore_x: 1000, valore_y: 800, prezzo_listino: 1234.5 },
    ]);
  });

  it("tiene la prima occorrenza in caso di coppia duplicata", () => {
    const raw = [
      ["", "1000", "1000"],
      ["800", "100", "200"],
    ];
    const r = matrixToCells(raw);
    // Entrambe le colonne hanno x=1000 → la seconda genera duplicato (dedup).
    expect(r.cells).toEqual([
      { valore_x: 1000, valore_y: 800, prezzo_listino: 100 },
    ]);
    expect(r.warnings.some((w) => /Duplicato/.test(w))).toBe(true);
  });
});

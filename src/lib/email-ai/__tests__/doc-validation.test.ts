import { describe, it, expect } from "vitest";
import {
  parseImporto,
  validatePartitaIva,
  checkQuadratura,
  checkAliquota,
  isValidIban,
  ibanEquivalenti,
  isCampoIncerto,
} from "../doc-validation";

describe("parseImporto", () => {
  it("formato IT 1.234,56", () => expect(parseImporto("1.234,56")).toBe(1234.56));
  it("formato EN 1,234.56", () => expect(parseImporto("1,234.56")).toBe(1234.56));
  it("decimale semplice", () => expect(parseImporto("264,00")).toBe(264));
  it("con simbolo euro", () => expect(parseImporto("€ 1.464,00")).toBe(1464));
  it("numero nativo", () => expect(parseImporto(1464)).toBe(1464));
  it("vuoto → null", () => expect(parseImporto("")).toBeNull());
  it("non numerico → null", () => expect(parseImporto("abc")).toBeNull());
});

describe("validatePartitaIva", () => {
  it("P.IVA valida (check digit ok)", () => expect(validatePartitaIva("12345670785")).toBe(true));
  it("P.IVA con check digit errato", () => expect(validatePartitaIva("12345670780")).toBe(false));
  it("11 zeri → invalida", () => expect(validatePartitaIva("00000000000")).toBe(false));
  it("lunghezza errata", () => expect(validatePartitaIva("1234567")).toBe(false));
  it("normalizza spazi/lettere IT", () => expect(validatePartitaIva("IT 12345670785")).toBe(true));
  it("null → false", () => expect(validatePartitaIva(null)).toBe(false));
});

describe("checkQuadratura", () => {
  it("imponibile + iva = totale", () => expect(checkQuadratura(1200, 264, 1464)).toBe(true));
  it("entro tolleranza arrotondamento", () => expect(checkQuadratura(1200.0, 264.01, 1464.0)).toBe(true));
  it("fuori quadratura", () => expect(checkQuadratura(1200, 264, 1500)).toBe(false));
  it("null → false", () => expect(checkQuadratura(null, 264, 1464)).toBe(false));
});

describe("checkAliquota", () => {
  it("IVA 22% coerente", () => expect(checkAliquota(1200, 264, 22)).toBe(true));
  it("IVA 10% coerente", () => expect(checkAliquota(1000, 100, 10)).toBe(true));
  it("aliquota incoerente", () => expect(checkAliquota(1000, 220, 10)).toBe(false));
});

describe("isValidIban", () => {
  it("IBAN IT valido (esempio canonico)", () => expect(isValidIban("IT60X0542811101000000123456")).toBe(true));
  it("IBAN con check errato", () => expect(isValidIban("IT00X0542811101000000123456")).toBe(false));
  it("lunghezza IT errata", () => expect(isValidIban("IT60X05428111010000001234")).toBe(false));
  it("spazi tollerati", () => expect(isValidIban("IT60 X054 2811 1010 0000 0123 456")).toBe(true));
  it("stringa vuota", () => expect(isValidIban("")).toBe(false));
});

describe("ibanEquivalenti (anti-frode BEC)", () => {
  it("uguali ignorando spazi/case", () =>
    expect(ibanEquivalenti("IT60 X0542811101000000123456", "it60x0542811101000000123456")).toBe(true));
  it("diversi → false (alert)", () =>
    expect(ibanEquivalenti("IT60X0542811101000000123456", "IT60X0542811101000000999999")).toBe(false));
  it("uno vuoto → false", () => expect(ibanEquivalenti("", "IT60X0542811101000000123456")).toBe(false));
});

describe("isCampoIncerto", () => {
  it("conf alta → certo", () => expect(isCampoIncerto({ valore: "x", conf: 0.9 })).toBe(false));
  it("conf bassa → incerto", () => expect(isCampoIncerto({ valore: "x", conf: 0.5 })).toBe(true));
  it("valore mancante → incerto", () => expect(isCampoIncerto({ valore: null, conf: 0.9 })).toBe(true));
  it("campo assente → incerto", () => expect(isCampoIncerto(null)).toBe(true));
});

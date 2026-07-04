/**
 * Test — parseListinoNumber (import listini Excel/CSV).
 *
 * Bug originale: `Number(v.replace(",", "."))` interpretava il punto
 * migliaia italiano come decimale → "1.234" importato come 1,234 €
 * (errore ×1000 silenzioso su tutto il listino) e "1.234,56" come NaN.
 */
import { describe, expect, it } from "vitest";
import { parseListinoNumber } from "@/lib/catalogo/listinoParser";

describe("parseListinoNumber — formati italiani", () => {
  it("gestisce il punto migliaia IT senza decimali", () => {
    expect(parseListinoNumber("1.234")).toBe(1234);
    expect(parseListinoNumber("12.500")).toBe(12500);
    expect(parseListinoNumber("1.234.567")).toBe(1234567);
  });

  it("gestisce migliaia + decimali IT", () => {
    expect(parseListinoNumber("1.234,56")).toBe(1234.56);
    expect(parseListinoNumber("12.500,00")).toBe(12500);
  });

  it("gestisce la virgola decimale semplice", () => {
    expect(parseListinoNumber("9,50")).toBe(9.5);
    expect(parseListinoNumber("0,5")).toBe(0.5);
  });

  it("mantiene il punto decimale non-migliaia", () => {
    expect(parseListinoNumber("9.5")).toBe(9.5);
    expect(parseListinoNumber("1234.56")).toBe(1234.56);
  });

  it("gestisce il formato US con entrambi i separatori", () => {
    expect(parseListinoNumber("1,234.56")).toBe(1234.56);
  });

  it("strippa valuta e spazi", () => {
    expect(parseListinoNumber("€ 1.234,56")).toBe(1234.56);
    expect(parseListinoNumber("EUR 9,50")).toBe(9.5);
    expect(parseListinoNumber(" 1.234 ")).toBe(1234);
  });

  it("preserva il segno negativo", () => {
    expect(parseListinoNumber("-1.234,56")).toBe(-1234.56);
    expect(parseListinoNumber("-9,5")).toBe(-9.5);
  });

  it("ritorna NaN per valori non numerici (errore visibile, non silenzioso)", () => {
    expect(parseListinoNumber("abc")).toBeNaN();
    expect(parseListinoNumber("")).toBeNaN();
    expect(parseListinoNumber("12,34,56")).toBeNaN();
  });

  it("numeri interi e semplici restano invariati", () => {
    expect(parseListinoNumber("100")).toBe(100);
    expect(parseListinoNumber("0")).toBe(0);
  });
});

/**
 * Editor del listino: un campo vuoto non deve mai bloccare il salvataggio.
 * Caso reale: Renova, "Modulo fotovoltaico — DA CENSIRE" con prezzo di
 * acquisto NULL → l'editor lo apriva come "null" → "Prezzo di acquisto deve
 * essere un numero valido" mentre l'utente cambiava il prezzo di VENDITA.
 */
import { describe, it, expect } from "vitest";
import { parseDecimalField, assertFiniteRange } from "@/lib/listino/numeriEditor";

describe("parseDecimalField", () => {
  it('il testo "null" di un campo vuoto vale come vuoto, non come numero sbagliato', () => {
    expect(parseDecimalField(String(null), 0)).toBe(0);
    expect(parseDecimalField(String(undefined), 1)).toBe(1);
    expect(() => assertFiniteRange(parseDecimalField(String(null), 0), "Prezzo di acquisto")).not.toThrow();
  });

  it("formato italiano con migliaia e decimali", () => {
    expect(parseDecimalField("1.234,56")).toBe(1234.56);
    expect(parseDecimalField("450,50")).toBe(450.5);
    expect(parseDecimalField("800")).toBe(800);
  });

  it("vuoto prende il valore di ripiego", () => {
    expect(parseDecimalField("", 22)).toBe(22);
    expect(parseDecimalField("   ", 0)).toBe(0);
  });

  it("un testo davvero non numerico resta un errore, con un messaggio chiaro", () => {
    const v = parseDecimalField("abc", 0);
    expect(Number.isNaN(v)).toBe(true);
    expect(() => assertFiniteRange(v, "Prezzo di vendita")).toThrow("Prezzo di vendita deve essere un numero valido.");
  });

  it("i negativi restano rifiutati", () => {
    expect(() => assertFiniteRange(-5, "Prezzo di vendita", { min: 0 })).toThrow("non può essere negativo");
  });
});

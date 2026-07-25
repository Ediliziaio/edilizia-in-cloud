/**
 * Test — parseDecimalIT / formatDecimalIT (campi importo e quantità del gestionale).
 *
 * Storia del bug (2026-05-27): `parseFloat(e.target.value)` tagliava i decimali
 * italiani ("9,50" → 9). Risolto con parseDecimalIT.
 *
 * Secondo giro (2026-07-25): l'helper trattava il punto SEMPRE come decimale
 * quando era l'unico separatore, quindi "1.500" → 1.5 e "85.000" → 85. Un
 * utente italiano che digita un importo tondo scrive "1.500", non "1500,00":
 * l'importo finiva in preventivi/fatture/DDT con un fattore 1000 di errore,
 * silenziosamente. Il parser dell'import listini (parseListinoNumber) aveva
 * già la regola giusta dal suo audit: qui allineiamo i due helper.
 */
import { describe, expect, it } from "vitest";
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import { parseListinoNumber } from "@/lib/catalogo/listinoParser";
import { orderSchema } from "@/lib/orderSchema";

describe("parseDecimalIT — regressione: comportamenti già garantiti", () => {
  it("virgola decimale italiana", () => {
    expect(parseDecimalIT("9,50")).toBe(9.5);
    expect(parseDecimalIT("0,5")).toBe(0.5);
    expect(parseDecimalIT("1234,56")).toBe(1234.56);
  });

  it("punto decimale (formato US / tastierino)", () => {
    expect(parseDecimalIT("9.50")).toBe(9.5);
    expect(parseDecimalIT("1.5")).toBe(1.5);
    expect(parseDecimalIT("3.14")).toBe(3.14);
    expect(parseDecimalIT("1234.56")).toBe(1234.56);
  });

  it("migliaia + decimali, entrambi i separatori", () => {
    expect(parseDecimalIT("1.234,56")).toBe(1234.56);
    expect(parseDecimalIT("1,234.56")).toBe(1234.56);
    expect(parseDecimalIT("1.500,00")).toBe(1500);
  });

  it("strippa valuta e spazi", () => {
    expect(parseDecimalIT("€ 9,50")).toBe(9.5);
    expect(parseDecimalIT("EUR 9,50")).toBe(9.5);
    expect(parseDecimalIT("  9,50 ")).toBe(9.5);
    expect(parseDecimalIT("9,50€")).toBe(9.5);
  });

  it("vuoto / null / undefined → 0 (mai NaN nei totali)", () => {
    expect(parseDecimalIT("")).toBe(0);
    expect(parseDecimalIT(null)).toBe(0);
    expect(parseDecimalIT(undefined)).toBe(0);
    expect(parseDecimalIT("abc")).toBe(0);
  });

  it("numeri passano invariati, NaN/Infinity → 0", () => {
    expect(parseDecimalIT(9.5)).toBe(9.5);
    expect(parseDecimalIT(0)).toBe(0);
    expect(parseDecimalIT(NaN)).toBe(0);
    expect(parseDecimalIT(Infinity)).toBe(0);
  });

  it("preserva il segno negativo", () => {
    expect(parseDecimalIT("-9,50")).toBe(-9.5);
    expect(parseDecimalIT("-1.234,56")).toBe(-1234.56);
  });

  it("digitazione intermedia: separatore finale senza decimali", () => {
    expect(parseDecimalIT("1,")).toBe(1);
    expect(parseDecimalIT("1.")).toBe(1);
  });
});

describe("parseDecimalIT — punto come separatore MIGLIAIA (fix 2026-07-25)", () => {
  it("importo tondo digitato all'italiana", () => {
    expect(parseDecimalIT("1.500")).toBe(1500);
    expect(parseDecimalIT("85.000")).toBe(85000);
    expect(parseDecimalIT("12.500")).toBe(12500);
    expect(parseDecimalIT("10.000")).toBe(10000);
  });

  it("gruppi multipli", () => {
    expect(parseDecimalIT("1.234.567")).toBe(1234567);
    expect(parseDecimalIT("12.345.678")).toBe(12345678);
  });

  it("con valuta e segno", () => {
    expect(parseDecimalIT("€ 85.000")).toBe(85000);
    expect(parseDecimalIT("-1.500")).toBe(-1500);
  });

  it("NON scatta con 4+ cifre prima del punto (è un decimale)", () => {
    expect(parseDecimalIT("1234.567")).toBe(1234.567);
    expect(parseDecimalIT("10000.500")).toBe(10000.5);
  });

  it("NON scatta con 1-2 o 4+ cifre dopo il punto (è un decimale)", () => {
    expect(parseDecimalIT("1.5")).toBe(1.5);
    expect(parseDecimalIT("1.50")).toBe(1.5);
    expect(parseDecimalIT("1.5000")).toBe(1.5);
    expect(parseDecimalIT("2.1234")).toBe(2.1234);
  });

  it("NON scatta con lo zero davanti: 0.500 è mezzo, non cinquecento", () => {
    // Un raggruppamento di migliaia non inizia mai con 0 → sicuro per le
    // quantità a 3 decimali (0,500 m³) digitate col punto.
    expect(parseDecimalIT("0.500")).toBe(0.5);
    expect(parseDecimalIT("0.750")).toBe(0.75);
    expect(parseDecimalIT("0.001")).toBe(0.001);
  });

  it("gruppo malformato → resta decimale (non inventiamo migliaia)", () => {
    expect(parseDecimalIT("1.23.456")).toBe(1.23);
  });
});

describe("parseDecimalIT ↔ parseListinoNumber — stessa stringa, stesso numero", () => {
  // L'incoerenza tra i due parser è ciò che ha prodotto il bug: la stessa
  // cifra valeva 1.5 se digitata a mano e 1500 se importata da CSV.
  const CASI = [
    "1.500", "85.000", "1.234.567", "12.500", "9,50", "9.50", "1.234,56",
    "1,234.56", "1.5", "1234.56", "0,5", "100", "0.500", "-1.500", "€ 85.000",
  ];

  it.each(CASI)("coerenza su %s", (raw) => {
    expect(parseDecimalIT(raw)).toBe(parseListinoNumber(raw));
  });
});

describe("orderSchema — la validazione legge l'importo come il salvataggio", () => {
  // Il form validava con parseFloat e salvava con parseDecimalIT: due
  // letture diverse della stessa stringa sullo stesso campo.
  const ordine = (total_amount: string) =>
    orderSchema.safeParse({
      customer_id: "c-1",
      description: "Rifacimento bagno",
      total_amount,
    });

  it("accetta gli importi in formato italiano", () => {
    for (const raw of ["1.500", "1.500,00", "9,50", "85.000", "€ 1.200,50"]) {
      expect(ordine(raw).success, `rifiutato: ${raw}`).toBe(true);
    }
  });

  it("accetta i centesimi senza intero (',50' era bocciato: parseFloat → NaN)", () => {
    expect(ordine(",50").success).toBe(true);
    expect(parseDecimalIT(",50")).toBe(0.5);
  });

  it("continua a bocciare il non numerico e lo zero", () => {
    expect(ordine("abc").success).toBe(false);
    expect(ordine("").success).toBe(false);
    expect(ordine("0").success).toBe(false);
    expect(ordine("0,00").success).toBe(false);
  });

  it("boccia gli importi negativi", () => {
    expect(ordine("-1.500").success).toBe(false);
  });
});

describe("formatDecimalIT — eco del valore interpretato", () => {
  it("formatta in italiano con separatore migliaia", () => {
    expect(formatDecimalIT(1500)).toBe("1.500,00");
    expect(formatDecimalIT(85000)).toBe("85.000,00");
    expect(formatDecimalIT(1.5)).toBe("1,50");
    expect(formatDecimalIT(0)).toBe("0,00");
  });

  it("rispetta i decimali richiesti (quantità)", () => {
    expect(formatDecimalIT(0.5, { minDecimals: 0, maxDecimals: 3 })).toBe("0,5");
    expect(formatDecimalIT(1.234, { minDecimals: 0, maxDecimals: 3 })).toBe("1,234");
    expect(formatDecimalIT(1500, { minDecimals: 0, maxDecimals: 3 })).toBe("1.500");
  });

  it("valori non finiti / nulli → stringa vuota (campo vuoto, non 'NaN')", () => {
    expect(formatDecimalIT(NaN)).toBe("");
    expect(formatDecimalIT(null)).toBe("");
    expect(formatDecimalIT(undefined)).toBe("");
    expect(formatDecimalIT(Infinity)).toBe("");
  });

  it("ROUND-TRIP: quello che mostriamo si rilegge identico", () => {
    // Requisito duro: l'eco non deve mai cambiare il valore al secondo blur.
    for (const n of [0, 1.5, 9.99, 1500, 85000, 1234567, 0.5, -1500, 1234.56]) {
      expect(parseDecimalIT(formatDecimalIT(n))).toBe(Number(n.toFixed(2)));
    }
  });

  it("ROUND-TRIP a 3 decimali (quantità)", () => {
    for (const n of [0.5, 1.234, 1500, 0.001]) {
      const s = formatDecimalIT(n, { minDecimals: 0, maxDecimals: 3 });
      expect(parseDecimalIT(s)).toBe(n);
    }
  });
});

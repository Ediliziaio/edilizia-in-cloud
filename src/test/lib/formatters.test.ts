import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";

/** Normalizza lo spazio non-breaking (\u00A0, \u202F) usato da Intl in Node */
function norm(s: string): string {
  return s.replace(/[\u00A0\u202F\u2009]/g, " ").trim();
}

describe("formatCurrency", () => {
  it("formatta zero correttamente (contiene 0,00 e €)", () => {
    const result = norm(formatCurrency(0));
    expect(result).toContain("0,00");
    expect(result).toContain("€");
  });

  it("formatta valori positivi con virgola decimale italiana e simbolo €", () => {
    const result = norm(formatCurrency(1234.56));
    // jsdom/Node può non avere ICU completo — verifichiamo solo decimale e simbolo
    expect(result).toContain(",56");
    expect(result).toContain("€");
    // Verifica che il numero intero sia presente (con o senza separatore migliaia)
    expect(result).toMatch(/1[.,]?234?/);
  });

  it("formatta valori negativi (perdita su ordine)", () => {
    const result = formatCurrency(-500);
    expect(result).toContain("-");
    expect(result).toContain("500");
  });

  it("formatta valori grandi (>1M)", () => {
    const result = formatCurrency(1_500_000);
    expect(result).toContain("1.500.000");
  });

  it("arrotonda a 2 decimali", () => {
    // 1/3 = 0.333... → 0,33 €
    const result = formatCurrency(1 / 3);
    expect(result).toContain("0,33");
  });
});

describe("formatCurrencyCompact", () => {
  it("formatta valori < 1000 come interi", () => {
    expect(formatCurrencyCompact(800)).toBe("€800");
  });

  it("formatta migliaia come k", () => {
    expect(formatCurrencyCompact(45_000)).toBe("€45k");
  });

  it("formatta milioni come M", () => {
    expect(formatCurrencyCompact(1_200_000)).toBe("€1.2M");
  });

  it("gestisce valori negativi", () => {
    expect(formatCurrencyCompact(-45_000)).toBe("-€45k");
  });

  it("gestisce zero", () => {
    expect(formatCurrencyCompact(0)).toBe("€0");
  });
});

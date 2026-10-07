/**
 * Le cifre a schermo del preventivatore Serramenti (06/10/2026): mai «-0» e mai NaN.
 */
import { describe, expect, it } from "vitest";
import { formatEuro, formatNumero, formatPct } from "@/lib/serramenti/format";

describe("cifre a schermo: mai «-0», mai NaN", () => {
  it("un valore che arrotonda a zero si scrive 0, non -0", () => {
    expect(formatEuro(-0)).toBe("€ 0");
    expect(formatEuro(-0.001)).toBe("€ 0");
    expect(formatEuro(-0.001, 2)).toBe("€ 0,00");
    expect(formatEuro(-0.4)).toBe("€ 0");
    expect(formatNumero(-0.0001, 2)).toBe("0,00");
    expect(formatPct(-0.04, 1)).toBe("0,0%");
  });

  it("i negativi veri restano negativi e le migliaia hanno il punto", () => {
    expect(formatEuro(-1234.5, 2)).toBe("€ -1.234,50");
    expect(formatEuro(8699.11, 2)).toBe("€ 8.699,11");
    expect(formatEuro(-0.6)).toBe("€ -1");
  });

  it("mancante o non numerico: il trattino, non NaN", () => {
    expect(formatEuro(null)).toBe("—");
    expect(formatEuro(undefined)).toBe("—");
    expect(formatEuro(Number.NaN)).toBe("—");
    expect(formatPct(null)).toBe("—");
    expect(formatNumero(undefined)).toBe("—");
  });
});

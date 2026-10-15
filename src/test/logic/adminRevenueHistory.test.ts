import { describe, expect, it } from "vitest";
import { monthlyMrrSeries, formatMrrAxis, type MrrSnapshot } from "@/lib/adminRevenueHistory";
const row = (data: string, cents: number): MrrSnapshot => ({ data, mrr_stripe_cents: cents, mrr_interno_cents: cents, aziende_attive_stripe: 2 });
describe("Storico mensile ricavi", () => {
  it("mostra l'ultimo snapshot di ogni mese senza sommare l'MRR giornaliero", () => {
    const result = monthlyMrrSeries([row("2026-10-15", 22499), row("2026-10-01", 20000), row("2026-09-30", 15000)]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ mese: "set 26", mrrStripe: 150 });
    expect(result[1]).toMatchObject({ mese: "ott 26", mrrStripe: 224.99 });
  });
  it("non inventa mesi senza osservazioni e limita lo storico a dodici mesi", () => {
    const result = monthlyMrrSeries(Array.from({ length: 15 }, (_, i) => row(`${2025 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}-15`, 10000)));
    expect(result).toHaveLength(12);
    expect(monthlyMrrSeries([row("2026-08-15", 10000), row("2026-10-15", 20000)])).toHaveLength(2);
  });
  it("non trasforma tutti gli importi sotto mille euro in 0k", () => {
    expect(formatMrrAxis(224)).toBe("224 €");
    expect(formatMrrAxis(2688)).toBe("2,7k €");
    expect(formatMrrAxis(0)).toBe("0 €");
  });
});

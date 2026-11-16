import { describe, expect, it } from "vitest";
import { variazioneStessoPeriodo } from "@/components/fatturazione/RiepilogoFatture";
import type { MonthSummary } from "@/hooks/billing/useMonthlyTimeline";

const anno = (year: number, totali: number[]): MonthSummary[] =>
  totali.map((t, i) => ({
    year, month: i + 1, label: "", key: `${year}-${String(i + 1).padStart(2, "0")}`,
    docCount: t > 0 ? 1 : 0, totalAmount: t, imponibile: 0, iva: 0, incassato: 0, daIncassare: 0, scaduto: 0,
  }));

describe("variazione sullo stesso periodo dell'anno prima", () => {
  const ora = anno(2026, [100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const prima = anno(2025, [50, 50, 50, 500, 500, 500, 500, 500, 500, 500, 500, 500]);

  it("anno in corso: confronta solo i mesi già passati, non l'anno prima intero", () => {
    expect(variazioneStessoPeriodo(ora, prima, null, new Date(2026, 2, 15))).toBeCloseTo(100);
  });

  it("mese scelto: confronta lo stesso mese", () => {
    expect(variazioneStessoPeriodo(ora, prima, "2026-02", new Date(2026, 2, 15))).toBeCloseTo(100);
  });

  it("anno chiuso: confronta l'anno intero", () => {
    const tutto = anno(2025, Array(12).fill(10));
    const primaAnc = anno(2024, Array(12).fill(5));
    expect(variazioneStessoPeriodo(tutto, primaAnc, null, new Date(2026, 2, 15))).toBeCloseTo(100);
  });

  it("senza fatturato l'anno prima non c'è variazione", () => {
    expect(variazioneStessoPeriodo(ora, anno(2025, Array(12).fill(0)), null, new Date(2026, 2, 15))).toBeNull();
    expect(variazioneStessoPeriodo(ora, undefined, null)).toBeNull();
  });
});

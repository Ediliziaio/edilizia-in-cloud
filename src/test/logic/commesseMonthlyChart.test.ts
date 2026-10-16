import { describe, expect, it } from "vitest";
import {
  annualComparisonPeriod,
  comparableOrderMonths,
  clickedOrderChartMonth,
  orderChartMonthFilter,
  orderChartMonths,
} from "@/lib/orders/monthlyChart";
const month = (key: string, commesse = 0) => ({
  key,
  mese: key,
  venduto: commesse * 100,
  incassato: commesse * 50,
  commesse,
  daIncassare: commesse * 40,
});
const today = new Date(2026, 9, 16);
describe("Andamento commesse senza falsi crolli futuri", () => {
  it("mantiene gli zeri reali passati e lascia vuoti i mesi futuri", () => {
    const data = orderChartMonths(
      [month("2026-09"), month("2026-10", 2), month("2026-11")],
      today,
    );
    expect(data[0]).toMatchObject({
      sold: 0,
      collected: 0,
      count: 0,
      future: false,
    });
    expect(data[1]).toMatchObject({
      sold: 200,
      collected: 100,
      count: 2,
      current: true,
    });
    expect(data[2]).toMatchObject({
      sold: null,
      collected: null,
      count: null,
      future: true,
    });
  });
  it("non nasconde dati effettivi registrati con una data futura", () => {
    expect(orderChartMonths([month("2026-12", 1)], today)[0]).toMatchObject({
      sold: 100,
      count: 1,
      future: true,
    });
  });
  it("mostra tutti i mesi di un anno storico e non modifica le somme originali", () => {
    const input = [month("2025-12"), month("2026-11")];
    const data = orderChartMonths(input, today);
    expect(data[0].count).toBe(0);
    expect(data[1].commesse).toBe(0);
    expect(input[1]).not.toHaveProperty("count");
  });
});

describe("Selezione mensile del grafico", () => {
  it("passa dal pregresso all’anno rappresentato e pulisce solo le date incompatibili", () => {
    expect(
      orderChartMonthFilter("2026-09", "corrente", 2026, "previous"),
    ).toEqual({
      monthFilter: "8",
      yearFilter: "corrente",
      scopeGroup: "annual",
      contractFrom: "",
      contractTo: "",
    });
    expect(orderChartMonthFilter("2025-12", "all", 2026)).toEqual({
      monthFilter: "11",
      yearFilter: "2025",
      scopeGroup: "all",
      contractFrom: "",
      contractTo: "",
    });
    expect(orderChartMonthFilter(null, "2025", 2026)).toEqual({
      monthFilter: "all",
      contractFrom: "",
      contractTo: "",
    });
    expect(orderChartMonthFilter("2026-13", "all", 2026)).toBeNull();
    expect(
      orderChartMonthFilter("2026-09", "corrente", 2026, "all")?.scopeGroup,
    ).toBe("all");
  });
  it("ignora spazio vuoto e mesi futuri, risolve label e indici delle due versioni Recharts", () => {
    const data = orderChartMonths(
      [month("2026-09", 1), month("2026-11")],
      today,
    );
    expect(clickedOrderChartMonth({ activeLabel: "2026-09" }, data)).toBe(
      "2026-09",
    );
    expect(clickedOrderChartMonth({ activeTooltipIndex: "0" }, data)).toBe(
      "2026-09",
    );
    for (const event of [
      null,
      {},
      { activeTooltipIndex: null },
      { activeTooltipIndex: 20 },
      { activeTooltipIndex: 1 },
    ])
      expect(clickedOrderChartMonth(event, data)).toBeNull();
  });
});

describe("Confronto annuale a parità di periodo", () => {
  it("include il giorno corrente nei due anni ed esclude i giorni successivi", () => {
    const period = annualComparisonPeriod(2026, today)!;
    expect(period.to).toEqual(new Date(2026, 9, 17));
    expect(period.previousTo).toEqual(new Date(2025, 9, 17));
    const row = (year: number, day: number) => ({
      created_at: new Date(year, 9, day, 12).toISOString(),
      venduto: 100,
      incassato: 40,
      daIncassare: 60,
    });
    const data = comparableOrderMonths(
      [month("2026-10"), month("2026-11")],
      [row(2026, 16), row(2026, 17)],
      [row(2025, 16), row(2025, 17)],
      period,
    );
    expect(data[0]).toMatchObject({
      commesse: 1,
      venduto: 100,
      comparison: { year: 2025, commesse: 1, venduto: 100 },
    });
    expect(data[1].comparison).toBeUndefined();
    expect(orderChartMonths(data, today)[1].count).toBeNull();
  });
  it("gestisce anno bisestile, anni conclusi e anno futuro senza sforare il mese", () => {
    const leap = annualComparisonPeriod(2024, new Date(2024, 1, 29))!;
    expect(leap.to).toEqual(new Date(2024, 2, 1));
    expect(leap.previousTo).toEqual(new Date(2023, 2, 1));
    const closed = annualComparisonPeriod(2025, today)!;
    expect(closed.to).toEqual(new Date(2026, 0, 1));
    expect(closed.previousTo).toEqual(new Date(2025, 0, 1));
    expect(annualComparisonPeriod(2027, today)).toBeNull();
    expect(annualComparisonPeriod(NaN, today)).toBeNull();
  });
  it("mantiene gli zeri reali in assenza di commesse e non modifica il riepilogo originale", () => {
    const template = [month("2026-09", 2)];
    const data = comparableOrderMonths(
      template,
      [],
      [],
      annualComparisonPeriod(2026, today)!,
    );
    expect(data[0]).toMatchObject({
      venduto: 0,
      comparison: { venduto: 0, commesse: 0 },
    });
    expect(template[0].venduto).toBe(200);
    expect(template[0]).not.toHaveProperty("comparison");
  });
});

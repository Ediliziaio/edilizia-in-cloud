import { describe, expect, it } from "vitest";
import {
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

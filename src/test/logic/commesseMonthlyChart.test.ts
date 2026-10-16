import { describe, expect, it } from "vitest";
import { orderChartMonths } from "@/lib/orders/monthlyChart";
const month = (key: string, commesse = 0) => ({
  key,
  mese: key,
  venduto: commesse * 100,
  incassato: commesse * 50,
  commesse,
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

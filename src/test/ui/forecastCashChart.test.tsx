import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
vi.mock("recharts", () => {
  const Nothing = (): null => null;
  return {
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    ComposedChart: () => <div data-testid="chart" />,
    Area: Nothing,
    Bar: Nothing,
    CartesianGrid: Nothing,
    Line: Nothing,
    ReferenceDot: Nothing,
    ReferenceLine: Nothing,
    Tooltip: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
  };
});
import {
  ForecastCashChart,
  CashChartTooltip,
  type CashChartPoint,
} from "@/components/forecast/ForecastCashChart";
import { cashChartScale } from "@/lib/finance/forecastChart";
const point: CashChartPoint = {
  start: "2026-10-14",
  end: "2026-10-14",
  label: "14 ott",
  balance: -200000,
  withoutEstimates: -100000,
  income: 0,
  expense: -1200000,
};
const props = () => ({
  rows: [point],
  opening: 1000000,
  closing: -200000,
  minimum: -200000,
  minimumDate: point.start,
  income: 0,
  expense: 1200000,
  threshold: 500000,
  hasEstimates: true,
  granularity: "giorni" as const,
  onGranularity: vi.fn(),
  onPeriod: vi.fn(),
  onTable: vi.fn(),
});
afterEach(cleanup);
describe("cash chart visual hierarchy", () => {
  it("keeps flows collapsed and comparison optional without hiding their totals", () => {
    const p = props();
    const before = JSON.stringify(p.rows);
    render(
      <MemoryRouter>
        <ForecastCashChart {...p} />
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId("chart")).toHaveLength(1);
    expect(screen.getByText("Uscite del periodo")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confronta senza stime" }),
    ).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(
      screen.getByRole("button", { name: "Confronta senza stime" }),
    );
    expect(
      screen.getByRole("button", { name: "Confronta senza stime" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Senza stime")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Mostra entrate e uscite" }),
    );
    expect(screen.getAllByTestId("chart")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Nascondi flussi" }),
    ).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Nascondi flussi" }));
    expect(screen.getAllByTestId("chart")).toHaveLength(1);
    expect(JSON.stringify(p.rows)).toBe(before);
    expect(p.onPeriod).not.toHaveBeenCalled();
  });
  it("offers keyboard-accessible period and table actions", () => {
    const p = props();
    render(
      <MemoryRouter>
        <ForecastCashChart {...p} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Minimo previsto/ }));
    expect(p.onPeriod).toHaveBeenCalledWith({
      start: point.start,
      end: point.end,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Tabella settimanale" }),
    );
    expect(p.onTable).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Per settimana" }));
    expect(p.onGranularity).toHaveBeenCalledWith("settimane");
  });
  it("retains the missing-opening safeguard and never draws a fabricated balance", () => {
    render(
      <MemoryRouter>
        <ForecastCashChart {...props()} opening={null} closing={null} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("chart")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Completa in Tesoreria" }),
    ).toHaveAttribute("href", "/azienda/tesoreria");
    expect(screen.getByText("Non disponibile")).toBeVisible();
  });
  it("preserves negative and zero amounts in the actual tooltip", () => {
    const view = render(
      <CashChartTooltip active point={point} threshold={500000} comparison />,
    );
    expect(screen.getByText(/-2\.000,00/)).toBeVisible();
    expect(screen.getByText(/-1\.000,00/)).toBeVisible();
    expect(screen.getByText(/12\.000,00/)).toBeVisible();
    expect(screen.getByText(/^0,00\s*€$/)).toBeVisible();
    view.rerender(
      <CashChartTooltip
        active={false}
        point={point}
        threshold={500000}
        comparison
      />,
    );
    expect(screen.queryByText("Saldo a fine giornata")).toBeNull();
  });
  it("uses rounded ticks that cover negatives, zero and positive balances", () => {
    for (const values of [
      [-24241251, 66333151, 500000],
      [-10000, -30000],
      [0, 0],
      [null, Number.NaN, Infinity],
    ]) {
      const scale = cashChartScale(values);
      expect(scale.domain.every(Number.isFinite)).toBe(true);
      expect(scale.domain[1]).toBeGreaterThan(scale.domain[0]);
      for (const value of values)
        if (value !== null && Number.isFinite(value)) {
          expect(scale.domain[0]).toBeLessThanOrEqual(value);
          expect(scale.domain[1]).toBeGreaterThanOrEqual(value);
        }
      expect(scale.ticks).toContain(0);
      expect(scale.ticks.length).toBeLessThanOrEqual(7);
    }
  });
});

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ComposedChart: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Bar: ({ name }: { name: string }) => <span data-testid="series">{name}</span>,
  Line: ({ name }: { name: string }) => (
    <span data-testid="series">{name}</span>
  ),
  CartesianGrid: (): null => null,
  ReferenceLine: (): null => null,
  Tooltip: (): null => null,
  XAxis: (): null => null,
  YAxis: (): null => null,
}));
import { OrdersMonthlyChart } from "@/components/orders/OrdersMonthlyChart";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 16));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const months = [
  {
    key: "2026-10",
    mese: "ott '26",
    venduto: 200,
    incassato: 100,
    commesse: 2,
  },
  { key: "2026-11", mese: "nov '26", venduto: 0, incassato: 0, commesse: 0 },
];
describe("Viste separate e dati accessibili dell’andamento", () => {
  it("apre con gli importi e passa al numero commesse senza mescolare le scale", () => {
    render(<OrdersMonthlyChart months={months} period="2026" />);
    expect(screen.getByRole("button", { name: "Importi" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByTestId("series").map((el) => el.textContent)).toEqual(
      ["Venduto", "Incassato"],
    );
    fireEvent.click(screen.getByRole("button", { name: "Numero commesse" }));
    expect(
      screen.getByRole("button", { name: "Numero commesse" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("series").map((el) => el.textContent)).toEqual(
      ["Numero commesse"],
    );
    expect(
      screen.getByText(/indipendentemente dalla data dell’incasso/),
    ).toBeVisible();
  });
  it("offre una tabella consultabile senza hover e distingue mesi futuri e correnti", () => {
    render(<OrdersMonthlyChart months={months} period="2026" />);
    fireEvent.click(screen.getByText("Dati mese per mese"));
    expect(screen.getByRole("table")).toBeVisible();
    expect(
      screen.getByRole("rowheader", { name: "ott '26 · in corso" }),
    ).toBeVisible();
    expect(screen.getByText("Non ancora disponibile")).toBeVisible();
    expect(screen.getByRole("cell", { name: /200\s*€/ })).toBeVisible();
  });
});

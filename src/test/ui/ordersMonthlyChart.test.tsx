import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("framer-motion", () => ({ useReducedMotion: () => true }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ComposedChart: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: (event: unknown) => void;
  }) => (
    <div
      data-testid="plot"
      onClick={() => onClick?.({ activeTooltipIndex: 0 })}
    >
      {children}
    </div>
  ),
  Bar: ({ name }: { name: string }) => <span data-testid="series">{name}</span>,
  Line: ({ name }: { name: string }) => (
    <span data-testid="series">{name}</span>
  ),
  Area: ({
    name,
    isAnimationActive,
  }: {
    name: string;
    isAnimationActive: boolean;
  }) => (
    <span data-testid="series" data-animated={String(isAnimationActive)}>
      {name}
    </span>
  ),
  CartesianGrid: (): null => null,
  ReferenceLine: (): null => null,
  Tooltip: (): null => null,
  XAxis: (): null => null,
  YAxis: (): null => null,
}));
import { orderChartMonths } from "@/lib/orders/monthlyChart";
import {
  OrderMonthDetails,
  OrdersMonthlyChart,
} from "@/components/orders/OrdersMonthlyChart";
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
    daIncassare: 85,
  },
  {
    key: "2026-11",
    mese: "nov '26",
    venduto: 0,
    incassato: 0,
    commesse: 0,
    daIncassare: 0,
  },
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

describe("Filtri e tooltip del grafico", () => {
  it("filtra dal grafico e dai pulsanti, consente la deselezione e disabilita i mesi futuri vuoti", () => {
    const onSelectMonth = vi.fn();
    render(
      <OrdersMonthlyChart
        months={months}
        period="2026"
        selectedMonth="2026-10"
        onSelectMonth={onSelectMonth}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Filtra commesse di ottobre 2026" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("plot"));
    expect(onSelectMonth).toHaveBeenLastCalledWith(null);
    fireEvent.click(
      screen.getByRole("button", { name: "Filtra commesse di ottobre 2026" }),
    );
    expect(onSelectMonth).toHaveBeenLastCalledWith(null);
    expect(
      screen.getByRole("button", { name: "Filtra commesse di novembre 2026" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Rimuovi filtro mese" }),
    );
    expect(onSelectMonth).toHaveBeenLastCalledWith(null);
  });
  it("seleziona un mese nuovo e conserva i comandi anche nella vista numerica", () => {
    const onSelectMonth = vi.fn();
    render(
      <OrdersMonthlyChart
        months={months}
        period="2026"
        onSelectMonth={onSelectMonth}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Numero commesse" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Filtra commesse di ottobre 2026" }),
    );
    expect(onSelectMonth).toHaveBeenCalledWith("2026-10");
  });
  it("mostra il residuo effettivo, che può differire da venduto meno incassato", () => {
    render(
      <OrderMonthDetails
        active
        payload={[{ payload: orderChartMonths(months)[0] }]}
      />,
    );
    expect(screen.getByText("Da incassare")).toBeVisible();
    expect(screen.getByText(/85\s*€/)).toBeVisible();
    expect(screen.getByText("Commesse")).toBeVisible();
  });
  it("offre Linee e Barre e rispetta la preferenza di movimento ridotto", () => {
    render(<OrdersMonthlyChart months={months} period="2026" />);
    expect(screen.getByRole("button", { name: "Linee" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByTestId("series")[0]).toHaveAttribute(
      "data-animated",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Barre" }));
    expect(screen.getByRole("button", { name: "Barre" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("Confronto facoltativo del grafico", () => {
  const prior = {
    year: 2025,
    venduto: 100,
    incassato: 50,
    daIncassare: 45,
    commesse: 1,
  };
  const options = {
    year: 2025,
    enabled: true,
    onToggle: vi.fn(),
    loading: false,
    error: false,
    onRetry: vi.fn(),
    label: "1 gennaio – 16 ottobre",
  };
  it("aggiunge serie tratteggiate e dati consultabili, mantenendo il clic sull’anno corrente", () => {
    const select = vi.fn();
    render(
      <OrdersMonthlyChart
        months={[{ ...months[0], comparison: prior }, months[1]]}
        period="2026"
        comparison={options}
        onSelectMonth={select}
      />,
    );
    expect(
      screen.getAllByTestId("series").map((el) => el.textContent),
    ).toContain("Venduto 2025");
    expect(screen.getByText(/Stesso periodo:/)).toHaveTextContent("16 ottobre");
    fireEvent.click(screen.getByTestId("plot"));
    expect(select).toHaveBeenLastCalledWith("2026-10");
    fireEvent.click(screen.getByRole("button", { name: "Numero commesse" }));
    expect(screen.getAllByTestId("series").map((el) => el.textContent)).toEqual(
      ["Commesse 2025", "Numero commesse"],
    );
    fireEvent.click(screen.getByText("Dati mese per mese"));
    expect(screen.getByRole("rowheader", { name: "ott · 2025" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confronta 2025" }));
    expect(options.onToggle).toHaveBeenCalledOnce();
  });
  it("non presenta dati falsi durante errore e offre un nuovo tentativo", () => {
    render(
      <OrdersMonthlyChart
        months={months}
        period="2026"
        comparison={{ ...options, error: true }}
      />,
    );
    expect(screen.getAllByTestId("series")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Confronto non disponibile",
    );
    fireEvent.click(screen.getByRole("button", { name: "Riprova confronto" }));
    expect(options.onRetry).toHaveBeenCalledOnce();
  });
  it("mostra entrambi gli anni nel tooltip e non calcola percentuali su base zero", () => {
    render(
      <OrderMonthDetails
        active
        payload={[
          {
            payload: {
              ...orderChartMonths(months)[0],
              comparison: { ...prior, venduto: 0 },
            },
          },
        ]}
      />,
    );
    expect(screen.getByText(/Confronto 2025/)).toBeVisible();
    expect(screen.getByText("Base precedente assente")).toBeVisible();
  });
});

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
vi.mock("@/lib/csvExport", () => ({ exportToCSV: vi.fn() }));
vi.mock("@/components/forecast/MarginTab", () => ({
  MarginTab: () => <p>Marginalità di verifica</p>,
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: () => <div>Grafico di verifica</div>,
  Area: (): null => null,
  CartesianGrid: (): null => null,
  ReferenceLine: (): null => null,
  Tooltip: (): null => null,
  XAxis: (): null => null,
  YAxis: (): null => null,
}));
import { ForecastWorkspace } from "@/components/forecast/ForecastWorkspace";
import { forecastFixture } from "@/test/fixtures/forecastDataset";
import { exportToCSV } from "@/lib/csvExport";
import type { ForecastDataset } from "@/hooks/useForecastLedger";
const click = (element: HTMLElement) => {
  fireEvent.mouseDown(element, { button: 0, ctrlKey: false });
  fireEvent.click(element);
};
const mount = (data: ForecastDataset = forecastFixture) =>
  render(
    <MemoryRouter>
      <ForecastWorkspace data={data} onRefresh={vi.fn()} />
    </MemoryRouter>,
  );
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("forecast workspace decisions", () => {
  it("opens on future cash with all four tabs available", () => {
    mount();
    expect(screen.getByRole("tab", { name: "Cassa futura" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    for (const name of ["Movimenti", "Incassato", "Marginalità"])
      expect(screen.getByRole("tab", { name })).toBeVisible();
    expect(screen.getByText("Minimo nei 90 giorni")).toBeVisible();
    expect(screen.getByText("Sotto la soglia dal 14 ott")).toBeVisible();
  });
  it("shows an unavailable opening balance instead of zero", () => {
    mount({
      ...forecastFixture,
      opening: { cents: null, source: "nessuna", updatedAt: null },
    });
    expect(
      screen.getAllByText("Non disponibile").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      screen.getByRole("link", { name: "Completa in Tesoreria" }),
    ).toHaveAttribute("href", "/azienda/tesoreria");
  });
  it("shows source failures and provides a retry", async () => {
    const refresh = vi.fn();
    render(
      <MemoryRouter>
        <ForecastWorkspace
          data={{ ...forecastFixture, issues: ["F24", "Conti bancari"] }}
          onRefresh={refresh}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Conti bancari");
    click(screen.getByRole("button", { name: "Riprova il caricamento" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("exports the active scenario dates and declares excluded amounts", async () => {
    mount();
    click(screen.getByRole("button", { name: "Simula ritardo di 15 giorni" }));
    click(screen.getByRole("button", { name: "Esporta piano" }));
    const rows = vi.mocked(exportToCSV).mock.calls[0][0];
    expect(rows.find((r) => r.descrizione === "SAL commessa")).toMatchObject({
      data: "2026-10-31",
      ritardo_giorni: "15",
      importo: "15000.00",
      inclusione: "Incluso",
    });
    expect(
      rows.find((r) => r.descrizione === "Spesa senza scadenza")?.inclusione,
    ).toBe("Escluso: senza data");
    expect(
      rows.find((r) => r.descrizione === "Fattura scaduta")?.inclusione,
    ).toBe("Escluso: incasso scaduto da confermare");
  });
  it("requires an explicit assumption to include an overdue receipt", async () => {
    mount();
    click(
      screen.getByRole("checkbox", {
        name: "Ipotizza l’incasso degli scaduti da oggi",
      }),
    );
    click(screen.getByRole("button", { name: "Esporta piano" }));
    const rows = vi.mocked(exportToCSV).mock.calls[0][0];
    expect(rows.find((r) => r.descrizione === "Fattura scaduta")).toMatchObject(
      { data: "2026-10-14", inclusione: "Incluso" },
    );
  });
  it("opens undated source documents from the task list", async () => {
    mount();
    click(screen.getByRole("button", { name: /Movimenti senza data/ }));
    expect(screen.getByRole("tab", { name: "Movimenti" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("link", { name: "Apri fonte: Spesa senza scadenza" }),
    ).toHaveAttribute("href", "/azienda/costi");
  });
  it("exposes the daily minimum in weekly rows and opens that week's movements", async () => {
    mount();
    click(screen.getByRole("button", { name: "settimane" }));
    const table = screen.getByRole("table", {
      name: "Piano settimanale con minimo giornaliero e saldo finale",
    });
    expect(within(table).getByText("Minimo giornaliero")).toBeVisible();
    click(screen.getByRole("button", { name: "Apri movimenti 14 ott" }));
    expect(screen.getByText(/Periodo 14 ott – 20 ott/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Apri fonte: SAL commessa" }),
    ).toHaveAttribute("href", "/azienda/ordini/example");
  });
  it("keeps filters on details without changing the plan", async () => {
    mount();
    click(screen.getByRole("tab", { name: "Movimenti" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Direzione movimenti" }),
      { target: { value: "out" } },
    );
    expect(
      screen.queryByRole("link", { name: "Apri fonte: SAL commessa" }),
    ).toBeNull();
    click(screen.getByRole("tab", { name: "Cassa futura" }));
    expect(screen.getByText(/A fine periodo:.*13.000/)).toBeVisible();
    click(screen.getByRole("tab", { name: "Movimenti" }));
    expect(
      screen.getByRole("combobox", { name: "Direzione movimenti" }),
    ).toHaveValue("out");
    expect(
      screen.queryByRole("link", { name: "Apri fonte: SAL commessa" }),
    ).toBeNull();
  });
  it("exports all filtered rows without changing the whole plan export", () => {
    mount();
    click(screen.getByRole("tab", { name: "Movimenti" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Direzione movimenti" }),
      { target: { value: "out" } },
    );
    click(screen.getByRole("button", { name: "Esporta vista" }));
    const filtered = vi.mocked(exportToCSV).mock.calls[0][0];
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((r) => r.direzione === "Uscita")).toBe(true);
    click(screen.getByRole("button", { name: "Esporta piano" }));
    expect(
      vi
        .mocked(exportToCSV)
        .mock.calls[1][0].find((r) => r.descrizione === "SAL commessa"),
    ).toBeDefined();
  });
  it("resets a previous search when opening an actionable missing-date filter", () => {
    mount();
    click(screen.getByRole("tab", { name: "Movimenti" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca nei movimenti" }),
      { target: { value: "SAL" } },
    );
    click(screen.getByRole("tab", { name: "Cassa futura" }));
    click(screen.getByRole("button", { name: /Movimenti senza data/ }));
    expect(
      screen.getByRole("textbox", { name: "Cerca nei movimenti" }),
    ).toHaveValue("");
    expect(
      screen.getByRole("link", { name: "Apri fonte: Spesa senza scadenza" }),
    ).toBeVisible();
  });
  it("stores planning preferences separately for each company", async () => {
    const first = mount();
    click(screen.getByRole("button", { name: "30 giorni" }));
    first.unmount();
    mount({ ...forecastFixture, companyId: "other-company" });
    expect(screen.getByRole("button", { name: "90 giorni" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("retains collected receipts and distinguishes margins from cash", async () => {
    mount();
    click(screen.getByRole("tab", { name: "Incassato" }));
    expect(
      screen.getByRole("link", { name: "Apri fonte: Incasso registrato" }),
    ).toHaveAttribute("href", "/azienda/prima-nota");
    click(screen.getByRole("tab", { name: "Marginalità" }));
    expect(await screen.findByText("Marginalità di verifica")).toBeVisible();
  });
});

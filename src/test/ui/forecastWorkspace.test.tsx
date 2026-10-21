import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
vi.mock("@/lib/csvExport", () => ({ exportToCSV: vi.fn() }));
vi.mock("recharts", () => {
  const Nothing = (): null => null;
  return {
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    ComposedChart: () => <div>Grafico di verifica</div>,
    Bar: Nothing,
    Line: Nothing,
    CartesianGrid: Nothing,
    ReferenceDot: Nothing,
    ReferenceLine: Nothing,
    Tooltip: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
  };
});
import { ForecastWorkspace } from "@/components/forecast/ForecastWorkspace";
import { forecastFixture } from "@/test/fixtures/forecastDataset";
import { exportToCSV } from "@/lib/csvExport";
import type { ForecastDataset } from "@/hooks/useForecastLedger";
const click = (element: HTMLElement) => {
  fireEvent.mouseDown(element, { button: 0, ctrlKey: false });
  fireEvent.click(element);
};
function SearchSpy(): ReactNode {
  return <output data-testid="url">{useLocation().search}</output>;
}
const urlSearch = () => screen.getByTestId("url").textContent;
const mount = (data: ForecastDataset = forecastFixture, url = "/") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ForecastWorkspace data={data} onRefresh={vi.fn()} />
      <SearchSpy />
    </MemoryRouter>,
  );
const exported = (call = 0) => vi.mocked(exportToCSV).mock.calls[call][0];
const overdueSupplier = {
  id: "old-supplier",
  description: "Fornitore scaduto",
  counterparty: "",
  category: "fornitori" as const,
  direction: "out" as const,
  cents: 9_300_000,
  date: "2026-09-01",
  source: "Spesa registrata",
  href: "/azienda/costi",
  estimated: false,
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("previsionale: schede e filtri comuni", () => {
  it("opens on the overview with the six tabs and the renamed figures", () => {
    mount();
    expect(screen.getByRole("tab", { name: "Panoramica" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    for (const name of [
      "Settimane",
      "Movimenti",
      "Da sistemare",
      "Incassato",
      "Fonti e ipotesi",
    ])
      expect(screen.getByRole("tab", { name })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Marginalità" })).toBeNull();
    expect(screen.getByText("Ti mancano")).toBeVisible();
    expect(screen.getByText(/per restare sopra/)).toBeVisible();
    expect(screen.getByText("Incassi scaduti da sollecitare")).toBeVisible();
    expect(screen.getByText("Sotto la soglia dal 14 ott")).toBeVisible();
  });
  it("reads the tab and the filters from the URL and writes them back", () => {
    mount(forecastFixture, "/?scheda=settimane&giorni=30");
    expect(screen.getByRole("tab", { name: "Settimane" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "30 giorni" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    click(screen.getByRole("button", { name: "180 giorni" }));
    expect(urlSearch()).toContain("giorni=180");
    click(screen.getByRole("button", { name: "Azzera" }));
    expect(urlSearch()).toBe("?scheda=settimane");
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
  it("shows source failures in every tab with a retry, keeping the verdict", () => {
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
    expect(screen.getByText("Sotto la soglia dal 14 ott")).toBeVisible();
    expect(
      screen.getByText(/Verifica prima di decidere: mancano F24/),
    ).toBeVisible();
    click(screen.getByRole("tab", { name: "Movimenti" }));
    click(screen.getByRole("button", { name: "Riprova il caricamento" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("exports the active scenario and declares excluded amounts", () => {
    mount();
    fireEvent.change(screen.getByRole("combobox", { name: "Scenario incassi" }), {
      target: { value: "15" },
    });
    click(screen.getByRole("button", { name: "Esporta piano" }));
    const rows = exported();
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
  it("uses the real average delay from the collected tab as a scenario", () => {
    mount({
      ...forecastFixture,
      collected: [
        { ...forecastFixture.collected[0], expectedDate: "2026-10-03" },
      ],
    });
    const option = screen.getByRole("option", {
      name: "Ritardo medio reale (10 giorni)",
    });
    expect(option).not.toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Scenario incassi" }), {
      target: { value: "reale" },
    });
    click(screen.getByRole("button", { name: "Esporta piano" }));
    expect(
      exported().find((r) => r.descrizione === "SAL commessa"),
    ).toMatchObject({ data: "2026-10-26", ritardo_giorni: "10" });
  });
  it("requires an explicit assumption to include an overdue receipt", () => {
    mount();
    click(screen.getByRole("checkbox", { name: "Includi incassi scaduti" }));
    click(screen.getByRole("button", { name: "Esporta piano" }));
    expect(
      exported().find((r) => r.descrizione === "Fattura scaduta"),
    ).toMatchObject({ data: "2026-10-14", inclusione: "Incluso" });
  });
  it("leaves overdue unpaid expenses out until the switch includes them", () => {
    mount({
      ...forecastFixture,
      movements: [...forecastFixture.movements, overdueSupplier],
    });
    click(screen.getByRole("button", { name: "Esporta piano" }));
    expect(
      exported().find((r) => r.descrizione === "Fornitore scaduto")?.inclusione,
    ).toBe("Escluso: uscita scaduta non segnata pagata");
    click(screen.getByRole("checkbox", { name: "Includi uscite scadute" }));
    click(screen.getByRole("button", { name: "Esporta piano" }));
    expect(
      exported(1).find((r) => r.descrizione === "Fornitore scaduto"),
    ).toMatchObject({ data: "2026-10-14", inclusione: "Incluso" });
  });
  it("lists what to fix and opens each list in Movimenti", () => {
    mount({
      ...forecastFixture,
      movements: [...forecastFixture.movements, overdueSupplier],
    });
    click(screen.getByRole("tab", { name: "Da sistemare" }));
    expect(
      screen.getByText("Uscite scadute non segnate pagate"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Apri Spese" })).toHaveAttribute(
      "href",
      "/azienda/costi",
    );
    click(screen.getByRole("button", { name: "Vedi Movimenti senza data" }));
    expect(screen.getByRole("tab", { name: "Movimenti" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("link", { name: "Apri fonte: Spesa senza scadenza" }),
    ).toHaveAttribute("href", "/azienda/costi");
  });
  it("shows weeks below the threshold and opens that week's movements", () => {
    mount(forecastFixture, "/?scheda=settimane");
    const table = screen.getByRole("table", {
      name: "Piano settimanale con minimo giornaliero e saldo finale",
    });
    expect(within(table).getAllByText("sotto soglia").length).toBeGreaterThan(0);
    click(screen.getByRole("button", { name: "Apri movimenti 14 ott" }));
    expect(screen.getByText(/Periodo 14 ott – 20 ott/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Apri fonte: SAL commessa" }),
    ).toHaveAttribute("href", "/azienda/ordini/example");
  });
  it("sorts the movements by amount", () => {
    mount(forecastFixture, "/?scheda=movimenti");
    fireEvent.change(screen.getByRole("combobox", { name: "Ordina movimenti" }), {
      target: { value: "importo-desc" },
    });
    const links = screen
      .getAllByRole("link", { name: /Apri fonte/ })
      .map((l) => l.getAttribute("aria-label"));
    expect(links[0]).toBe("Apri fonte: SAL commessa");
  });
  it("filters every tab by category from the common bar", () => {
    mount();
    fireEvent.change(screen.getByRole("combobox", { name: "Categoria" }), {
      target: { value: "clienti" },
    });
    expect(urlSearch()).toContain("categoria=clienti");
    expect(screen.getByText(/Vista filtrata/)).toBeVisible();
    click(screen.getByRole("tab", { name: "Movimenti" }));
    expect(
      screen.queryByRole("link", { name: "Apri fonte: Saldo materiali" }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Apri fonte: SAL commessa" }),
    ).toBeVisible();
  });
  it("moves a single receipt only in simulation and restores it", () => {
    mount(forecastFixture, "/?scheda=movimenti");
    fireEvent.change(
      screen.getByLabelText("Sposta incasso: SAL commessa"),
      { target: { value: "2026-11-20" } },
    );
    expect(screen.getByText("Data spostata")).toBeVisible();
    expect(
      JSON.parse(localStorage.getItem("forecast-spostamenti-v1:forecast-qa")!),
    ).toEqual({ customer: "2026-11-20" });
    click(screen.getByRole("button", { name: "Esporta piano" }));
    expect(
      exported().find((r) => r.descrizione === "SAL commessa")?.data,
    ).toBe("2026-11-20");
    click(screen.getByRole("button", { name: "Ripristina" }));
    expect(screen.queryByText("Data spostata")).toBeNull();
  });
  it("exports all filtered rows without changing the whole plan export", () => {
    mount(forecastFixture, "/?scheda=movimenti");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Direzione movimenti" }),
      { target: { value: "out" } },
    );
    click(screen.getByRole("button", { name: "Esporta vista" }));
    const filtered = exported();
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((r) => r.direzione === "Uscita")).toBe(true);
    click(screen.getByRole("button", { name: "Esporta piano" }));
    expect(
      exported(1).find((r) => r.descrizione === "SAL commessa"),
    ).toBeDefined();
  });
  it("stores the safety threshold separately for each company", () => {
    const first = mount();
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Soglia di sicurezza in euro" }),
      { target: { value: "1200" } },
    );
    first.unmount();
    mount({ ...forecastFixture, companyId: "other-company" });
    expect(
      screen.getByRole("spinbutton", { name: "Soglia di sicurezza in euro" }),
    ).toHaveValue(5000);
    cleanup();
    mount();
    expect(
      screen.getByRole("spinbutton", { name: "Soglia di sicurezza in euro" }),
    ).toHaveValue(1200);
  });
  it("retains collected receipts and points margins to the jobs page", () => {
    mount(forecastFixture, "/?scheda=incassato");
    expect(
      screen.getByRole("link", { name: "Apri fonte: Incasso registrato" }),
    ).toHaveAttribute("href", "/azienda/prima-nota");
    click(screen.getByRole("tab", { name: "Fonti e ipotesi" }));
    expect(
      screen.getByRole("link", { name: "Commesse → Marginalità" }),
    ).toHaveAttribute("href", "/azienda/ordini?tab=marginalita");
  });
});

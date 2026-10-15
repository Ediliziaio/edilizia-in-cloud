import { afterEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import { CompanyEconomicsTab } from "@/components/admin/company/CompanyEconomicsTab";
import type { EconomicsReport } from "@/lib/companyEconomics";
const state = vi.hoisted(() => ({
  data: null as EconomicsReport | null,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));
vi.mock("@/hooks/useCompanyEconomics", () => ({
  useCompanyEconomics: () => state,
}));
vi.mock("@/hooks/useCompanyDatabaseFootprint", () => ({
  useCompanyDatabaseFootprint: () => ({
    data: null as import("@/lib/companyConsumption").DatabaseFootprint | null,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
afterEach(() => {
  cleanup();
  state.data = null;
  state.isError = false;
  state.error = null;
});
const data: EconomicsReport = {
  measured_at: "2026-10-15T09:00:00Z",
  period_start: "2026-10-12T00:00:00Z",
  period_end: "2026-11-12T00:00:00Z",
  companies: [
    {
      id: "a",
      name: "Bagni Milano",
      status: "active",
      payment_method: "comped",
      created_at: "2026-01-01",
      plan_name: "Pro",
      plan_monthly_eur: 247,
      custom_monthly_eur: null,
      override_expires_at: null,
    },
    {
      id: "b",
      name: "Cliente pagante",
      status: "active",
      payment_method: "stripe",
      created_at: "2026-01-01",
      plan_name: "Pro",
      plan_monthly_eur: 247,
      custom_monthly_eur: null,
      override_expires_at: null,
    },
  ],
  costs: [
    {
      company_id: "a",
      kind: "email",
      recorded_eur: 0,
      events: 4,
      missing_events: 4,
      estimated_events: 0,
    },
  ],
  providers: [
    {
      id: "supabase",
      label: "Supabase",
      kind: "cycle",
      observed_at: "2026-10-15T09:00:00Z",
      period_start: "2026-10-12T00:00:00Z",
      period_end: "2026-11-12T00:00:00Z",
      current_amount: 25,
      forecast_amount: 76,
      currency: "USD",
      eur_per_unit: 0.9,
      fx_date: "2026-10-14",
      source_url: "https://supabase.com/dashboard",
      last_invoice_amount: 73.39,
      last_invoice_date: "2026-10-12",
      note: "",
    },
  ],
  storage: [],
  legacy_ai: { events: 0, recorded_eur: 0, note: "" },
};
describe("Scheda economia azienda", () => {
  it("non presenta errori di caricamento come costo zero", () => {
    state.isError = true;
    state.error = new Error("Accesso riservato");
    render(<CompanyEconomicsTab companyId="a" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Dati economici non disponibili",
    );
    expect(screen.queryByText("0,00 €")).not.toBeInTheDocument();
  });
  it("mostra email non misurate, margine parziale e previsione separata", () => {
    state.data = data;
    render(<CompanyEconomicsTab companyId="a" />);
    expect(screen.getByText("Non misurato")).toBeInTheDocument();
    expect(screen.getByText("Il margine è provvisorio")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Previsione ciclo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("4 costi da verificare nell’azienda"),
    ).toBeInTheDocument();
  });
  it("cerca aziende senza cambiare il riparto e ordina il confronto", () => {
    state.data = data;
    render(<CompanyEconomicsTab companyId="a" />);
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Cerca azienda nel confronto economico",
      }),
      { target: { value: "pagante" } },
    );
    expect(screen.getByText("1 di 2 aziende")).toBeInTheDocument();
    expect(screen.getAllByText("1/2").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Ordina confronto economico"), {
      target: { value: "margin" },
    });
    expect(
      within(
        screen.getByRole("table", { name: "Costi e margine per ogni azienda" }),
      ).getByText("Cliente pagante"),
    ).toBeInTheDocument();
  });
  it("una nuova azienda non eredita il margine di un’altra", () => {
    state.data = data;
    render(<CompanyEconomicsTab companyId="missing" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Azienda non presente");
  });
  it("collega le tariffe al relativo percorso senza modifiche economiche", () => {
    state.data = data;
    const onNavigateToTab = vi.fn();
    render(
      <CompanyEconomicsTab companyId="a" onNavigateToTab={onNavigateToTab} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Gestisci crediti e tariffe/ }),
    );
    expect(onNavigateToTab).toHaveBeenCalledWith("billing");
  });
});

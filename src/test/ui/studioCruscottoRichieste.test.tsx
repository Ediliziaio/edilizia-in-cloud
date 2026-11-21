import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import AccountantDashboard from "@/pages/accountant/AccountantDashboard";
import AccountantRequests from "@/pages/accountant/AccountantRequests";

import type { AccountantCompanyAccessRow, AccountantNotificationRow } from "@/hooks/accountant/useAccountantPortalData";

const demo = vi.hoisted(() => {
  const company: NonNullable<AccountantCompanyAccessRow["company"]> = { id: "impresa-alfa", name: "Impresa Alfa", vat_number: "12345000001", fiscal_code: null, legal_city: "Forlì" };
  const request = { firm_id: "studio-alfa", company_id: company.id, requested_by: "contabile-demo", status: "pending",
    resource_type: "proposta", operation: "update", created_at: "2026-11-01T10:00:00Z", expires_at: "2099-12-31T00:00:00Z" };
  return {
    firm: { id: "studio-alfa", name: "Studio Alfa" },
    companies: [{
      id: "delega-1", company_id: company.id, company, status: "active", access_mode: "approval_required",
    }, {
      id: "delega-2", company_id: "impresa-beta", company: { ...company, id: "impresa-beta", name: "Impresa Beta", vat_number: "12345000002", legal_city: "Torino" },
      status: "invited", access_mode: "read_only",
    }],
    requests: [
      { ...request, id: "req-1", payload: { description: "Aggiorna la descrizione Alfa" } },
      { ...request, id: "req-2", status: "approved", payload: { description: "Proposta già approvata" } },
      { ...request, id: "req-3", firm_id: "studio-esterno", payload: { description: "Proposta altro studio" } },
      { ...request, id: "req-4", company_id: "impresa-beta", status: "approved", payload: { description: "Proposta Beta già approvata" } },
    ],
  };
});

vi.mock("@/hooks/useSEO", () => ({ useSEO: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "contabile-demo" } }) }));
vi.mock("@/components/accountant/CreateAziendaDialog", () => ({ CreateAziendaDialog: (): null => null }));
vi.mock("@/components/accountant/NuovaRichiestaStudio", () => ({
  NuovaRichiestaStudio: ({ aziendaIniziale }: { aziendaIniziale: string }) => <input aria-label="Bozza proposta" name={aziendaIniziale} />,
}));
vi.mock("@/hooks/accountant/useAccountantPortalData", () => ({
  useAccountantFirm: () => ({ data: demo.firm }),
  useAccountantCompanies: () => ({ data: demo.companies, isSuccess: true }),
  useAccountantNotifications: () => ({ data: [] as AccountantNotificationRow[] }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      expect(table).toBe("accountant_change_requests");
      let data = [...demo.requests];
      const query = {
        select: () => query, order: () => query, limit: () => query,
        eq: (field: "requested_by" | "firm_id", value: string) => {
          data = data.filter((item) => item[field] === value);
          return query;
        },
        then: (resolve: (result: { data: typeof data; error: null }) => void) =>
          Promise.resolve({ data, error: null }).then(resolve),
      };
      return query;
    },
  },
}));

afterEach(() => cleanup());

function renderStudio(path = "/commercialista") {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/commercialista" element={<AccountantDashboard />} />
      <Route path="/commercialista/richieste" element={<AccountantRequests />} />
    </Routes>
  </MemoryRouter></QueryClientProvider>);
}

it("dà accesso allo storico dello studio selezionato e filtra le proposte per stato", async () => {
  renderStudio();
  const requests = await screen.findByRole("link", { name: /Segui le richieste di modifica.*1 in attesa/ });
  expect(screen.getByRole("link", { name: /Apri gli inviti e le notifiche.*1 invito/ }).getAttribute("href")).toBe("/commercialista/inbox");
  fireEvent.click(requests);
  expect(await screen.findByText("Aggiorna la descrizione Alfa")).toBeTruthy();
  expect(screen.queryByText("Proposta altro studio")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Approvate" }));
  expect(screen.queryByText("Aggiorna la descrizione Alfa")).toBeNull();
  expect(screen.getByText("Proposta già approvata")).toBeTruthy();
});

it("combina ricerca, stato e livello della delega e conserva i filtri al ritorno", () => {
  renderStudio();
  fireEvent.click(screen.getByRole("button", { name: /attive/i }));
  fireEvent.change(screen.getByRole("combobox", { name: "Livello di accesso" }), { target: { value: "approval_required" } });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "forli 12345000001" } });

  expect(screen.queryByRole("heading", { name: "Impresa Beta" })).toBeNull();
  const link = screen.getByRole("link", { name: "Apri Impresa Alfa" });
  const returnTo = new URL(link.getAttribute("href")!, "http://localhost").searchParams.get("returnTo")!;
  const filters = new URL(returnTo, "http://localhost").searchParams;
  expect(Object.fromEntries(filters)).toEqual({ stato: "active", delega: "approval_required", q: "forli 12345000001" });

  fireEvent.change(screen.getByRole("combobox", { name: "Livello di accesso" }), { target: { value: "read_only" } });
  expect(screen.getByText("Nessuna azienda corrisponde ai filtri")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
  expect(screen.getByRole("heading", { name: "Impresa Beta" })).toBeTruthy();
});

it("apre le richieste in attesa della singola azienda e mantiene la bozza mentre si filtra lo storico", async () => {
  renderStudio();
  fireEvent.click(await screen.findByRole("link", { name: "1 richiesta in attesa" }));
  expect(await screen.findByText("Aggiorna la descrizione Alfa")).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "Filtra richieste per azienda" }) as HTMLSelectElement).value).toBe("impresa-alfa");
  expect(screen.getByRole("button", { name: "In attesa" }).getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(screen.getByRole("button", { name: "Nuova richiesta" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Bozza proposta" }), { target: { value: "Testo ancora in preparazione" } });
  fireEvent.click(screen.getByRole("button", { name: "Approvate" }));
  expect(screen.getByText("Proposta già approvata")).toBeTruthy();
  expect(screen.queryByText("Proposta Beta già approvata")).toBeNull();

  fireEvent.change(screen.getByRole("combobox", { name: "Filtra richieste per azienda" }), { target: { value: "impresa-beta" } });
  expect(screen.getByText("Proposta Beta già approvata")).toBeTruthy();
  expect(screen.queryByText("Proposta già approvata")).toBeNull();
  expect((screen.getByRole("textbox", { name: "Bozza proposta" }) as HTMLInputElement).value).toBe("Testo ancora in preparazione");
});

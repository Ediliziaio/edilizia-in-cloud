import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import AccountantDashboard from "@/pages/accountant/AccountantDashboard";
import AccountantRequests from "@/pages/accountant/AccountantRequests";

const demo = vi.hoisted(() => {
  const company = { id: "impresa-alfa", name: "Impresa Alfa", vat_number: null, fiscal_code: null, legal_city: null };
  const request = { firm_id: "studio-alfa", company_id: company.id, requested_by: "contabile-demo", status: "pending",
    resource_type: "proposta", operation: "update", created_at: "2026-11-01T10:00:00Z", expires_at: "2099-12-31T00:00:00Z" };
  return {
    firm: { id: "studio-alfa", name: "Studio Alfa" },
    companies: [{
      id: "delega-1", company_id: company.id, company, status: "active", access_mode: "approval_required",
    }, {
      id: "delega-2", company_id: "impresa-beta", company: { ...company, id: "impresa-beta", name: "Impresa Beta" },
      status: "invited", access_mode: "read_only",
    }],
    requests: [
      { ...request, id: "req-1", payload: { description: "Aggiorna la descrizione Alfa" } },
      { ...request, id: "req-2", status: "approved", payload: { description: "Proposta già approvata" } },
      { ...request, id: "req-3", firm_id: "studio-esterno", payload: { description: "Proposta altro studio" } },
    ],
  };
});

vi.mock("@/hooks/useSEO", () => ({ useSEO: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "contabile-demo" } }) }));
vi.mock("@/components/accountant/CreateAziendaDialog", () => ({ CreateAziendaDialog: () => null }));
vi.mock("@/components/accountant/NuovaRichiestaStudio", () => ({ NuovaRichiestaStudio: () => null }));
vi.mock("@/hooks/accountant/useAccountantPortalData", () => ({
  useAccountantFirm: () => ({ data: demo.firm }),
  useAccountantCompanies: () => ({ data: demo.companies, isSuccess: true }),
  useAccountantNotifications: () => ({ data: [] }),
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

it("dà accesso allo storico dello studio selezionato e filtra le proposte per stato", async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/commercialista"]}>
    <Routes>
      <Route path="/commercialista" element={<AccountantDashboard />} />
      <Route path="/commercialista/richieste" element={<AccountantRequests />} />
    </Routes>
  </MemoryRouter></QueryClientProvider>);
  const requests = await screen.findByRole("link", { name: /Segui le richieste di modifica.*1 in attesa/ });
  expect(screen.getByRole("link", { name: /Apri gli inviti e le notifiche.*1 invito/ }).getAttribute("href")).toBe("/commercialista/inbox");
  fireEvent.click(requests);
  expect(await screen.findByText("Aggiorna la descrizione Alfa")).toBeTruthy();
  expect(screen.queryByText("Proposta altro studio")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Approvate" }));
  expect(screen.queryByText("Aggiorna la descrizione Alfa")).toBeNull();
  expect(screen.getByText("Proposta già approvata")).toBeTruthy();
});

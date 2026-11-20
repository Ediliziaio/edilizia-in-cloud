import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CommercialistiDashboard from "@/pages/admin/CommercialistiDashboard";

const database = vi.hoisted(() => ({
  errorDeleghe: false,
  studi: [
    { id: "s1", name: "Studio Bianchi", status: "active", owner_user_id: "u1", created_at: "2026-01-15" },
    { id: "s2", name: "Studio Verdi", status: "active", owner_user_id: null, created_at: "2026-02-15" },
  ],
  deleghe: [
    { id: "a1", firm_id: "s1", company_id: "a1", status: "active", access_mode: "read_only", company: { name: "Impresa Alfa", status: "suspended" } },
    { id: "a2", firm_id: "s1", company_id: "a2", status: "invited", access_mode: "operational", company: { name: "Impresa Beta", status: "active" } },
    { id: "a3", firm_id: "s2", company_id: "a1", status: "active", access_mode: "operational", company: { name: "Impresa Alfa", status: "suspended" } },
  ],
}));

vi.mock("@/hooks/useSuperAdminPermissions", () => ({
  useSuperAdminPermissions: () => ({ permissions: { can_manage_companies: true, super_admin: true } }),
}));
vi.mock("@/hooks/useAdminActivity", () => ({
  latestActivity: (): null => null,
  useAdminActivity: () => ({ activity: {}, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const risultati: Record<string, unknown[]> = {
        accountant_firms: database.studi,
        accountant_firm_members: [],
        accountant_company_access: database.deleghe,
        profiles: [{ id: "u1", first_name: "Mario", last_name: "Bianchi", email: "studio@esempio.it" }],
      };
      const risposta: { data: unknown[] | null; error: { message: string; code: string } | null } =
        table === "accountant_company_access" && database.errorDeleghe
        ? { data: null, error: { message: "Lettura non disponibile", code: "42501" } }
        : { data: risultati[table], error: null };
      const query = {
        select: () => query,
        order: () => query,
        in: () => query,
        then: (resolve: (result: typeof risposta) => unknown) => Promise.resolve(risposta).then(resolve),
      };
      return query;
    },
  },
}));

function apri() {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={query}><MemoryRouter><CommercialistiDashboard /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => {
  database.errorDeleghe = false;
  cleanup();
});

describe("Commercialisti", () => {
  it("conta una sola volta l'azienda delegata da più studi e combina ricerca e inviti", async () => {
    apri();
    const kpi = (await screen.findByText("Aziende delegate")).parentElement?.parentElement;
    expect(kpi?.textContent).toBe("Aziende delegate1Con delega attiva");
    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca studi e aziende" }), { target: { value: "Impresa Alfa" } });
    expect(screen.getAllByRole("button", { name: /Apri dettaglio Studio/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Inviti in attesa 1" }));
    expect(screen.queryByRole("button", { name: "Apri dettaglio Studio Verdi" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apri dettaglio Studio Bianchi" }));
    const deleghe = within(screen.getByRole("region", { name: "Deleghe aziendali" }));
    expect(deleghe.getByRole("link", { name: /Impresa Alfa.*Stato azienda Sospeso.*Attiva/ }).getAttribute("href")).toBe("/admin/aziende/a1");
    expect(deleghe.getByRole("link", { name: /Impresa Beta.*Invito in attesa/ }).getAttribute("href")).toBe("/admin/aziende/a2");
  });

  it("segnala la lettura fallita delle deleghe senza mostrare conteggi parziali", async () => {
    database.errorDeleghe = true;
    apri();
    expect((await screen.findByRole("alert")).textContent).toContain("Impossibile aggiornare studi, deleghe e membri.");
    expect(screen.queryByText("Aziende delegate")).toBeNull();
  });
});

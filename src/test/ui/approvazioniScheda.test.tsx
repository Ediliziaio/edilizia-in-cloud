/**
 * «Approvazioni» è una scheda di Modelli di preventivo (09/10/2026): prima era la linguetta «Regole e approvazioni»
 * nascosta dentro la pagina Margini, sotto un'altra fila di linguette.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import SettingsApprovazioni from "@/pages/azienda/settings/SettingsApprovazioni";

const state = vi.hoisted(() => ({
  role: "company_admin" as string,
  permissions: { isAdmin: true, canEditSettingsPricing: true } as Record<string, boolean>,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" }, role: state.role }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/hooks/useGovernanceThresholds", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGovernanceThresholds")>()),
  useGovernanceThresholds: () => ({ data: undefined as unknown, isLoading: false }),
  useSaveGovernanceThresholds: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null as unknown, error: null as unknown }) }) }) }) } }));

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SettingsApprovazioni /></QueryClientProvider>);
}
afterEach(() => { cleanup(); state.role = "company_admin"; state.permissions = { isAdmin: true, canEditSettingsPricing: true }; });

describe("scheda Approvazioni", () => {
  it("parla in italiano semplice: doppia approvazione, avviso sui costi, margine minimo delle commesse", async () => {
    open();
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Approvazioni e avvisi" })).toBeInTheDocument());
    expect(screen.getByText("Doppia approvazione preventivi")).toBeInTheDocument();
    expect(screen.getByText(/Avviso se i costi non seguono l'avanzamento \(SAL\)/)).toBeInTheDocument();
    expect(screen.getByText("Margine minimo delle commesse")).toBeInTheDocument();
    expect(screen.queryByText(/Governance/)).toBeNull();
  });

  it("chi non amministra e non può modificare il listino le vede in sola lettura", async () => {
    state.role = "staff";
    state.permissions = { isAdmin: false, canEditSettingsPricing: false };
    open();
    await waitFor(() => expect(screen.getByText(/Solo un amministratore dell'azienda può modificare queste soglie/)).toBeInTheDocument());
    for (const interruttore of screen.getAllByRole("switch")) expect(interruttore).toBeDisabled();
  });

  it("la rotta c'è, col permesso dei costi, e il piano la tratta come i preventivi", () => {
    const rotte = readFileSync("src/routes/companyRoutes.tsx", "utf8");
    expect(rotte).toContain('<Route path="approvazioni" element={withCompanyPermission("canViewCosts", <SettingsApprovazioni />)} />');
    expect(readFileSync("src/lib/impostazioni/pianoImpostazioni.ts", "utf8")).toContain("approvazioni: PREVENTIVI,");
  });
});

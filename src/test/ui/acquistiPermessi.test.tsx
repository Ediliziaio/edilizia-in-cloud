/**
 * Chi ha solo il permesso «Ufficio acquisti» (senza vedere le Commesse) entra
 * in /azienda/ordini e trova direttamente la scheda Acquisti; chi vede le
 * Commesse trova la scheda «Acquisti» accanto alle altre.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";

const stato = vi.hoisted(() => ({ permessi: {} as Record<string, boolean> }));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useFeatureFlags", () => ({ useFeatureFlags: () => ({ isFeatureEnabled: () => false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/pages/azienda/PurchaseOrdersList", () => ({ default: () => <p>pagina acquisti</p> }));
vi.mock("@/pages/azienda/SupplierRfqsList", () => ({ default: (): null => null }));
vi.mock("@/pages/azienda/DDTRicezioneList", () => ({ default: (): null => null }));
vi.mock("@/pages/azienda/GlobalErrors", () => ({ default: (): null => null }));
vi.mock("@/pages/azienda/MarginalitaCantieri", () => ({ default: (): null => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, user: { id: "u" } }) }));

import OrdersList from "@/pages/azienda/OrdersList";

function Dove() {
  const l = useLocation();
  return <output aria-label="indirizzo">{l.pathname}{l.search}</output>;
}

function disegna(percorso = "/azienda/ordini") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[percorso]}><OrdersList /><Dove /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const indirizzo = () => screen.getByLabelText("indirizzo").textContent;

describe("Commesse: ordini e DDT hanno la loro pagina", () => {
  beforeEach(() => {
    stato.permessi = { canViewOrders: false, canManagePurchasing: true, canViewCosts: false };
  });

  it("con il solo «Ufficio acquisti» si va agli ordini, senza Commesse", async () => {
    disegna();
    await waitFor(() => expect(indirizzo()).toBe("/azienda/ordini-acquisto"));
    expect(screen.queryByRole("tab", { name: /Commesse/ })).not.toBeInTheDocument();
  });

  it("anche chiedendo la scheda delle commesse resta sugli ordini", async () => {
    disegna("/azienda/ordini?tab=ordini");
    await waitFor(() => expect(indirizzo()).toBe("/azienda/ordini-acquisto"));
  });

  it("i vecchi link alle schede portano alle pagine e tengono i filtri", async () => {
    stato.permessi = { canViewOrders: true, canManagePurchasing: false, canViewCosts: false };
    disegna("/azienda/ordini?tab=acquisto&vista=elenco");
    await waitFor(() => expect(indirizzo()).toBe("/azienda/ordini-acquisto?vista=elenco"));
  });

  it("il vecchio link ai DDT porta alla pagina DDT", async () => {
    stato.permessi = { canViewOrders: true, canManagePurchasing: false, canViewCosts: false };
    disegna("/azienda/ordini?tab=ddt");
    await waitFor(() => expect(indirizzo()).toBe("/azienda/ddt"));
  });

  it("Commesse non ha più le schede Acquisti e DDT", () => {
    stato.permessi = { canViewOrders: true, canManagePurchasing: false, canViewCosts: false };
    disegna("/azienda/ordini?tab=oggi");
    expect(screen.queryByRole("tab", { name: /Acquisti/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^DDT/ })).not.toBeInTheDocument();
  });
});

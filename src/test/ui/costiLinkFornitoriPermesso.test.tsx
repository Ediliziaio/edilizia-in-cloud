/**
 * Pagina Costi → riquadro «I costi, in ordine»: sotto «Già pagato» ci sono due collegamenti, «Categorie» e «Fornitori».
 * «Fornitori» porta a Impostazioni → Fornitori, che chiede un altro permesso (16 persone vedono i costi, 6 i
 * fornitori): si mostra solo a chi ci può entrare, cioè all'amministratore o a chi vede i fornitori nelle impostazioni.
 * «Categorie» usa lo stesso permesso dei costi, quindi c'è sempre.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ permessi: {} as Record<string, boolean> }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, ...state.permessi }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));

import { CostIntegrationPanel } from "@/components/forecast/CompanyCostsManager";

const riepilogo = {
  total: 10, manual: 6, linked: 4, scheduled: 8, paid: 5,
  totalAmount: 10000, manualAmount: 6000, linkedAmount: 4000, scheduledAmount: 8000, paidAmount: 5000,
};

function monta() {
  render(
    <MemoryRouter>
      <CostIntegrationPanel
        summary={riepilogo}
        missingCategory={0}
        missingSupplier={0}
        unscheduled={0}
        onShowOrderCosts={() => {}}
        onShowUnscheduled={() => {}}
        onShowMissingCategories={() => {}}
        onShowMissingSuppliers={() => {}}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => { state.permessi = {}; });
afterEach(cleanup);

describe("Costi: il collegamento ai fornitori compare solo a chi ci può entrare", () => {
  it("chi vede i costi ma non i fornitori trova «Categorie» e non «Fornitori»", () => {
    state.permessi = { canViewCosts: true };
    monta();
    expect(screen.getByRole("link", { name: "Categorie" })).toHaveAttribute("href", "/azienda/impostazioni/categorie-costi");
    expect(screen.queryByRole("link", { name: "Fornitori" })).toBeNull();
  });
  it("chi vede i fornitori nelle impostazioni trova anche «Fornitori»", () => {
    state.permessi = { canViewCosts: true, canViewSettingsSuppliers: true };
    monta();
    expect(screen.getByRole("link", { name: "Fornitori" })).toHaveAttribute("href", "/azienda/impostazioni/fornitori");
    expect(screen.getByRole("link", { name: "Categorie" })).toBeInTheDocument();
  });
  it("l'amministratore trova tutti e due", () => {
    state.permessi = { isAdmin: true, canViewCosts: true };
    monta();
    expect(screen.getByRole("link", { name: "Fornitori" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Categorie" })).toBeInTheDocument();
  });
});

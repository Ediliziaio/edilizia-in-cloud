/**
 * Chi ha solo il permesso «Ufficio acquisti» (senza vedere le Commesse) entra
 * in /azienda/ordini e trova direttamente la scheda Acquisti; chi vede le
 * Commesse trova la scheda «Acquisti» accanto alle altre.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

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

function disegna(percorso = "/azienda/ordini") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[percorso]}><OrdersList /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Commesse › Acquisti: chi entra", () => {
  beforeEach(() => {
    stato.permessi = { canViewOrders: false, canManagePurchasing: true, canViewCosts: false };
  });

  it("con il solo «Ufficio acquisti» si apre la scheda Acquisti, senza Commesse", () => {
    disegna();
    expect(screen.getByText("pagina acquisti")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Acquisti/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /Commesse/ })).not.toBeInTheDocument();
  });

  it("anche chiedendo la scheda delle commesse resta sugli acquisti", () => {
    disegna("/azienda/ordini?tab=ordini");
    expect(screen.getByText("pagina acquisti")).toBeInTheDocument();
  });

  it("chi vede le commesse trova la scheda «Acquisti» fra le altre", () => {
    stato.permessi = { canViewOrders: true, canManagePurchasing: false, canViewCosts: false };
    disegna("/azienda/ordini?tab=acquisto");
    expect(screen.getByRole("tab", { name: /Commesse/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Acquisti/ })).toHaveAttribute("aria-selected", "true");
  });
});

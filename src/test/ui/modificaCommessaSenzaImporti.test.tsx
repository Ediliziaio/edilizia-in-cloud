/**
 * Modifica commessa senza «Venduto e importi» (14/11/2026).
 *
 * Chi modifica le commesse ma non vede gli importi riceve dalla vista totale, IVA e rate vuoti.
 * Salvando, la pagina li rimandava indietro: il totale diventava 0 e il piano dei pagamenti una
 * sola rata «Saldo» da 0. In più il controllo «importo maggiore di zero» non lo lasciava salvare.
 * Ora la parte economica non si mostra, non si controlla e non si salva.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ importi: false, rpc: vi.fn() }));
const empty: never[] = [];
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" }, user: { id: "user" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ onlyAssigned: false, canViewOrderAmounts: m.importi, canViewCosts: false }) }));
vi.mock("@/hooks/useBonusFiscaliFlags", () => ({ useBonusFiscaliFlags: () => ({ bonusMultipli: false }) }));
vi.mock("@/hooks/useCompanyCustomers", () => ({ useCompanyCustomers: () => ({ data: [] as never[], isLoading: false }) }));
vi.mock("@/hooks/billing/useFatturaOrdineLink", () => ({ useFattureByOrdine: () => ({ data: empty, isError: false }) }));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({ CreateCustomerDialog: (): null => null }));
vi.mock("@/components/orders/OrderAttachments", () => ({ OrderAttachments: (): null => null }));
vi.mock("@/components/orders/OrderItemsList", () => ({ OrderItemsList: (): null => null }));
vi.mock("@/components/orders/FinancialSummary", () => ({ FinancialSummary: () => <output aria-label="Parte economica" /> }));
vi.mock("@/components/salespeople/SalespersonSelect", () => ({ SalespersonSelect: (): null => null }));
vi.mock("@/components/orders/AssignedToSelect", () => ({ AssignedToSelect: (): null => null }));
vi.mock("@/components/warehouse/WarehouseSelect", () => ({ WarehouseSelect: (): null => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  catena.select = () => catena; catena.eq = () => catena;
  catena.maybeSingle = async () => ({ data: { version: 2 }, error: null as unknown });
  return { supabase: { from: () => catena, rpc: m.rpc } };
});

import EditOrder from "@/pages/azienda/EditOrder";
import { toast } from "sonner";

function apri() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  // Dalla vista: chi non ha il diritto riceve importi e IVA a null.
  qc.setQueryData(["order", "order"], { id: "order", customer_id: "cliente", description: "Ristrutturazione", total_amount: null, vat_rate: null, payment_type: null, updated_at: "2025-01-01T00:00:00Z", version: 1 });
  for (const key of [["order-items", "order"], ["order-installments", "order"], ["order-bonus-lines", "order"], ["order-statuses", "company"]]) qc.setQueryData(key, []);
  qc.setQueryData(["order-salesperson", "order"], null);
  qc.setQueryData(["order-customer", "cliente"], { id: "cliente", first_name: "Cliente", last_name: "Demo" });
  qc.setQueryData(["edit-order-variazioni-approvate", "company", "order"], 0);
  render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/azienda/ordini/order/modifica"]}><Routes><Route path="/azienda/ordini/:id/modifica" element={<EditOrder />} /></Routes></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => { m.importi = false; m.rpc.mockReset(); m.rpc.mockResolvedValue({ data: {}, error: null }); localStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Modifica commessa senza «Venduto e importi»", () => {
  it("non mostra la parte economica e dice chi la gestisce", async () => {
    apri();
    await screen.findByDisplayValue("Ristrutturazione");
    expect(screen.queryByLabelText("Parte economica")).toBeNull();
    expect(screen.getByText(/«Venduto e importi»/)).toBeInTheDocument();
  });

  it("salva la descrizione senza toccare totale, IVA, rate e bonus", async () => {
    apri();
    fireEvent.change(await screen.findByDisplayValue("Ristrutturazione"), { target: { value: "Ristrutturazione bagno" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva Modifiche" }));
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    const [nome, args] = m.rpc.mock.calls[0];
    expect(nome).toBe("commessa_salva");
    expect(args.p_campi).toMatchObject({ description: "Ristrutturazione bagno" });
    for (const k of ["total_amount", "vat_rate", "payment_type", "tetto_importo", "financing_cost"]) expect(args.p_campi, k).not.toHaveProperty(k);
    expect(args.p_rate).toBeNull();
    expect(args.p_bonus).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("chi ha il permesso vede la parte economica come prima", async () => {
    m.importi = true;
    apri();
    await screen.findByDisplayValue("Ristrutturazione");
    expect(screen.getByLabelText("Parte economica")).toBeInTheDocument();
  });
});

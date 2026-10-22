import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const stato = vi.hoisted(() => ({
  permessi: { canManagePurchasing: true, canViewCosts: true, isAdmin: false, canEditOrders: false },
  tabelle: {} as Record<string, unknown[]>,
  copertura: [] as unknown[],
  creaOrdini: vi.fn(),
  assegna: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, user: { id: "utente" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useOperationalSuppliers", () => ({ useOperationalSuppliers: () => ({ suppliers: [{ id: "f1", name: "Elettroforniture Srl", is_active: true }] }) }));
vi.mock("@/hooks/useMaterialProcurement", () => ({ loadMaterialCoverage: async () => stato.copertura }));
vi.mock("@/hooks/useMaterialiPerFase", () => ({
  useAzioniMateriali: () => ({
    creaOrdini: { mutate: stato.creaOrdini, isPending: false },
    assegnaFornitore: { mutate: stato.assegna, isPending: false },
    richiediOfferta: { mutate: vi.fn(), isPending: false },
  }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: stato.tabelle[tabella] ?? [], error: null }).then(ok);
    return q;
  };
  return { supabase: { from: (t: string) => catena(t) } };
});

import AcquistiDaFare from "@/pages/azienda/AcquistiDaFare";

const riga = (id: string, extra: Record<string, unknown> = {}) => ({
  id, order_id: "c1", name: `Materiale ${id}`, description: null, quantity: 10, status: "da_ordinare", supplier_id: "f1",
  purchase_price: 1, vat_rate: 22, phase_id: "fase-el", unita_misura: "m", specifiche: "450/750 V", origine_materiale: "computo",
  quantita_calcolata: 10, origini: [], locale: null, supplier_rfq_item_id: null, stock_item_id: null, posizioni: null, ...extra,
});

function disegna(percorso = "/azienda/acquisti-da-fare") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[percorso]}><AcquistiDaFare /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Acquisti da fare (ufficio acquisti)", () => {
  beforeEach(() => {
    stato.permessi = { canManagePurchasing: true, canViewCosts: true, isAdmin: false, canEditOrders: false };
    stato.creaOrdini.mockReset();
    stato.copertura = [];
    stato.tabelle = {
      materiali_fasi_validazione: [{ phase_id: "fase-el", order_id: "c1", validata_il: "2026-10-22", fase: { name: "Impianto elettrico", position: 1 }, commessa: { order_code: "C-2028-001" } }],
      order_items: [riga("a"), riga("b", { supplier_id: null })],
    };
  });

  it("raggruppa per commessa › fase, con unità, specifiche, fornitore e stato", async () => {
    disegna();
    const commessa = await screen.findByRole("region", { name: "Commessa C-2028-001" });
    expect(within(commessa).getByText("Impianto elettrico")).toBeInTheDocument();
    expect(within(commessa).getAllByText("450/750 V")).toHaveLength(2);
    expect(within(commessa).getByText("Elettroforniture Srl")).toBeInTheDocument();
    expect(within(commessa).getByText("Fornitore da scegliere")).toBeInTheDocument();
    expect(within(commessa).getAllByText("Da ordinare")).toHaveLength(2);
  });

  it("i materiali già consegnati non sono tra quelli «da fare»", async () => {
    stato.copertura = [{ id: "p", order_item_id: "a", quantity: 10, quantity_received: 10, unit_of_measure: "m", purchase_orders: { id: "o", oda_number: "ODA-1", status: "ricevuto" } }];
    disegna();
    await screen.findByRole("region", { name: "Commessa C-2028-001" });
    expect(screen.queryByText("Materiale a")).not.toBeInTheDocument();
    expect(screen.getByText("Materiale b")).toBeInTheDocument();
  });

  it("seleziona la fase e crea gli ordini della commessa giusta", async () => {
    disegna();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleziona la fase Impianto elettrico" }));
    expect(screen.getByText("2 selezionati")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Crea ordine/ }));
    const [arg] = stato.creaOrdini.mock.calls[0];
    expect(arg.materiali.map((m: { id: string }) => m.id)).toEqual(["a", "b"]);
    expect(arg.orderIdDi({ order_id: "c1" })).toBe("c1");
  });

  it("senza il permesso «Ufficio acquisti» la pagina lo spiega", () => {
    stato.permessi = { canManagePurchasing: false, canViewCosts: false, isAdmin: false, canEditOrders: true };
    disegna();
    expect(screen.getByText(/permesso «Ufficio acquisti»/)).toBeInTheDocument();
  });
});

/**
 * Commesse › Acquisti: la pipeline (ha preso il posto di «Acquisti da fare»),
 * l'elenco, il redirect della vecchia pagina e chi può entrare.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const stato = vi.hoisted(() => ({
  permessi: { canManagePurchasing: true, canViewCosts: true, isAdmin: false, canEditOrders: false, canViewOrders: true } as Record<string, boolean>,
  materiali: [] as unknown[],
  rpc: vi.fn(),
  copertura: [] as unknown[],
  ordini: [] as unknown[],
  rfqs: [] as unknown[],
  contatori: {} as Record<string, unknown>,
  creaOrdini: vi.fn(),
  assegna: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, user: { id: "utente" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useOperationalSuppliers", () => ({ useOperationalSuppliers: () => ({ suppliers: [{ id: "f1", name: "Elettroforniture Srl", is_active: true }] }) }));
vi.mock("@/hooks/useMaterialProcurement", () => ({ loadMaterialCoverage: async () => stato.copertura }));
vi.mock("@/hooks/usePurchaseOrders", () => ({
  usePurchaseOrders: () => ({ orders: stato.ordini, isLoading: false, isError: false, create: { mutate: vi.fn(), isPending: false } }),
}));
vi.mock("@/hooks/useSupplierRfqs", () => ({ useSupplierRfqs: () => ({ rfqs: stato.rfqs, contatori: stato.contatori, isLoading: false }) }));
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
    // Le tabelle delle commesse non si leggono più: i materiali arrivano dalla RPC.
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: new Error(`lettura diretta di ${tabella}`) }).then(ok);
    return q;
  };
  return {
    supabase: {
      from: (t: string) => catena(t),
      rpc: (nome: string, args: unknown) => {
        stato.rpc(nome, args);
        return Promise.resolve({ data: nome === "acquisti_materiali_da_ordinare" ? stato.materiali : null, error: null });
      },
    },
  };
});

import PurchaseOrdersList from "@/pages/azienda/PurchaseOrdersList";
import { AcquistiDaFareRedirect } from "@/routes/company/AcquistiDaFareRedirect";

const riga = (id: string, extra: Record<string, unknown> = {}) => ({
  id, order_id: "c1", name: `Materiale ${id}`, description: null as never, quantity: 10, status: "da_ordinare", supplier_id: "f1",
  purchase_price: 1, vat_rate: 22, phase_id: "fase-el", unita_misura: "m", specifiche: "450/750 V", origine_materiale: "computo",
  quantita_calcolata: 10, origini: [] as never[], locale: null as never, supplier_rfq_item_id: null as never, stock_item_id: null as never,
  posizioni: null as never, rfq_id: null as never, commessa: "C-2028-001", fase: "Impianto elettrico", posizione_fase: 1, ...extra,
});

const ordine = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, oda_number: `ODA-${id}`, status, supplier_id: "f1", order_id: "c1", total: 500, issue_date: "2026-10-01",
  expected_delivery_date: null as string | null, suppliers: { name: "Elettroforniture Srl", email: null as string | null }, orders: { order_code: "C-2028-001" },
  purchase_order_items: [] as unknown[], ddt_ricezione: [] as unknown[], ...extra,
});

function Dove() {
  const l = useLocation();
  return <p data-testid="dove">{l.pathname}{l.search}</p>;
}

function disegna(percorso = "/azienda/ordini?tab=acquisto") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[percorso]}>
        <PurchaseOrdersList />
        <Dove />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Commesse › Acquisti: la pipeline", () => {
  beforeEach(() => {
    stato.permessi = { canManagePurchasing: true, canViewCosts: true, isAdmin: false, canEditOrders: false, canViewOrders: true };
    stato.creaOrdini.mockReset();
    stato.copertura = [];
    stato.ordini = [ordine("1", "inviato", { expected_delivery_date: "2020-01-10" }), ordine("2", "parziale"), ordine("3", "ricevuto"), ordine("4", "bozza")];
    stato.rfqs = [{ id: "r1", rfq_number: "RDO-1", titolo: "Cavi elettrici", status: "inviata", order_id: "c1", scadenza_offerte: null, data_fabbisogno: null, supplier_id_aggiudicato: null, created_at: "2026-10-01", orders: { order_code: "C-2028-001" } }];
    stato.contatori = { r1: { invitati: 3, risposte: 1, migliore: 900, fornitori: ["f1"] } };
    stato.materiali = [riga("a"), riga("b", { supplier_id: null })];
    stato.rpc.mockReset();
  });

  it("la pipeline è la vista di partenza: cinque colonne con conteggi", async () => {
    disegna();
    const daOrdinare = screen.getByRole("region", { name: "Colonna Da ordinare" });
    await within(daOrdinare).findByRole("region", { name: "Commessa C-2028-001" });
    // due materiali validati + la bozza d'ordine da mandare
    expect(screen.getByTestId("conteggio-da_ordinare")).toHaveTextContent("3");
    expect(screen.getByTestId("conteggio-offerta")).toHaveTextContent("1");
    expect(screen.getByTestId("conteggio-ordinato")).toHaveTextContent("1");
    expect(screen.getByTestId("conteggio-in_consegna")).toHaveTextContent("1");
    expect(screen.getByTestId("conteggio-consegnato")).toHaveTextContent("1");
    const offerta = screen.getByRole("region", { name: "Colonna Richiesta d'offerta" });
    expect(within(offerta).getByText("1/3 risposte")).toBeInTheDocument();
    const ordinato = screen.getByRole("region", { name: "Colonna Ordinato" });
    expect(within(ordinato).getByRole("link", { name: "Ordine ODA-1" })).toHaveAttribute("href", "/azienda/ordini-acquisto/1");
    expect(within(ordinato).getByText("1 in ritardo")).toBeInTheDocument();
  });

  it("i materiali arrivano dalla funzione dell'ufficio acquisti, per l'azienda in cui si lavora", async () => {
    disegna();
    await screen.findByRole("region", { name: "Commessa C-2028-001" });
    expect(stato.rpc).toHaveBeenCalledWith("acquisti_materiali_da_ordinare", { p_company: "azienda" });
  });

  it("nella colonna «Da ordinare» i materiali per commessa › fase, con specifiche e fornitore", async () => {
    disegna();
    const commessa = await screen.findByRole("region", { name: "Commessa C-2028-001" });
    expect(within(commessa).getByText("Impianto elettrico")).toBeInTheDocument();
    expect(within(commessa).getAllByText("450/750 V")).toHaveLength(2);
    expect(within(commessa).getByText("Elettroforniture Srl")).toBeInTheDocument();
    expect(within(commessa).getByText("Fornitore da scegliere")).toBeInTheDocument();
  });

  it("i materiali già in un ordine non si ripetono fra quelli da ordinare", async () => {
    stato.copertura = [{ id: "p", order_item_id: "a", quantity: 10, quantity_received: 10, unit_of_measure: "m", purchase_orders: { id: "3", oda_number: "ODA-3", status: "ricevuto" } }];
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

  it("chi può solo guardare vede i materiali ma non le azioni", async () => {
    stato.permessi = { canManagePurchasing: false, canViewCosts: false, isAdmin: false, canEditOrders: false, canViewOrders: true };
    disegna();
    await screen.findByRole("region", { name: "Commessa C-2028-001" });
    expect(screen.queryByRole("checkbox", { name: /Seleziona la fase/ })).not.toBeInTheDocument();
  });

  it("«Solo in ritardo» finisce nell'URL e lascia solo i ritardi", async () => {
    disegna();
    await screen.findByRole("region", { name: "Commessa C-2028-001" });
    fireEvent.click(screen.getByRole("button", { name: /Solo in ritardo/ }));
    expect(screen.getByTestId("dove")).toHaveTextContent("ritardo=1");
    expect(screen.getByTestId("conteggio-ordinato")).toHaveTextContent("1");
    expect(screen.getByTestId("conteggio-da_ordinare")).toHaveTextContent("0");
    expect(screen.getByTestId("conteggio-in_consegna")).toHaveTextContent("0");
  });

  it("la commessa della notifica arriva già filtrata", async () => {
    stato.ordini = [ordine("1", "inviato"), ordine("9", "inviato", { order_id: "c9", orders: { order_code: "C-9" } })];
    disegna("/azienda/ordini?tab=acquisto&vista=pipeline&commessa=c1");
    await screen.findByRole("region", { name: "Commessa C-2028-001" });
    expect(screen.getByTestId("conteggio-ordinato")).toHaveTextContent("1");
  });

  it("la vista elenco tiene la tabella degli ordini, con gli stessi filtri", async () => {
    disegna("/azienda/ordini?tab=acquisto&vista=elenco&commessa=c1");
    expect(screen.queryByRole("region", { name: "Colonna Da ordinare" })).not.toBeInTheDocument();
    expect((await screen.findAllByText("ODA-2")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Pipeline/ }));
    expect(screen.getByTestId("dove")).not.toHaveTextContent("vista=elenco");
    expect(screen.getByRole("region", { name: "Colonna Da ordinare" })).toBeInTheDocument();
  });
});

describe("La vecchia pagina «Acquisti da fare»", () => {
  it("rimanda alla pipeline, portando con sé la commessa", () => {
    render(
      <MemoryRouter initialEntries={["/azienda/acquisti-da-fare?commessa=c1"]}>
        <Routes>
          <Route path="/azienda/acquisti-da-fare" element={<AcquistiDaFareRedirect />} />
          <Route path="/azienda/ordini" element={<Dove />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/ordini?tab=acquisto&vista=pipeline&commessa=c1");
  });
});

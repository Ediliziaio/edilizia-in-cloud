import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExpensePaymentDialog } from "@/components/orders/ExpensePaymentDialog";

/**
 * «C'è in banca» nel pannello dei pagamenti (23/11/2026). Se il pagamento è già passato in
 * banca va collegato, non riscritto a mano: altrimenti risulterebbe due volte.
 */
Element.prototype.scrollIntoView ??= () => {};
type Risposta = { data: unknown; error: { message: string } | null };
const stato = vi.hoisted(() => ({
  rpc: vi.fn(),
  puoCollegare: true as boolean,
  candidati: [] as unknown[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: stato.rpc } }));
vi.mock("@/hooks/useContiPrimaNota", () => ({ useContiPrimaNota: () => ({ data: [] as unknown[], isError: false, isFetching: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: true, solaLettura: false, canViewTesoreria: true, canManagePayments: true, isAdmin: false }) }));
vi.mock("@/components/orders/ExpensePaymentLinks", () => ({ ExpenseSalLinks: (): null => null, ExpenseBankLink: (): null => null }));

const radius = {
  transaction_id: "tx-radius", data: "2026-10-02", importo: 3325.92, conto: "BPER Banca ···0769",
  causale: "ADDEBITO B2B Radius Business Solutions", chiave: "ricevuta:f1", forza: "media", prova: false,
  righe: [{ tipo: "ricevuta", id: "f1", importo: 3325.92, titolo: "Fattura 262700691224", di_questo_costo: true }],
};

beforeEach(() => {
  vi.stubGlobal("BroadcastChannel", undefined);
  stato.puoCollegare = true;
  stato.candidati = [radius];
  stato.rpc.mockReset();
  stato.rpc.mockImplementation(async (nome: string): Promise<Risposta> => {
    if (nome === "dettaglio_pagamento_costo") return { data: { id: "costo", company_id: "vulcano", nome: "Fattura 262700691224 - Radius", totale: 3325.92, pagato: 0, residuo: 3325.92, da_verificare: false, senza_prova: 0, movimenti: [] }, error: null };
    if (nome === "pagamenti_banca_candidati_costo") return { data: { candidati: stato.candidati, puo_collegare: stato.puoCollegare }, error: null };
    if (nome === "bank_conferma_ripartizione") return { data: { resto: 0 }, error: null };
    throw new Error(`RPC inattesa ${nome}`);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const apri = (props: { apriInRegistrazione?: boolean } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ExpensePaymentDialog costId="costo" onClose={vi.fn()} {...props} /></QueryClientProvider>);
};

it("mostra il movimento di banca e lo collega con le righe proposte", async () => {
  apri({ apriInRegistrazione: true });
  expect(await screen.findByText("In banca c'è già")).toBeInTheDocument();
  expect(screen.getByText(/02\/10\/2026 · 3\.325,92\s€ · BPER Banca ···0769/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Collega" }));
  await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("bank_conferma_ripartizione", {
    p_company: "vulcano", p_tx: "tx-radius",
    p_rows: [{ tipo: "ricevuta", id: "f1", importo: 3325.92 }],
    p_note: "Collegato dal pagamento della fattura",
  }));
  // Collegato: niente pagamento scritto a mano.
  expect(stato.rpc.mock.calls.some(([nome]) => nome === "registra_pagamento_costo_con_conto")).toBe(false);
});

it("con due movimenti possibili chiede di scegliere quello giusto", async () => {
  stato.candidati = [radius, { ...radius, transaction_id: "tx-2", data: "2026-11-02", chiave: "ricevuta:f1b" }];
  apri();
  expect(await screen.findByText("In banca c'è già (scegli quello giusto)")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Collega" })).toHaveLength(2);
});

it("chi non può riconciliare vede il movimento ma non il pulsante", async () => {
  stato.puoCollegare = false;
  apri();
  expect(await screen.findByText("In banca c'è già")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Collega" })).toBeNull();
  expect(screen.getByText("Da collegare in Tesoreria")).toBeInTheDocument();
});

it("senza proposte non compare niente", async () => {
  stato.candidati = [];
  apri();
  await screen.findByText("Fattura 262700691224 - Radius");
  expect(screen.queryByText(/In banca c'è già/)).toBeNull();
});

import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExpensePaymentDialog } from "@/components/orders/ExpensePaymentDialog";

/**
 * Il popup dei pagamenti di una fattura ricevuta dice quello che dice l'elenco (23/11/2026).
 *
 * Impresa Vulcano: Intesa Sanpaolo pagata, col movimento di banca già collegato dalla
 * tesoreria, e il popup «Pagato 0,00» più l'avviso «registrazioni storiche da
 * riconciliare»; CSI Broker segnata pagata nell'elenco e «Residuo 100,00» nel popup.
 * Il saldo adesso arriva dallo stesso calcolo dell'elenco, con i movimenti di banca.
 */
Element.prototype.scrollIntoView ??= () => {};
const stato = vi.hoisted(() => ({ dettaglio: {} as Record<string, unknown> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async (nome: string) => {
  if (nome === "dettaglio_pagamento_costo") return { data: stato.dettaglio, error: null as null };
  throw new Error(`RPC inattesa ${nome}`);
} } }));
vi.mock("@/hooks/useContiPrimaNota", () => ({ useContiPrimaNota: () => ({ data: [] as unknown[], isError: false, isFetching: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: true, solaLettura: false, canViewTesoreria: true, canManagePayments: true, isAdmin: false }) }));
vi.mock("@/components/orders/ExpensePaymentLinks", () => ({ ExpenseSalLinks: (): null => null, ExpenseBankLink: () => <span>Collega alla banca</span> }));

beforeEach(() => { vi.stubGlobal("BroadcastChannel", undefined); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const apri = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ExpensePaymentDialog costId="costo" onClose={vi.fn()} /></QueryClientProvider>);
};

it("il movimento di banca collegato dalla tesoreria conta come pagamento, senza avviso", async () => {
  stato.dettaglio = {
    id: "costo", nome: "Fattura 012L2026_V300224548 - INTESA SANPAOLO S.P.A.", totale: 1954.23, pagato: 1954.23, residuo: 0,
    da_verificare: false, senza_prova: 0, movimenti: [
      { id: "r1", data: "2026-11-02", importo: 1954.23, direzione: "uscita", banca: "tx1", riferimento: "ADDEBITO SDD INTESA", storno_di: null, conto: "BPER Banca ···0769", metodo: null, bank_account_id: "a1", fonte: "banca" },
    ],
  };
  apri();
  expect(await screen.findByText("Pagamento in banca")).toBeInTheDocument();
  expect(screen.getByText("BPER Banca ···0769")).toBeInTheDocument();
  expect(screen.getByText("Riconciliato con la banca")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
  // Già riconciliato: niente «collega alla banca», e col residuo a zero niente «Registra pagamento».
  expect(screen.queryByText("Collega alla banca")).toBeNull();
  expect(screen.queryByRole("button", { name: "Registra pagamento" })).toBeNull();
});

it("la prova di un pagamento già segnato si legge come conferma della banca", async () => {
  stato.dettaglio = {
    id: "costo", nome: "Fattura 262700651947 - Radius", totale: 603.99, pagato: 603.99, residuo: 0,
    da_verificare: false, senza_prova: 0, movimenti: [
      { id: "r2", data: "2026-09-07", importo: 603.99, direzione: "uscita", banca: "tx2", riferimento: null, storno_di: null, conto: "BPER Banca ···0769", metodo: null, bank_account_id: "a1", fonte: "prova" },
    ],
  };
  apri();
  expect(await screen.findByText("Pagamento confermato dalla banca")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("pagata senza movimento: lo dice come informazione, non come allarme", async () => {
  stato.dettaglio = {
    id: "costo", nome: "Fattura FT-2026/4077 - CSI BROKER SRL", totale: 100, pagato: 100, residuo: 0,
    da_verificare: false, senza_prova: 100, movimenti: [],
  };
  apri();
  expect(await screen.findByText(/100,00\s€ risultano pagati senza un movimento di banca collegato/)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("se i movimenti superano il dovuto resta l'avviso da controllare", async () => {
  stato.dettaglio = {
    id: "costo", nome: "Fattura doppia", totale: 100, pagato: 200, residuo: 0, da_verificare: true, senza_prova: 0, movimenti: [],
  };
  apri();
  expect(await screen.findByRole("alert")).toHaveTextContent("non tornano col dovuto");
});

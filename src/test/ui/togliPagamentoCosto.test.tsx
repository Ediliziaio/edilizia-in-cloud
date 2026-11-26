/**
 * «Come faccio a togliere il pagamento? Ricordo che c'era un tasto ma non lo trovo più»
 * (26/11/2026, Impresa Vulcano).
 *
 * Nel pannello «Pagamenti e residuo» della fattura ricevuta non c'era nessun comando per
 * annullare un pagamento: la tabella sapeva dire «Pagamento annullato», ma non c'era modo di
 * annullarlo. Il tasto che l'azienda ricordava è la pastiglia verde dell'elenco, che dentro il
 * pannello non si vede.
 *
 * Qui si tiene fermo: il comando c'è su ogni riga che si può togliere, chiede conferma, passa la
 * versione (il controllo di concorrenza del database) e NON appare dove il database dice che la
 * riga non si tocca — un movimento della tesoreria, uno già annullato, una contropartita.
 */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { ExpensePaymentDialog } from "@/components/orders/ExpensePaymentDialog";

Element.prototype.scrollIntoView ??= () => {};

interface Movimento {
  id: string; data: string; importo: number; direzione: string; banca: string | null;
  riferimento: string | null; storno_di: string | null; conto: string; metodo: string | null;
  fonte: string; versione: string | null; non_annullabile: string | null;
}

const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
  readonly: false,
  movimenti: [] as Movimento[],
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: fake.rpc } }));
vi.mock("@/hooks/useContiPrimaNota", () => ({ useContiPrimaNota: () => ({ data: [] as never[], isError: false, isFetching: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({
  canViewCosts: true, solaLettura: fake.readonly, canViewSubappaltatoriAmministrazione: false,
  canViewTesoreria: false, canManagePayments: false, isAdmin: false,
}) }));

const pagamento = (p: Partial<Movimento> = {}): Movimento => ({
  id: "pn1", data: "2026-11-04", importo: 400, direzione: "uscita", banca: null,
  riferimento: "Segnata pagata dalla fattura ricevuta", storno_di: null, conto: "Banca Beta",
  metodo: "bonifico", fonte: "prima_nota", versione: "2026-11-04T08:43:58.134149+00",
  non_annullabile: null, ...p,
});

beforeEach(() => {
  fake.readonly = false;
  fake.movimenti = [pagamento()];
  fake.rpc.mockReset();
  vi.stubGlobal("BroadcastChannel", undefined);
  fake.rpc.mockImplementation(async (name: string) => {
    if (name === "dettaglio_pagamento_costo") {
      return { data: { id: "cost", company_id: "az", nome: "Fattura SILTE", totale: 1220, pagato: 400, residuo: 820, da_verificare: false, movimenti: fake.movimenti }, error: null };
    }
    if (name === "pagamento_costo_annulla") return { data: { via: "saldo_rapido", annullato: true }, error: null };
    throw new Error(`RPC inattesa ${name}`);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const monta = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <ExpensePaymentDialog costId="cost" onClose={vi.fn()} />
  </QueryClientProvider>,
);

describe("togliere un pagamento dal pannello della fattura", () => {
  it("il comando c'è, chiede conferma e passa la versione del pagamento", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Togli" }));
    expect(screen.getByText("Togliere il pagamento di 400,00 €?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Togli il pagamento" }));
    await waitFor(() => expect(fake.rpc).toHaveBeenCalledWith("pagamento_costo_annulla", {
      p_movimento: "pn1", p_versione: "2026-11-04T08:43:58.134149+00",
    }));
  });

  it("non parte niente se si annulla la conferma", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Togli" }));
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByText("Togliere il pagamento di 400,00 €?")).toBeNull());
    expect(fake.rpc.mock.calls.filter(([n]) => n === "pagamento_costo_annulla")).toHaveLength(0);
  });

  it("dove il database dice di no il comando non appare, e il motivo resta leggibile", async () => {
    fake.movimenti = [pagamento({ banca: "tx1", fonte: "banca", versione: null,
      non_annullabile: "Viene dalla tesoreria: scollegalo dal movimento di banca." })];
    monta();
    await screen.findByText("Pagamento in banca");
    expect(screen.queryByRole("button", { name: "Togli" })).toBeNull();
    expect(screen.getByTitle("Viene dalla tesoreria: scollegalo dal movimento di banca.")).toBeTruthy();
  });

  it("in sola lettura non si tocca niente", async () => {
    fake.readonly = true;
    monta();
    await screen.findByText("Fattura SILTE");
    expect(screen.queryByRole("button", { name: "Togli" })).toBeNull();
  });
});

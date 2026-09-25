/**
 * Tesoreria e fatture interne (25/09/2026), con Supabase finto.
 *
 * Una fattura della fatturazione interna compare tra quelle da incassare;
 * «Collega» su un bonifico la incassa con riconcilia_bonifico_fattura (mai
 * scrivendo a mano pagamenti o legami), e «Scollega» storna l'incasso con
 * scollega_bonifico_fattura invece di toccare la scadenza.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Riga = Record<string, unknown>;
const dati: Record<string, Riga[]> = {};
const chiamate: { tabella: string; metodo: string; args: unknown[] }[] = [];
const rpc = vi.fn();

function query(tabella: string) {
  const uguali: [string, unknown][] = [];
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "is", "in", "order", "limit", "not", "gte", "lte", "single", "maybeSingle", "update", "insert", "delete"]) {
    q[metodo] = (...args: unknown[]) => {
      chiamate.push({ tabella, metodo, args });
      return q;
    };
  }
  q.eq = (colonna: string, valore: unknown) => {
    chiamate.push({ tabella, metodo: "eq", args: [colonna, valore] });
    uguali.push([colonna, valore]);
    return q;
  };
  q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
    const righe = (dati[tabella] ?? []).filter((r) => uguali.every(([c, v]) => !(c in r) || r[c] === v));
    return Promise.resolve({ data: righe, error: null }).then(ok, ko);
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => query(tabella),
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "utente-1" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import BankReconciliation from "@/components/tesoreria/BankReconciliation";

function monta() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <BankReconciliation companyId="azienda-1" />
    </QueryClientProvider>,
  );
}

const scritture = (tabella: string) =>
  chiamate.filter((c) => c.tabella === tabella && ["update", "insert", "delete"].includes(c.metodo));

beforeEach(() => {
  chiamate.length = 0;
  rpc.mockReset();
  rpc.mockResolvedValue({ data: "movimento-1", error: null });
  dati.bank_transactions = [
    {
      id: "tx-1", company_id: "azienda-1", amount: 6171, transaction_type: "credit",
      description: "SALDO FATTURA 37/2026", debtor_name: "Rossi Costruzioni Srl",
      booking_date: "2026-09-21", bank_accounts: { display_name: "Conto principale" },
    },
  ];
  dati.invoices = [];
  dati.scadenze = [];
  dati.documenti_fiscali = [
    {
      id: "doc-37", numero: "FT-2026-0037", numero_progressivo: 37, anno: 2026,
      cliente_snapshot: { ragione_sociale: "Rossi Costruzioni Srl" },
      totale_da_pagare: 6171, importo_pagato: 0, stato: "consegnata",
      data_scadenza: "2026-10-31", data_emissione: "2026-09-20",
    },
  ];
  dati.bank_reconciliations = [
    {
      id: "rec-30", company_id: "azienda-1", transaction_id: "tx-0", matched_amount: 1000,
      match_type: "auto", notes: "Fattura n. FT-2026-0030", movimento_id: "movimento-0", invoice_id: null,
      bank_transactions: { id: "tx-0", description: "Bonifico acconto", amount: 1000 },
      invoices: null,
      scadenze: { id: "scad-30", description: "FT-2026-0030 — Rossi", amount: 1000, direction: "entrata", suppliers: null },
      movimento: { documento: { id: "doc-30", numero: "FT-2026-0030", cliente_snapshot: { ragione_sociale: "Rossi Costruzioni Srl" }, totale_documento: 1000 } },
    },
  ];
});

describe("Tesoreria: le fatture interne si incassano dal bonifico", () => {
  it("la fattura interna è tra quelle da incassare, col suo segno", async () => {
    monta();
    expect(await screen.findByText("Interna")).toBeTruthy();
    expect(screen.getAllByText("FT-2026-0037").length).toBeGreaterThan(0);
  });

  it("«Collega» registra l'incasso con la RPC, senza scrivere pagamenti o legami a mano", async () => {
    monta();
    const suggerita = await screen.findByText("Fatt. FT-2026-0037");
    expect(suggerita).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collega" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("riconcilia_bonifico_fattura", {
      p_transaction_id: "tx-1",
      p_documento_id: "doc-37",
      p_match_type: "manual",
      // numero breve in causale 60 + importo esatto 50 + nome 20
      p_match_score: 130,
    });
    expect(scritture("invoice_payments")).toEqual([]);
    expect(scritture("bank_transactions")).toEqual([]);
    expect(scritture("bank_reconciliations")).toEqual([]);
  });

  it("«Scollega» su un incasso di fattura interna è uno storno, non una scadenza toccata a mano", async () => {
    monta();
    expect(await screen.findByText("FT-2026-0030 — Rossi Costruzioni Srl")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi riconciliazione" }));
    expect(await screen.findByText(/verrà stornato: la fattura, la sua scadenza e la rata della commessa/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scollega" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("scollega_bonifico_fattura", { p_reconciliation_id: "rec-30" }));
    expect(scritture("scadenze")).toEqual([]);
    expect(scritture("bank_transactions")).toEqual([]);
    expect(scritture("bank_reconciliations")).toEqual([]);
  });

  it("un bonifico già abbinato non torna tra quelli da riconciliare", async () => {
    dati.bank_transactions.push({
      id: "tx-0", company_id: "azienda-1", amount: 1000, transaction_type: "credit",
      description: "Bonifico acconto", booking_date: "2026-09-10",
    });
    monta();
    await screen.findByText("Fatt. FT-2026-0037");
    // «Bonifico acconto» resta solo nella riga della riconciliazione.
    expect(screen.getAllByText("Bonifico acconto")).toHaveLength(1);
  });
});

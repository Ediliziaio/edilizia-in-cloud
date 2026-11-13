import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  write: true,
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  load: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canReconcileBankTransactions: mock.write,
    canViewPrimaNota: true,
    isAdmin: true,
    canViewMezzi: true,
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user" } }),
}));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        order: () => Promise.resolve({ data: [], error: null }),
      };
      return q;
    },
  },
}));
vi.mock("@/lib/finance/bankWorkspace", async (original) => ({
  ...(await original<object>()),
  bankRpc: mock.rpc,
  loadBankPage: mock.load,
}));
vi.mock("@/components/tesoreria/MovimentoSenzaFattura", () => ({
  MovimentoSenzaFattura: (): null => null,
}));
import { BankMovementDetail } from "@/components/tesoreria/BankMovementDetail";
import TransactionsFeed from "@/components/tesoreria/TransactionsFeed";
import { bankCausale } from "@/lib/finance/bankWorkspace";
const movement = {
  id: "tx",
  account_id: "account",
  account_name: "Banca reale",
  booking_date: "2026-11-12",
  value_date: "2026-11-13",
  amount: 1000,
  currency: "EUR",
  description: "Bonifico Alfa Beta",
  debtor_name: "Cliente Test",
  debtor_iban: "IT000TEST",
  transaction_type: "credit",
  status: "booked",
  category: "Clienti",
  note: "Nota conservata",
  reconciliation_status: "parziale",
  chiuso_senza_documento: null as string | null,
  links: {
    financial: [
      {
        id: "r1",
        kind: "documento",
        label: "Fattura ALFA",
        amount: 400,
        url: "/documento/alfa",
        jobs: [{ id: "j1", label: "Commessa Alfa", url: "/ordine/alfa" }],
        split: true,
      },
      {
        id: "r2",
        kind: "pagamento",
        label: "Fattura BETA",
        amount: 100,
        url: "/documento/beta",
        jobs: [{ id: "j2", label: "Commessa Beta", url: "/ordine/beta" }],
        split: true,
        existing_payment: true,
      },
    ],
    contexts: [
      {
        id: "m1",
        kind: "mezzo",
        label: "Furgone Blu",
        amount: 100,
        url: "/mezzo/blu",
      },
    ],
    history: [] as unknown[],
    matched: 500,
    remaining: 500,
    revision: 0,
  },
};
function view(element: React.ReactNode) {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        {element}
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mock.write = true;
  mock.rpc.mockImplementation(async (name: string) =>
    name === "bank_movimento_dettaglio" ? structuredClone(movement) : [],
  );
  mock.load.mockResolvedValue({
    rows: [movement],
    count: 1,
    totals: [{ currency: "EUR", n: 1, income: 1000, expenses: 0, net: 1000 }],
  });
});
describe("popup e registro dei movimenti", () => {
  it("mantiene la causale originale, anche se somiglia a un codice tecnico", () => {
    expect(bankCausale({ description: "sepa_credit_transfer" })).toBe(
      "sepa_credit_transfer",
    );
    expect(
      bankCausale({ description: "Saldo FT 1/2026\nCommessa Alfa | Rif 937" }),
    ).toBe("Saldo FT 1/2026\nCommessa Alfa | Rif 937");
    expect(bankCausale({ description: null })).toBe(
      "Causale non fornita dalla banca",
    );
  });
  it("mantiene le cinque colonne principali nell’ordine richiesto anche con preferenze salvate", async () => {
    localStorage.setItem("eic:bank-columns:user:company", JSON.stringify(["notes"]));
    view(<TransactionsFeed companyId="company" />);
    expect(
      await screen.findByRole("columnheader", { name: "Causale" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").slice(0, 5).map(h => h.textContent)).toEqual([
      "Data", "Controparte", "Importo", "Causale", "Conto",
    ]);
  });

  it("Collega apre la ricerca e conserva più fatture selezionate durante le ricerche senza registrare pagamenti", async () => {
    const tx = structuredClone(movement);
    tx.links.financial = [];
    mock.load.mockResolvedValue({ rows: [tx], count: 1, totals: [] });
    const a = { key: "a", tipo: "documento", id: "a", titolo: "Fattura Alfa", residuo: 300 };
    const b = { key: "b", tipo: "documento", id: "b", titolo: "Fattura Beta", residuo: 400 };
    mock.rpc.mockImplementation(async (name: string, args: { p_search?: string }) => {
      if (name === "bank_movimento_dettaglio") return structuredClone(tx);
      if (name === "bank_candidati_movimento") return args.p_search === "Beta" ? [b] : [a];
      return [];
    });
    view(<TransactionsFeed companyId="company" />);
    fireEvent.click(await screen.findByRole("button", { name: "Collega fatture e pagamenti: Bonifico Alfa Beta" }));
    expect(await screen.findByRole("dialog", { name: "Dettaglio movimento" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Scegli Fattura Alfa" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca documenti da collegare" }), { target: { value: "Beta" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Scegli Fattura Beta" }));
    expect(screen.getByLabelText("Importo per Fattura Alfa")).toHaveValue("300,00");
    expect(screen.getByLabelText("Importo per Fattura Beta")).toHaveValue("200,00");
    expect(screen.getByRole("button", { name: "Conferma" })).toBeEnabled();
    expect(mock.rpc.mock.calls.every(c => ["bank_movimento_dettaglio", "bank_candidati_movimento"].includes(c[0]))).toBe(true);
  });

  it("apre dalla destra e mostra tutti i documenti, le commesse, il mezzo e le note", async () => {
    view(<TransactionsFeed companyId="company" />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Dettaglio movimento: Bonifico Alfa Beta",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Dettaglio movimento" }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText("Fattura ALFA")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Fattura BETA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Furgone Blu").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Note interne")).toHaveValue(
      "Nota conservata",
    );
    expect(
      mock.rpc.mock.calls.filter((c) => c[0] !== "bank_movimento_dettaglio"),
    ).toHaveLength(0);
  });
  it("un salvataggio fallito mantiene la nota e non mostra successo", async () => {
    mock.rpc.mockImplementation(async (name: string) => {
      if (name === "bank_movimento_dettaglio") return structuredClone(movement);
      if (name === "bank_movimento_note")
        throw new Error("Il movimento è stato modificato in un’altra finestra");
      return [];
    });
    view(<BankMovementDetail company="company" id="tx" onClose={vi.fn()} />);
    const input = await screen.findByLabelText("Note interne");
    fireEvent.change(input, { target: { value: "Testo da non perdere" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Salva note e categoria" }),
    );
    await waitFor(() => expect(mock.toast.error).toHaveBeenCalled());
    expect(input).toHaveValue("Testo da non perdere");
    expect(mock.toast.success).not.toHaveBeenCalled();
  });
  it("il popup protegge le note non salvate quando viene chiuso", async () => {
    const close = vi.fn();
    view(<BankMovementDetail company="company" id="tx" onClose={close} />);
    const note = await screen.findByLabelText("Note interne");
    fireEvent.change(note, { target: { value: "Nota da conservare" } });
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(await screen.findByRole("alertdialog", { name: "Chiudere senza salvare?" })).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continua a modificare" }));
    expect(screen.getByLabelText("Note interne")).toHaveValue("Nota da conservare");
  });
  it("il collegamento di un pagamento esistente ha un’azione esplicita e conserva il pagamento", async () => {
    view(<BankMovementDetail company="company" id="tx" onClose={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Scollega prova bancaria" }),
    );
    expect(
      await screen.findByText(/Il pagamento già registrato verrà conservato/),
    ).toBeInTheDocument();
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma scollegamento" }),
    );
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith("bank_scollega_pagamento", {
        p_riconciliazione: "r2",
      }),
    );
  });
  it("sola lettura mostra i dati senza comandi che registrano pagamenti o modificano note", async () => {
    mock.write = false;
    view(<BankMovementDetail company="company" id="tx" onClose={vi.fn()} />);
    const input = await screen.findByLabelText("Note interne");
    expect(input).toHaveAttribute("readonly");
    expect(
      screen.queryByRole("button", { name: "Salva note e categoria" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Collega fatture e scadenze" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Gestisci collegamenti" }),
    ).not.toBeInTheDocument();
  });
  it("la vista di riconciliazione parte dai movimenti da lavorare e non riconcilia automaticamente", async () => {
    view(<TransactionsFeed companyId="company" mode="reconcile" />);
    await screen.findByText("Bonifico Alfa Beta");
    expect(mock.load).toHaveBeenCalledWith(
      "company",
      expect.objectContaining({ state: "work" }),
      0,
    );
    expect(mock.rpc).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Trova corrispondenze" }),
    );
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith("bank_suggerisci_riconciliazioni", {
        p_company: "company",
      }),
    );
  });
});

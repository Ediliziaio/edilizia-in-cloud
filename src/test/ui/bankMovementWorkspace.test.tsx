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
    expect(mock.rpc.mock.calls.every(c => ["bank_movimento_dettaglio", "bank_candidati_movimento", "cassa_voci_movimenti", "tesoreria_controparti", "tesoreria_conti", "tesoreria_classifica_movimento", "tesoreria_esito_movimento"].includes(c[0]))).toBe(true);
  });

  // 27/11/2026: distinta RiBa da 94.856 €, decine di scadenze spuntate, una ricerca in
  // timeout e la ripartizione spariva con tutte le scelte. L'errore ora sta sopra e le scelte restano.
  it("una ricerca che va in timeout non cancella le scadenze già scelte", async () => {
    const tx = structuredClone(movement);
    tx.links.financial = [];
    mock.load.mockResolvedValue({ rows: [tx], count: 1, totals: [] });
    const a = { key: "a", tipo: "documento", id: "a", titolo: "Fattura Alfa", residuo: 300 };
    const b = { key: "b", tipo: "documento", id: "b", titolo: "Fattura Beta", residuo: 400 };
    let lento = true;
    mock.rpc.mockImplementation(async (name: string, args: { p_search?: string }) => {
      if (name === "bank_movimento_dettaglio") return structuredClone(tx);
      if (name === "bank_candidati_movimento") {
        if (args.p_search === "Beta" && lento) throw new Error("L’operazione ha impiegato troppo tempo. Riprova.");
        return args.p_search === "Beta" ? [b] : [a];
      }
      return [];
    });
    view(<TransactionsFeed companyId="company" />);
    fireEvent.click(await screen.findByRole("button", { name: "Collega fatture e pagamenti: Bonifico Alfa Beta" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Scegli Fattura Alfa" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca documenti da collegare" }), { target: { value: "Beta" } });
    expect(await screen.findByText(/impiegato troppo tempo/)).toBeInTheDocument();
    expect(screen.getByText(/Le scadenze già selezionate restano selezionate/)).toBeInTheDocument();
    expect(screen.getByLabelText("Importo per Fattura Alfa")).toHaveValue("300,00");
    expect(screen.getByRole("textbox", { name: "Cerca documenti da collegare" })).toHaveValue("Beta");
    lento = false;
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Scegli Fattura Beta" }));
    expect(screen.getByLabelText("Importo per Fattura Alfa")).toHaveValue("300,00");
    expect(screen.getByLabelText("Importo per Fattura Beta")).toHaveValue("200,00");
    await waitFor(() => expect(screen.queryByText(/impiegato troppo tempo/)).not.toBeInTheDocument());
  });

  // Caso P0-2 (28/11/2026): le scelte e le quote sopravvivono a risposte vuote o fuori ordine,
  // a un errore di conferma, e non si perdono chiudendo o cambiando modo senza un avviso.
  const apriCollega = async (tx: typeof movement) => {
    mock.load.mockResolvedValue({ rows: [tx], count: 1, totals: [] });
    view(<TransactionsFeed companyId="company" />);
    fireEvent.click(await screen.findByRole("button", { name: "Collega fatture e pagamenti: Bonifico Alfa Beta" }));
    return screen.findByRole("checkbox", { name: "Scegli Fattura A" });
  };
  const nuovoTx = () => { const tx = structuredClone(movement); tx.links.financial = []; return tx; };
  const cand = (k: string, r: number) => ({ key: k, tipo: "documento", id: k, titolo: `Fattura ${k.toUpperCase()}`, residuo: r });
  const cerca = (v: string) => fireEvent.change(screen.getByRole("textbox", { name: "Cerca documenti da collegare" }), { target: { value: v } });

  it("risposta vuota e risposta vecchia fuori ordine non toccano scelte, quote e totale", async () => {
    const tx = nuovoTx();
    let sblocca: (v: unknown[]) => void = () => {};
    mock.rpc.mockImplementation(async (name: string, args: { p_search?: string }) => {
      if (name === "bank_movimento_dettaglio") return structuredClone(tx);
      if (name === "bank_candidati_movimento") {
        if (args.p_search === "lenta") return new Promise((r) => { sblocca = r; });
        if (args.p_search === "vuota") return [];
        return [cand("a", 300)];
      }
      return [];
    });
    fireEvent.click(await apriCollega(tx));
    fireEvent.change(screen.getByLabelText("Importo per Fattura A"), { target: { value: "120,00" } });
    cerca("lenta");
    await waitFor(() => expect(mock.rpc.mock.calls.some(c => c[1]?.p_search === "lenta")).toBe(true));
    cerca("vuota");
    await waitFor(() => expect(mock.rpc.mock.calls.some(c => c[1]?.p_search === "vuota")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("status", { name: "" })).toBeNull());
    expect(screen.getByLabelText("Importo per Fattura A")).toHaveValue("120,00"); // risposta vuota: scelta ancora lì
    sblocca([cand("zz", 50)]); // la più vecchia arriva per ultima
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByLabelText("Importo per Fattura A")).toHaveValue("120,00");
    expect(screen.getByRole("checkbox", { name: "Scegli Fattura A" })).toBeChecked();
    expect(screen.getByText(/Abbinati .*120,00.* restano .*380,00/)).toBeInTheDocument();
  });

  it("errore alla conferma: le quote restano, si riprova senza reinserirle, e una sola conferma per volta", async () => {
    const tx = nuovoTx();
    let falla = true;
    let conferme = 0;
    mock.rpc.mockImplementation(async (name: string) => {
      if (name === "bank_movimento_dettaglio") return structuredClone(tx);
      if (name === "bank_candidati_movimento") return [cand("a", 300)];
      if (name === "bank_conferma_ripartizione") {
        conferme++;
        if (falla) throw new Error("Connessione persa");
        return {};
      }
      return [];
    });
    fireEvent.click(await apriCollega(tx));
    fireEvent.change(screen.getByLabelText("Importo per Fattura A"), { target: { value: "250,00" } });
    const conferma = screen.getByRole("button", { name: "Conferma" });
    fireEvent.click(conferma);
    fireEvent.click(conferma);
    await waitFor(() => expect(mock.toast.error).toHaveBeenCalledWith("Connessione persa"));
    expect(conferme).toBe(1);
    expect(screen.getByLabelText("Importo per Fattura A")).toHaveValue("250,00");
    falla = false;
    await waitFor(() => expect(screen.getByRole("button", { name: "Conferma" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(mock.toast.success).toHaveBeenCalled());
    expect(conferme).toBe(2);
    // Dopo la conferma riuscita il selettore si chiude e la bozza è azzerata.
    await waitFor(() => expect(screen.queryByLabelText("Importo per Fattura A")).not.toBeInTheDocument());
  });

  // 28/11/2026 (revisione): il server scrive, la risposta si perde. Prima di ridare il pulsante si
  // rilegge il movimento: il resto è sceso, quindi niente seconda conferma e niente quote doppie.
  it("risposta persa dopo una conferma riuscita: non si conferma due volte", async () => {
    const tx = nuovoTx();
    let conferme = 0;
    mock.rpc.mockImplementation(async (name: string) => {
      if (name === "bank_movimento_dettaglio") {
        const copia = structuredClone(tx);
        if (conferme > 0) copia.links.remaining = Number(copia.links.remaining) - 250;
        return copia;
      }
      if (name === "bank_candidati_movimento") return [cand("a", 300)];
      if (name === "bank_conferma_ripartizione") {
        conferme++;
        throw new Error("Failed to fetch");
      }
      return [];
    });
    fireEvent.click(await apriCollega(tx));
    fireEvent.change(screen.getByLabelText("Importo per Fattura A"), { target: { value: "250,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(mock.toast.warning).toHaveBeenCalledWith(expect.stringMatching(/conferma era già arrivata/)));
    expect(mock.toast.error).not.toHaveBeenCalled();
    expect(conferme).toBe(1);
    await waitFor(() => expect(screen.queryByLabelText("Importo per Fattura A")).not.toBeInTheDocument());
  });

  // Lotto D (28/11/2026): dopo una conferma a mano, gli altri movimenti della stessa controparte con
  // una proposta forte si offrono nella conferma in blocco. Solo un avviso: niente si conferma da sé.
  it("dopo una conferma a mano offre i movimenti simili e apre la conferma in blocco già pronta, senza confermare", async () => {
    const tx = nuovoTx();
    const forte = { ...cand("z", 1000), forte: true, incongruenze: [] as string[] };
    mock.rpc.mockImplementation(async (name: string, args: { p_tx?: string; p_ids?: string[] }) => {
      if (name === "bank_movimento_dettaglio") {
        const copia = structuredClone(tx);
        copia.id = args.p_tx ?? "tx";
        return copia;
      }
      if (name === "bank_candidati_movimento") return [cand("a", 300)];
      if (name === "bank_conferma_ripartizione") return {};
      if (name === "bank_movimenti_simili") return ["s1", "s2"];
      if (name === "bank_proposte_lotto")
        return Object.fromEntries((args.p_ids ?? []).map((id) => [id, id === "s1" ? [forte] : [cand("y", 10)]]));
      return [];
    });
    fireEvent.click(await apriCollega(tx));
    fireEvent.change(screen.getByLabelText("Importo per Fattura A"), { target: { value: "250,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    // s2 non ha una proposta forte: resta fuori dal conteggio.
    expect(await screen.findByText("C'è un movimento simile: riconciliarlo allo stesso modo?")).toBeInTheDocument();
    expect(mock.rpc).toHaveBeenCalledWith("bank_movimenti_simili", { p_company: "company", p_tx: "tx" });
    fireEvent.click(screen.getByRole("button", { name: "Apri la conferma in blocco" }));
    expect(await screen.findByText(/Movimenti simili a quello appena riconciliato/)).toBeInTheDocument();
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("bank_movimento_dettaglio", { p_company: "company", p_tx: "s1" }));
    expect(await screen.findByText("Nel lotto")).toBeInTheDocument();
    expect(mock.rpc.mock.calls.some(([n]) => n === "bank_conferma_lotto")).toBe(false);
  });

  it("senza movimenti simili non compare nessun avviso", async () => {
    const tx = nuovoTx();
    mock.rpc.mockImplementation(async (name: string) => {
      if (name === "bank_movimento_dettaglio") return structuredClone(tx);
      if (name === "bank_candidati_movimento") return [cand("a", 300)];
      if (name === "bank_conferma_ripartizione") return {};
      return [];
    });
    fireEvent.click(await apriCollega(tx));
    fireEvent.change(screen.getByLabelText("Importo per Fattura A"), { target: { value: "250,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("bank_movimenti_simili", expect.anything()));
    expect(mock.rpc.mock.calls.some(([n]) => n === "bank_proposte_lotto")).toBe(false);
    expect(screen.queryByText(/movimenti? simil/)).not.toBeInTheDocument();
  });

  it("con una bozza di scelte, chiudere o cambiare modo chiede conferma: «Resta» conserva tutto", async () => {
    const tx = nuovoTx();
    const close = vi.fn();
    mock.rpc.mockImplementation(async (name: string) => {
      if (name === "bank_movimento_dettaglio") return structuredClone(tx);
      if (name === "bank_candidati_movimento") return [cand("a", 300)];
      return [];
    });
    view(<BankMovementDetail company="company" id="tx" onClose={close} initialSection="documents" />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Scegli Fattura A" }));
    // cambio modo
    fireEvent.click(screen.getByRole("button", { name: "Collega pagamenti già registrati" }));
    expect(await screen.findByRole("alertdialog", { name: "Scartare le scelte fatte?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resta" }));
    expect(screen.getByLabelText("Importo per Fattura A")).toHaveValue("300,00");
    // «Dividi in quote» chiude il selettore: anche lui chiede prima (28/11/2026)
    fireEvent.click(screen.getByRole("button", { name: "Dividi in quote" }));
    expect(await screen.findByRole("alertdialog", { name: "Scartare le scelte fatte?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resta" }));
    expect(screen.getByLabelText("Importo per Fattura A")).toHaveValue("300,00");
    // chiusura
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(await screen.findByRole("alertdialog", { name: "Chiudere senza salvare?" })).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continua a modificare" }));
    expect(screen.getByLabelText("Importo per Fattura A")).toHaveValue("300,00");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    fireEvent.click(await screen.findByRole("button", { name: "Chiudi senza salvare" }));
    expect(close).toHaveBeenCalled();
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
    // Aprire il popup legge soltanto: il dettaglio e i documenti aperti per i suggerimenti.
    expect(
      mock.rpc.mock.calls.filter((c) => !["bank_movimento_dettaglio", "bank_candidati_movimento", "cassa_voci_movimenti", "tesoreria_controparti", "tesoreria_conti", "tesoreria_classifica_movimento", "tesoreria_esito_movimento"].includes(c[0])),
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
      screen.getByRole("button", { name: "Salva nota" }),
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
    expect(mock.rpc.mock.calls.filter((c) => !["bank_candidati_movimento", "cassa_voci_movimenti", "tesoreria_conti", "tesoreria_classifica_movimento", "tesoreria_esito_movimento"].includes(c[0]))).toHaveLength(1);
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
      screen.queryByRole("button", { name: "Salva note" }),
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
    // Leggere le categorie e le controparti della pagina è lecito; scrivere o riconciliare no.
    expect(mock.rpc.mock.calls.filter((c) => !["cassa_voci_movimenti", "tesoreria_controparti", "tesoreria_conti"].includes(c[0]))).toHaveLength(0);
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

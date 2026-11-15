// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const selezioni: Record<string, string> = {};
const chiamate: Array<{ nome: string; args: unknown }> = [];
const interruttore = { acceso: false };
const righe: Record<string, unknown[]> = {
  fattura_ricevuta_mezzi: [{ id: "l1", mezzo_id: "m1", importo: 120, confermata: false, mezzi: { nome: "Gru", targa: "AB123CD" } }],
  fattura_ddt: Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, numero_ddt: `DDT-${i}`, data_ddt: null as string | null, ddt_ricezione_id: null as string | null })),
  note_credito_storni: [{ fattura_id: "f1", nota_id: "n1", importo: 50 }],
  fatture_ricevute: [{ numero_fattura: "NC-7" }],
  prima_nota_entries: [
    { id: "p1", entry_date: "2026-05-12", amount: -500, reversal_of: null, bank_transaction_id: "b1" },
    { id: "p2", entry_date: "2026-05-13", amount: -40, reversal_of: null, bank_transaction_id: null },
    { id: "p3", entry_date: "2026-05-14", amount: 40, reversal_of: "p2", bank_transaction_id: null },
  ],
  bank_transactions: [{ id: "b1", booking_date: "2026-05-12", amount: -500, description: "Bonifico", counterparty_name: "Fornitore X" }],
  email_documento_estratto: [{ id: "e1", email_inbox: { from_name: "Mario", from_email: null, subject: "Fattura maggio", received_at: "2026-05-02T10:00:00Z" } }],
  contratti_subappalto: [
    { id: "c1", numero_contratto: "C-1", descrizione_lavori: null, subappaltatori_sicurezza: { piva: "IT 123" } },
    { id: "c2", numero_contratto: "C-2", descrizione_lavori: null, subappaltatori_sicurezza: { piva: "999" } },
  ],
  sal_subappaltatori: [],
  mezzi: [],
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (nome: string, args: unknown) => {
      chiamate.push({ nome, args });
      return { data: (nome === "azienda_collegamento_automatico" ? interruttore.acceso : null) as unknown, error: null as unknown };
    },
    auth: { getUser: async () => ({ data: { user: null as { id: string } | null } }) },
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["eq", "neq", "is", "not", "in", "or", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = () => ({ then: (ok: (v: unknown) => unknown) => ok({ data: (righe[t] ?? [])[0] ?? null, error: null }) });
      q.select = (colonne: string) => { selezioni[t] = colonne; return q; };
      q.then = (ok: (v: unknown) => unknown) => ok({ data: righe[t] ?? [], error: null });
      return q;
    },
  },
}));

import { CollegamentiFattura } from "@/components/fatturazione/CollegamentiFattura";

const monta = (puoModificare = true, cedentePiva: string | null = null, permessi = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <dl><CollegamentiFattura fatturaId="f1" companyId="c1" puoModificare={puoModificare} cedentePiva={cedentePiva} notaDiCredito={false} primaNotaId="p1" costoId="k1" {...permessi} /></dl>
    </MemoryRouter>
  </QueryClientProvider>,
);

describe("Collegamenti della fattura, come righe del riepilogo", () => {
  it("niente moduli a vista: mezzo da confermare, primi DDT e nota di credito", async () => {
    monta();
    expect(await screen.findByText(/Gru · AB123CD/)).toBeTruthy();
    expect(screen.getByText("da confermare")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Numero DDT")).toBeNull();
    expect(screen.getByText("DDT-5")).toBeTruthy();
    expect(screen.queryByText("DDT-6")).toBeNull();
    expect(screen.getByRole("button", { name: "Altri 2" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: "NC-7" })).toBeTruthy();
  });

  it("propone il contratto del fornitore: la ditta sta in subappaltatori_sicurezza, P.IVA pulita", async () => {
    monta(true, "123");
    expect(await screen.findByRole("combobox", { name: "Contratto di subappalto" })).toBeTruthy();
    expect(selezioni.contratti_subappalto).toContain("subappaltatori_sicurezza(piva)");
  });

  it("mostra banca, prima nota ed email; lo storno e la scrittura stornata restano fuori", async () => {
    monta(true, null, { vaiPrimaNota: true, vaiTesoreria: true, vaiEmail: false });
    expect((await screen.findByRole("link", { name: /Fornitore X/ })).getAttribute("href")).toBe("/azienda/tesoreria");
    expect(screen.getAllByRole("link", { name: /500,00/ })).toHaveLength(2);
    expect(screen.queryByText(/40,00/)).toBeNull();
    expect(await screen.findByText(/Fattura maggio/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Fattura maggio/ })).toBeNull();
  });

  it("in sola lettura non si collega e non si toglie", async () => {
    monta(false);
    await screen.findByText(/Gru · AB123CD/);
    expect(screen.queryByRole("button", { name: "Collega un mezzo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Togli/ })).toBeNull();
  });

  it("controllo del subappalto: riconosce contratto e SAL dal testo e collega passando dal database", async () => {
    const prima = { f: righe.fatture_ricevute, c: righe.contratti_subappalto, s: righe.sal_subappaltatori };
    righe.fatture_ricevute = [{ id: "f1", company_id: "c1", cedente_piva: "01234567890", tipo_documento: "TD01", imponibile_totale: 500, stato: "da_verificare", righe: [{ descrizione: "Lavori SAL n. 1" }], note: null }];
    righe.contratti_subappalto = [{ id: "k1", company_id: "c1", numero_contratto: "K-1", importo_contrattuale: 5000, oneri_sicurezza: 0, stato: "attivo", descrizione_lavori: null, subappaltatori_sicurezza: { piva: "IT01234567890" } }];
    righe.sal_subappaltatori = [{ id: "s1", company_id: "c1", contratto_id: "k1", numero_sal: 1, importo_lordo: 500, oneri_quota: 0, importo_netto: 475, stato: "verificato" }];
    try {
      monta(true, "01234567890");
      // Interruttore spento (di base): il riconosciuto resta una proposta, la conferma è «manuale».
      expect(await screen.findByText(/Proposta: contratto K-1 · SAL 1/)).toBeTruthy();
      expect(chiamate.some((c) => c.nome === "subappalto_collega_fattura")).toBe(false);
      screen.getByRole("button", { name: "Collega" }).click();
      await vi.waitFor(() => expect(chiamate).toContainEqual({ nome: "subappalto_collega_fattura",
        args: expect.objectContaining({ p_fattura: "f1", p_contratto: "k1", p_sal: "s1", p_esito: "manuale", p_regola: "subappalto_controllo_fattura" }) }));
      const prove = (chiamate.find((c) => c.nome === "subappalto_collega_fattura")!.args as { p_prove: Array<{ testo: string }> }).p_prove;
      expect(prove.map((p) => p.testo)).toContain("SAL trovato per numero: n. 1");
      // Interruttore acceso: si collega da sola, con esito «automatico».
      cleanup();
      chiamate.length = 0;
      interruttore.acceso = true;
      monta(true, "01234567890");
      await vi.waitFor(() => expect(chiamate).toContainEqual({ nome: "subappalto_collega_fattura",
        args: expect.objectContaining({ p_contratto: "k1", p_sal: "s1", p_esito: "automatico" }) }));
      expect(chiamate.filter((c) => c.nome === "subappalto_collega_fattura")).toHaveLength(1);
      interruttore.acceso = false;
      // SAL ancora da verificare: si propone il solo contratto, il SAL dopo la verifica.
      cleanup();
      chiamate.length = 0;
      righe.sal_subappaltatori = [{ id: "s1", company_id: "c1", contratto_id: "k1", numero_sal: 1, importo_lordo: 500, oneri_quota: 0, importo_netto: 475, stato: "ricevuto" }];
      monta(true, "01234567890");
      expect(await screen.findByText(/Proposta: contratto K-1 \(il SAL si collega dopo la verifica\)/)).toBeTruthy();
      screen.getByRole("button", { name: "Collega" }).click();
      await vi.waitFor(() => expect(chiamate).toContainEqual({ nome: "subappalto_collega_fattura",
        args: expect.objectContaining({ p_fattura: "f1", p_contratto: "k1", p_sal: null, p_esito: "manuale" }) }));
    } finally {
      righe.fatture_ricevute = prima.f; righe.contratti_subappalto = prima.c; righe.sal_subappaltatori = prima.s; interruttore.acceso = false;
    }
  });
});

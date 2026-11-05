/**
 * L'andamento del prezzo d'acquisto sulla scheda di un articolo di magazzino.
 *
 * Il titolare non vuole solo essere avvisato dei rincari: vuole vedere com'è andato
 * il prezzo nel tempo. Qui si verifica che la sezione ci sia, che dica la variazione
 * dal primo all'ultimo acquisto, e che evidenzi i carichi segnalati come rincaro —
 * e che spariscia in silenzio quando la funzione del database non c'è ancora o
 * l'utente non può vedere i costi.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  andamento: null as unknown,
  errore: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (nome: string) => {
      if (nome !== "magazzino_andamento_prezzo") return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: stato.andamento, error: stato.errore });
    },
    from: () => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        in: () => Promise.resolve({ data: [], error: null }),
        order: () => Promise.resolve({ data: [], error: null }),
      });
      return q;
    },
  },
}));

import { StockMovementHistoryDialog } from "@/components/warehouse/StockMovementHistoryDialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const articolo = { id: "a1", name: "Cemento 32,5 R", quantity: 120, unit_cost: 11.5 } as any;

const mostra = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StockMovementHistoryDialog open onOpenChange={() => {}} item={articolo} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  stato.andamento = null;
  stato.errore = null;
});
afterEach(cleanup);

describe("andamento del prezzo d'acquisto", () => {
  it("mostra la variazione dal primo all'ultimo acquisto e segna i rincari", async () => {
    // Il più recente per primo, come li dà la funzione.
    stato.andamento = [
      {
        movement_id: "m3", quando: "2026-11-03T10:00:00Z", quantita: 50, prezzo_pagato: 16,
        medio_prima: 10, scostamento_perc: 60, spesa_in_piu: 300, e_rincaro: true, note: null,
      },
      {
        movement_id: "m2", quando: "2026-09-10T10:00:00Z", quantita: 100, prezzo_pagato: 10.5,
        medio_prima: 10, scostamento_perc: 5, spesa_in_piu: 50, e_rincaro: false, note: null,
      },
      {
        movement_id: "m1", quando: "2026-06-01T10:00:00Z", quantita: 100, prezzo_pagato: 10,
        medio_prima: null, scostamento_perc: null, spesa_in_piu: null, e_rincaro: false, note: null,
      },
    ];
    mostra();
    const sezione = await screen.findByLabelText("Andamento del prezzo d'acquisto");
    // Dal primo (10 €) all'ultimo (16 €): +60%.
    expect(sezione).toHaveTextContent(/Dal primo/);
    expect(sezione).toHaveTextContent(/\+60,0%|\+60\.0%/);
    // Il rincaro è nominato e spiegato.
    expect(sezione).toHaveTextContent("Un acquisto è costato più del solito.");
    expect(sezione).toHaveTextContent(/\+60\.0% sul medio/);
    // Il carico non rincarato mostra il medio di allora, non un avviso.
    expect(sezione).toHaveTextContent(/medio di allora/);
  });

  it("un solo acquisto: nessuna variazione da raccontare", async () => {
    stato.andamento = [
      {
        movement_id: "m1", quando: "2026-06-01T10:00:00Z", quantita: 100, prezzo_pagato: 10,
        medio_prima: null, scostamento_perc: null, spesa_in_piu: null, e_rincaro: false, note: null,
      },
    ];
    mostra();
    const sezione = await screen.findByLabelText("Andamento del prezzo d'acquisto");
    expect(sezione).toHaveTextContent(/Un solo acquisto/);
    expect(sezione).not.toHaveTextContent(/Dal primo/);
  });

  it("più rincari: li conta al plurale", async () => {
    stato.andamento = [
      {
        movement_id: "m2", quando: "2026-11-03T10:00:00Z", quantita: 50, prezzo_pagato: 16,
        medio_prima: 10, scostamento_perc: 60, spesa_in_piu: 300, e_rincaro: true, note: null,
      },
      {
        movement_id: "m1", quando: "2026-10-03T10:00:00Z", quantita: 50, prezzo_pagato: 14,
        medio_prima: 10, scostamento_perc: 40, spesa_in_piu: 200, e_rincaro: true, note: null,
      },
    ];
    mostra();
    const sezione = await screen.findByLabelText("Andamento del prezzo d'acquisto");
    expect(sezione).toHaveTextContent("2 acquisti sono costati più del solito.");
  });

  it("un prezzo in calo lo dice col segno giusto", async () => {
    stato.andamento = [
      {
        movement_id: "m2", quando: "2026-11-03T10:00:00Z", quantita: 50, prezzo_pagato: 8,
        medio_prima: 10, scostamento_perc: -20, spesa_in_piu: -100, e_rincaro: false, note: null,
      },
      {
        movement_id: "m1", quando: "2026-06-01T10:00:00Z", quantita: 100, prezzo_pagato: 10,
        medio_prima: null, scostamento_perc: null, spesa_in_piu: null, e_rincaro: false, note: null,
      },
    ];
    mostra();
    const sezione = await screen.findByLabelText("Andamento del prezzo d'acquisto");
    expect(sezione).toHaveTextContent(/−20,0%|−20\.0%/);
    expect(sezione).not.toHaveTextContent(/costati più del solito|costato più del solito/);
  });

  it("funzione non ancora applicata o costi non visibili: la sezione non compare, senza errori", async () => {
    stato.andamento = null;
    stato.errore = { message: 'function public.magazzino_andamento_prezzo does not exist' };
    mostra();
    await waitFor(() => expect(screen.getByText(/Storico Movimenti/)).toBeInTheDocument());
    expect(screen.queryByLabelText("Andamento del prezzo d'acquisto")).toBeNull();
  });

  it("nessun carico valorizzato: niente sezione", async () => {
    stato.andamento = [];
    mostra();
    await waitFor(() => expect(screen.getByText(/Storico Movimenti/)).toBeInTheDocument());
    expect(screen.queryByLabelText("Andamento del prezzo d'acquisto")).toBeNull();
  });
});

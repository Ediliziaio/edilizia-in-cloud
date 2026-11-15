/** Impostazioni → Automazioni: la misura (lavori senza AI degli acquisti, collegamenti corretti a mano). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({
  ai: { data: null as unknown, error: null as unknown },
  coll: { data: null as unknown, error: null as unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: async (fn: string) => (fn === "metriche_ai_azienda" ? state.ai : state.coll) },
}));

import { MisuraAutomazioni } from "@/components/settings/automazioni/MisuraAutomazioni";

function apri() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MisuraAutomazioni companyId="c" />
    </QueryClientProvider>,
  );
}
afterEach(() => cleanup());

describe("misura delle automazioni", () => {
  it("solo i flussi degli acquisti, e le correzioni per regola con la percentuale", async () => {
    state.ai = {
      data: {
        flussi: [
          { flusso: "fattura_classifica", totali: 40, senza_ai: 30, pct_senza_ai: 75, chiamate_ai: 10 },
          { flusso: "lead_qualifica", totali: 99, senza_ai: 0, pct_senza_ai: 0, chiamate_ai: 99 },
        ],
      },
      error: null,
    };
    state.coll = {
      data: { regole: [{ regola: "xml_ddt_numero_data_fornitore", totali: 3, da_soli: 2, confermati: 0, in_attesa: 1, corretti: 1, pct_corretti: 33.3, con_ai: 0 }] },
      error: null,
    };
    apri();
    expect(await screen.findByText("Commessa e categoria delle fatture ricevute")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.queryByText(/lead_qualifica/)).toBeNull();
    expect(screen.getByText(/Bolla citata nella fattura/)).toBeInTheDocument();
    expect(screen.getByText("1 (33.3%)")).toBeInTheDocument();
  });

  it("senza permesso o senza dati lo dice, senza inventare numeri", async () => {
    state.ai = { data: null, error: { message: "42501" } };
    state.coll = { data: { regole: [] }, error: null };
    apri();
    expect(await screen.findByText("Non disponibile per il tuo ruolo.")).toBeInTheDocument();
    expect(screen.getByText("Nessun collegamento negli ultimi 30 giorni.")).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc } }));
import { ProveModelliRouter } from "@/components/admin/ai-monitor/ProveModelliRouter";

afterEach(cleanup);

const dati = {
  dal: "2026-10-16T00:00:00Z", giorni: 30,
  totali: { chiamate: 130, errori: 26, da_riserva: 0, costo: 6.46, cache_pct: 40.1 },
  compiti: [
    {
      task_key: "planimetria_genera", etichetta: null as string | null, categoria: null as string | null, configurato: false, abilitato: true, principale: null as string | null, riserve: [] as string[],
      chiamate: 130, costo: 6.46,
      modelli: [
        { modello: "anthropic/claude-sonnet-4.5", ruolo: "fuori_catena", chiamate: 104, riuscite: 104, errori: 0, da_riserva: 0, costo: 6.46, costo_medio: 0.0621, p50_ms: 24000, p95_ms: 57000, cache_pct: 40, token_in: 12000, token_out: 3000, aziende: 2, ultima: "2026-11-10T10:00:00Z", ultimo_errore: null as string | null },
        { modello: "google/gemini-2.5-pro", ruolo: "fuori_catena", chiamate: 26, riuscite: 0, errori: 26, da_riserva: 0, costo: 0, costo_medio: null, p50_ms: null, p95_ms: null, cache_pct: null, token_in: null, token_out: null, aziende: 1, ultima: "2026-11-02T16:40:00Z", ultimo_errore: "google/gemini-2.5-pro: Signal timed out." },
      ],
    },
    { task_key: "template_tetti", etichetta: "Template tetti", categoria: null, configurato: true, abilitato: true, principale: "openai/gpt-5.4", riserve: ["openai/gpt-4o-mini"], chiamate: 0, costo: 0, modelli: [] },
  ],
  diretti: [{ provider: "openai", modello: "openai/whisper-1", chiamate: 16, errori: 0, costo: 0.01, ultima: "2026-11-14T10:00:00Z" }],
  allarmi_aperti: [] as unknown[],
};

describe("Prove modelli: il traffico del router", () => {
  it("mostra totali, segnali, compiti e il dettaglio dei modelli", async () => {
    m.rpc.mockResolvedValue({ data: dati, error: null });
    render(<QueryClientProvider client={new QueryClient()}><ProveModelliRouter /></QueryClientProvider>);
    expect(await screen.findByText("6.46 $", { selector: "p" })).toBeInTheDocument();
    expect(m.rpc).toHaveBeenCalledWith("admin_ai_prove_modelli", { p_giorni: 30 });
    expect(screen.getByText("gemini-2.5-pro fallisce in «planimetria_genera»")).toBeInTheDocument();
    // Il compito fermo è nascosto, ma lo si dice.
    expect(screen.queryByText("Template tetti")).not.toBeInTheDocument();
    expect(screen.getByText(/1 compiti configurati non hanno fatto chiamate/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("planimetria_genera")[0]);
    expect(screen.getByText(/Ultimo errore: google\/gemini-2.5-pro: Signal timed out\./)).toBeInTheDocument();
    expect(screen.getByText("whisper-1")).toBeInTheDocument();
  });
});

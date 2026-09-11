/**
 * La pagina «Traffico del sito» con i dati veri di `admin_sito_traffico()`,
 * presi dalla produzione il giorno della correzione (20280915300000).
 *
 * Tiene fermi i tre errori che la pagina faceva:
 *   · il tempo mostrato era la MEDIA (190 s) gonfiata da schede lasciate
 *     aperte per ore; deve essere la mediana (40,8 s → «41s»);
 *   · le richieste non si vedevano, pur essendo nei dati;
 *   · le fonti non riconoscevano gli assistenti AI.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const traffico = {
  riepilogo: {
    giorni: 30, pagine_viste: 504, sessioni: 333, visitatori: 263,
    pagine_per_sessione: 1.51, sessioni_una_pagina: 285,
    tempo_tipico_pagina_s: 40.8, tempo_medio_pagina_s: 190.0, viste_con_tempo: 366,
    viste_precedente: 0, sessioni_precedente: 0, visitatori_precedente: 0,
    crescita_viste_pct: null as number | null, crescita_sessioni_pct: null as number | null, crescita_visitatori_pct: null as number | null,
    richieste: 3, tasso_richiesta_pct: 0.9,
  },
  pagine: [
    { pagina: "/", titolo: "Edilizia in Cloud", viste: 150, visitatori: 84,
      tempo_tipico_s: 25.1, tempo_medio_s: 210.4, misurate: 110, uscite: 90, uscite_pct: 60 },
    { pagina: "/prezzi", titolo: "Prezzi", viste: 32, visitatori: 24,
      tempo_tipico_s: 64.0, tempo_medio_s: 120.0, misurate: 20, uscite: 10, uscite_pct: 31 },
  ],
  ingressi: [{ pagina: "/", ingressi: 120, senza_seguito: 80, senza_seguito_pct: 67 }],
  fonti: [
    { fonte: "diretto", sessioni: 142, visitatori: 93, richieste: 2 },
    { fonte: "google", sessioni: 133, visitatori: 121, richieste: 1 },
    { fonte: "altri motori", sessioni: 44, visitatori: 42, richieste: 0 },
    { fonte: "assistenti AI", sessioni: 11, visitatori: 10, richieste: 0 },
  ],
  richieste: [
    { quando: "2026-09-09T13:49:56.143+00:00", nome: "Nicole", fonte: "diretto", ingresso: "/", pagine: 1 },
    { quando: "2026-09-07T08:22:41.84+00:00", nome: "PATRICK ZANDONELLA", fonte: "google", ingresso: "/", pagine: 11 },
  ],
  giorni: [
    { giorno: "2026-09-10", viste: 80, sessioni: 50, visitatori: 40 },
    { giorno: "2026-09-11", viste: 0, sessioni: 0, visitatori: 0 },
  ],
  calcolato_il: "2026-09-11T18:00:00+00:00",
};

const rpc = vi.fn(async () => ({ data: traffico, error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...(args as [])) },
}));

describe("SiteTrafficPage", () => {
  let contenitore: HTMLDivElement;

  beforeAll(() => {
    // recharts misura il contenitore con ResizeObserver, che jsdom non ha.
    if (!("ResizeObserver" in globalThis)) {
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  afterEach(() => {
    contenitore?.remove();
  });

  async function rendi(): Promise<string> {
    const { default: SiteTrafficPage } = await import("@/pages/admin/SiteTrafficPage");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    contenitore = document.createElement("div");
    document.body.appendChild(contenitore);
    const root = createRoot(contenitore);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SiteTrafficPage />
        </QueryClientProvider>,
      );
    });
    // la query si risolve al giro successivo
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return contenitore.textContent ?? "";
  }

  it("chiede i dati del periodo scelto", async () => {
    await rendi();
    expect(rpc).toHaveBeenCalledWith("admin_sito_traffico", { p_giorni: 30 });
  });

  it("mostra il tempo tipico (mediana), non la media gonfiata", async () => {
    const testo = await rendi();
    expect(testo).toContain("Tempo tipico su una pagina");
    expect(testo).toContain("41s");      // 40,8 s di mediana
    expect(testo).not.toContain("3m 10s"); // 190 s di media: non deve comparire come valore
  });

  it("mostra le richieste: quante, chi, da dove", async () => {
    const testo = await rendi();
    expect(testo).toContain("Visite diventate richieste");
    expect(testo).toContain("0.9% delle visite ha scritto");
    expect(testo).toContain("PATRICK ZANDONELLA");
    expect(testo).toContain("Nicole");
  });

  it("riconosce gli assistenti AI fra le fonti", async () => {
    const testo = await rendi();
    expect(testo).toContain("assistenti AI");
  });

  it("dice «primo periodo misurato» quando non c'è confronto", async () => {
    const testo = await rendi();
    expect(testo).toContain("primo periodo misurato");
  });
});

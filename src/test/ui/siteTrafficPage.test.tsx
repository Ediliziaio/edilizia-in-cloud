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
import { MemoryRouter } from "react-router-dom";
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

const metricheGoogle = {
  siti: [{ id: "eic", dominio: "www.ediliziaincloud.com", ga4_property_id: "123",
    gsc_site_url: "sc-domain:ediliziaincloud.com", sessioni: 70, visualizzazioni: 120,
    impressioni: 300, clic: 42 }],
  chiave_google: true,
};

const confrontoGoogle = {
  eic: { dal: "2026-09-08", al: "2026-09-09", giorni: 2, sessioni: 11, clic: 18, impressioni: 160 },
};

const rispostaBase = async (nome: string, _parametri: unknown): Promise<{ data: unknown; error: null }> => ({
  data: nome === "admin_siti_metriche" ? metricheGoogle
    : nome === "admin_siti_confronto_google" ? confrontoGoogle
    : nome === "admin_sito_google_organico_giornaliero" ? [] : traffico,
  error: null,
});
const rpc = vi.fn(rispostaBase);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(args[0] as string, args[1]) },
}));

describe("SiteTrafficPage", () => {
  let contenitore: HTMLDivElement;

  beforeAll(async () => {
    // recharts misura il contenitore con ResizeObserver, che jsdom non ha.
    if (!("ResizeObserver" in globalThis)) {
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    // Il primo import (recharts compreso) su una macchina carica supera i
    // 5 secondi di un test: si fa qui, con il suo margine.
    await import("@/pages/admin/SiteTrafficPage");
  }, 60_000);

  afterEach(() => {
    contenitore?.remove();
    rpc.mockReset().mockImplementation(rispostaBase);
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
          <MemoryRouter><SiteTrafficPage /></MemoryRouter>
        </QueryClientProvider>,
      );
    });
    // Si aspetta che i dati siano sulla pagina, non un numero fisso di giri:
    // con un giro solo il test passava a macchina scarica e falliva sotto carico.
    const fine = Date.now() + 10_000;
    while (!(contenitore.textContent ?? "").includes("Visitatori")) {
      if (Date.now() > fine) throw new Error("la pagina non ha mostrato i dati");
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
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

  async function apriScheda(nome: string) {
    const scheda = [...contenitore.querySelectorAll('[role="tab"]')]
      .find(tab => tab.textContent === nome);
    if (!scheda) throw new Error("Scheda non trovata");
    await act(async () => { scheda.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); });
    return contenitore.textContent ?? "";
  }

  it("mostra le richieste e mantiene il rapporto nel riepilogo", async () => {
    await rendi();
    const testo = await apriScheda("Richieste");
    expect(testo).toContain("Richieste dal sito");
    expect(testo).toContain("0,9 richieste ogni 100 visite");
    expect(testo).toContain("PATRICK ZANDONELLA");
    expect(testo).toContain("Nicole");
  });

  it("riconosce gli assistenti AI fra le fonti", async () => {
    await rendi();
    expect(await apriScheda("Fonti")).toContain("assistenti AI");
  });

  it("indica quando manca il confronto con il periodo precedente", async () => {
    const testo = await rendi();
    expect(testo).toContain("Senza confronto con il periodo precedente");
  });

  it("passa il periodo selezionato al riepilogo Google e al link di dettaglio", async () => {
    await rendi();
    const periodo = [...contenitore.querySelectorAll("button")].find(b => b.textContent === "28 giorni");
    await act(async () => periodo?.click());
    await apriScheda("Dati Google");
    expect(rpc).toHaveBeenCalledWith("admin_siti_metriche", { p_giorni: 28 });
    expect([...contenitore.querySelectorAll("a")].map(a => a.getAttribute("href")))
      .toContain("/admin/siti?giorni=28&sito=ediliziaincloud.com&traffico=organico");
  });
  it("mostra i due valori confrontabili nel tab Google, accanto ai totali per fonte", async () => {
    await rendi();
    await apriScheda("Dati Google");
    const fine = Date.now() + 10_000;
    const confronto = () => contenitore.querySelector('[aria-label="Confronto Google organico"]');
    while (!confronto()?.textContent?.includes("2 giorni confrontabili")) {
      if (Date.now() > fine) throw new Error("Confronto organico non caricato");
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    }
    expect(rpc).toHaveBeenCalledWith("admin_siti_confronto_google", { p_giorni: 30 });
    expect([...confronto()!.querySelectorAll("dd")].map(x => x.textContent)).toEqual(["18", "11"]);
    expect(contenitore.textContent).toContain("GA4 · Tutti i canali");
  });

  it("aggiorna la serie giornaliera con il periodo e distingue zero da un giorno mancante", async () => {
    rpc.mockImplementation(async (nome, parametri) => {
      const giorni = (parametri as { p_giorni: number }).p_giorni;
      if (nome === "admin_sito_google_organico_giornaliero") {
        return {
          data: [
            ...(giorni === 30 ? [{ giorno: "2026-08-20", clic: 51, sessioni: 42 }] : []),
            { giorno: "2026-09-10", clic: 0, sessioni: 0 },
            { giorno: "2026-09-11", clic: null, sessioni: null },
          ],
          error: null,
        };
      }
      if (nome === "admin_siti_metriche") return {
        data: {
          chiave_google: true,
          siti: [{ id: "eic", dominio: "www.ediliziaincloud.com", ga4_property_id: "42", gsc_site_url: "sc-domain:ediliziaincloud.com" }],
        },
        error: null,
      };
      if (nome === "admin_siti_confronto_google") return { data: {}, error: null };
      return rispostaBase(nome, parametri);
    });
    await rendi();
    await apriScheda("Dati Google");
    await vi.waitFor(() => expect(contenitore.textContent).toContain("Andamento giornaliero"));
    const bottone = (nome: string) => [...contenitore.querySelectorAll("button")].find(b => b.textContent === nome);
    await act(async () => bottone("Mostra dati giornalieri")?.click());
    const righe = () => [...contenitore.querySelectorAll("tbody tr")];
    expect(righe()).toHaveLength(3);
    expect(righe()[0].querySelectorAll('[aria-label="Dato non disponibile"]')).toHaveLength(2);
    expect([...righe()[1].querySelectorAll("td")].map(td => td.textContent)).toEqual(["0", "0"]);
    await act(async () => bottone("7 giorni")?.click());
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith("admin_sito_google_organico_giornaliero", { p_sito: "eic", p_giorni: 7 }));
    await vi.waitFor(() => expect(contenitore.textContent).toContain("Andamento giornaliero"));
    expect(righe()).toHaveLength(2);
    expect(contenitore.querySelector('time[datetime="2026-08-20"]')).toBeNull();
  });
});

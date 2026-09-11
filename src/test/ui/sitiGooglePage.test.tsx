/**
 * «Siti e Google» con lo stato vero trovato l'11/09/2026 (migrazione
 * 20280915400000): quattro siti, nessun ID, nessuna chiave, nessun dato.
 *
 * Tiene fermi i due modi in cui la pagina mentiva:
 *   · il riquadro «manca il collegamento» dipendeva solo dagli ID dei siti:
 *     deve dire che manca la chiave Google;
 *   · «Sincronizza» diceva «completata» anche quando la funzione rispondeva
 *     che non poteva partire.
 * E con i numeri: «Visite» sono le sessioni, non le pagine viste, e la
 * durata si scrive in minuti e secondi.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

function sito(nome: string, dominio: string) {
  return {
    id: `id-${dominio}`, nome, dominio,
    ga4_property_id: null as string | null, gsc_site_url: null as string | null,
    attivo: true, ultimo_sync: null as string | null, ultimo_errore: null as string | null,
    ultimo_dato: null as string | null,
    utenti: 0, sessioni: 0, visualizzazioni: 0, durata_media_s: null as number | null,
    sessioni_prima: 0, visualizzazioni_prima: 0,
    impressioni: 0, clic: 0, posizione_media: null as number | null,
    clic_prima: 0, ctr_pct: null as number | null, pagine_viste_da_google: 0,
  };
}

const statoVero = {
  giorni: 28,
  siti: [
    sito("Corriere Edile", "www.corrieredile.it"),
    sito("Edilizia 24 Ore", "edilizia24ore.it"),
    sito("Edilizia in Cloud", "www.ediliziaincloud.com"),
    sito("Il Giornale Edile", "www.ilgiornaleedile.it"),
  ],
  chiave_google: false,
  siti_collegati: 0,
  ultimo_dato: null as string | null,
  configurato: false,
  calcolato_il: "2026-09-11T19:17:39+00:00",
};

const collegato = {
  ...statoVero,
  siti: [{
    ...sito("Edilizia in Cloud", "www.ediliziaincloud.com"),
    ga4_property_id: "123456789", gsc_site_url: "sc-domain:ediliziaincloud.com",
    ultimo_sync: "2026-09-11T05:35:10+00:00", ultimo_dato: "2026-09-09",
    utenti: 700, sessioni: 900, visualizzazioni: 1500, durata_media_s: 85,
    sessioni_prima: 600, impressioni: 12000, clic: 340, posizione_media: 8.4,
    clic_prima: 300, ctr_pct: 2.83, pagine_viste_da_google: 41,
  }],
  chiave_google: true, siti_collegati: 1, ultimo_dato: "2026-09-09", configurato: true,
};

let metriche: unknown = statoVero;
const rpc = vi.fn(async () => ({ data: metriche, error: null as unknown }));
const invoke = vi.fn(async () => ({
  data: { ok: false, configurato: false, messaggio: "Service account non trovato." } as unknown,
  error: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...(args as [])),
    functions: { invoke: (...args: unknown[]) => invoke(...(args as [])) },
  },
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

describe("SitiGooglePage", () => {
  let contenitore: HTMLDivElement;

  // Il primo import su una macchina carica supera i 5 secondi di un test.
  beforeAll(async () => {
    await import("@/pages/admin/SitiGooglePage");
  }, 60_000);

  beforeEach(() => {
    metriche = statoVero;
    vi.clearAllMocks();
  });

  /** Si aspetta una condizione, non un numero fisso di giri: sotto carico un giro non basta. */
  async function aspetta(condizione: () => boolean, cosa: string): Promise<void> {
    const fine = Date.now() + 10_000;
    while (!condizione()) {
      if (Date.now() > fine) throw new Error(`troppo tempo ad aspettare: ${cosa}`);
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
  }

  afterEach(() => {
    contenitore?.remove();
  });

  async function rendi(): Promise<string> {
    const { default: SitiGooglePage } = await import("@/pages/admin/SitiGooglePage");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    contenitore = document.createElement("div");
    document.body.appendChild(contenitore);
    const root = createRoot(contenitore);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SitiGooglePage />
        </QueryClientProvider>,
      );
    });
    // la tabella compare solo a caricamento finito
    await aspetta(() => !!contenitore.querySelector("table"), "la tabella dei siti");
    return contenitore.textContent ?? "";
  }

  async function premiSincronizza(): Promise<void> {
    await act(async () => { bottone("Sincronizza").click(); });
    await aspetta(
      () => [toast.success, toast.warning, toast.error].some((f) => f.mock.calls.length > 0),
      "l'esito di «Sincronizza»",
    );
  }

  function bottone(testo: string): HTMLButtonElement {
    const b = Array.from(contenitore.querySelectorAll("button"))
      .find((x) => x.textContent?.includes(testo));
    if (!b) throw new Error(`nessun pulsante «${testo}»`);
    return b;
  }

  it("dice che manca la chiave Google, non solo gli ID", async () => {
    const testo = await rendi();
    expect(testo).toContain("Il collegamento a Google non è completo");
    expect(testo).toContain("non caricata");
    expect(testo).toContain("Siti collegati a GA4 o Search Console: 0 su 4");
    expect(testo).toContain("Dati scaricati: ancora nessuno");
    expect(testo).toContain("google_service_account");
    expect(testo).toContain("mai raccolto");
  });

  it("«Sincronizza» senza chiave non dice «completata»", async () => {
    await rendi();
    await premiSincronizza();
    expect(invoke).toHaveBeenCalledWith("siti-metriche-sync", {
      body: { azione: "sincronizza", giorni: 28 },
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("manca la chiave Google"));
  });

  it("un sito in errore lo dice sotto il nome, e il pulsante non lo nasconde", async () => {
    invoke.mockResolvedValueOnce({
      data: { ok: true, siti: [{ sito: "www.ediliziaincloud.com", giorni_metriche: 0, righe_pagine: 0,
        errore: "GA4: 403 permesso negato" }] } as unknown,
      error: null,
    });
    metriche = {
      ...collegato,
      siti: [{ ...collegato.siti[0], ultimo_errore: "GA4: 403 permesso negato" }],
    };
    const testo = await rendi();
    expect(testo).toContain("GA4: 403 permesso negato");
    await premiSincronizza();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("1 sito su 1 con errori"));
  });

  it("con tutto collegato: niente riquadro, visite = sessioni, durata leggibile", async () => {
    metriche = collegato;
    const testo = await rendi();
    expect(testo).not.toContain("Il collegamento a Google non è completo");
    expect(testo).toContain("dati fino al 09/09/2026");
    expect(testo).toContain("+50%");   // 900 visite contro 600 del periodo prima
    expect(testo).toContain("1m 25s"); // 85 secondi
    expect(testo).toContain("8.4");    // posizione pesata, come arriva dal database
  });
});

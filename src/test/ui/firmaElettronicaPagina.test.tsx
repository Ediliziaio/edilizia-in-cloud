/**
 * Impostazioni → Firma e condizioni → Firma elettronica: la pagina (10/10/2026).
 *
 * Otto riquadri per due comandi, un rimando a «Template offerte» (che non si chiama più così) due volte lo stesso
 * indirizzo, una descrizione dell'interruttore che prometteva un «flusso» che l'interruttore non accende. Oggi due
 * sezioni (la firma dei preventivi e l'informativa sul ripensamento), l'ambito scritto, il nome e la frase
 * dell'interruttore uguali a quelli di «Prezzo e margini» (è la stessa colonna), il resto in un riquadro chiuso.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsFirmaElettronica from "@/pages/azienda/settings/SettingsFirmaElettronica";

const state = vi.hoisted(() => ({
  puoModificare: true,
  rows: { fea_configurazione: null, preventivo_impostazioni: { firma_digitale_abilitata: true } } as Record<string, Record<string, unknown> | null>,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsIntegrations: state.puoModificare }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: state.rows[table] ?? null, error: null as unknown }),
        upsert: () => Promise.resolve({ data: null as unknown, error: null as unknown }),
      };
      return builder;
    },
  },
}));

const scorri = vi.fn();
function open(percorso = "/azienda/impostazioni/firma-elettronica") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}>
        <SettingsFirmaElettronica />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function caricata() {
  await waitFor(() => expect(screen.getByRole("switch", { name: "Firma elettronica sui preventivi" })).toBeEnabled());
}
const sezione = (id: string) => document.getElementById(id) as HTMLElement;
const leggi = (relativo: string) => readFileSync(resolve(process.cwd(), relativo), "utf8");

beforeEach(() => {
  state.puoModificare = true;
  state.rows = { fea_configurazione: null, preventivo_impostazioni: { firma_digitale_abilitata: true } };
  scorri.mockClear();
  Element.prototype.scrollIntoView = scorri;
});
afterEach(() => cleanup());

describe("Firma elettronica: due sezioni, un solo titolo di pagina", () => {
  it("niente titolo di pagina (lo mette il layout) e due sezioni con il loro titolo", async () => {
    open(); await caricata();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Firma dei preventivi", "Firma con il codice"]);
  });

  it("dice a quali documenti vale ciascuna sezione", async () => {
    open(); await caricata();
    expect(within(sezione("firma-sul-preventivo")).getByText("Preventivo generico")).toBeInTheDocument();
    expect(within(sezione("ripensamento")).getByText("Clienti privati")).toBeInTheDocument();
  });

  it("i nomi vecchi non ci sono più: «Template offerte», «Testo consenso B2C», «Moduli e firme operative»", async () => {
    open(); await caricata();
    const testo = document.body.textContent ?? "";
    for (const vecchio of ["Template offerte", "Testo consenso B2C", "Moduli e firme operative", "Marketing & Vendite", "Cantieri & Lavori"]) {
      expect(testo, vecchio).not.toContain(vecchio);
    }
  });

  it("il rimando all'archivio delle firme c'è una volta sola, con un indirizzo che esiste", async () => {
    open(); await caricata();
    const archivio = screen.getAllByRole("link", { name: "Archivio delle firme" });
    expect(archivio).toHaveLength(1);
    expect(archivio[0]).toHaveAttribute("href", "/azienda/firma-elettronica");
  });

  it("la spiegazione lunga (come funziona, firma semplice e avanzata) sta in un riquadro chiuso", async () => {
    open(); await caricata();
    const dettagli = screen.getByText("Come funziona la firma").closest("details")!;
    expect(dettagli).not.toHaveAttribute("open");
    expect(within(dettagli).getByText("Firma Elettronica Avanzata vs Firma Elettronica Semplice")).toBeInTheDocument();
  });
});

describe("Firma elettronica: l'interruttore dei preventivi dice la stessa cosa che in «Prezzo e margini»", () => {
  it("stesso nome e stessa frase (è la stessa colonna, firma_digitale_abilitata)", async () => {
    const margini = leggi("src/pages/azienda/settings/SettingsMargini.tsx");
    const nelleMargini = margini.match(/id="firma-digitale"\s+titolo="([^"]+)"\s+descrizione="([^"]+)"/);
    expect(nelleMargini, "la riga della firma non si trova più in SettingsMargini.tsx").not.toBeNull();
    open(); await caricata();
    const interruttore = screen.getByRole("switch", { name: nelleMargini![1] });
    const descrizione = document.getElementById(interruttore.getAttribute("aria-describedby")!)!;
    expect(descrizione.textContent).toBe(nelleMargini![2]);
  });

  it("non promette più un «flusso» che l'interruttore non accende", async () => {
    open(); await caricata();
    expect(document.body.textContent).not.toContain("Mostra il flusso firma");
  });

  it("dice cosa cambia davvero: il valore di partenza dei nuovi preventivi, e la firma online c'è comunque quando si manda", async () => {
    open(); await caricata();
    const dettagli = screen.getByText("Cosa cambia se lo spengo").closest("details")!;
    expect(dettagli.textContent).toContain("valore di partenza dei nuovi preventivi");
    expect(dettagli.textContent).toContain("la firma online c'è sempre");
  });

  it("è acceso se l'azienda non ha ancora la riga (il database parte da acceso)", async () => {
    state.rows.preventivo_impostazioni = null;
    open(); await caricata();
    expect(screen.getByRole("switch", { name: "Firma elettronica sui preventivi" })).toBeChecked();
  });
});

describe("Firma elettronica: àncore e sola lettura", () => {
  it("l'indirizzo con l'àncora apre la pagina già scorsa alla sezione e la evidenzia", async () => {
    open("/azienda/impostazioni/firma-elettronica#ripensamento"); await caricata();
    await waitFor(() => expect(scorri).toHaveBeenCalled());
    expect(scorri.mock.instances[0]).toBe(sezione("ripensamento"));
    expect(sezione("ripensamento")).toHaveAttribute("data-evidenziata", "true");
  });

  it("chi non può modificare vede l'avviso in cima e nessun pulsante di salvataggio", async () => {
    state.puoModificare = false;
    state.rows.fea_configurazione = { testo_recesso_b2c: "Testo già salvato" };
    open();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Informativa sul diritto di ripensamento" })).toHaveValue("Testo già salvato"));
    expect(screen.getByText(/Stai consultando le impostazioni: le cambia chi ha il permesso «Integrazioni» in modifica/)).toBeInTheDocument();
    for (const interruttore of screen.getAllByRole("switch")) expect(interruttore).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salva impostazioni|Impostazioni salvate/ })).toBeNull();
  });

  it("con modifiche non salvate il ricaricamento della pagina chiede conferma", async () => {
    open(); await caricata();
    const prima = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(prima);
    expect(prima.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole("switch", { name: "Firma elettronica sui preventivi" }));
    const dopo = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dopo);
    expect(dopo.defaultPrevented).toBe(true);
  });

  it("se non riesce a leggere le impostazioni lo dice e permette di riprovare", async () => {
    state.rows = new Proxy({}, { get: () => { throw { message: "Failed to fetch" }; } }) as never;
    open();
    expect(await screen.findByText("Non riesco a leggere le impostazioni della firma")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });
});

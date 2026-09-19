/**
 * Elenco delle automazioni (19/09/2026): più denso e più chiaro.
 *
 * Tiene fermo:
 *   · 6 colonne (Nome, Stato, Iscritti, Aggiornato più selezione e menu) invece
 *     di 11: Controlli, Struttura, Cartella, Categoria e Attivi non ci sono più;
 *   · sotto il nome una riga sola: com'è fatta l'automazione, oppure in giallo
 *     cosa manca per pubblicarla. Nessun «Pronta» che sembrava un tasto «avvia»;
 *   · un «Messaggio programmato» (senza passaggi per costruzione) non risulta
 *     «flusso vuoto»;
 *   · il numero su ogni pastiglia di stato, non solo su quella scelta;
 *   · la cartella è una riga compatta con il conteggio e le pubblicate;
 *   · «Nessuna automazione» solo quando l'ha detto il database: non durante
 *     il ripristino della cache del browser, né da una copia vuota salvata;
 *   · l'elenco si ricarica a ogni apertura, anche con una copia recente (così
 *     si vede subito ciò che si è cambiato nel builder);
 *   · un aggiornamento fallito non nasconde l'elenco che c'è già: resta, con
 *     l'avviso sopra.
 */
import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const RIGHE: Record<string, unknown[]> = {
  automation_folders: [
    { id: "cartella-1", name: "Download Risorse", parent_id: null, created_at: "2026-09-01T08:00:00Z" },
  ],
  automation_flows: [
    { id: "f1", name: "Download Risorse — PDF Vendita", description: null, status: "published", folder_id: "cartella-1", company_id: "azienda-1", created_at: "2026-09-19T08:00:00Z", updated_at: "2026-09-19T10:00:00Z", created_by: "utente-1", category: "generale", config_json: null, bulk_trigger_config: null },
    { id: "f2", name: "Sequenza Trial 31 giorni", description: null, status: "draft", folder_id: null, company_id: "azienda-1", created_at: "2026-06-05T08:00:00Z", updated_at: "2026-06-05T08:00:00Z", created_by: "utente-1", category: "marketing", config_json: null, bulk_trigger_config: null },
    { id: "f3", name: "Benvenuto nuova azienda", description: null, status: "draft", folder_id: null, company_id: "azienda-1", created_at: "2026-06-03T08:00:00Z", updated_at: "2026-06-03T08:00:00Z", created_by: "utente-1", category: "generale", config_json: null, bulk_trigger_config: null },
    { id: "f4", name: "Promemoria di massa", description: null, status: "published", folder_id: null, company_id: "azienda-1", created_at: "2026-06-02T08:00:00Z", updated_at: "2026-06-02T08:00:00Z", created_by: "utente-1", category: "generale", config_json: null, bulk_trigger_config: { canale: "email" } },
  ],
  automation_enrollments: [
    { flow_id: "f2", status: "active" },
    { flow_id: "f2", status: "completed" },
  ],
  automation_nodes: [
    { flow_id: "f1", node_type: "trigger", config_json: {} },
    { flow_id: "f1", node_type: "action", config_json: { action_type: "email" } },
    { flow_id: "f2", node_type: "trigger", config_json: {} },
    { flow_id: "f2", node_type: "action", config_json: { action_type: "email" } },
    { flow_id: "f2", node_type: "action", config_json: { action_type: "email" } },
    { flow_id: "f3", node_type: "trigger", config_json: {} },
  ],
};

// Per le prove sul caricamento: una risposta che si fa attendere, o un errore.
let attesa: Promise<void> | null = null;
let errori: Record<string, string> = {};

function builder(tabella: string) {
  const b: Record<string, unknown> = {};
  const catena = () => b;
  for (const m of ["select", "eq", "is", "in", "order", "limit", "update", "insert", "delete"]) b[m] = vi.fn(catena);
  b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  b.single = vi.fn(async () => ({ data: null, error: null }));
  b.then = (ok: (v: unknown) => unknown) =>
    (attesa ?? Promise.resolve())
      .then((): { data: unknown; error: { message: string } | null } => (errori[tabella]
        ? { data: null, error: { message: errori[tabella] } }
        : { data: RIGHE[tabella] ?? [], error: null }))
      .then(ok);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-1" }, user: { id: "utente-1" }, role: "company_admin" }),
}));
vi.mock("@/hooks/useMarketingRoutePrefix", () => ({ useMarketingRoutePrefix: () => "/azienda/marketing" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/query-timeout", () => ({ withClientTimeout: <T,>(p: T) => p, retryListQuery: false }));
vi.mock("@/components/marketing/automations/AutomazioniCestinoDialog", () => ({ AutomazioniCestinoDialog: (): null => null }));
vi.mock("@/components/shared/ConfermaQuantita", () => ({
  ConfermaQuantita: (): null => null,
  useConfermaQuantita: () => ({ valida: true }),
}));

import { AutomationFlowsList } from "@/components/marketing/automations/AutomationFlowsList";

let root: Root | null = null;
let contenitore: HTMLDivElement;

beforeAll(() => {
  // Radix usa ResizeObserver, che jsdom non ha.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  contenitore?.remove();
  attesa = null;
  errori = {};
});

const nuovoClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
// Come nell'app sul web (DEFAULT_QUERY_STALE_TIME_MS): una copia in cache vale 5 minuti.
const clientComeApp = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } } });

async function attendiQuery() {
  for (let i = 0; i < 5; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
}

async function monta(client = nuovoClient(), ripristino = false) {
  contenitore = document.createElement("div");
  document.body.appendChild(contenitore);
  await act(async () => {
    root = createRoot(contenitore);
    root.render(
      <QueryClientProvider client={client}>
        <IsRestoringProvider value={ripristino}>
          <AutomationFlowsList />
        </IsRestoringProvider>
      </QueryClientProvider>,
    );
  });
  // Le quattro query si risolvono in più giri.
  await attendiQuery();
}

const riga = (nome: string) =>
  Array.from(contenitore.querySelectorAll("tbody tr")).find((tr) => tr.textContent?.includes(nome)) as HTMLTableRowElement | undefined;

describe("elenco delle automazioni", () => {
  it("ha 6 colonne: via Controlli, Struttura, Cartella, Categoria e Attivi", async () => {
    await monta();
    const intestazioni = Array.from(contenitore.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
    expect(intestazioni).toHaveLength(6);
    expect(intestazioni).toEqual(expect.arrayContaining(["Nome", "Stato", "Iscritti", "Aggiornato"]));
    for (const via of ["Controlli", "Struttura", "Cartella", "Categoria", "Attivi"]) {
      expect(intestazioni).not.toContain(via);
    }
    expect(contenitore.textContent).not.toContain("Pronta");
  });

  it("sotto il nome dice com'è fatta l'automazione, con la categoria se non è Generale", async () => {
    await monta();
    const trial = riga("Sequenza Trial 31 giorni");
    expect(trial?.textContent).toContain("1 trigger · 2 passaggi · Marketing");
    // Iscritti e attivi nella stessa colonna.
    expect(trial?.textContent).toContain("2");
    expect(trial?.textContent).toContain("· 1 attivi");
  });

  it("mostra in giallo cosa manca per pubblicarla", async () => {
    await monta();
    const benvenuto = riga("Benvenuto nuova azienda");
    const avviso = Array.from(benvenuto?.querySelectorAll("p") ?? []).find((p) => p.textContent?.includes("Aggiungi almeno un'azione dopo il trigger."));
    expect(avviso).toBeDefined();
    expect(avviso?.className).toContain("text-amber-700");
  });

  it("un messaggio programmato non è un flusso vuoto", async () => {
    await monta();
    const massa = riga("Promemoria di massa");
    expect(massa?.textContent).toContain("Messaggio programmato");
    expect(massa?.textContent).not.toContain("il flusso è vuoto");
  });

  it("ogni pastiglia di stato ha il suo numero", async () => {
    await monta();
    const pastiglie = Array.from(contenitore.querySelectorAll("button")).map((b) => b.textContent?.replace(/\s+/g, " ").trim() ?? "");
    expect(pastiglie).toContain("Tutti4");
    expect(pastiglie).toContain("Bozza2");
    expect(pastiglie).toContain("Pubblicato2");
    expect(pastiglie).toContain("Necessita revisione1");
  });

  it("la cartella è una riga compatta: conteggio, pubblicate, e si apre con un clic", async () => {
    await monta();
    const cartella = riga("Download Risorse");
    expect(cartella?.textContent).toContain("1 pubblicata");
    expect(cartella?.getAttribute("aria-expanded")).toBe("false");
    expect(riga("Download Risorse — PDF Vendita")).toBeUndefined();
    await act(async () => { cartella?.click(); });
    expect(riga("Download Risorse — PDF Vendita")?.textContent).toContain("1 trigger · 1 passaggio");
  });

  it("mentre il browser ripristina la cache non dice «Nessuna automazione»", async () => {
    await monta(nuovoClient(), true);
    expect(contenitore.textContent).not.toContain("Nessuna automazione");
    expect(contenitore.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("una copia vuota e recente rimasta nel browser non dice «Nessuna automazione»: si ricarica", async () => {
    let sblocca: () => void = () => {};
    attesa = new Promise<void>((r) => { sblocca = () => r(); });
    const client = clientComeApp();
    // Come la copia che queryPersister rimette in cache all'apertura.
    client.setQueryData(["automation-flows", "azienda-1", null], []);
    client.setQueryData(["automation-folders-all", "azienda-1"], []);
    await monta(client);
    expect(contenitore.textContent).not.toContain("Nessuna automazione");
    expect(contenitore.textContent).not.toContain("Crea la tua prima automazione");
    await act(async () => { sblocca(); });
    await attendiQuery();
    expect(riga("Sequenza Trial 31 giorni")).toBeDefined();
  });

  it("tornando dal builder si vede il nome nuovo, anche con una copia di un minuto fa", async () => {
    const client = clientComeApp();
    const copia = (RIGHE.automation_flows as { id: string; name: string }[])
      .map((f) => (f.id === "f3" ? { ...f, name: "Benvenuto (nome vecchio)" } : f));
    client.setQueryData(["automation-flows", "azienda-1", null], copia);
    client.setQueryData(["automation-folders-all", "azienda-1"], RIGHE.automation_folders);
    await monta(client);
    expect(riga("Benvenuto nuova azienda")).toBeDefined();
    expect(riga("Benvenuto (nome vecchio)")).toBeUndefined();
  });

  it("se l'aggiornamento non riesce, l'elenco già in cache resta con un avviso", async () => {
    errori = { automation_flows: "Service Unavailable" };
    const client = nuovoClient();
    client.setQueryData(["automation-flows", "azienda-1", null], RIGHE.automation_flows);
    client.setQueryData(["automation-folders-all", "azienda-1"], RIGHE.automation_folders);
    await monta(client);
    expect(riga("Sequenza Trial 31 giorni")).toBeDefined();
    expect(contenitore.textContent).toContain("Elenco non aggiornato: Service Unavailable");
    expect(contenitore.textContent).not.toContain("Automazioni non caricate");
  });
});

/**
 * Elenco delle automazioni (19/09/2026): più denso e più chiaro.
 *
 * Tiene fermo:
 *   · 7 colonne: Nome, Stato, Iscritti, Ultima esecuzione, Modificata, più
 *     selezione e menu. Controlli, Struttura, Cartella, Categoria e Attivi non
 *     ci sono più;
 *   · sotto il nome da dove parte e cosa fa («Lead da campagna Facebook →
 *     2 email · opportunità · tag»), oppure in giallo cosa manca per pubblicarla;
 *   · un «Messaggio programmato» (senza passaggi per costruzione) non risulta
 *     «flusso vuoto»;
 *   · l'ultima esecuzione: la data, «Mai» per una pubblicata mai partita, e gli
 *     errori della settimana in rosso;
 *   · date leggibili: «oggi, 10:30», «ieri, 18:40», «5 giu», «30 dic 2025»;
 *   · il numero su ogni pastiglia di stato, e le pastiglie a zero nascoste;
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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// «Adesso» per le prove: 19 settembre 2026, mezzogiorno (ora locale).
const ADESSO = new Date(2026, 8, 19, 12, 0, 0);
const locale = (anno: number, mese: number, giorno: number, ore: number, minuti: number) =>
  new Date(anno, mese, giorno, ore, minuti).toISOString();

const RIGHE: Record<string, unknown[]> = {
  automation_folders: [
    { id: "cartella-1", name: "Download Risorse", parent_id: null, created_at: "2026-09-01T08:00:00Z" },
  ],
  automation_flows: [
    { id: "f1", name: "Download Risorse — PDF Vendita", description: null, status: "published", folder_id: "cartella-1", company_id: "azienda-1", created_at: "2026-09-19T08:00:00Z", updated_at: locale(2026, 8, 19, 9, 15), created_by: "utente-1", category: "generale", config_json: null, bulk_trigger_config: null },
    { id: "f2", name: "Sequenza Trial 31 giorni", description: null, status: "draft", folder_id: null, company_id: "azienda-1", created_at: "2026-06-05T08:00:00Z", updated_at: locale(2026, 5, 5, 10, 0), created_by: "utente-1", category: "marketing", config_json: null, bulk_trigger_config: null },
    { id: "f3", name: "Benvenuto nuova azienda", description: null, status: "draft", folder_id: null, company_id: "azienda-1", created_at: "2026-06-03T08:00:00Z", updated_at: locale(2026, 5, 3, 10, 0), created_by: "utente-1", category: "generale", config_json: null, bulk_trigger_config: null },
    { id: "f4", name: "Promemoria di massa", description: null, status: "published", folder_id: null, company_id: "azienda-1", created_at: "2026-06-02T08:00:00Z", updated_at: locale(2026, 5, 2, 10, 0), created_by: "utente-1", category: "generale", config_json: null, bulk_trigger_config: { canale: "email" } },
    { id: "f5", name: "Onboarding completo", description: null, status: "published", folder_id: null, company_id: "azienda-1", created_at: "2025-12-30T08:00:00Z", updated_at: locale(2025, 11, 30, 10, 0), created_by: "utente-1", category: "crm", config_json: null, bulk_trigger_config: null },
  ],
  automation_enrollments: [
    { flow_id: "f2", status: "active" },
    { flow_id: "f2", status: "completed" },
  ],
  automation_nodes: [
    // Nodo creato dal builder: il suo nome sta anche nella colonna label.
    { flow_id: "f1", node_type: "trigger", label: "Lead da campagna Facebook", config_json: { item_id: "campagna_facebook_lead" } },
    { flow_id: "f1", node_type: "action", label: "Crea o aggiorna opportunità", config_json: { item_id: "crea_opportunita" } },
    { flow_id: "f1", node_type: "action", label: "Aggiungi tag a contatto", config_json: { item_id: "aggiungi_tag" } },
    { flow_id: "f1", node_type: "action", label: "Email L1", config_json: { item_id: "invia_email" } },
    { flow_id: "f1", node_type: "delay", label: "Aspetta 1 giorno", config_json: { item_id: "attendi", delay_durata: 1 } },
    { flow_id: "f1", node_type: "action", label: "Email L2", config_json: { item_id: "invia_email" } },
    // Nodo scritto a mano: senza label, il nome viene dal catalogo.
    { flow_id: "f2", node_type: "trigger", label: null, config_json: { item_id: "azienda_creata" } },
    { flow_id: "f2", node_type: "action", label: null, config_json: { item_id: "invia_email_admin_azienda" } },
    { flow_id: "f2", node_type: "action", label: null, config_json: { item_id: "invia_email_admin_azienda" } },
    { flow_id: "f3", node_type: "trigger", label: null, config_json: { item_id: "azienda_creata" } },
    { flow_id: "f5", node_type: "trigger", label: null, config_json: { item_id: "contatto_creato" } },
    { flow_id: "f5", node_type: "action", label: null, config_json: { item_id: "aggiorna_campo" } },
    { flow_id: "f5", node_type: "action", label: null, config_json: { item_id: "invia_email" } },
    { flow_id: "f5", node_type: "action", label: null, config_json: { item_id: "invia_whatsapp" } },
    { flow_id: "f5", node_type: "action", label: null, config_json: { item_id: "crea_task" } },
    { flow_id: "f5", node_type: "action", label: null, config_json: { item_id: "aggiorna_campo" } },
    { flow_id: "f5", node_type: "action", label: null, config_json: { item_id: "assegna_agente" } },
  ],
  "rpc:automazioni_attivita": [
    { flow_id: "f1", ultima_esecuzione: locale(2026, 8, 19, 10, 30), esecuzioni_7gg: 10, errori_7gg: 2, ultimo_errore: "Token Facebook scaduto" },
    { flow_id: "f2", ultima_esecuzione: null, esecuzioni_7gg: 0, errori_7gg: 0, ultimo_errore: null },
    { flow_id: "f3", ultima_esecuzione: null, esecuzioni_7gg: 0, errori_7gg: 0, ultimo_errore: null },
    { flow_id: "f4", ultima_esecuzione: null, esecuzioni_7gg: 0, errori_7gg: 0, ultimo_errore: null },
    { flow_id: "f5", ultima_esecuzione: locale(2026, 8, 18, 18, 40), esecuzioni_7gg: 5, errori_7gg: 0, ultimo_errore: null },
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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => builder(t), rpc: (funzione: string) => builder(`rpc:${funzione}`) },
}));
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
  // Solo l'orologio: i timer restano veri, le query si risolvono da sole.
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(ADESSO);
});

afterAll(() => {
  vi.useRealTimers();
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
  // Le cinque query si risolvono in più giri.
  await attendiQuery();
}

const riga = (nome: string) =>
  Array.from(contenitore.querySelectorAll("tbody tr")).find((tr) => tr.textContent?.includes(nome)) as HTMLTableRowElement | undefined;

// La cella della colonna «Ultima esecuzione» (quinta: selezione, nome, stato, iscritti).
const esecuzione = (nome: string) => riga(nome)?.querySelectorAll("td")[4] as HTMLTableCellElement | undefined;
const modificata = (nome: string) => riga(nome)?.querySelectorAll("td")[5] as HTMLTableCellElement | undefined;

async function apriCartella() {
  const cartella = riga("Download Risorse");
  await act(async () => { cartella?.click(); });
}

describe("elenco delle automazioni", () => {
  it("ha 7 colonne: via Controlli, Struttura, Cartella, Categoria e Attivi", async () => {
    await monta();
    const intestazioni = Array.from(contenitore.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
    expect(intestazioni).toEqual(["", "Nome", "Stato", "Iscritti", "Ultima esecuzione", "Modificata", ""]);
    for (const via of ["Controlli", "Struttura", "Cartella", "Categoria", "Attivi", "Aggiornato"]) {
      expect(intestazioni).not.toContain(via);
    }
    expect(contenitore.textContent).not.toContain("Pronta");
  });

  it("sotto il nome dice da dove parte e cosa fa", async () => {
    await monta();
    await apriCartella();
    expect(riga("Download Risorse — PDF Vendita")?.textContent).toContain("Lead da campagna Facebook → 2 email · opportunità · tag");
    // Senza label sul nodo, il nome del trigger viene dal catalogo.
    const trial = riga("Sequenza Trial 31 giorni");
    expect(trial?.textContent).toContain("Nuova azienda registrata → 2 email");
    // La categoria non ripete più «Marketing» su ogni riga.
    expect(trial?.textContent).not.toContain("Marketing");
    // Iscritti e attivi nella stessa colonna.
    expect(trial?.textContent).toContain("· 1 attivi");
  });

  it("raggruppa le azioni, usa il catalogo per le altre e si ferma a tre voci", async () => {
    await monta();
    expect(riga("Onboarding completo")?.textContent).toContain("Aggiorna campo entità (2) · email · WhatsApp · +2");
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

  it("ultima esecuzione: la data, «Mai» se pubblicata e mai partita, gli errori in rosso", async () => {
    await monta();
    await apriCartella();
    const vendita = esecuzione("Download Risorse — PDF Vendita");
    expect(vendita?.textContent).toContain("oggi, 10:30");
    const errore = vendita?.querySelector("p");
    expect(errore?.textContent).toBe("2 errori in 7 giorni");
    expect(errore?.className).toContain("text-destructive");
    expect(errore?.getAttribute("title")).toBe("Token Facebook scaduto");
    expect(esecuzione("Onboarding completo")?.textContent).toBe("ieri, 18:40");
    expect(esecuzione("Promemoria di massa")?.textContent).toBe("Mai");
    // Una bozza mai partita non è «Mai»: non doveva partire.
    expect(esecuzione("Sequenza Trial 31 giorni")?.textContent).toBe("—");
  });

  it("date di modifica leggibili, con l'anno solo se non è quello in corso", async () => {
    await monta();
    await apriCartella();
    expect(modificata("Download Risorse — PDF Vendita")?.textContent).toBe("oggi, 09:15");
    expect(modificata("Sequenza Trial 31 giorni")?.textContent).toBe("5 giu");
    expect(modificata("Onboarding completo")?.textContent).toBe("30 dic 2025");
  });

  it("ogni pastiglia di stato ha il suo numero, e quelle a zero non si vedono", async () => {
    await monta();
    const pastiglie = Array.from(contenitore.querySelectorAll("button")).map((b) => b.textContent?.replace(/\s+/g, " ").trim() ?? "");
    expect(pastiglie).toContain("Tutti5");
    expect(pastiglie).toContain("Bozza2");
    expect(pastiglie).toContain("Pubblicato3");
    expect(pastiglie).toContain("Necessita revisione1");
    expect(pastiglie.some((t) => t.startsWith("Archiviato"))).toBe(false);
  });

  it("la cartella è una riga compatta: conteggio, pubblicate, e si apre con un clic", async () => {
    await monta();
    const cartella = riga("Download Risorse");
    expect(cartella?.textContent).toContain("1 pubblicata");
    expect(cartella?.getAttribute("aria-expanded")).toBe("false");
    expect(riga("Download Risorse — PDF Vendita")).toBeUndefined();
    await act(async () => { cartella?.click(); });
    expect(riga("Download Risorse — PDF Vendita")).toBeDefined();
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

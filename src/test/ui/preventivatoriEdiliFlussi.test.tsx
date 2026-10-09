/**
 * Gli otto preventivatori edili (bagni, tetti, climatizzazione, elettrico, termoidraulico, pavimenti, piscine,
 * ristrutturazione): i flussi che attraversano il guscio, provati TUTTI con i passi e gli hook veri (cambia solo
 * il database, finto) — 06/10/2026.
 *
 *  1. Un preventivo nuovo aperto da un contatto del CRM (?contact_id=…) porta nome, cognome, email e telefono del
 *     contatto: prima arrivava solo il legame, il passo diceva «Dati sincronizzati nel progetto» con i campi vuoti e
 *     il PDF usciva «Cliente da definire».
 *  2. Il salvataggio automatico che non riesce si dice (piede «Salvataggio non riuscito», un avviso) e si ritenta da
 *     solo: prima restava muto, il piede continuava a dire «si salvano da sole tra un attimo» e non succedeva più niente.
 *  3. Uscire dal preventivo con modifiche degli ultimi 2 secondi le salva, con UN solo disegno: la freccia «Esci» salva
 *     ORA ed esce solo se il salvataggio riesce (poi la chiusura della pagina non risalva); le altre uscite (menu,
 *     «indietro» del browser o del telefono) passano da useSalvaUscendo, che salva una volta e, se non riesce, lo dice
 *     con un solo avviso. Prima l'autosave si annullava con la pagina e quelle modifiche sparivano senza un avviso.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ComponentType } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

// Il primo test importa il wizard (e il suo mondo): con la macchina carica supera i 5 secondi di partenza.
vi.setConfig({ testTimeout: 40_000 });

const { stato } = vi.hoisted(() => ({
  stato: {
    prefisso: "idr",
    aggiornamentoFallisce: false,
    /** L'errore del salvataggio che fallisce: di default quello vero di un browser senza rete. */
    messaggioErrore: "Failed to fetch",
    /** Se c'è, la lettura del contatto del CRM aspetta che si risolva: il contatto arriva quando decide la prova. */
    attesaContatto: null as null | Promise<void>,
    /** Se c'è, la scrittura del preventivo aspetta che si risolva: un salvataggio lento, che la prova tiene aperto. */
    attesaAggiornamento: null as null | Promise<void>,
    rilasciaAggiornamento: null as null | (() => void),
    aggiornamenti: [] as Array<{ tabella: string; patch: Record<string, unknown> }>,
  },
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "titolare@example.it" }, profile: { id: "u1", company_id: "c1" }, effectiveCompany: { id: "c1", name: "Bianchi Impianti" }, companyId: "c1", loading: false }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => new Proxy({}, { get: (_t, p) => (typeof p === "string" && p.startsWith("can") ? true : undefined) }),
}));
vi.mock("@/hooks/useSupportoModelliPreventivo", () => ({ useSupportoModelloPreventivo: () => ({ supported: true, isLoading: false }) }));
vi.mock("@/hooks/useTettiModelSupport", () => ({ useTettiModelSupport: () => ({ supported: true, isLoading: false, data: true }) }));
vi.mock("@/integrations/supabase/client", () => {
  const dati = (tabella: string, singolo: boolean, perId: boolean): unknown => {
    const p = stato.prefisso;
    if (tabella === "marketing_contacts") {
      const contatto = {
        id: "cnt-1", first_name: "Giulia", last_name: "Neri", email: "giulia.neri@example.it", phone: "347 000 1111",
        address: "Via Po 3", city: "Torino", province: "TO", postal_code: "10124", customer_profile_id: null as null,
      };
      return singolo ? contatto : [contatto];
    }
    // senza filtro sull'id è la ricerca dell'ultima bozza («Riprendi bozza»): nessuna
    if (tabella === `${p}_progetti` && !perId) return singolo ? null : [];
    if (tabella === `${p}_progetti`) {
      const riga = {
        id: "p1", company_id: "c1", code: `${p.toUpperCase()}-2026-0031`, stato: "bozza", tipo_intervento: null as null,
        cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: null as null, cliente_telefono: "347 123 4567",
        cantiere_indirizzo: "Via Roma 4", cantiere_citta: "Vicenza", cantiere_provincia: "VI", cantiere_cap: "36100",
        sconto_pct: 5, iva_pct: 10, detrazione_pct: 50, massimale_detrazione: 96000, prezzo_manuale: null as null,
        totale_imponibile: 0, totale: 0, note: null as null, modello_snapshot: null as null,
        created_at: "2026-10-05T08:00:00Z", updated_at: "2026-10-05T08:30:00Z",
      };
      return singolo ? riga : [riga];
    }
    if (tabella === `${p}_computo_voci`) return [];
    if (tabella === `${p}_template_pdf`) return singolo ? { company_id: "c1", ragione_sociale: "Bianchi Impianti S.r.l." } : [];
    return singolo ? null : [];
  };
  const catena = (tabella: string): unknown => {
    let singolo = false;
    let perId = false;
    let aggiornamento = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new Proxy(function () {}, {
      get: (_t, nome) => {
        if (nome === "then") {
          return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
            (tabella === "marketing_contacts" && stato.attesaContatto
              ? stato.attesaContatto
              : aggiornamento && tabella === `${stato.prefisso}_progetti` && stato.attesaAggiornamento
                ? stato.attesaAggiornamento
                : Promise.resolve()
            ).then(() =>
              aggiornamento && stato.aggiornamentoFallisce && tabella === `${stato.prefisso}_progetti`
                ? { data: null as null, error: { message: stato.messaggioErrore }, count: 0 }
                : { data: dati(tabella, singolo, perId), error: null as null, count: 0 },
            ).then(ok, ko);
        }
        if (nome === "eq") return (colonna: string) => { if (colonna === "id") perId = true; return p; };
        if (nome === "maybeSingle" || nome === "single") return () => { singolo = true; return p; };
        if (nome === "update") {
          return (patch: Record<string, unknown>) => {
            stato.aggiornamenti.push({ tabella, patch });
            aggiornamento = true;
            return p;
          };
        }
        if (nome === "insert") return () => { perId = true; return p; };
        return () => p;
      },
    });
    return p;
  };
  const nulla = () => Promise.resolve({ data: null as null, error: null as null });
  type Canale = { on: () => Canale; subscribe: () => Canale; unsubscribe: () => void };
  const canale: Canale = { on: () => canale, subscribe: () => canale, unsubscribe: (): void => undefined };
  return {
    supabase: {
      from: (t: string) => catena(t), rpc: nulla, functions: { invoke: nulla },
      storage: { from: () => ({ upload: nulla, download: nulla, remove: nulla, list: () => Promise.resolve({ data: [], error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }), createSignedUrl: () => Promise.resolve({ data: { signedUrl: "" }, error: null }), createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
      auth: { getSession: () => Promise.resolve({ data: { session: null } }), getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: (): void => undefined } } }) },
      channel: () => canale, removeChannel: (): void => undefined,
    },
  };
});

const MODULI: Array<{ slug: string; p: string; wizard: () => Promise<{ default: ComponentType }> }> = [
  { slug: "bagni", p: "bgn", wizard: () => import("@/pages/azienda/bagni/BagniWizard") },
  { slug: "tetti", p: "tet", wizard: () => import("@/pages/azienda/tetti/TettiWizard") },
  { slug: "climatizzazione", p: "clm", wizard: () => import("@/pages/azienda/climatizzazione/ClimatizzazioneWizard") },
  { slug: "elettrico", p: "ele", wizard: () => import("@/pages/azienda/elettrico/ElettricoWizard") },
  { slug: "termoidraulico", p: "idr", wizard: () => import("@/pages/azienda/termoidraulico/TermoidraulicoWizard") },
  { slug: "pavimenti", p: "pav", wizard: () => import("@/pages/azienda/pavimenti/PavimentiWizard") },
  { slug: "piscine", p: "pis", wizard: () => import("@/pages/azienda/piscine/PiscineWizard") },
  { slug: "ristrutturazione", p: "rst", wizard: () => import("@/pages/azienda/ristrutturazione/RistrutturazioneWizard") },
];

async function monta(m: (typeof MODULI)[number], percorso: string) {
  stato.prefisso = m.p;
  const { default: Wizard } = await m.wizard();
  const risultato = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[percorso]}>
          <Routes>
            <Route path="/azienda/x/nuovo" element={<Wizard />} />
            <Route path="/azienda/x/:id/modifica" element={<Wizard />} />
            <Route path="/azienda/marketing/preventivi" element={<p>Elenco preventivi</p>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  const nav = await screen.findByRole("navigation", { name: /Fasi del preventivo/ }, { timeout: 8000 });
  return { ...risultato, nav };
}

/** Il preventivo esiste già: si torna al passo Cliente, dove ci sono i campi da scrivere. */
async function apriSulCliente(m: (typeof MODULI)[number]) {
  const { nav, unmount } = await monta(m, "/azienda/x/p1/modifica");
  // all'apertura il wizard salta da solo al secondo passo: si aspetta che ci sia arrivato, poi si torna indietro
  await waitFor(() => expect(within(nav).getAllByRole("button")[1].getAttribute("aria-current")).toBe("step"), { timeout: 8000 });
  fireEvent.click(within(nav).getAllByRole("button")[0]);
  const nome = (await screen.findByPlaceholderText("Mario")) as HTMLInputElement;
  return { nome, unmount };
}

const aggiornamenti = () => stato.aggiornamenti;
const aggiornamentiDelProgetto = (m: (typeof MODULI)[number]) => aggiornamenti().filter((a) => a.tabella === `${m.p}_progetti`);
const piede = () => screen.getAllByRole("status").map((s) => s.textContent ?? "").join(" | ");

beforeEach(() => {
  stato.attesaContatto = null;
  stato.attesaAggiornamento = null;
  stato.messaggioErrore = "Failed to fetch";
  stato.aggiornamentoFallisce = false;
  aggiornamenti().length = 0;
  localStorage.clear();
  vi.mocked(toast.error).mockClear();
});
afterEach(() => {
  // Un salvataggio tenuto aperto dalla prova si libera sempre: la coda dei salvataggi di un progetto è dello stesso
  // processo, e uno rimasto appeso (prova fallita a metà) bloccherebbe tutte le prove dopo.
  stato.rilasciaAggiornamento?.();
  stato.rilasciaAggiornamento = null;
  vi.useRealTimers();
  // Smontare un wizard con modifiche in sospeso lancia il salvataggio di chiusura: che non fallisca fuori dal suo test.
  stato.aggiornamentoFallisce = false;
  cleanup();
});

describe.each(MODULI)("$slug: dal contatto del CRM", (m) => {
  it("aperto con ?contact_id= porta nome, cognome, email e telefono del contatto (e l'indirizzo, già prima)", async () => {
    await monta(m, "/azienda/x/nuovo?contact_id=cnt-1");
    await waitFor(() => expect((screen.getByPlaceholderText("Mario") as HTMLInputElement).value).toBe("Giulia"), { timeout: 8000 });
    expect((screen.getByPlaceholderText("Rossi") as HTMLInputElement).value).toBe("Neri");
    expect((screen.getByPlaceholderText("mario.rossi@email.it") as HTMLInputElement).value).toBe("giulia.neri@example.it");
    expect((screen.getByPlaceholderText("+39 333 1234567") as HTMLInputElement).value).toBe("347 000 1111");
  });

  it("chi ha già scritto qualcosa non se lo vede cambiare dal contatto, che arriva dopo: riempie solo ciò che era vuoto", async () => {
    // Il contatto si fa attendere: nel frattempo si scrive il cognome. Se il contatto arrivasse prima, la prova non direbbe niente.
    let rilascia!: () => void;
    stato.attesaContatto = new Promise<void>((ok) => { rilascia = ok; });
    await monta(m, "/azienda/x/nuovo?contact_id=cnt-1");
    const nome = screen.getByPlaceholderText("Mario") as HTMLInputElement;
    const cognome = screen.getByPlaceholderText("Rossi") as HTMLInputElement;
    expect(nome.value).toBe("");
    fireEvent.change(cognome, { target: { value: "Bianchi" } });
    expect(cognome.value).toBe("Bianchi");
    rilascia(); // adesso arriva il contatto (nome Giulia, cognome Neri)
    await waitFor(() => expect((screen.getByPlaceholderText("Mario") as HTMLInputElement).value).toBe("Giulia"), { timeout: 8000 });
    expect((screen.getByPlaceholderText("Rossi") as HTMLInputElement).value).toBe("Bianchi");
    expect((screen.getByPlaceholderText("mario.rossi@email.it") as HTMLInputElement).value).toBe("giulia.neri@example.it");
  });
});

describe.each(MODULI)("$slug: salvataggio automatico", (m) => {
  it("se il salvataggio automatico non riesce lo dice: «Salvataggio non riuscito» nel piede e un avviso", async () => {
    const { nome } = await apriSulCliente(m);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stato.aggiornamentoFallisce = true;
    fireEvent.change(nome, { target: { value: "Anna" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2300); });
    expect(aggiornamentiDelProgetto(m).length).toBeGreaterThanOrEqual(1);
    expect(piede()).toMatch(/Salvataggio non riuscito/);
    expect(piede()).not.toMatch(/si salvano da sole/);
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1);
    const chiamata = vi.mocked(toast.error).mock.calls[0];
    expect(chiamata[0]).toBe("Salvataggio automatico non riuscito");
    const descrizione = (chiamata[1] as { description: string }).description;
    expect(descrizione).toContain("Connessione persa");
    expect(descrizione).toContain("riprovo da solo");
    expect(descrizione).not.toMatch(/Failed to fetch|TypeError/);
  });
});

const scritturePer = (m: (typeof MODULI)[number], nome: string) => aggiornamentiDelProgetto(m).filter((a) => a.patch.cliente_nome === nome);
/** Il tempo che un secondo salvataggio, se ci fosse, avrebbe per partire. */
const dopoUnAttimo = () => new Promise((r) => setTimeout(r, 300));

describe.each(MODULI)("$slug: uscita dal preventivo", (m) => {
  it("dalla freccia, con una modifica degli ultimi 2 secondi: si salva ORA, si esce dopo, e la chiusura non risalva", async () => {
    const { nome } = await apriSulCliente(m);
    fireEvent.change(nome, { target: { value: "Anna" } });
    // subito, senza aspettare l'autosave: la freccia «Esci dal preventivo»
    fireEvent.click(screen.getByRole("button", { name: "Esci dal preventivo" }));
    await waitFor(() => expect(screen.getByText("Elenco preventivi")).toBeTruthy(), { timeout: 5000 });
    await dopoUnAttimo(); // la pagina si è smontata: l'hook di chiusura non deve scrivere ancora
    expect(scritturePer(m, "Anna")).toHaveLength(1);
  });

  /** L'avviso «Salvataggio fallito» della freccia: il testo e l'azione «Esci comunque». */
  const avvisoDellaFreccia = () => {
    const chiamata = vi.mocked(toast.error).mock.calls.find((c) => c[0] === "Salvataggio fallito");
    return chiamata?.[1] as { description: string; action?: { label: string; onClick: () => void } } | undefined;
  };

  it("se quel salvataggio non riesce, dalla freccia non si esce (le modifiche non si perdono) e si dice perché, in italiano", async () => {
    const { nome } = await apriSulCliente(m);
    stato.aggiornamentoFallisce = true;
    fireEvent.change(nome, { target: { value: "Anna" } });
    fireEvent.click(screen.getByRole("button", { name: "Esci dal preventivo" }));
    await waitFor(() => expect(avvisoDellaFreccia()).toBeTruthy(), { timeout: 5000 });
    const avviso = avvisoDellaFreccia();
    expect(avviso?.description).toContain("Connessione persa");
    expect(avviso?.description).toContain("le modifiche non sono perse");
    expect(avviso?.description).not.toMatch(/Failed to fetch|TypeError/);
    expect(screen.queryByText("Elenco preventivi")).toBeNull();
    expect((screen.getByPlaceholderText("Mario") as HTMLInputElement).value).toBe("Anna");
  });

  it("l'avviso offre «Esci comunque»: esce, la chiusura riprova e, se non riesce ancora, lo dice (mai un'uscita in silenzio)", async () => {
    const { nome } = await apriSulCliente(m);
    stato.aggiornamentoFallisce = true;
    fireEvent.change(nome, { target: { value: "Anna" } });
    fireEvent.click(screen.getByRole("button", { name: "Esci dal preventivo" }));
    await waitFor(() => expect(avvisoDellaFreccia()?.action).toBeTruthy(), { timeout: 5000 });
    expect(avvisoDellaFreccia()?.action?.label).toBe("Esci comunque");
    expect(screen.queryByText("Elenco preventivi")).toBeNull();
    act(() => { avvisoDellaFreccia()?.action?.onClick(); });
    await waitFor(() => expect(screen.getByText("Elenco preventivi")).toBeTruthy(), { timeout: 5000 });
    // il salvataggio di chiusura riprova, fallisce di nuovo e lo dice: «Modifiche non salvate»
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Modifiche non salvate", expect.objectContaining({ description: expect.stringContaining("Connessione persa") })), { timeout: 5000 });
  });

  it("se il salvataggio è rifiutato SEMPRE (permesso tolto, account bloccato) la freccia non esce ma «Esci comunque» sì, col motivo giusto", async () => {
    const { nome } = await apriSulCliente(m);
    stato.messaggioErrore = 'new row violates row-level security policy for table "progetti"';
    stato.aggiornamentoFallisce = true;
    fireEvent.change(nome, { target: { value: "Anna" } });
    fireEvent.click(screen.getByRole("button", { name: "Esci dal preventivo" }));
    await waitFor(() => expect(avvisoDellaFreccia()?.action).toBeTruthy(), { timeout: 5000 });
    expect(avvisoDellaFreccia()?.description).toContain("Non hai i permessi");
    expect(avvisoDellaFreccia()?.description).not.toMatch(/row-level security|policy/);
    expect(screen.queryByText("Elenco preventivi")).toBeNull();
    act(() => { avvisoDellaFreccia()?.action?.onClick(); });
    await waitFor(() => expect(screen.getByText("Elenco preventivi")).toBeTruthy(), { timeout: 5000 });
  });

  it("mentre la freccia sta salvando è spenta: un altro clic non mette un secondo salvataggio in coda", async () => {
    const { nome } = await apriSulCliente(m);
    stato.attesaAggiornamento = new Promise<void>((ok) => { stato.rilasciaAggiornamento = ok; }); // il salvataggio si fa attendere
    fireEvent.change(nome, { target: { value: "Anna" } });
    const freccia = screen.getByRole("button", { name: "Esci dal preventivo" });
    fireEvent.click(freccia);
    await waitFor(() => expect((freccia as HTMLButtonElement).disabled).toBe(true), { timeout: 5000 });
    fireEvent.click(freccia);
    fireEvent.click(freccia);
    stato.rilasciaAggiornamento?.();
    await waitFor(() => expect(screen.getByText("Elenco preventivi")).toBeTruthy(), { timeout: 5000 });
    await dopoUnAttimo();
    expect(scritturePer(m, "Anna")).toHaveLength(1);
  });

  it("se il salvataggio dalla freccia non riesce, la freccia si riaccende (non resta spenta)", async () => {
    const { nome } = await apriSulCliente(m);
    stato.aggiornamentoFallisce = true;
    fireEvent.change(nome, { target: { value: "Anna" } });
    const freccia = screen.getByRole("button", { name: "Esci dal preventivo" }) as HTMLButtonElement;
    fireEvent.click(freccia);
    await waitFor(() => expect(avvisoDellaFreccia()).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(freccia.disabled).toBe(false), { timeout: 5000 });
  });

  it("se si scrive ancora mentre la freccia sta salvando, la modifica più recente si salva alla chiusura", async () => {
    const { nome } = await apriSulCliente(m);
    fireEvent.change(nome, { target: { value: "Anna" } });
    fireEvent.click(screen.getByRole("button", { name: "Esci dal preventivo" })); // parte il salvataggio di «Anna»
    fireEvent.change(nome, { target: { value: "Annabella" } }); // e intanto si scrive ancora
    await waitFor(() => expect(screen.getByText("Elenco preventivi")).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(scritturePer(m, "Annabella")).toHaveLength(1), { timeout: 5000 });
  });

  it("lasciando la pagina in un altro modo (menu, indietro del browser) la modifica si salva comunque, una volta sola", async () => {
    const { nome, unmount } = await apriSulCliente(m);
    fireEvent.change(nome, { target: { value: "Anna" } });
    unmount();
    await waitFor(() => expect(scritturePer(m, "Anna")).toHaveLength(1), { timeout: 5000 });
    await dopoUnAttimo();
    expect(scritturePer(m, "Anna")).toHaveLength(1);
  });

  it("e se quel salvataggio di chiusura non riesce lo dice: un solo avviso «Modifiche non salvate»", async () => {
    const { nome, unmount } = await apriSulCliente(m);
    stato.aggiornamentoFallisce = true;
    fireEvent.change(nome, { target: { value: "Anna" } });
    unmount();
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled(), { timeout: 5000 });
    await dopoUnAttimo();
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1);
    const chiamata = vi.mocked(toast.error).mock.calls[0];
    expect(chiamata[0]).toBe("Modifiche non salvate");
    const descrizione = (chiamata[1] as { description: string }).description;
    expect(descrizione).toContain("Connessione persa");
    expect(descrizione).not.toMatch(/Failed to fetch|TypeError/);
  });

  it("senza modifiche, uscire non scrive niente", async () => {
    await apriSulCliente(m);
    aggiornamenti().length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Esci dal preventivo" }));
    await waitFor(() => expect(screen.getByText("Elenco preventivi")).toBeTruthy(), { timeout: 5000 });
    await dopoUnAttimo();
    expect(aggiornamentiDelProgetto(m)).toEqual([]);
  });
});

describe("il salvataggio automatico ritenta da solo (provato sul primo modulo: gli altri sono la stessa copia)", () => {
  it("dopo un errore ritenta, e quando riesce il piede torna a «Salvato»", async () => {
    const { nome } = await apriSulCliente(MODULI[0]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stato.aggiornamentoFallisce = true;
    fireEvent.change(nome, { target: { value: "Anna" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2300); });
    expect(piede()).toMatch(/Salvataggio non riuscito/);
    const tentativi = aggiornamentiDelProgetto(MODULI[0]).length;

    // la rete torna: il tentativo dopo riesce da solo, senza altre modifiche e senza un secondo avviso.
    // Il tempo avanza a pezzi, ognuno in un suo `act`: l'aggiornamento che fa ripartire il salvataggio si applica a fine pezzo.
    stato.aggiornamentoFallisce = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); }); // scatta il ritento
    await act(async () => { await vi.advanceTimersByTimeAsync(2300); }); // e il salvataggio riparte
    expect(aggiornamentiDelProgetto(MODULI[0]).length).toBeGreaterThan(tentativi);
    expect(piede()).not.toMatch(/Salvataggio non riuscito/);
    expect(piede()).toMatch(/Salvato/);
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1);
  });
});

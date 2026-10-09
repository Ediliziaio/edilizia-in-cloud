/**
 * Impostazioni → Fornitori, dopo il controllo del 09/10/2026.
 *
 *  - Il modulo non ha più «Prefisso barcode» e «Formato QR» (nessun codice li leggeva, 0 fornitori su 181):
 *    resta «Questo fornitore usa codici GS1», che invece il carico rapido del magazzino legge. Salvando non si
 *    scrivono più le due colonne: se un fornitore le avesse, restano com'erano.
 *  - Chi può solo guardare (senza «Fornitori» in modifica) non vede nessun comando che scrive.
 *  - Un solo titolo di primo livello per pagina: lo mette il layout, non la scheda «Ordini e pagamenti».
 *  - La finestra del fornitore e quella «Unisci due fornitori» non perdono quello che si è scritto con Esc o un
 *    clic fuori: chiedono conferma, ma solo se si è cambiato qualcosa.
 *  - Il registro «Cosa è cambiato» dice creato / modificato / eliminato / unito e il nome del fornitore.
 *  - Gli errori sono in italiano, mai il testo del database.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SettingsSuppliers from "@/pages/azienda/settings/SettingsSuppliers";
import { SuppliersConfig } from "@/components/settings/SuppliersConfig";
import { SuppliersOperational } from "@/pages/azienda/Suppliers";

// La pagina intera con le sue schede è pesante per le interrogazioni per ruolo di Testing Library: su una macchina
// carica 5 secondi possono non bastare.
vi.setConfig({ testTimeout: 30_000 });

type Riga = Record<string, unknown>;

const state = vi.hoisted(() => ({
  role: "employee",
  permessi: {} as Record<string, boolean>,
  fornitori: [] as Array<Record<string, unknown>>,
  ordini: [] as Array<Record<string, unknown>>,
  log: [] as Array<Record<string, unknown>>,
  collegamenti: 0,
  errori: {} as Record<string, string>,
  scritturaFallita: false,
  scritturaMessaggio: "errore simulato",
  scritturaCodice: "",
  scritture: [] as Array<{ table: string; op: string; payload: unknown; filtri: Array<[string, unknown]> }>,
  letture: [] as Array<{ table: string; inFiltri: Array<[string, unknown[]]> }>,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ role: state.role, effectiveCompany: { id: "company-1", name: "Azienda prova" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, ...state.permessi }) }));
vi.mock("sonner", () => ({ toast: { success: state.toastSuccess, error: state.toastError, info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "utente-1" } } }) },
  from: (table: string) => {
    let op = "read";
    let payload: unknown;
    let conteggio = false;
    const filtri: Array<[string, unknown]> = [];
    const inFiltri: Array<[string, unknown[]]> = [];
    const risposta = () => {
      if (op !== "read") {
        if (state.scritturaFallita) return { data: null as unknown, count: null as unknown, error: { message: state.scritturaMessaggio, code: state.scritturaCodice } as unknown };
        return { data: [{ id: "scritto" }] as unknown, count: null as unknown, error: null as unknown };
      }
      if (state.errori[table]) return { data: null as unknown, count: null as unknown, error: { message: state.errori[table] } as unknown };
      if (table === "suppliers") return { data: state.fornitori as unknown, count: null as unknown, error: null as unknown };
      if (table === "company_activity_log") return { data: state.log as unknown, count: null as unknown, error: null as unknown };
      if (table === "purchase_orders") return { data: (conteggio ? [] : state.ordini) as unknown, count: (conteggio ? state.collegamenti : null) as unknown, error: null as unknown };
      return { data: [] as unknown, count: (conteggio ? 0 : null) as unknown, error: null as unknown };
    };
    const scrive = (nome: string, dati?: unknown) => { op = nome; payload = dati; };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: (_colonne?: string, opzioni?: { count?: string }) => { if (opzioni?.count) conteggio = true; return builder; },
      eq: (colonna: string, valore: unknown) => { filtri.push([colonna, valore]); return builder; },
      neq: () => builder,
      in: (colonna: string, valori: unknown[]) => { inFiltri.push([colonna, valori]); return builder; },
      is: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      insert: (dati: unknown) => { scrive("insert", dati); return builder; },
      update: (dati: unknown) => { scrive("update", dati); return builder; },
      delete: () => { scrive("delete"); return builder; },
      then: (resolve: (valore: ReturnType<typeof risposta>) => unknown, rifiuta?: (errore: unknown) => unknown) => {
        if (op === "read") state.letture.push({ table, inFiltri });
        else state.scritture.push({ table, op, payload, filtri });
        return Promise.resolve(risposta()).then(resolve, rifiuta);
      },
    };
    return builder;
  },
} }));

const base: Riga = {
  company_id: "company-1", vat_rate: 22, is_foreign: false, address: null as unknown, city: null as unknown, province: null as unknown, postal_code: null as unknown,
  country: "Italia", vat_number: null as unknown, fiscal_code: null as unknown, email: null as unknown, phone: null as unknown, website: null as unknown, product_category: null as unknown,
  notes: null as unknown, payment_method: null as unknown, is_active: true, uses_gs1: false, lead_time_days: 0, min_order_amount: 0, credit_limit: null as unknown,
  rating: null as unknown, iban: null as unknown, bank_name: null as unknown, created_at: "2026-01-01T10:00:00Z", updated_at: "2026-01-01T10:00:00Z",
};
const fornitore = (id: string, name: string, extra: Riga = {}): Riga => ({ ...base, id, name, ...extra });
const ROSSI = () => fornitore("f1", "Rossi Serramenti Srl", { city: "Bologna", province: "BO", product_category: "Serramenti", vat_number: "01234567890" });
const BIANCHI = () => fornitore("f2", "Bianchi Materiali", { city: "Modena", province: "MO", product_category: "Edilizia" });

// jsdom, a differenza di Chrome, non ferma i focus() annidati. Aprire una tendina (Radix Select) dentro una
// finestra (Radix Dialog) mette in gioco due FocusScope: se sono due copie del modulo (la node_modules locale,
// installata con npm, ne ha una per pacchetto; bun.lock, quella di CI, ne fa condividere una) si rimandano il
// focus all'infinito e vitest non finisce mai. Qui il rimbalzo si ferma dopo pochi livelli, come nel browser
// (stessa correzione, solo nel file di test, di adminPipelineSettings.test.tsx).
const focusDiJsdom = HTMLElement.prototype.focus;
let focusAnnidati = 0;

beforeAll(() => {
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    if (focusAnnidati >= 3) return;
    focusAnnidati++;
    try { focusDiJsdom.call(this, options); } finally { focusAnnidati--; }
  };
  // Radix e cmdk misurano e scorrono gli elementi: jsdom non lo sa fare.
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
});
afterAll(() => { HTMLElement.prototype.focus = focusDiJsdom; });

beforeEach(() => {
  state.role = "employee";
  state.permessi = { canViewSettingsSuppliers: true, canEditSettingsSuppliers: true };
  state.fornitori = [ROSSI(), BIANCHI()];
  state.ordini = [];
  state.log = [];
  state.collegamenti = 0;
  state.errori = {};
  state.scritturaFallita = false; state.scritturaMessaggio = "errore simulato"; state.scritturaCodice = "";
  state.scritture.length = 0; state.letture.length = 0;
  state.toastSuccess.mockClear(); state.toastError.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}
function montaPagina() {
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter><SettingsSuppliers /></MemoryRouter>
    </QueryClientProvider>,
  );
}
function montaAnagrafica(puoModificare = true) {
  return render(<QueryClientProvider client={client()}><SuppliersConfig puoModificare={puoModificare} /></QueryClientProvider>);
}
/** Le schede (Radix Tabs) si attivano con il mouse premuto, non con il clic. */
const apriScheda = (nome: string) => fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(nome) }), { button: 0, ctrlKey: false });
/** Apre un menu a tendina (Radix Select) e sceglie una voce. */
async function scegli(campo: HTMLElement, voce: RegExp | string) {
  fireEvent.click(campo);
  fireEvent.click(await screen.findByRole("option", { name: voce }));
}
async function apriNuovoFornitore() {
  fireEvent.click(await screen.findByRole("button", { name: /Nuovo fornitore/ }));
  return await screen.findByRole("dialog");
}
const apriCodiciABarre = (finestra: HTMLElement) => fireEvent.click(within(finestra).getByRole("button", { name: /Codici a barre/ }));

describe("Fornitori: codici a barre", () => {
  it("il modulo non ha più «Prefisso barcode» né «Formato QR», e ha «Questo fornitore usa codici GS1»", async () => {
    montaAnagrafica();
    const finestra = await apriNuovoFornitore();
    apriCodiciABarre(finestra);
    expect(within(finestra).getByLabelText("Questo fornitore usa codici GS1")).toBeInTheDocument();
    expect(within(finestra).getByText("Il lettore legge da solo lotto, seriale e scadenza dai QR di questo fornitore.")).toBeInTheDocument();
    expect(within(finestra).queryByText(/prefisso barcode/i)).toBeNull();
    expect(within(finestra).queryByText(/formato qr/i)).toBeNull();
    expect(within(finestra).queryByLabelText(/prefisso|formato/i)).toBeNull();
    expect(within(finestra).queryByText(/QR & Barcode/)).toBeNull();
    expect(within(finestra).queryByText("Custom")).toBeNull();
  });
  it("il riquadro si chiama «Codici a barre» e dice se GS1 è attivo", async () => {
    montaAnagrafica();
    const finestra = await apriNuovoFornitore();
    expect(within(finestra).getByText("Codici a barre")).toBeInTheDocument();
    expect(within(finestra).getByText("GS1 non attivo")).toBeInTheDocument();
    apriCodiciABarre(finestra);
    fireEvent.click(within(finestra).getByLabelText("Questo fornitore usa codici GS1"));
    expect(within(finestra).getByText("GS1 attivo")).toBeInTheDocument();
    expect(within(finestra).queryByText("GS1 non attivo")).toBeNull();
  });
  it("creando un fornitore si scrive «usa GS1» ma non il prefisso né il formato", async () => {
    montaAnagrafica();
    const finestra = await apriNuovoFornitore();
    fireEvent.change(within(finestra).getByLabelText(/Nome del fornitore/), { target: { value: "Verdi Ferramenta" } });
    apriCodiciABarre(finestra);
    fireEvent.click(within(finestra).getByLabelText("Questo fornitore usa codici GS1"));
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea" }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith("Fornitore creato", expect.anything()));
    const inserimenti = state.scritture.filter((s) => s.table === "suppliers" && s.op === "insert");
    expect(inserimenti).toHaveLength(1);
    expect(inserimenti[0].payload).toMatchObject({ name: "Verdi Ferramenta", uses_gs1: true, company_id: "company-1" });
    expect(Object.keys(inserimenti[0].payload as object)).not.toContain("barcode_prefix");
    expect(Object.keys(inserimenti[0].payload as object)).not.toContain("default_qr_format");
  });
  it("modificando un fornitore che ha già prefisso e formato non si toccano: l'aggiornamento non li nomina", async () => {
    state.fornitori = [fornitore("f1", "Rossi Serramenti Srl", { uses_gs1: true, barcode_prefix: "800012", default_qr_format: "ean13", city: "Bologna" })];
    montaAnagrafica();
    fireEvent.click(await screen.findByRole("button", { name: "Modifica Rossi Serramenti Srl" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByRole("heading", { name: "Modifica fornitore" })).toBeInTheDocument();
    apriCodiciABarre(finestra);
    expect(within(finestra).getByLabelText("Questo fornitore usa codici GS1")).toBeChecked();
    fireEvent.change(within(finestra).getByLabelText("Città"), { target: { value: "Modena" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith("Fornitore aggiornato", expect.anything()));
    const aggiornamenti = state.scritture.filter((s) => s.table === "suppliers" && s.op === "update");
    expect(aggiornamenti).toHaveLength(1);
    expect(aggiornamenti[0].payload).toMatchObject({ city: "Modena", uses_gs1: true });
    expect(Object.keys(aggiornamenti[0].payload as object)).not.toContain("barcode_prefix");
    expect(Object.keys(aggiornamenti[0].payload as object)).not.toContain("default_qr_format");
  });
});

describe("Fornitori: sola lettura onesta", () => {
  it("senza «Fornitori» in modifica non ci sono comandi che scrivono, e una frase dice perché", async () => {
    state.permessi = { canViewSettingsSuppliers: true };
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    expect(screen.getByRole("note")).toHaveTextContent("Stai consultando queste impostazioni: le cambia chi ha «Fornitori» in modifica.");
    expect(screen.queryByRole("button", { name: /Nuovo fornitore/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Unisci doppioni/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Modifica Rossi Serramenti Srl" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Elimina Rossi Serramenti Srl" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Azioni" })).toBeNull();
    // Leggere resta possibile: la tabella c'è e anche l'esportazione.
    expect(screen.getByRole("columnheader", { name: "Nome del fornitore" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Esporta/ }).length).toBeGreaterThan(0);
  });
  it("con «Fornitori» in modifica i comandi ci sono e la frase no", async () => {
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByRole("button", { name: /Nuovo fornitore/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unisci doppioni/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modifica Rossi Serramenti Srl" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimina Rossi Serramenti Srl" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Azioni" })).toBeInTheDocument();
  });
  it("l'amministratore, anche senza il permesso scritto, può modificare", async () => {
    state.role = "company_admin"; state.permessi = {};
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    expect(screen.getByRole("button", { name: /Nuovo fornitore/ })).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("nella scheda «Ordini e pagamenti» chi può solo guardare non ha «Modifica»", async () => {
    state.permessi = { canViewSettingsSuppliers: true };
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Ordini e pagamenti");
    fireEvent.click(await screen.findByText("Rossi Serramenti Srl"));
    await screen.findByRole("heading", { level: 2, name: "Rossi Serramenti Srl" });
    expect(screen.queryByRole("button", { name: /Modifica/ })).toBeNull();
  });
  it("nella scheda «Ordini e pagamenti» con il permesso la modifica rapida c'è e i campi hanno un nome", async () => {
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Ordini e pagamenti");
    fireEvent.click(await screen.findByText("Rossi Serramenti Srl"));
    fireEvent.click(await screen.findByRole("button", { name: /Modifica/ }));
    for (const nome of ["Email", "Telefono", "Sito web", "IBAN", "Banca", "Metodo di pagamento", "Lead time (gg)", "Ordine min.", "Fido", "Via e numero", "CAP", "Città", "Provincia", "Note"]) {
      expect(screen.getByLabelText(nome), nome).toBeInTheDocument();
    }
  });
  it("chi non può modificare non apre le finestre di scrittura nemmeno per sbaglio", async () => {
    state.permessi = { canViewSettingsSuppliers: true };
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(state.scritture).toHaveLength(0);
  });
  it("se il permesso di vista viene tolto mentre la pagina è aperta, si torna alla home (l'effetto guarda canView)", async () => {
    // Prima l'effetto dipendeva da [isAdmin, navigate]: chi non è amministratore non veniva rimandato mai.
    state.permessi = { canViewSettingsSuppliers: true };
    const qc = client();
    const albero = () => (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/azienda/impostazioni/fornitori"]}>
          <Routes>
            <Route path="/azienda/impostazioni/fornitori" element={<SettingsSuppliers />} />
            <Route path="/azienda" element={<p>Home dell'azienda</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(albero());
    await screen.findByText("Rossi Serramenti Srl");
    state.permessi = {};
    rerender(albero());
    expect(await screen.findByText("Home dell'azienda")).toBeInTheDocument();
  });
  it("senza nemmeno la vista l'effetto rimanda a casa; con la vista non rimanda", async () => {
    state.permessi = {};
    const { unmount } = montaPagina();
    // Senza permessi la pagina non mostra niente (e rimanda a /azienda).
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Anagrafica" })).toBeNull());
    unmount();
    state.permessi = { canViewSettingsSuppliers: true };
    montaPagina();
    expect(await screen.findByRole("tab", { name: "Anagrafica" })).toBeInTheDocument();
  });
});

describe("Fornitori: un solo titolo di primo livello", () => {
  it("nessun h1 nella pagina, in nessuna scheda, nemmeno aprendo un fornitore", async () => {
    state.ordini = [{ supplier_id: "f1", total: 1000 }];
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    // Il titolo e la frase della scheda che ripetevano «Fornitori» sul telefono non ci sono più.
    expect(screen.queryByText("Gestisci i tuoi fornitori e le relative informazioni")).toBeNull();
    expect(screen.queryByText("Anagrafica, listini, metodi di pagamento e performance dei tuoi fornitori.")).toBeNull();

    apriScheda("Ordini e pagamenti");
    await screen.findByText("Fornitori attivi");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    fireEvent.click(await screen.findByText("Rossi Serramenti Srl"));
    await screen.findByRole("heading", { level: 2, name: "Rossi Serramenti Srl" });
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);

    apriScheda("Acquisti");
    await screen.findByText("Chi compriamo di più");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);

    apriScheda("Cosa è cambiato");
    await screen.findByText(/Creazioni, modifiche, eliminazioni e unioni dei fornitori/);
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
  });
  it("fuori dalle impostazioni la scheda «Ordini e pagamenti» ha ancora il suo titolo e la modifica rapida", async () => {
    render(<QueryClientProvider client={client()}><MemoryRouter><SuppliersOperational /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("heading", { level: 1, name: "Fornitori" })).toBeInTheDocument();
    fireEvent.click(await screen.findByText("Rossi Serramenti Srl"));
    expect(await screen.findByRole("heading", { level: 1, name: "Rossi Serramenti Srl" })).toBeInTheDocument();
    // Senza dire niente, il permesso di modificare c'è (valore di partenza): chi la usa altrove non perde la modifica.
    expect(screen.getByRole("button", { name: /Modifica/ })).toBeInTheDocument();
  });
  it("i titoli dei riquadri dei report e del registro sono di secondo livello", async () => {
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Acquisti");
    await screen.findByText("Chi compriamo di più");
    const secondoLivello = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(secondoLivello).toEqual(expect.arrayContaining(["Chi compriamo di più", "Scadenze aperte", "Categorie fornitore"]));
    apriScheda("Cosa è cambiato");
    expect(await screen.findByRole("heading", { level: 2, name: "Cosa è cambiato" })).toBeInTheDocument();
  });
});

describe("Fornitori: la bozza non si perde", () => {
  it("chiudere la finestra del fornitore con del testo scritto chiede conferma", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    montaAnagrafica();
    const finestra = await apriNuovoFornitore();
    fireEvent.change(within(finestra).getByLabelText(/Nome del fornitore/), { target: { value: "Verdi Ferramenta" } });
    // Esc
    fireEvent.keyDown(finestra, { key: "Escape" });
    expect(conferma).toHaveBeenCalledTimes(1);
    expect(conferma).toHaveBeenCalledWith("Ci sono modifiche non salvate. Uscire senza salvarle?");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByLabelText(/Nome del fornitore/)).toHaveValue("Verdi Ferramenta");
    // «Annulla»
    fireEvent.click(within(finestra).getByRole("button", { name: "Annulla" }));
    expect(conferma).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Se si conferma, si chiude.
    conferma.mockReturnValue(true);
    fireEvent.click(within(finestra).getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(state.scritture).toHaveLength(0);
  });
  it("chiudere la finestra senza aver cambiato niente non chiede niente", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    montaAnagrafica();
    const finestra = await apriNuovoFornitore();
    fireEvent.keyDown(finestra, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(conferma).not.toHaveBeenCalled();
  });
  it("aprire un fornitore esistente e richiuderlo senza toccare niente non chiede niente", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    montaAnagrafica();
    fireEvent.click(await screen.findByRole("button", { name: "Modifica Rossi Serramenti Srl" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.click(within(finestra).getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(conferma).not.toHaveBeenCalled();
  });
  it("una modifica a un fornitore esistente chiede conferma prima di chiudere", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    montaAnagrafica();
    fireEvent.click(await screen.findByRole("button", { name: "Modifica Rossi Serramenti Srl" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.change(within(finestra).getByLabelText("Città"), { target: { value: "Ferrara" } });
    fireEvent.keyDown(finestra, { key: "Escape" });
    expect(conferma).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("«Unisci due fornitori» chiede conferma solo se si è scelto qualcosa", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    montaAnagrafica();
    fireEvent.click(await screen.findByRole("button", { name: /Unisci doppioni/ }));
    let finestra = await screen.findByRole("dialog");
    // Vuota: si chiude senza chiedere.
    fireEvent.keyDown(finestra, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(conferma).not.toHaveBeenCalled();
    // Con un doppione scelto: chiede, e se non si conferma resta.
    fireEvent.click(screen.getByRole("button", { name: /Unisci doppioni/ }));
    finestra = await screen.findByRole("dialog");
    await scegli(within(finestra).getByLabelText("Doppione da eliminare"), /Bianchi Materiali/);
    fireEvent.keyDown(finestra, { key: "Escape" });
    expect(conferma).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Fornitori: parole", () => {
  it("il pulsante e la finestra per unire i doppioni parlano come il cantiere", async () => {
    montaAnagrafica();
    fireEvent.click(await screen.findByRole("button", { name: "Unisci doppioni" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByRole("heading", { name: "Unisci due fornitori" })).toBeInTheDocument();
    expect(within(finestra).getByText("Sposta ordini, costi, scadenze, prima nota, listino e magazzino dal doppione al fornitore principale, poi elimina il doppione.")).toBeInTheDocument();
    expect(within(finestra).getByLabelText("Doppione da eliminare")).toBeInTheDocument();
    expect(within(finestra).getByLabelText("Fornitore da tenere")).toBeInTheDocument();
    expect(within(finestra).getByText("Non si può annullare")).toBeInTheDocument();
    expect(within(finestra).getByText("Controlla bene quale tenere e quale eliminare prima di andare avanti.")).toBeInTheDocument();
    expect(within(finestra).getByRole("button", { name: "Unisci i fornitori" })).toBeDisabled();
    expect(screen.queryByText(/merge/i)).toBeNull();
  });
  it("l'avviso dei doppioni dice cosa fare, con le parole nuove", async () => {
    state.fornitori = [ROSSI(), fornitore("f9", "Rossi Serramenti S.r.l.", { vat_number: "01234567890" }), BIANCHI()];
    montaAnagrafica();
    expect(await screen.findByText("Possibili doppioni")).toBeInTheDocument();
    expect(screen.getByText("2 fornitori hanno nome o partita IVA simili. Usa «Unisci doppioni» per portare lo storico sul fornitore giusto.")).toBeInTheDocument();
    expect(screen.queryByText(/Possibili duplicati/)).toBeNull();
  });
  it("senza il permesso l'avviso dei doppioni non manda a un pulsante che non c'è", async () => {
    state.fornitori = [ROSSI(), fornitore("f9", "Rossi Serramenti S.r.l.", { vat_number: "01234567890" })];
    montaAnagrafica(false);
    expect(await screen.findByText("2 fornitori hanno nome o partita IVA simili.")).toBeInTheDocument();
    expect(screen.queryByText(/Usa «Unisci doppioni»/)).toBeNull();
  });
  it("unire due fornitori sposta lo storico e dice «Fornitori uniti»", async () => {
    montaAnagrafica();
    fireEvent.click(await screen.findByRole("button", { name: /Unisci doppioni/ }));
    const finestra = await screen.findByRole("dialog");
    await scegli(within(finestra).getByLabelText("Doppione da eliminare"), /Bianchi Materiali/);
    await scegli(within(finestra).getByLabelText("Fornitore da tenere"), /Rossi Serramenti Srl/);
    fireEvent.click(within(finestra).getByRole("button", { name: "Unisci i fornitori" }));
    await waitFor(() => expect(state.toastSuccess).toHaveBeenCalledWith("Fornitori uniti", { description: "Storico, costi, ordini e pagamenti sono passati al fornitore da tenere." }));
    expect(state.scritture.filter((s) => s.op === "update").every((s) => (s.payload as { supplier_id: string }).supplier_id === "f1")).toBe(true);
    expect(state.scritture.some((s) => s.table === "suppliers" && s.op === "delete")).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("se l'unione non riesce lo dice in italiano", async () => {
    state.scritturaFallita = true; state.scritturaMessaggio = "deadlock detected"; state.scritturaCodice = "40P01";
    montaAnagrafica();
    fireEvent.click(await screen.findByRole("button", { name: /Unisci doppioni/ }));
    const finestra = await screen.findByRole("dialog");
    await scegli(within(finestra).getByLabelText("Doppione da eliminare"), /Bianchi Materiali/);
    await scegli(within(finestra).getByLabelText("Fornitore da tenere"), /Rossi Serramenti Srl/);
    fireEvent.click(within(finestra).getByRole("button", { name: "Unisci i fornitori" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith("Non sono riuscito a unire i fornitori.", { description: "Il sistema era occupato. Riprova tra qualche istante." }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("le schede si chiamano Anagrafica, Ordini e pagamenti, Acquisti, Cosa è cambiato", async () => {
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    expect(screen.getAllByRole("tab").map((t) => t.textContent).filter((t) => !/^(Italiani|Esteri)/.test(t ?? ""))).toEqual(["Anagrafica", "Ordini e pagamenti", "Acquisti", "Cosa è cambiato"]);
  });
  it("il modulo e la tabella usano maiuscole e nomi semplici", async () => {
    montaAnagrafica();
    const finestra = await apriNuovoFornitore();
    expect(within(finestra).getByRole("heading", { name: "Nuovo fornitore" })).toBeInTheDocument();
    for (const titolo of ["Dati generali", "Dati fiscali", "Contatti", "Indirizzo"]) {
      expect(within(finestra).getByRole("heading", { level: 3, name: titolo })).toBeInTheDocument();
    }
    for (const etichetta of ["Nome del fornitore *", "Categoria", "Modalità di pagamento", "Tipo fornitore", "Codice fiscale", "Sito web"]) {
      expect(within(finestra).getByLabelText(etichetta), etichetta).toBeInTheDocument();
    }
    for (const vecchia of ["Dati Generali", "Dati Fiscali", "Sito Web", "Nome Fornitore", "Categoria Prodotti", "Tipo Fornitore", "Modalità di Pagamento", "Codice Fiscale"]) {
      expect(within(finestra).queryByText(vecchia), vecchia).toBeNull();
    }
    fireEvent.click(within(finestra).getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("columnheader", { name: "Nome del fornitore" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Pagamento" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Mod. Pagamento" })).toBeNull();
  });
  it("il riquadro dei report dice «Chi compriamo di più» con la frase nuova", async () => {
    state.ordini = [{ supplier_id: "f1", total: 1000 }];
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Acquisti");
    expect(await screen.findByText("Chi compriamo di più")).toBeInTheDocument();
    expect(screen.getByText("I fornitori con più ordini d'acquisto: utile per trattare i prezzi.")).toBeInTheDocument();
    expect(screen.queryByText(/Storico acquisti avanzato/)).toBeNull();
    expect(screen.queryByText(/procurement/i)).toBeNull();
  });
});

describe("Fornitori: il registro «Cosa è cambiato»", () => {
  const registro = (id: string, azione: string, tipo: string, dettagli: Riga, extra: Riga = {}): Riga => ({
    id, action: azione, target_type: tipo, target_id: `codice-interno-${id}`, target_label: null as unknown,
    details: dettagli, created_at: "2026-10-08T10:15:00Z", user_id: null as unknown, actor_name: null as unknown, ...extra,
  });
  beforeEach(() => {
    state.log = [
      registro("l1", "supplier.updated", "suppliers", { name: "Rossi Serramenti Srl" }),
      registro("l2", "supplier.created", "suppliers", { name: "Bianchi Materiali" }),
      registro("l3", "supplier.deleted", "suppliers", { name: "Verdi Ferramenta" }),
      registro("l4", "create_supplier", "supplier", { name: "Neri Colori" }),
      registro("l5", "merge", "supplier", { source_name: "Rossi Srl", target_name: "Rossi Serramenti Srl" }),
      registro("l6", "qualcosa.di.strano", "suppliers", { name: "Gialli Vernici" }),
    ];
  });
  it("l'azione è in italiano e il nome del fornitore sta al posto del codice interno", async () => {
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Cosa è cambiato");
    expect(await screen.findByText("Verdi Ferramenta")).toBeInTheDocument();
    const cartellini = screen.getAllByText(/^(creato|modificato|eliminato|unito|altro)$/).map((c) => c.textContent);
    expect(cartellini).toEqual(["modificato", "creato", "eliminato", "creato", "unito", "altro"]);
    for (const nome of ["Bianchi Materiali", "Verdi Ferramenta", "Neri Colori", "Gialli Vernici"]) expect(screen.getByText(nome)).toBeInTheDocument();
    expect(screen.getByText("Il doppione «Rossi Srl» è passato a questo fornitore.")).toBeInTheDocument();
    const testo = document.body.textContent ?? "";
    for (const inglese of ["supplier.updated", "supplier.created", "supplier.deleted", "create_supplier", "merge", "qualcosa.di.strano"]) {
      expect(testo, inglese).not.toContain(inglese);
    }
    expect(testo).not.toContain("codice-interno");
  });
  it("legge le righe sia col tipo «suppliers» (oggi) sia «supplier» (prima e unione)", async () => {
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Cosa è cambiato");
    await screen.findByText("Verdi Ferramenta");
    const lettura = state.letture.find((l) => l.table === "company_activity_log");
    expect(lettura?.inFiltri).toContainEqual(["target_type", ["suppliers", "supplier"]]);
  });
  it("il titolo e la frase del registro sono quelli nuovi", async () => {
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Cosa è cambiato");
    expect(await screen.findByText("Creazioni, modifiche, eliminazioni e unioni dei fornitori, con la data.")).toBeInTheDocument();
    expect(screen.queryByText(/Audit log/i)).toBeNull();
    expect(screen.queryByText(/merge fornitori/i)).toBeNull();
  });
  it("mostra l'autore solo quando il registro lo conosce", async () => {
    state.log = [registro("l1", "supplier.updated", "suppliers", { name: "Rossi Serramenti Srl" }, { actor_name: "Mario Rossi" }), registro("l2", "supplier.created", "suppliers", { name: "Bianchi Materiali" })];
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Cosa è cambiato");
    expect(await screen.findByText("da Mario Rossi")).toBeInTheDocument();
    expect(screen.getAllByText(/^da /)).toHaveLength(1);
  });
  it("durante la lettura dice «Caricamento registro…»", async () => {
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Cosa è cambiato");
    expect(screen.getByText("Caricamento registro…")).toBeInTheDocument();
    await screen.findByText("Gialli Vernici");
  });
  it("se la lettura fallisce dice «Registro non disponibile», in italiano, e permette di riprovare", async () => {
    state.errori.company_activity_log = 'permission denied for table "company_activity_log"';
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Cosa è cambiato");
    expect(await screen.findByText("Registro non disponibile")).toBeInTheDocument();
    expect(screen.getByText(/Non sono riuscito a leggere le modifiche ai fornitori/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/permission denied/);
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });
});

describe("Fornitori: accessibilità e errori in italiano", () => {
  it("le etichette del modulo sono collegate ai campi", async () => {
    montaAnagrafica();
    const finestra = await apriNuovoFornitore();
    for (const etichetta of ["Categoria", "Modalità di pagamento", "Tipo fornitore", "Aliquota IVA"]) {
      const campo = within(finestra).getByLabelText(etichetta);
      expect(campo, etichetta).toHaveAttribute("role", "combobox");
    }
  });
  it("i campi dei filtri hanno un nome", async () => {
    montaAnagrafica();
    await screen.findByText("Rossi Serramenti Srl");
    expect(screen.getByLabelText("Cerca un fornitore")).toBeInTheDocument();
    for (const nome of ["Filtra per stato", "Filtra per categoria", "Filtra per provincia", "Ordina i fornitori"]) {
      expect(screen.getByLabelText(nome), nome).toBeInTheDocument();
    }
  });
  it("la ricerca della scheda «Ordini e pagamenti» ha un nome", async () => {
    montaPagina();
    await screen.findByText("Rossi Serramenti Srl");
    apriScheda("Ordini e pagamenti");
    expect(await screen.findByLabelText("Cerca un fornitore")).toBeInTheDocument();
  });
  it("se i fornitori non si leggono, gli avvisi sono in italiano e senza il testo del database", async () => {
    state.errori.suppliers = 'relation "public.suppliers" does not exist';
    montaPagina();
    expect(await screen.findByText("Impossibile caricare i fornitori")).toBeInTheDocument();
    expect(await screen.findByText("Statistiche fornitori non disponibili")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/does not exist/);
    expect(screen.getAllByRole("button", { name: "Riprova" }).length).toBeGreaterThanOrEqual(2);
  });
  it("un fornitore già presente si segnala in italiano", async () => {
    state.scritturaFallita = true; state.scritturaCodice = "23505";
    state.scritturaMessaggio = 'duplicate key value violates unique constraint "suppliers_company_id_name_key"';
    montaAnagrafica();
    const finestra = await apriNuovoFornitore();
    fireEvent.change(within(finestra).getByLabelText(/Nome del fornitore/), { target: { value: "Verdi Ferramenta" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith("Errore", { description: "Esiste già un fornitore con questa ragione sociale." }));
    // La bozza resta lì.
    expect(within(screen.getByRole("dialog")).getByLabelText(/Nome del fornitore/)).toHaveValue("Verdi Ferramenta");
  });
  it("un rifiuto del database per i permessi non diventa «associato a dati operativi»", async () => {
    state.scritturaFallita = true; state.scritturaCodice = "42501";
    state.scritturaMessaggio = 'new row violates row-level security policy for table "suppliers"';
    montaAnagrafica();
    fireEvent.click(await screen.findByRole("button", { name: "Elimina Bianchi Materiali" }));
    const conferma = await screen.findByRole("alertdialog");
    await waitFor(() => expect(within(conferma).getByRole("button", { name: "Elimina" })).toBeEnabled());
    fireEvent.click(within(conferma).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith("Errore", { description: "Non hai i permessi per questa operazione. Contatta l'amministratore." }));
  });
  it("un errore senza una regola scritta ripiega su una frase italiana", async () => {
    state.scritturaFallita = true; state.scritturaMessaggio = "boom";
    montaAnagrafica();
    const finestra = await apriNuovoFornitore();
    fireEvent.change(within(finestra).getByLabelText(/Nome del fornitore/), { target: { value: "Verdi Ferramenta" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea" }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith("Errore", { description: "Impossibile creare il fornitore." }));
  });
});

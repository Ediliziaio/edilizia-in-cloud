/**
 * Impostazioni → Finanziamenti (10/10/2026): cosa dicono le pagine, e che sia vero.
 *
 *  - elenco: una riga al posto dei quattro riquadri, i filtri solo con più di 5 tabelle, le date all'italiana,
 *    e la scritta «Scaduta» che dice la verità: una tabella attiva e scaduta viene ancora proposta nei preventivi
 *    (le date non filtrano niente: conta solo «attiva». Decisione D12 aperta, il comportamento non cambia);
 *  - dettaglio: otto riquadri diventano una riga, gli avvisi sulla validità dicono la verità, titoli in ordine,
 *    colonne ordinabili da tastiera;
 *  - procedura «Nuova tabella»: parole in italiano, etichette collegate, bozza protetta, errori senza testo tecnico;
 *  - calcolatore: parole e percentuali all'italiana.
 * Il database è finto e registra ogni scrittura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import SettingsFinanziamenti from "@/pages/azienda/settings/SettingsFinanziamenti";
import SettingsFinanziamentiDetail from "@/pages/azienda/settings/SettingsFinanziamentiDetail";
import SettingsFinanziamentiNuova from "@/pages/azienda/settings/SettingsFinanziamentiNuova";
import SettingsFinanziamentiCalcolatore from "@/pages/azienda/settings/SettingsFinanziamentiCalcolatore";
import { CalcolatoreOutput } from "@/pages/azienda/settings/_finanziamenti/CalcolatoreOutput";
import { SimulatoreMultiDurata } from "@/pages/azienda/settings/_finanziamenti/SimulatoreMultiDurata";
import { calcolaFinanziamento } from "@/lib/finanziamenti/calcolaFinanziamento";
import type { RigaTabellaFinanziamento } from "@/lib/finanziamenti/types";

type Riga = Record<string, unknown>;

const state = vi.hoisted(() => ({
  permissions: {} as Record<string, boolean>,
  tabelle: [] as Array<Record<string, unknown>>,
  righe: [] as Array<Record<string, unknown>>,
  finanziarie: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{ table: string; op: string; value: unknown; filters: Array<[string, unknown]> }>,
  /** Un errore che il database finto restituisce a quella tabella e a quell'operazione. */
  fallisce: [] as Array<{ table: string; op: string; error: unknown }>,
  /** Cosa risponde l'archivio dei file quando si chiede il collegamento per scaricare un allegato. */
  erroreFile: null as unknown,
  /** Un progetto fotovoltaico usa la tabella (la funzione che elimina lo controlla prima di cancellare). */
  usataDaFv: false,
  /** Cosa risponde la funzione che legge il PDF. */
  funzione: { data: {} as unknown, error: {} as unknown },
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "company_admin", effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permissions }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-1" }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const call = { table, op: "select", value: null as unknown, filters: [] as Array<[string, unknown]> };
      let uno = false;
      const risposta = () => {
        const guasto = state.fallisce.find((f) => f.table === table && f.op === call.op);
        if (guasto) return { data: null as unknown, error: guasto.error };
        if (call.op === "delete" && table === "eic_tabelle_finanziamento") {
          const id = call.filters.find(([colonna]) => colonna === "id")?.[1];
          state.tabelle = state.tabelle.filter((r) => r.id !== id);
        }
        if (call.op !== "select") {
          const v = (call.value ?? {}) as Record<string, unknown>;
          return { data: uno ? { id: "nuova-id", nome_prodotto: v.nome_prodotto ?? null } : null, error: null as unknown };
        }
        const sorgente =
          table === "eic_tabelle_finanziamento" ? state.tabelle
          : table === "eic_tabelle_finanziamento_righe" ? state.righe
          : table === "eic_finanziarie" ? state.finanziarie
          : table === "fv_progetti" && state.usataDaFv ? [{ id: "progetto-1" }]
          : [];
        const trovate = sorgente.filter((r) => call.filters.every(([colonna, valore]) => !(colonna in r) || r[colonna] === valore));
        return { data: uno ? (trovate[0] ?? null) : trovate, error: null as unknown };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (colonna: string, valore: unknown) => { call.filters.push([colonna, valore]); return builder; },
        ilike: () => builder, order: () => builder, limit: () => builder,
        maybeSingle: async () => { uno = true; return risposta(); },
        single: async () => { uno = true; return risposta(); },
        insert: (valore: unknown) => {
          call.op = "insert"; call.value = valore; state.writes.push(call);
          // Le colonne che il database calcola da sé (righe_count, importi, durate) partono vuote.
          if (table === "eic_tabelle_finanziamento") state.tabelle.push({ id: "nuova-id", company_id: "company-1", righe_count: 0, importo_min: null as unknown, importo_max: null as unknown, durate_disponibili: [] as number[], attiva: true, ...(valore as Record<string, unknown>) });
          if (table === "eic_finanziarie") state.finanziarie.push({ id: "nuova-id", ...(valore as Record<string, unknown>) });
          return builder;
        },
        update: (valore: unknown) => { call.op = "update"; call.value = valore; state.writes.push(call); return builder; },
        delete: () => { call.op = "delete"; state.writes.push(call); return builder; },
        then: (resolve: (v: ReturnType<typeof risposta>) => unknown) => Promise.resolve(risposta()).then(resolve),
      };
      return builder;
    },
    storage: { from: () => ({ upload: async () => ({ error: null as unknown }), createSignedUrl: async () => (state.erroreFile ? { data: null as unknown, error: state.erroreFile } : { data: { signedUrl: "https://esempio.test/file" }, error: null as unknown }) }) },
    functions: { invoke: async () => state.funzione },
  },
}));

// Radix Select in jsdom
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  setPointerCapture: () => {},
  scrollIntoView: () => {},
});
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const PUO_MODIFICARE = { canViewSettingsFinanziamenti: true, canEditSettingsFinanziamenti: true };
const BASE = "/azienda/impostazioni/finanziamenti";

const tabella = (extra: Riga = {}): Riga => ({
  id: "t1", company_id: "company-1", finanziaria_id: "f1", nome_prodotto: "OKNOPLAST TAN 8.75", codice_condizione: "255891",
  subtariffa_default: "GT57T", tan_base: 8.75, pdf_url: null, pdf_filename: null, csv_url: null, csv_filename: null,
  data_decorrenza: "2026-10-01", data_scadenza: "2026-12-31", attiva: true, note: null, righe_count: 2,
  importo_min: 5000, importo_max: 30000, durate_disponibili: [24, 36], finanziaria: { nome: "Fiditalia" },
  ...extra,
});
const riga = (extra: Riga = {}): Riga => ({
  id: "r1", tabella_id: "t1", company_id: "company-1", subtariffa: "GT57T", importo_erogato: 5000, spese_istruttoria: 0,
  importo_totale_credito: 5000, numero_rate: 24, durata_mesi: 24, prima_rata_giorni: 30, importo_rata: 230,
  spese_incasso_rata: 3, interessi_cliente: 650, importo_totale_dovuto: 5650, tan: 8.75, taeg: 10.1, icc: null,
  provvigione_dealer: 60, created_at: "2026-10-01", ...extra,
});

function Posizione() {
  return <p data-testid="percorso">{useLocation().pathname}</p>;
}
function apri(percorso: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}>
        <Routes>
          <Route path={BASE} element={<SettingsFinanziamenti />} />
          <Route path={`${BASE}/nuova`} element={<SettingsFinanziamentiNuova />} />
          <Route path={`${BASE}/calcolatore`} element={<SettingsFinanziamentiCalcolatore />} />
          <Route path={`${BASE}/:id`} element={<SettingsFinanziamentiDetail />} />
        </Routes>
        <Posizione />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const testo = () => document.body.textContent ?? "";

beforeEach(() => {
  // «Oggi» è il 10/10/2026 a mezzogiorno: le tabelle di prova hanno le date rispetto a quel giorno.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0, 0));
  state.permissions = { ...PUO_MODIFICARE };
  state.tabelle = [];
  state.righe = [];
  state.finanziarie = [{ id: "f1", nome: "Fiditalia" }];
  state.writes.length = 0;
  state.fallisce.length = 0;
  state.usataDaFv = false;
  state.erroreFile = null as unknown;
  state.funzione = { data: null as unknown, error: null as unknown };
  state.success.mockClear();
  state.error.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Elenco ───────────────────────────────────────────────────────────────────
describe("Elenco", () => {
  const sei = () => [
    tabella({ id: "a", nome_prodotto: "In vigore" }),
    tabella({ id: "b", nome_prodotto: "Scaduta attiva", data_decorrenza: null, data_scadenza: "2026-10-01" }),
    tabella({ id: "c", nome_prodotto: "Scaduta spenta", data_decorrenza: null, data_scadenza: "2026-09-30", attiva: false }),
    tabella({ id: "d", nome_prodotto: "Futura", data_decorrenza: "2026-12-01", data_scadenza: null }),
    tabella({ id: "e", nome_prodotto: "In scadenza", data_decorrenza: null, data_scadenza: "2026-10-25" }),
    tabella({ id: "f", nome_prodotto: "Senza date", data_decorrenza: null, data_scadenza: null }),
  ];

  it("una riga al posto dei quattro riquadri: tabelle, attive, scadute, in scadenza (30 giorni)", async () => {
    state.tabelle = sei();
    apri(BASE);
    await screen.findByText("In vigore");
    expect(screen.getByText("6 tabelle · 5 attive · 2 scadute · 1 in scadenza (30 giorni)")).toBeInTheDocument();
    for (const vecchio of ["Piani caricati", "In scadenza 30gg", "Scaduti", "Attivi"]) {
      expect(screen.queryByText(vecchio), vecchio).toBeNull();
    }
  });

  it("le parti a zero non si scrivono, e si dice «1 tabella», non «1 tabelle»", async () => {
    state.tabelle = [tabella({ id: "a", nome_prodotto: "Una sola" })];
    apri(BASE);
    await screen.findByText("Una sola");
    expect(screen.getByText("1 tabella · 1 attiva")).toBeInTheDocument();
    cleanup();
    state.tabelle = [tabella({ id: "a", nome_prodotto: "Prima" }), tabella({ id: "b", nome_prodotto: "Seconda", attiva: false })];
    apri(BASE);
    await screen.findByText("Prima");
    expect(screen.getByText("2 tabelle · 1 attiva")).toBeInTheDocument();
  });

  it("i filtri si vedono solo con più di 5 tabelle", async () => {
    state.tabelle = sei().slice(0, 5);
    apri(BASE);
    await screen.findByText("In vigore");
    expect(screen.queryByLabelText("Filtra per stato")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pulisci" })).toBeNull();
    cleanup();
    state.tabelle = sei();
    apri(BASE);
    await screen.findByText("In vigore");
    expect(screen.getByLabelText("Filtra per stato")).toBeInTheDocument();
    expect(screen.getByLabelText("Filtra per finanziaria")).toBeInTheDocument();
    expect(screen.getByLabelText("Filtra per durata")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pulisci" })).toBeInTheDocument();
  });

  /** Apre la tendina di un filtro e sceglie una voce. */
  async function scegliFiltro(nome: string, voce: string) {
    fireEvent.pointerDown(screen.getByRole("combobox", { name: nome }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("option", { name: voce }));
  }
  const prodottiInElenco = () =>
    screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);

  it("il filtro per stato lavora sulle date vere: scadute, in scadenza, non ancora iniziate, disattivate", async () => {
    state.tabelle = sei();
    apri(BASE);
    await screen.findByText("In vigore");
    expect(prodottiInElenco()).toHaveLength(6);
    await scegliFiltro("Filtra per stato", "Scadute");
    expect(prodottiInElenco()).toEqual(["Scaduta attiva", "Scaduta spenta"]);
    await scegliFiltro("Filtra per stato", "In scadenza (30 giorni)");
    expect(prodottiInElenco()).toEqual(["In scadenza"]);
    await scegliFiltro("Filtra per stato", "Non ancora iniziate");
    expect(prodottiInElenco()).toEqual(["Futura"]);
    await scegliFiltro("Filtra per stato", "Disattivate");
    expect(prodottiInElenco()).toEqual(["Scaduta spenta"]);
    fireEvent.click(screen.getByRole("button", { name: "Pulisci" }));
    expect(prodottiInElenco()).toHaveLength(6);
  });

  it("se le tabelle scendono a 5 mentre un filtro è acceso, il filtro non nasconde più niente (e non si vede per spegnerlo)", async () => {
    state.tabelle = sei();
    apri(BASE);
    await screen.findByText("In vigore");
    await scegliFiltro("Filtra per stato", "Scadute");
    expect(prodottiInElenco()).toEqual(["Scaduta attiva", "Scaduta spenta"]);
    // si elimina una delle due scadute: restano 5 tabelle e le tendine spariscono
    fireEvent.click(screen.getByRole("button", { name: "Elimina Scaduta spenta" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Elimina tabella" }));
    await waitFor(() => expect(screen.queryByLabelText("Filtra per stato")).toBeNull());
    expect(prodottiInElenco()).toEqual(["In vigore", "Scaduta attiva", "Futura", "In scadenza", "Senza date"]);
  });

  it("la ricerca c'è sempre", async () => {
    state.tabelle = [tabella({ id: "a", nome_prodotto: "Prima" }), tabella({ id: "b", nome_prodotto: "Seconda" })];
    apri(BASE);
    await screen.findByText("Prima");
    fireEvent.change(screen.getByLabelText("Cerca tabelle finanziamento"), { target: { value: "seco" } });
    expect(screen.queryByText("Prima")).toBeNull();
    expect(screen.getByText("Seconda")).toBeInTheDocument();
  });

  it("le date sono gg/mm/aaaa, mai 2026-10-01", async () => {
    state.tabelle = sei();
    apri(BASE);
    await screen.findByText("In vigore");
    expect(screen.getByText("Scaduta il 01/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Scaduta il 30/09/2026")).toBeInTheDocument();
    expect(screen.getByText("Dal 01/12/2026")).toBeInTheDocument();
    expect(screen.getByText("Scade il 25/10/2026")).toBeInTheDocument();
    expect(within(screen.getByText("In vigore").closest("tr")!).getByText("Valida")).toBeInTheDocument();
    expect(within(screen.getByText("Senza date").closest("tr")!).getByText("Senza scadenza")).toBeInTheDocument();
    expect(testo()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("«Scaduta» dice la verità: se la tabella è attiva viene ancora proposta nei preventivi; se è spenta no", async () => {
    state.tabelle = sei();
    apri(BASE);
    await screen.findByText("In vigore");
    const attiva = screen.getByText("Scaduta attiva").closest("tr")!;
    expect(within(attiva).getByText("Scaduta il 01/10/2026")).toBeInTheDocument();
    expect(within(attiva).getByText("Ancora proposta nei preventivi")).toBeInTheDocument();
    const spenta = screen.getByText("Scaduta spenta").closest("tr")!;
    expect(within(spenta).getByText("Scaduta il 30/09/2026")).toBeInTheDocument();
    expect(within(spenta).queryByText(/proposta nei preventivi/)).toBeNull();
    const futura = screen.getByText("Futura").closest("tr")!;
    expect(within(futura).getByText("Già proposta nei preventivi")).toBeInTheDocument();
    // le altre non hanno niente da segnalare
    expect(within(screen.getByText("In vigore").closest("tr")!).queryByText(/proposta nei preventivi/)).toBeNull();
  });

  it("le intestazioni dicono «Condizione» e «Importi», non «Cond.» e «Range importi»", async () => {
    state.tabelle = [tabella()];
    apri(BASE);
    await screen.findByText("OKNOPLAST TAN 8.75");
    expect(screen.getByRole("columnheader", { name: "Condizione" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Importi" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Cond." })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Range importi" })).toBeNull();
  });

  it("sul telefono (375 px) ogni tabella è una scheda leggibile, non nove colonne da far scorrere; i comandi restano gli stessi", async () => {
    const larghezzaPrima = window.innerWidth;
    window.innerWidth = 375;
    try {
      state.tabelle = [
        tabella({ id: "b", nome_prodotto: "Scaduta attiva", data_decorrenza: null, data_scadenza: "2026-10-01" }),
        tabella({ id: "a", nome_prodotto: "In vigore", attiva: false }),
      ];
      apri(BASE);
      await screen.findByText("Scaduta attiva");
      expect(screen.queryByRole("table")).toBeNull();
      const schede = within(screen.getByRole("list", { name: "Tabelle di finanziamento" })).getAllByRole("listitem");
      expect(schede).toHaveLength(2);
      const scaduta = schede[0];
      // tutto quel che serve per capire senza far scorrere di lato: finanziaria, importi, durate, validità, stato
      expect(scaduta).toHaveTextContent("Fiditalia · Condizione 255891");
      expect(scaduta).toHaveTextContent("€ 5000 – 30.000 · 24, 36 mesi");
      expect(within(scaduta).getByText("Scaduta il 01/10/2026")).toBeInTheDocument();
      expect(within(scaduta).getByText("Ancora proposta nei preventivi")).toBeInTheDocument();
      expect(within(scaduta).getByText("Attiva")).toBeInTheDocument();
      expect(within(schede[1]).getByText("Disattivata")).toBeInTheDocument();
      // i comandi: gli stessi, con gli stessi nomi
      fireEvent.click(within(scaduta).getByRole("button", { name: "Disattiva Scaduta attiva" }));
      await waitFor(() => expect(state.success).toHaveBeenCalledWith("Tabella disattivata."));
      expect(state.writes).toHaveLength(1);
      expect(within(scaduta).getByRole("link", { name: "Apri Scaduta attiva" })).toHaveAttribute("href", `${BASE}/b`);
      expect(within(schede[1]).getByRole("button", { name: "Elimina In vigore" })).toBeEnabled();
    } finally {
      window.innerWidth = larghezzaPrima;
    }
  });

  it("sul telefono una ricerca senza risultati lo dice", async () => {
    const larghezzaPrima = window.innerWidth;
    window.innerWidth = 375;
    try {
      state.tabelle = [tabella({ id: "a", nome_prodotto: "Prima" })];
      apri(BASE);
      await screen.findByText("Prima");
      fireEvent.change(screen.getByLabelText("Cerca tabelle finanziamento"), { target: { value: "zzz" } });
      expect(screen.getByText('Nessuna tabella trovata per "zzz".')).toBeInTheDocument();
    } finally {
      window.innerWidth = larghezzaPrima;
    }
  });

  it("nessun titolo di primo livello; a elenco vuoto il titolo è di secondo livello, e non promette calcoli che non fa", async () => {
    apri(BASE);
    const titolo = await screen.findByRole("heading", { level: 2, name: "Nessuna tabella caricata" });
    expect(titolo).toBeInTheDocument();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(testo()).not.toMatch(/calcolerà rate/);
    expect(testo()).toMatch(/vengono presi da quelle righe/);
  });

  it("l'errore di lettura non lascia il testo tecnico", async () => {
    state.fallisce = [{ table: "eic_tabelle_finanziamento", op: "select", error: { code: "42501", message: "permission denied for table eic_tabelle_finanziamento" } }];
    apri(BASE);
    const avviso = await screen.findByText("Non riesco a leggere le tabelle.");
    const scheda = avviso.closest("[role=alert]")!;
    expect(scheda).toHaveTextContent("Non hai i permessi per questa operazione");
    expect(scheda.textContent).not.toMatch(/permission denied|eic_tabelle/);
    expect(screen.queryByText("Nessuna tabella caricata")).toBeNull();
  });

  it("un errore nel disattivare dice in italiano cosa è andato storto", async () => {
    state.tabelle = [tabella({ id: "a", nome_prodotto: "Prima" })];
    state.fallisce = [{ table: "eic_tabelle_finanziamento", op: "update", error: { code: "42501", message: "new row violates row-level security policy for table \"eic_tabelle_finanziamento\"" } }];
    apri(BASE);
    await screen.findByText("Prima");
    fireEvent.click(screen.getByRole("button", { name: "Disattiva Prima" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito a cambiare lo stato della tabella", {
      description: "Non hai i permessi per questa operazione. Contatta l'amministratore.",
    });
  });

  it("eliminare una tabella usata da un progetto fotovoltaico: si legge la frase scritta dalla funzione, e non si cancella niente", async () => {
    state.tabelle = [tabella({ id: "a", nome_prodotto: "Prima" })];
    state.usataDaFv = true;
    apri(BASE);
    await screen.findByText("Prima");
    fireEvent.click(screen.getByRole("button", { name: "Elimina Prima" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Elimina tabella" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito a eliminare la tabella", {
      description: "Questa tabella è già usata in progetti/preventivi. Disattivala per impedirne nuovi utilizzi senza perdere lo storico.",
    });
    expect(state.writes).toEqual([]);
  });

  it("eliminare, se il database rifiuta: una frase italiana, non il testo del database", async () => {
    state.tabelle = [tabella({ id: "a", nome_prodotto: "Prima" })];
    state.fallisce = [{ table: "eic_tabelle_finanziamento", op: "delete", error: { code: "23503", message: "update or delete on table \"eic_tabelle_finanziamento\" violates foreign key constraint \"x\" on table \"y\"" } }];
    apri(BASE);
    await screen.findByText("Prima");
    fireEvent.click(screen.getByRole("button", { name: "Elimina Prima" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Elimina tabella" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito a eliminare la tabella", {
      description: "Impossibile completare: l'elemento è collegato ad altri dati.",
    });
  });

  it("la finestra di conferma non promette un blocco che non c'è: dice cosa succede davvero", async () => {
    state.tabelle = [tabella({ id: "a", nome_prodotto: "Prima" })];
    apri(BASE);
    await screen.findByText("Prima");
    fireEvent.click(screen.getByRole("button", { name: "Elimina Prima" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(finestra).toHaveTextContent("non si torna indietro");
    expect(finestra).toHaveTextContent("disattivala invece di eliminarla");
    expect(finestra).toHaveTextContent("Una tabella usata da un progetto fotovoltaico non si può eliminare.");
    expect(finestra.textContent).not.toMatch(/l.eliminazione verrà bloccata/);
  });
});

// ─── Dettaglio ────────────────────────────────────────────────────────────────
describe("Dettaglio", () => {
  beforeEach(() => {
    state.tabelle = [tabella()];
    state.righe = [
      riga(),
      riga({ id: "r2", importo_erogato: 30000, numero_rate: 36, durata_mesi: 36, importo_rata: 1000, importo_totale_credito: 30000, importo_totale_dovuto: 36500, taeg: 8.5, tan: 8.0 }),
    ];
  });
  const caricato = () => screen.findByRole("heading", { level: 2, name: /OKNOPLAST/ });

  it("gli otto riquadri sono una riga sotto il titolo, con le date all'italiana", async () => {
    apri(`${BASE}/t1`);
    await caricato();
    await screen.findByText(/rata da/);
    expect(screen.getByText(
      "2 righe · importi da € 5000 a € 30.000 · 24, 36 mesi · rata da € 233,00 a € 1003,00 · TAEG 8,50%–10,10% · valida dal 01/10/2026 al 31/12/2026",
    )).toBeInTheDocument();
    for (const vecchio of ["Rata completa", "Provvigione media", "Decorrenza", "Importi", "Durate"]) {
      expect(screen.queryByText(vecchio), vecchio).toBeNull();
    }
    expect(screen.getByText("Fiditalia · Condizione 255891 · Subtariffa GT57T · TAN base 8,75%")).toBeInTheDocument();
    expect(testo()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("con una data sola la riga dice «valida dal …» oppure «valida fino al …»", async () => {
    state.tabelle = [tabella({ data_decorrenza: "2026-10-01", data_scadenza: null })];
    const { unmount } = apri(`${BASE}/t1`);
    await caricato();
    expect(await screen.findByText(/ · valida dal 01\/10\/2026$/)).toBeInTheDocument();
    expect(screen.queryByText(/valida fino al/)).toBeNull();
    unmount();
    state.tabelle = [tabella({ data_decorrenza: null, data_scadenza: "2026-12-31" })];
    apri(`${BASE}/t1`);
    await caricato();
    expect(await screen.findByText(/ · valida fino al 31\/12\/2026$/)).toBeInTheDocument();
  });

  it("senza righe lette la riga ha solo ciò che si sa; senza date non scrive «valida»", async () => {
    state.tabelle = [tabella({ righe_count: 0, importo_min: null, importo_max: null, durate_disponibili: [], data_decorrenza: null, data_scadenza: null })];
    state.righe = [];
    apri(`${BASE}/t1`);
    await caricato();
    expect(screen.queryByText(/rata da|TAEG \d|importi da|valida dal|valida fino/)).toBeNull();
    // resta solo la parte che si sa: il numero di righe (e il numero delle righe visibili nella scheda)
    expect(screen.getAllByText("0 righe").length).toBeGreaterThan(0);
  });

  it("scaduta e attiva: l'avviso dice che viene ancora proposta nei preventivi e cosa fare davvero", async () => {
    state.tabelle = [tabella({ data_decorrenza: null, data_scadenza: "2026-10-01" })];
    apri(`${BASE}/t1`);
    await caricato();
    const avviso = screen.getByText("Offerta scaduta").closest("[role=alert]")!;
    expect(avviso).toHaveTextContent(
      "Scaduta il 01/10/2026. Finché la tabella è attiva viene ancora proposta nei preventivi: disattivala, oppure carica la tabella nuova.",
    );
    // le date di una tabella non si cambiano da qui: la pagina non manda a «aggiornare la data»
    expect(avviso.textContent).not.toMatch(/aggiorna la data/);
    expect(avviso.textContent).not.toMatch(/Verifica le condizioni/);
  });

  it("non ancora iniziata e attiva: l'avviso dice che è già proposta", async () => {
    state.tabelle = [tabella({ data_decorrenza: "2026-12-01", data_scadenza: null })];
    apri(`${BASE}/t1`);
    await caricato();
    const avviso = screen.getByText("Offerta non ancora iniziata").closest("[role=alert]")!;
    expect(avviso).toHaveTextContent("Vale dal 01/12/2026. Finché la tabella è attiva viene già proposta nei preventivi: se non vuoi, disattivala e riattivala da quel giorno.");
  });

  it("disattivata: non viene proposta; e la scadenza passata non aggiunge un secondo avviso", async () => {
    state.tabelle = [tabella({ attiva: false, data_decorrenza: null, data_scadenza: "2026-10-01" })];
    apri(`${BASE}/t1`);
    await caricato();
    expect(screen.getByText("Tabella disattivata").closest("[role=alert]")).toHaveTextContent("Non viene proposta nei nuovi preventivi.");
    expect(screen.queryByText("Offerta scaduta")).toBeNull();
  });

  it("in vigore: nessun avviso sulla validità, e l'avviso sullo storico ha le parole del rapporto", async () => {
    apri(`${BASE}/t1`);
    await caricato();
    expect(screen.queryByText("Offerta scaduta")).toBeNull();
    expect(screen.queryByText("Tabella disattivata")).toBeNull();
    const storico = screen.getByText("Le condizioni non si cambiano").closest("[role=alert]")!;
    expect(storico).toHaveTextContent(
      "Se questa tabella è già stata usata in preventivi, ordini o progetti, non modificarla: duplicala o disattivala, così lo storico resta com'era.",
    );
    expect(testo()).not.toMatch(/versionate| gia' | e' /);
  });

  it("i titoli sono in ordine: un solo secondo livello, niente primo livello, niente titoli di avviso al quinto livello", async () => {
    apri(`${BASE}/t1`);
    await caricato();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(document.querySelectorAll("h5")).toHaveLength(0);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Allegati" }), { button: 0 });
    expect(await screen.findByRole("heading", { level: 3, name: "Documenti allegati" })).toBeInTheDocument();
  });

  it("le colonne si ordinano con un pulsante vero e dicono in che ordine sono", async () => {
    apri(`${BASE}/t1`);
    await caricato();
    const importo = screen.getByRole("columnheader", { name: "Importo" });
    const rate = screen.getByRole("columnheader", { name: "Rate" });
    expect(importo).toHaveAttribute("aria-sort", "ascending");
    expect(rate).toHaveAttribute("aria-sort", "none");
    fireEvent.click(within(rate).getByRole("button", { name: "Rate" }));
    expect(rate).toHaveAttribute("aria-sort", "ascending");
    expect(importo).toHaveAttribute("aria-sort", "none");
    fireEvent.click(within(rate).getByRole("button", { name: "Rate" }));
    expect(rate).toHaveAttribute("aria-sort", "descending");
    const prime = screen.getAllByRole("row")[1];
    expect(prime).toHaveTextContent("36");
  });

  it("le colonne della tabella hanno nomi interi e le percentuali la virgola", async () => {
    apri(`${BASE}/t1`);
    await caricato();
    for (const nome of ["Spese incasso", "Totale dovuto", "Provvigione"]) {
      expect(screen.getByRole("columnheader", { name: nome }), nome).toBeInTheDocument();
    }
    expect(screen.queryByRole("columnheader", { name: "Sp. incasso" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Tot. dovuto" })).toBeNull();
    expect(await screen.findAllByText("10,10%")).not.toHaveLength(0);
    expect(testo()).not.toMatch(/\d\.\d{2}%/);
  });

  it("le schede vanno a capo sul telefono invece di uscire dallo schermo", async () => {
    apri(`${BASE}/t1`);
    await caricato();
    expect(screen.getByRole("tablist").className).toMatch(/flex-wrap/);
  });

  it("un errore nel leggere la tabella si vede e si può riprovare", async () => {
    state.fallisce = [{ table: "eic_tabelle_finanziamento", op: "select", error: { code: "42501", message: "permission denied for table eic_tabelle_finanziamento" } }];
    apri(`${BASE}/t1`);
    const avviso = await screen.findByText("Non riesco a leggere la tabella.");
    expect(avviso.closest("[role=alert]")!.textContent).not.toMatch(/permission denied/);
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
    expect(screen.queryByText("Tabella non trovata")).toBeNull();
  });

  it("se le righe non si leggono, lo dice (non resta solo «Nessuna riga.») e si può riprovare", async () => {
    state.fallisce = [{ table: "eic_tabelle_finanziamento_righe", op: "select", error: { code: "42501", message: "permission denied for table eic_tabelle_finanziamento_righe" } }];
    state.righe = [];
    apri(`${BASE}/t1`);
    await caricato();
    const avviso = await screen.findByText("Non riesco a leggere le righe della tabella.");
    expect(avviso.closest("[role=alert]")!.textContent).not.toMatch(/permission denied/);
    expect(screen.getAllByRole("button", { name: "Riprova" }).length).toBeGreaterThan(0);
  });

  it("scaricare un allegato che non si può avere dà una frase italiana", async () => {
    class ErroreArchivio extends Error {
      status = 404;
    }
    state.tabelle = [tabella({ pdf_url: "company-1/tabella.pdf", pdf_filename: "tabella.pdf" })];
    state.erroreFile = new ErroreArchivio("The resource was not found");
    apri(`${BASE}/t1`);
    await caricato();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Allegati" }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: /Scarica il PDF originale/ }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito a scaricare il file", { description: "Riprova tra poco." });
  });

  it("sul telefono, con degli allegati, la scheda dice dove si scaricano invece di restare vuota", async () => {
    const larghezzaPrima = window.innerWidth;
    window.innerWidth = 375;
    try {
      state.tabelle = [tabella({ pdf_url: "company-1/tabella.pdf", pdf_filename: "tabella.pdf" })];
      apri(`${BASE}/t1`);
      await caricato();
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Allegati" }), { button: 0 });
      expect(await screen.findByText("Gli allegati si scaricano dal computer.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Scarica il PDF originale/ })).toBeNull();
    } finally {
      window.innerWidth = larghezzaPrima;
    }
  });

  it("Disattiva: se il database dice di no, la frase è italiana", async () => {
    state.fallisce = [{ table: "eic_tabelle_finanziamento", op: "update", error: new TypeError("Failed to fetch") }];
    apri(`${BASE}/t1`);
    await caricato();
    fireEvent.click(screen.getByRole("button", { name: "Disattiva" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito a cambiare lo stato della tabella", {
      description: "Connessione persa. Controlla la rete e riprova.",
    });
  });
});

// ─── Procedura «Nuova tabella» ────────────────────────────────────────────────
describe("Nuova tabella: la procedura in tre passi", () => {
  const CSV = [
    "importo_erogato,numero_rate,importo_rata,interessi_cliente,importo_totale_dovuto,tan,taeg",
    "5000,24,230,520,5520,8.75,9.1",
    "10000,24,460,1040,11040,8.75,9.1",
  ].join("\n");
  const CSV_CON_ERRORE = [
    "importo_erogato,numero_rate,importo_rata,interessi_cliente,importo_totale_dovuto,tan,taeg",
    "5000,24,230,520,5520,8.75,9.1",
    "abc,24,460,1040,11040,8.75,9.1",
  ].join("\n");

  beforeEach(() => {
    // Nessuna finanziaria già registrata: il controllo «esiste già un nome uguale» non trova niente.
    state.finanziarie = [];
  });

  function file(nome: string, contenuto: string, tipo: string) {
    const f = new File([contenuto], nome, { type: tipo });
    return f;
  }
  function scrivi(etichetta: string | RegExp, valore: string) {
    fireEvent.change(screen.getByLabelText(etichetta), { target: { value: valore } });
  }
  /** Passo 1 compilato con una finanziaria nuova, poi «Avanti». */
  function passo1() {
    fireEvent.click(screen.getByRole("button", { name: "Nuova finanziaria" }));
    scrivi(/Nome breve/, "Fiditalia");
    scrivi(/Nome prodotto/, "Prodotto Z");
    scrivi("Decorrenza", "2026-10-01");
    scrivi("Scadenza", "2026-12-31");
    scrivi(/TAN base/, "8,75");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
  }
  /** Passo 2: il file CSV scelto, poi «Avanti». */
  async function scegliCsv(contenuto = CSV) {
    const campo = document.getElementById("file-csv") as HTMLInputElement;
    fireEvent.change(campo, { target: { files: [file("tabella.csv", contenuto, "text/csv")] } });
    await screen.findByText(/Anteprima tabella\.csv/);
  }
  async function passo2(contenuto = CSV) {
    await scegliCsv(contenuto);
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
  }

  it("le parole sono in italiano: «Passo 1 di 3», non «Step 1 di 3»", () => {
    apri(`${BASE}/nuova`);
    expect(screen.getByText("Passo 1 di 3 — Finanziaria e prodotto")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nuova tabella" })).toBeInTheDocument();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(testo()).not.toMatch(/Step \d|Subtariffa default/);
    expect(screen.getByLabelText(/Subtariffa \(se le righe non la riportano\)/)).toBeInTheDocument();
    // il TAN si scrive come lo scrive chi è in Italia
    expect(screen.getByLabelText(/TAN base/)).toHaveAttribute("placeholder", "es. 8,75");
  });

  it("passo 2: «Come carichi le righe», parte ancora sul file CSV (decisione D3 aperta: non si cambia)", async () => {
    apri(`${BASE}/nuova`);
    passo1();
    expect(screen.getByText("Passo 2 di 3 — File con le righe e PDF")).toBeInTheDocument();
    const gruppo = screen.getByRole("group", { name: "Come carichi le righe" });
    const csv = within(gruppo).getByRole("button", { name: /Carica un file CSV/ });
    const ai = within(gruppo).getByRole("button", { name: /Leggi il PDF con l'AI \(consigliato\)/ });
    expect(csv).toHaveAttribute("aria-pressed", "true");
    expect(ai).toHaveAttribute("aria-pressed", "false");
    for (const vecchio of ["Upload CSV", "Modalità import", "Estrai con AI da PDF", "Carica CSV/Excel", "Bypassa", "Colonne richieste"]) {
      expect(testo(), vecchio).not.toContain(vecchio);
    }
  });

  it("le colonne del file stanno in «Quali colonne servono?», con il nome tecnico tra parentesi", async () => {
    apri(`${BASE}/nuova`);
    passo1();
    const riassunto = screen.getByText("Quali colonne servono?");
    const dettagli = riassunto.closest("details")!;
    expect(dettagli).not.toHaveAttribute("open");
    expect(dettagli).toHaveTextContent("Importo erogato (importo_erogato)");
    expect(dettagli).toHaveTextContent("Interessi pagati dal cliente (interessi_cliente)");
    expect(dettagli).toHaveTextContent("Totale dovuto dal cliente (importo_totale_dovuto)");
    expect(dettagli).toHaveTextContent("Provvigione (provvigione_dealer)");
    expect(dettagli).toHaveTextContent("Importo totale del credito (importo_totale_credito)");
    // fuori dal riquadro chiuso non resta l'elenco dei nomi tecnici
    expect(screen.getByRole("button", { name: "Scarica il file di esempio" })).toBeInTheDocument();
  });

  it("ogni etichetta è collegata a un campo o dà il nome a un gruppo (prima 11 su 16)", async () => {
    const senzaCollegamento = () =>
      Array.from(document.querySelectorAll("label")).filter((etichetta) => {
        const per = etichetta.getAttribute("for");
        return !per || !document.getElementById(per);
      }).map((e) => e.textContent);
    apri(`${BASE}/nuova`);
    expect(senzaCollegamento()).toEqual([]);
    expect(screen.getByRole("group", { name: "Finanziaria *" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuova finanziaria" }));
    expect(senzaCollegamento()).toEqual([]);
    passo1();
    // passo 2, sul file CSV
    expect(senzaCollegamento()).toEqual([]);
    expect(screen.getByRole("button", { name: /File CSV con le righe/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PDF originale \(facoltativo\)/ })).toBeInTheDocument();
    // passo 2, sull'AI
    fireEvent.click(screen.getByRole("button", { name: /Leggi il PDF con l'AI/ }));
    expect(senzaCollegamento()).toEqual([]);
    expect(screen.getByRole("button", { name: /PDF della tabella/ })).toBeInTheDocument();
  });

  it("dopo aver scelto un file, il pulsante dice l'etichetta e il nome del file (non solo uno dei due)", async () => {
    apri(`${BASE}/nuova`);
    passo1();
    expect(screen.getByRole("button", { name: "File CSV con le righe * Scegli il file CSV…" })).toBeInTheDocument();
    await scegliCsv();
    expect(screen.getByRole("button", { name: "File CSV con le righe * tabella.csv" })).toBeInTheDocument();
    const campoPdf = document.getElementById("file-pdf-orig") as HTMLInputElement;
    fireEvent.change(campoPdf, { target: { files: [file("originale.pdf", "%PDF-1.4", "application/pdf")] } });
    expect(await screen.findByRole("button", { name: "PDF originale (facoltativo) originale.pdf" })).toBeInTheDocument();
  });

  it("il nome di un file lungo si accorcia dentro il pulsante (da telefono usciva dallo schermo) e per intero resta nel suggerimento", async () => {
    apri(`${BASE}/nuova`);
    passo1();
    const lungo = "Tabella_Fiditalia_Condizione_255891_Ottobre_2026_definitiva_versione_tre.csv";
    const campo = document.getElementById("file-csv") as HTMLInputElement;
    fireEvent.change(campo, { target: { files: [file(lungo, CSV, "text/csv")] } });
    await screen.findByText(`Anteprima ${lungo}`);
    const nome = screen.getByTitle(lungo);
    expect(nome).toHaveTextContent(lungo);
    expect(nome.className).toMatch(/\btruncate\b/);
    expect(nome.className).toMatch(/\bmin-w-0\b/);
    // lo stesso per il PDF originale (sul file CSV) e per il pulsante del PDF letto dall'AI
    const lungoPdf = "Tabella_Fiditalia_Condizione_255891_Ottobre_2026_definitiva_versione_tre.pdf";
    const campoPdf = document.getElementById("file-pdf-orig") as HTMLInputElement;
    fireEvent.change(campoPdf, { target: { files: [file(lungoPdf, "%PDF-1.4", "application/pdf")] } });
    expect((await screen.findByTitle(lungoPdf)).className).toMatch(/\btruncate\b/);
    fireEvent.click(screen.getByRole("button", { name: /Leggi il PDF con l'AI/ }));
    expect((await screen.findByTitle(lungoPdf)).className).toMatch(/\btruncate\b/);
  });

  it("dopo ogni scelta il campo del file si svuota: scegliere di nuovo lo stesso file, corretto, lo rilegge (il browser avvisa solo se il file cambia)", async () => {
    apri(`${BASE}/nuova`);
    passo1();
    const svuotamenti: Record<string, ReturnType<typeof vi.fn<(valore: string) => void>>> = {};
    const osserva = (id: string) => {
      const campo = document.getElementById(id) as HTMLInputElement;
      svuotamenti[id] = vi.fn<(valore: string) => void>();
      Object.defineProperty(campo, "value", { configurable: true, get: () => "", set: svuotamenti[id] });
      return campo;
    };
    // il file CSV: prima con un errore, poi corretto e con lo stesso nome
    const csv = osserva("file-csv");
    fireEvent.change(csv, { target: { files: [file("tabella.csv", CSV_CON_ERRORE, "text/csv")] } });
    await screen.findByText("1 riga valida, 1 errore");
    expect(svuotamenti["file-csv"]).toHaveBeenCalledWith("");
    fireEvent.change(csv, { target: { files: [file("tabella.csv", CSV, "text/csv")] } });
    await screen.findByText("2 righe valide");
    // il PDF originale e il PDF letto dall'AI
    fireEvent.change(osserva("file-pdf-orig"), { target: { files: [file("originale.pdf", "%PDF-1.4", "application/pdf")] } });
    expect(svuotamenti["file-pdf-orig"]).toHaveBeenCalledWith("");
    fireEvent.click(screen.getByRole("button", { name: /Leggi il PDF con l'AI/ }));
    fireEvent.change(osserva("file-pdf-ai"), { target: { files: [file("tabella.pdf", "%PDF-1.4", "application/pdf")] } });
    expect(svuotamenti["file-pdf-ai"]).toHaveBeenCalledWith("");
  });

  it("finché c'è qualcosa di scritto, ricaricare la pagina o seguire un collegamento chiede conferma", () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    apri(`${BASE}/nuova`);
    const vuoto = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(vuoto);
    expect(vuoto.defaultPrevented).toBe(false);

    scrivi(/Nome prodotto/, "Prodotto Z");
    const scritto = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(scritto);
    expect(scritto.defaultPrevented).toBe(true);
    expect(fireEvent.click(screen.getByRole("link", { name: "Torna alle tabelle" }))).toBe(false);
    expect(conferma).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("percorso")).toHaveTextContent(`${BASE}/nuova`);
  });

  it("a pagina vuota uscire non chiede niente", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    apri(`${BASE}/nuova`);
    fireEvent.click(screen.getByRole("link", { name: "Torna alle tabelle" }));
    expect(conferma).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("percorso")).toHaveTextContent(/^\/azienda\/impostazioni\/finanziamenti$/));
  });

  it("anche solo un file scelto, senza altro scritto, conta come bozza", async () => {
    apri(`${BASE}/nuova`);
    passo1();
    const campo = document.getElementById("file-csv") as HTMLInputElement;
    fireEvent.change(campo, { target: { files: [file("tabella.csv", CSV, "text/csv")] } });
    await screen.findByText(/Anteprima tabella\.csv/);
    // si torna al passo 1 e si svuotano i campi: resta il file già letto
    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    scrivi(/Nome prodotto/, "");
    fireEvent.click(screen.getByRole("button", { name: "Nuova finanziaria" }));
    scrivi(/Nome breve/, "");
    scrivi("Decorrenza", "");
    scrivi("Scadenza", "");
    scrivi(/TAN base/, "");
    const evento = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
  });

  it("l'anteprima e il riepilogo hanno le date all'italiana, la scadenza compare, e al database vanno ancora aaaa-mm-gg", async () => {
    apri(`${BASE}/nuova`);
    passo1();
    await scegliCsv();
    expect(screen.getByText("Righe lette")).toBeInTheDocument();
    expect(testo()).not.toMatch(/CSV parsato/);
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByText("Riepilogo prima del salvataggio")).toBeInTheDocument();
    expect(screen.getByText("Decorrenza").nextElementSibling).toHaveTextContent("01/10/2026");
    expect(screen.getByText("Scadenza").nextElementSibling).toHaveTextContent("31/12/2026");
    expect(screen.getByText("TAN base").nextElementSibling).toHaveTextContent("8,75%");
    expect(screen.getByText("Subtariffa").nextElementSibling).toHaveTextContent("—");
    expect(testo()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // «Provvigioni totali» sommava tutte le righe: un numero che non vuol dire niente
    expect(screen.queryByText("Provvigioni totali")).toBeNull();
    expect(screen.getByText("Provvigione")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salva tabella (2 righe)" }));
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    expect(state.writes.map((w) => `${w.op} ${w.table}`)).toEqual([
      "insert eic_finanziarie",
      "insert eic_tabelle_finanziamento",
      "insert eic_tabelle_finanziamento_righe",
    ]);
    expect(state.writes[1].value).toMatchObject({ nome_prodotto: "Prodotto Z", data_decorrenza: "2026-10-01", data_scadenza: "2026-12-31", tan_base: 8.75 });
    expect(state.writes[2].value).toHaveLength(2);
    expect(state.success).toHaveBeenCalledWith('Tabella "Prodotto Z" caricata con 2 righe.');
    await waitFor(() => expect(screen.getByTestId("percorso")).toHaveTextContent(`${BASE}/nuova-id`));
  });

  it("se il salvataggio delle righe fallisce, si legge una frase italiana e non il testo del database", async () => {
    state.fallisce = [{
      table: "eic_tabelle_finanziamento_righe", op: "insert",
      error: { code: "23505", message: 'duplicate key value violates unique constraint "eic_righe_unique_lookup"' },
    }];
    apri(`${BASE}/nuova`);
    passo1();
    await passo2();
    fireEvent.click(screen.getByRole("button", { name: "Salva tabella (2 righe)" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito a salvare la tabella", {
      description: "Esiste già un elemento con questi dati. Controlla e riprova.",
    });
    expect(screen.getByTestId("percorso")).toHaveTextContent(`${BASE}/nuova`);
  });

  it("una finanziaria già registrata si sceglie dall'elenco e non se ne crea un'altra", async () => {
    state.finanziarie = [{ id: "f1", nome: "Fiditalia", ragione_sociale: "Fiditalia S.p.A." }];
    apri(`${BASE}/nuova`);
    fireEvent.pointerDown(await screen.findByRole("combobox", { name: "Finanziaria" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("option", { name: "Fiditalia — Fiditalia S.p.A." }));
    scrivi(/Nome prodotto/, "Prodotto Z");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    await passo2();
    fireEvent.click(screen.getByRole("button", { name: "Salva tabella (2 righe)" }));
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    expect(state.writes.map((w) => `${w.op} ${w.table}`)).toEqual([
      "insert eic_tabelle_finanziamento",
      "insert eic_tabelle_finanziamento_righe",
    ]);
    expect(state.writes[0].value).toMatchObject({ finanziaria_id: "f1", nome_prodotto: "Prodotto Z" });
  });

  it("una frase scritta dalla procedura (finanziaria già esistente) passa com'è", async () => {
    state.finanziarie = [{ id: "f9", nome: "Fiditalia" }];
    apri(`${BASE}/nuova`);
    passo1();
    await passo2();
    fireEvent.click(screen.getByRole("button", { name: "Salva tabella (2 righe)" }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito a salvare la tabella", {
      description: "Esiste già una finanziaria con questo nome per l'azienda",
    });
  });

  it("con righe sbagliate nel file non si può salvare: il pulsante è spento e il riquadro dice perché", async () => {
    apri(`${BASE}/nuova`);
    passo1();
    await passo2(CSV_CON_ERRORE);
    const salva = screen.getByRole("button", { name: "Salva tabella (1 riga)" });
    expect(salva).toBeDisabled();
    expect(salva).toHaveAccessibleDescription(/Con degli errori non puoi salvare/);
    expect(testo()).not.toMatch(/importare solo le righe valide/);
    expect(screen.getByText("1 errore trovato")).toBeInTheDocument();
    fireEvent.click(salva);
    expect(state.writes).toEqual([]);
  });

  it("un file Excel viene rifiutato con la spiegazione, senza testo tecnico", async () => {
    apri(`${BASE}/nuova`);
    passo1();
    const campo = document.getElementById("file-csv") as HTMLInputElement;
    fireEvent.change(campo, { target: { files: [file("tabella.xlsx", "x", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")] } });
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.error).toHaveBeenCalledWith("Non riesco a leggere il file CSV", {
      description: "Formato non supportato: importa un file CSV, TXT o TSV. Converti eventuali Excel in CSV prima del caricamento.",
    });
  });

  it("la lettura del PDF con l'AI: se la funzione risponde con un errore, niente «non-2xx»", async () => {
    class ErroreFunzione extends Error {
      context = { status: 500 };
    }
    state.funzione = { data: null as unknown, error: new ErroreFunzione("Edge Function returned a non-2xx status code") };
    apri(`${BASE}/nuova`);
    passo1();
    fireEvent.click(screen.getByRole("button", { name: /Leggi il PDF con l'AI/ }));
    const campo = document.getElementById("file-pdf-ai") as HTMLInputElement;
    fireEvent.change(campo, { target: { files: [file("tabella.pdf", "%PDF-1.4", "application/pdf")] } });
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.error).toHaveBeenCalledWith("Non sono riuscito a leggere il PDF", {
      description: "Errore temporaneo del server. Riprova tra qualche istante.",
    });
  });

  it("il pulsante dell'AI dice «max 20 MB» e il controllo rifiuta davvero oltre 20 MB (prima il pulsante diceva 22)", async () => {
    apri(`${BASE}/nuova`);
    passo1();
    fireEvent.click(screen.getByRole("button", { name: /Leggi il PDF con l'AI/ }));
    expect(screen.getByRole("button", { name: "PDF della tabella * Scegli il PDF (max 20 MB)…" })).toBeInTheDocument();
    const grande = new File([new ArrayBuffer(20 * 1024 * 1024 + 1)], "grande.pdf", { type: "application/pdf" });
    fireEvent.change(document.getElementById("file-pdf-ai") as HTMLInputElement, { target: { files: [grande] } });
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(state.error).toHaveBeenCalledWith("Il PDF non va bene", { description: "PDF troppo grande (max 20 MB)" });
    expect(state.writes).toEqual([]);
  });

  it("la lettura del PDF riuscita: «Affidabilità», nessun costo, i campi del passo 1 compilati", async () => {
    state.funzione = {
      error: null as unknown,
      data: {
        rows: [{ importo_erogato: 5000, numero_rate: 24, importo_rata: 230, tan: 8.75, taeg: 9.1, interessi_cliente: 520, importo_totale_dovuto: 5520 }],
        detected: { finanziaria: "Fiditalia", prodotto: "OKNOPLAST", condizione: "255891", tan_base: 8.75 },
        confidence: 0.9,
        cost_cents: 123,
      },
    };
    apri(`${BASE}/nuova`);
    fireEvent.click(screen.getByRole("button", { name: "Nuova finanziaria" }));
    scrivi(/Nome breve/, "Fiditalia");
    scrivi(/Nome prodotto/, "Prodotto Z");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("button", { name: /Leggi il PDF con l'AI/ }));
    const campo = document.getElementById("file-pdf-ai") as HTMLInputElement;
    fireEvent.change(campo, { target: { files: [file("tabella.pdf", "%PDF-1.4", "application/pdf")] } });
    await screen.findByText("Cosa ha riconosciuto l'AI");
    expect(screen.getByText("Affidabilità:")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(testo()).not.toMatch(/Confidence|Costo|costo|€ 0,0/);
    expect(state.success).toHaveBeenCalledWith("1 riga letta dal PDF (affidabilità 90%)");
    expect(screen.getByText(/I campi del passo 1 \(nome del prodotto, codice condizione, TAN base\) sono stati compilati se erano vuoti/)).toBeInTheDocument();
    // il suggerimento sotto il pulsante dice QUALI campi compila l'AI (nome del prodotto, codice condizione, TAN: sono i tre che la pagina riempie)
    expect(screen.getByText(/Se nel passo 1 mancano il nome del prodotto, il codice condizione o il TAN, l'AI li compila\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF della tabella * tabella.pdf" })).toBeInTheDocument();
    // nessun «max 22 MB»: il controllo della pagina rifiuta già oltre 20 MB
    expect(testo()).not.toMatch(/22 MB/);
  });
});

// ─── Pagina del calcolatore ───────────────────────────────────────────────────
describe("Pagina del calcolatore", () => {
  it("se le tabelle non si leggono lo dice con parole italiane e permette di riprovare", async () => {
    state.fallisce = [{ table: "eic_tabelle_finanziamento", op: "select", error: { code: "42501", message: "permission denied for table eic_tabelle_finanziamento" } }];
    apri(`${BASE}/calcolatore`);
    const avviso = await screen.findByText("Non riesco a leggere le tabelle.");
    expect(avviso.closest("[role=alert]")!.textContent).not.toMatch(/permission denied/);
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
    expect(screen.queryByText(/Ricarica la pagina/)).toBeNull();
  });

  it("il calcolatore ha un titolo di secondo livello e nessuno di primo (il primo lo mette il layout)", async () => {
    state.tabelle = [tabella()];
    apri(`${BASE}/calcolatore`);
    expect(await screen.findByLabelText("Tabella finanziamento")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Calcolatore finanziamento" })).toBeInTheDocument();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
  });
});

// ─── Calcolatore: parole e percentuali ────────────────────────────────────────
describe("Calcolatore e confronto durate", () => {
  const righe = [
    riga({ id: "r1", importo_erogato: 5000, numero_rate: 24, importo_rata: 230, taeg: 10.1, tan: 8.75 }),
    riga({ id: "r2", importo_erogato: 10000, numero_rate: 24, importo_rata: 460, importo_totale_credito: 10000, importo_totale_dovuto: 11040, taeg: 10.1, tan: 8.75 }),
  ] as unknown as RigaTabellaFinanziamento[];

  it("importo in tabella: lo dice senza «Lookup»; percentuali con la virgola; «Provvigione» senza «dealer»", () => {
    render(<CalcolatoreOutput risultato={calcolaFinanziamento({ importo: 5000, numero_rate: 24, righe })} />);
    expect(screen.getByText("Importo presente in tabella")).toBeInTheDocument();
    expect(screen.getByText("10,10%")).toBeInTheDocument();
    expect(screen.getByText("8,75%")).toBeInTheDocument();
    expect(screen.getByText("Provvigione")).toBeInTheDocument();
    expect(testo()).not.toMatch(/Lookup|dealer|\d\.\d{2} ?%/);
  });

  it("importo tra due righe: «Calcolato tra le righe di», non «Interpolato»", () => {
    render(<CalcolatoreOutput risultato={calcolaFinanziamento({ importo: 7500, numero_rate: 24, righe })} />);
    expect(screen.getByText(/Calcolato tra le righe di € 5000 e € 10\.000/)).toBeInTheDocument();
    expect(testo()).not.toMatch(/nterpolato/);
  });

  it("senza importo: il titolo dell'avviso non è un titolo di quinto livello", () => {
    render(<CalcolatoreOutput risultato={null} />);
    expect(screen.getByText("Inserisci importo e durata")).toBeInTheDocument();
    expect(document.querySelectorAll("h5")).toHaveLength(0);
  });

  it("confronto durate: intestazioni intere, percentuali con la virgola, «calcolato tra due righe»", () => {
    render(<SimulatoreMultiDurata importo={7500} durateDisponibili={[24]} righe={righe} />);
    expect(screen.getByRole("columnheader", { name: "Spese incasso" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Provvigione" })).toBeInTheDocument();
    expect(screen.getByText("calcolato tra due righe")).toBeInTheDocument();
    expect(testo()).not.toMatch(/Sp\. incasso|Provv\. dealer|interpolato|\d\.\d{2}%/);
    expect(screen.getAllByText("10,10%").length).toBeGreaterThan(0);
  });
});

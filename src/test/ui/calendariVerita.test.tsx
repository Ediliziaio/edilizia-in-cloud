/**
 * Appuntamenti e prenotazioni: la pagina dice la verità (10/10/2026).
 *
 * Prima la scheda «Preferenze» aveva sette controlli (sei impostazioni, una doppia) che nessun codice leggeva: inizio settimana,
 * menu dei servizi, stanze, attrezzature, lingua e formato ora; ci stavano sopra quattro riquadri di conteggio e, sotto i 768 px,
 * un secondo h1. Gli orari di prenotazione erano la terza scheda e partivano da un menu vuoto («Seleziona un calendario» anche con
 * un calendario solo). «Link booking» e «App.» erano gergo, i pulsanti di riga non avevano nome, il salvataggio degli orari stava in
 * fondo e le modifiche non salvate (Spostamenti, Orari, finestra del calendario) si perdevano in silenzio. Qui si tiene fermo:
 *   · «Spostamenti» ha solo i tre numeri che il suggerimento dei calendari legge davvero, e salva solo quelli;
 *   · «Orari» parte dal primo calendario, spiega a cosa servono, salva da una barra che resta in vista;
 *   · la finestra del calendario ha sezioni numerate di seguito, «Pronto per le prenotazioni» conta solo nome, link, durata e orari,
 *     un solo accesso agli orari, e chiede conferma se si chiude con modifiche non salvate.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Op = [string, unknown[]];
type Riga = Record<string, unknown>;

const db = vi.hoisted(() => {
  type Operazione = [string, unknown[]];
  const stato = {
    chiamate: [] as Array<{ tabella: string; ops: Operazione[] }>,
    calendari: [] as Array<Record<string, unknown>>,
    /** Fasce settimanali per id del calendario. */
    orari: {} as Record<string, Array<Record<string, unknown>>>,
    preferenze: null as unknown,
    erroreScrittura: null as unknown,
    /** Fa fallire solo la scrittura delle fasce orarie di partenza. */
    erroreFasce: false,
    /** Il link di prenotazione scelto è già di un altro calendario. */
    linkOccupato: false,
  };
  const risposta = (tabella: string, ops: Operazione[]): { data: unknown; error: unknown; count?: number } => {
    const ha = (m: string) => ops.some(([n]) => n === m);
    const filtro = (chiave: string) => ops.find(([n, a]) => n === "eq" && a[0] === chiave)?.[1][1];
    if (tabella === "marketing_calendar_availability" && ha("insert") && stato.erroreFasce) return { data: null, error: { message: "Scrittura negata" } };
    if (ha("insert") || ha("update") || ha("delete") || ha("upsert")) return { data: { id: "calendario-nuovo" }, error: stato.erroreScrittura };
    switch (tabella) {
      case "marketing_calendars":
        // I controlli di nome e di link doppi (ilike / booking_slug) non trovano mai niente.
        if (filtro("booking_slug") !== undefined) return { data: stato.linkOccupato ? [{ id: "altro-calendario" }] : [], error: null };
        if (ha("ilike")) return { data: [], error: null };
        return { data: stato.calendari, error: null };
      case "marketing_calendar_availability":
        if (filtro("is_enabled") === true) {
          const conOrari = Object.entries(stato.orari).filter(([, f]) => f.some((r) => r.is_enabled)).map(([id]) => ({ calendar_id: id }));
          return { data: conOrari, error: null };
        }
        return { data: stato.orari[String(filtro("calendar_id"))] ?? [], error: null };
      case "marketing_calendar_preferences":
        return { data: stato.preferenze, error: null };
      case "appointments":
        return ha("or") ? { data: null, count: 0, error: null } : { data: [], error: null };
      default:
        return { data: [], error: null };
    }
  };
  const catena = (tabella: string): unknown => {
    const ops: Operazione[] = [];
    stato.chiamate.push({ tabella, ops });
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, metodo: string) {
          if (metodo === "then") {
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(risposta(tabella, ops)).then(ok, ko);
          }
          return (...argomenti: unknown[]) => {
            ops.push([metodo, argomenti]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  return { stato, catena };
});
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const permessi = vi.hoisted(() => ({ ruolo: "company_admin" as string, modifica: true }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-1", name: "Azienda di prova" }, user: { id: "utente-1" }, role: permessi.ruolo }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsCustomization: permessi.modifica, isLoading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (tabella: string) => db.catena(tabella) } }));
vi.mock("@/hooks/useCalendariLavori", () => ({ registraCanaleCalendario: async (): Promise<void> => undefined }));
vi.mock("@/hooks/useCalendariEsterni", () => ({
  PROVIDER_LABEL: { google: "Google", outlook: "Outlook", apple: "Apple" },
  useCaselleCalendario: () => ({ data: [] as unknown[] }),
}));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({
  useCompanyStaffUsers: () => ({ data: [{ id: "u1", first_name: "Mario", last_name: "Rossi" }] }),
}));
vi.mock("@/components/integrations/CompanyCalendarsOverview", () => ({ default: () => <div>panoramica dell'azienda</div> }));
vi.mock("@/components/settings/GoogleCalendarConnectionTab", () => ({ default: () => <div>collegamento Google</div> }));
vi.mock("@/components/settings/AppleCalendarConnectionTab", () => ({ default: () => <div>collegamento Apple</div> }));
vi.mock("@/components/settings/OutlookCalendarConnectionTab", () => ({ default: () => <div>collegamento Outlook</div> }));
vi.mock("@/components/settings/CalendarioEsternoPicker", () => ({ CalendarioEsternoPicker: (): null => null }));
vi.mock("@/components/shared/AddressAutocomplete", () => ({ default: (): null => null }));
vi.mock("@/components/shared/AddressMapPreview", () => ({ default: (): null => null }));
vi.mock("@/components/flow-builder/config-panels/VariablePicker", () => ({ VariablePicker: (): null => null }));

import MarketingCalendarsConfig from "@/components/settings/MarketingCalendarsConfig";

// Una tendina o un menu Radix aperti insieme a una finestra montano due FocusScope: con l'albero di bun.lock (CI e Cloudflare)
// condividono la stessa copia; nella node_modules locale (npm) sono copie diverse e si rimandano il focus all'infinito in
// jsdom. Il rimbalzo si ferma dopo pochi livelli, come nel browser; con l'albero giusto la protezione non scatta mai.
const focusDiJsdom = HTMLElement.prototype.focus;
let focusAnnidati = 0;
beforeAll(() => {
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    if (focusAnnidati >= 3) return;
    focusAnnidati++;
    try { focusDiJsdom.call(this, options); } finally { focusAnnidati--; }
  };
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
    scrollIntoView: () => {},
  });
});
afterAll(() => { HTMLElement.prototype.focus = focusDiJsdom; });

const calendario = (id: string, nome: string, extra: Riga = {}): Riga => ({
  id,
  company_id: "azienda-1",
  name: nome,
  group_name: null as unknown,
  duration_minutes: 60,
  max_daily_km: null as unknown,
  calendar_type: "personal",
  booking_slug: nome.toLowerCase().replace(/\s+/g, "-"),
  is_active: true,
  owner_id: "u1",
  description: null as unknown,
  color: null as unknown,
  created_by: "utente-1",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-02T10:00:00Z",
  default_meeting_provider: "none",
  default_meeting_enabled: false,
  base_formatted_address: null as unknown,
  base_address_city: null as unknown,
  ...extra,
});
/** Le sette fasce di una settimana: lunedì-venerdì 9-18 accese, sabato e domenica spente. */
const settimana = (idCalendario: string): Array<Record<string, unknown>> =>
  [1, 2, 3, 4, 5, 6, 0].map((g) => ({
    id: `f-${idCalendario}-${g}`,
    company_id: "azienda-1",
    calendar_id: idCalendario,
    day_of_week: g,
    start_time: "09:00",
    end_time: "18:00",
    is_enabled: g >= 1 && g <= 5,
    specific_date: null as unknown,
  }));

function monta(percorso = "/azienda/impostazioni/calendari") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[percorso]}>
        <MarketingCalendarsConfig />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const scritture = (metodo: string, tabella: string) =>
  db.stato.chiamate.filter((c) => c.tabella === tabella && c.ops.some(([m]) => m === metodo));
const argomenti = (c: { ops: Op[] }, metodo: string) => c.ops.find(([m]) => m === metodo)?.[1] ?? [];

beforeEach(() => {
  db.stato.chiamate.length = 0;
  db.stato.calendari = [calendario("c1", "Sopralluogo Milano"), calendario("c2", "Commerciale Roma", { is_active: false })];
  db.stato.orari = { c1: settimana("c1"), c2: settimana("c2") };
  db.stato.preferenze = null;
  db.stato.erroreScrittura = null;
  db.stato.erroreFasce = false;
  db.stato.linkOccupato = false;
  permessi.ruolo = "company_admin";
  permessi.modifica = true;
  Object.values(toast).forEach((f) => f.mockReset());
});
afterEach(() => {
  cleanup();
  // Anche se un test cade a metà, window.confirm torna quello vero: non si trascina nel test dopo.
  vi.restoreAllMocks();
});

describe("la testata e le schede", () => {
  it("niente quattro riquadri di conteggio né secondo h1: una riga con i numeri", async () => {
    monta();
    expect(await screen.findByText("2 calendari · 1 attivo")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    for (const sparito of ["Assegnati", "Sedi base", "con responsabile", /utili per scheduling/, /collegati ai calendari/, /Calendari Marketing/]) {
      expect(screen.queryByText(sparito), String(sparito)).toBeNull();
    }
  });

  it("le schede sono Calendari · Orari · Spostamenti · Collegamenti", async () => {
    monta();
    await screen.findByText("Sopralluogo Milano");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Calendari", "Orari", "Spostamenti", "Collegamenti"]);
    expect(screen.queryByRole("tab", { name: /Preferenze|Disponibilità/ })).toBeNull();
  });

  it("gli indirizzi di prima aprono la scheda giusta (?tab=availability → Orari, ?tab=preferences → Spostamenti)", async () => {
    monta("/azienda/impostazioni/calendari?tab=availability");
    expect(await screen.findByText("Orari di prenotazione")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Orari" }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    monta("/azienda/impostazioni/calendari?tab=preferences");
    expect(await screen.findByText("Spostamenti e durata")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Spostamenti" }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    monta("/azienda/impostazioni/calendari?tab=connections");
    expect(await screen.findByText("Il tuo account")).toBeTruthy();
    expect(screen.getByText("Tutta l'azienda")).toBeTruthy();
  });

  it("cambiare scheda con un clic apre quella scelta", async () => {
    monta();
    await screen.findByText("Sopralluogo Milano");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Spostamenti" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Spostamenti e durata")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Orari" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Orari di prenotazione")).toBeTruthy();
  });

  it("senza permesso una riga lo dice (non il riquadro giallo di prima) e «Nuovo calendario» è spento", async () => {
    permessi.ruolo = "company_staff";
    permessi.modifica = false;
    monta();
    await screen.findByText("Sopralluogo Milano");
    expect(screen.getByRole("note").textContent).toBe(
      "Sola lettura: per creare, modificare, disattivare o sincronizzare un calendario serve un amministratore o il permesso «Modifica» su Personalizzazione.",
    );
    expect(screen.getByRole("button", { name: "Nuovo calendario" })).toBeDisabled();
    expect(screen.queryByText("Accesso in sola lettura")).toBeNull();
  });
});

describe("l'elenco dei calendari", () => {
  it("intestazioni in italiano e pulsanti di riga con il nome del calendario", async () => {
    monta();
    await screen.findByText("Sopralluogo Milano");
    const intestazioni = within(screen.getAllByRole("row")[0]).getAllByRole("columnheader").map((h) => h.textContent);
    expect(intestazioni).toContain("Link di prenotazione");
    expect(intestazioni).toContain("Appuntamenti");
    expect(intestazioni).toContain("Calendario esterno");
    expect(intestazioni).not.toContain("Link booking");
    expect(intestazioni).not.toContain("App.");

    expect(screen.getByRole("switch", { name: "Attivo: Sopralluogo Milano" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Attivo: Commerciale Roma" })).not.toBeChecked();
    for (const nome of ["Condividi il link di «Sopralluogo Milano»", "Modifica «Sopralluogo Milano»", "Elimina «Sopralluogo Milano»"]) {
      const pulsante = screen.getByRole("button", { name: nome });
      expect(pulsante.className, nome).toMatch(/max-md:h-11/);
      expect(pulsante.className, nome).toMatch(/max-md:w-11/);
    }
  });

  it("sul telefono restano Nome, Stato e Azioni: durata e tipo stanno sotto il nome, e l'interruttore ha una zona da 44 px", async () => {
    monta();
    await screen.findByText("Sopralluogo Milano");
    const tabella = screen.getAllByRole("table")[0];
    const intestazioni = within(tabella).getAllByRole("columnheader");
    for (const nome of ["Durata", "Tipo", "Responsabile"]) {
      const colonna = intestazioni.find((h) => h.textContent === nome) as HTMLElement;
      expect(colonna.className, nome).toMatch(/hidden/);
      expect(colonna.className, nome).toMatch(/sm:table-cell/);
    }
    for (const nome of ["Nome", "Stato", "Azioni"]) {
      const colonna = intestazioni.find((h) => h.textContent === nome) as HTMLElement;
      expect(colonna.className, nome).not.toMatch(/(^|\s)hidden/);
      expect(colonna.className, nome).toMatch(/max-sm:px-2/);
    }
    const riga = screen.getByText("Sopralluogo Milano").closest("tr") as HTMLElement;
    const sotto = within(riga).getByText("60 min · Commerciale");
    expect(sotto.className).toMatch(/sm:hidden/);
    // L'interruttore è alto 24 px: la zona che risponde al dito si allarga a 44 senza spostare niente.
    const interruttore = screen.getByRole("switch", { name: "Attivo: Sopralluogo Milano" });
    expect(interruttore.className).toMatch(/max-md:before:absolute/);
    expect(interruttore.className).toMatch(/max-md:before:-inset-y-2\.5/);
  });

  it("«Da completare» parla di «responsabile», non di «utente»", async () => {
    db.stato.calendari = [calendario("c3", "Senza responsabile", { owner_id: null })];
    db.stato.orari = { c3: settimana("c3") };
    monta();
    expect(await screen.findByText("Da completare: responsabile")).toBeTruthy();
  });

  it("eliminare dice cosa succede davvero (orari eliminati, appuntamenti attivi bloccano)", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Elimina «Sopralluogo Milano»" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(finestra.textContent).toContain("Il calendario e i suoi orari vengono eliminati e non si possono recuperare. Se ha appuntamenti attivi non si elimina: disattivalo.");
    expect(finestra.textContent).not.toMatch(/irreversibile/);
  });
});

describe("la scheda «Spostamenti»", () => {
  const apri = async () => {
    monta("/azienda/impostazioni/calendari?tab=preferences");
    await screen.findByText("Spostamenti e durata");
  };

  it("ha solo i tre numeri che qualcuno legge, e nessuna delle sei impostazioni morte", async () => {
    await apri();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(3);
    expect(screen.getByLabelText("Km massimi giornalieri A/R (default)")).toBeTruthy();
    expect(screen.getByLabelText("Tempo max spostamento tra appuntamenti (min)")).toBeTruthy();
    expect(screen.getByLabelText("Durata appuntamento di default (min)")).toBeTruthy();
    for (const morto of [/Giorno di inizio settimana/, /Inizio settimana/, /Menu dei servizi/, /Stanze/, /Attrezzature/, /^Lingua$/, /Formato ora/, /Preferenze dell'app/, /Preferenze widget/, /^Servizi$/]) {
      expect(screen.queryByText(morto), String(morto)).toBeNull();
    }
    // Nessuna tendina: erano le sei impostazioni morte.
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.getByText("Valori che si usano quando il calendario non ne ha di suoi, per proporre il calendario giusto a un nuovo appuntamento.")).toBeTruthy();
  });

  it("la prima volta (nessuna riga) mostra i valori di partenza 250 / 60 / 90 e non c'è niente da salvare", async () => {
    await apri();
    expect(screen.getByLabelText("Km massimi giornalieri A/R (default)")).toHaveValue(250);
    expect(screen.getByLabelText("Tempo max spostamento tra appuntamenti (min)")).toHaveValue(60);
    expect(screen.getByLabelText("Durata appuntamento di default (min)")).toHaveValue(90);
    expect(screen.queryByText("Modifiche non salvate")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salva gli spostamenti" })).toBeNull();
  });

  it("salva SOLO i tre numeri (le altre colonne restano come sono) e poi la barra sparisce", async () => {
    db.stato.preferenze = {
      id: "p1", company_id: "azienda-1", week_start_day: "sunday", time_format: "12h", language: "en",
      show_services_menu: false, show_rooms: false, show_equipment: false,
      default_max_daily_km: 300, max_travel_minutes: 45, default_appointment_duration_minutes: 60,
    };
    await apri();
    // I valori salvati arrivano con la lettura: prima di allora i campi sono spenti.
    await waitFor(() => expect(screen.getByLabelText("Km massimi giornalieri A/R (default)")).toHaveValue(300));
    fireEvent.change(screen.getByLabelText("Km massimi giornalieri A/R (default)"), { target: { value: "180" } });
    expect(screen.getByText("Modifiche non salvate").getAttribute("role")).toBe("status");
    fireEvent.click(screen.getByRole("button", { name: "Salva gli spostamenti" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Spostamenti salvati"));
    const [scrittura] = scritture("upsert", "marketing_calendar_preferences");
    expect(argomenti(scrittura, "upsert")[0]).toEqual({
      company_id: "azienda-1",
      default_max_daily_km: 180,
      max_travel_minutes: 45,
      default_appointment_duration_minutes: 60,
    });
    expect(argomenti(scrittura, "upsert")[1]).toEqual({ onConflict: "company_id" });
    await waitFor(() => expect(screen.queryByText("Modifiche non salvate")).toBeNull());
  });

  it("un valore non valido (vuoto, zero, con la virgola) si rifiuta in italiano, senza scrivere; il campo si può svuotare per riscriverlo", async () => {
    await apri();
    const km = screen.getByLabelText("Km massimi giornalieri A/R (default)");
    fireEvent.change(km, { target: { value: "" } });
    // Prima «250» tornava subito nel campo e non si riusciva a cancellare per riscrivere.
    expect(km).toHaveValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Salva gli spostamenti" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Scrivi i km massimi giornalieri: un numero intero maggiore di zero."));
    expect(scritture("upsert", "marketing_calendar_preferences")).toHaveLength(0);

    fireEvent.change(km, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva gli spostamenti" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Durata appuntamento di default (min)"), { target: { value: "2000" } });
    fireEvent.change(km, { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva gli spostamenti" }));
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith("Scrivi la durata di default: minuti, tra 1 e 1440."));
    expect(scritture("upsert", "marketing_calendar_preferences")).toHaveLength(0);
  });

  it("«Annulla le modifiche» rimette i valori salvati", async () => {
    await apri();
    fireEvent.change(screen.getByLabelText("Km massimi giornalieri A/R (default)"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Annulla le modifiche" }));
    expect(screen.getByLabelText("Km massimi giornalieri A/R (default)")).toHaveValue(250);
    expect(screen.queryByText("Modifiche non salvate")).toBeNull();
  });

  it("senza permesso i campi sono spenti e non c'è la barra", async () => {
    permessi.ruolo = "company_staff";
    permessi.modifica = false;
    await apri();
    for (const campo of screen.getAllByRole("spinbutton")) expect(campo).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Salva gli spostamenti/ })).toBeNull();
  });

  it("bersagli da 44 px sul telefono", async () => {
    await apri();
    for (const campo of screen.getAllByRole("spinbutton")) expect(campo.className).toMatch(/max-md:h-11/);
  });

  it("sul telefono i due pulsanti della barra vanno a capo (non escono dalla scheda)", async () => {
    await apri();
    await waitFor(() => expect(screen.getByLabelText("Km massimi giornalieri A/R (default)")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Km massimi giornalieri A/R (default)"), { target: { value: "181" } });
    const gruppo = screen.getByRole("button", { name: "Salva gli spostamenti" }).parentElement as HTMLElement;
    expect(gruppo.className).toMatch(/flex-wrap/);
    expect(gruppo.contains(screen.getByRole("button", { name: "Annulla le modifiche" }))).toBe(true);
  });
});

describe("la scheda «Orari»", () => {
  const apri = async () => {
    monta("/azienda/impostazioni/calendari?tab=availability");
    await screen.findByText("Orari di prenotazione");
  };

  it("spiega a cosa servono e parte dal primo calendario, senza chiedere di sceglierlo", async () => {
    await apri();
    expect(screen.getByText("Sono gli orari in cui i clienti possono prenotare con il link.")).toBeTruthy();
    // Gli orari del primo calendario sono già sullo schermo: nessun «Seleziona un calendario».
    expect(await screen.findByLabelText("Lunedì: dalle")).toHaveValue("09:00");
    expect(screen.queryByText(/Seleziona un calendario/)).toBeNull();
    // Con più di un calendario c'è la scelta, già posata sul primo.
    expect(screen.getByRole("combobox", { name: "Calendario" })).toHaveTextContent("Sopralluogo Milano");
    expect(screen.getByText("5 giorni attivi su 7")).toBeTruthy();
    expect(scritture("select", "marketing_calendar_availability").some((c) => c.ops.some(([m, a]) => m === "eq" && a[0] === "calendar_id" && a[1] === "c1"))).toBe(true);
  });

  it("con un calendario solo non c'è nessuna scelta: c'è il suo nome", async () => {
    db.stato.calendari = [calendario("c1", "Sopralluogo Milano")];
    await apri();
    expect(await screen.findByText("Calendario: Sopralluogo Milano")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Calendario" })).toBeNull();
  });

  it("senza calendari dice di crearne uno", async () => {
    db.stato.calendari = [];
    await apri();
    expect(await screen.findByText(/Crea prima un calendario/)).toBeTruthy();
  });

  it("i pulsanti dicono cosa fanno, e ogni controllo ha un nome (giorno, dalle, alle)", async () => {
    await apri();
    await screen.findByLabelText("Lunedì: dalle");
    expect(screen.getByRole("button", { name: "Lunedì-venerdì 9-18" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chiudi tutti i giorni" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Lunedì: aperto" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sabato: aperto" })).not.toBeChecked();
    expect(screen.getByLabelText("Venerdì: alle")).toHaveValue("18:00");
    expect(screen.getByRole("button", { name: "Copia gli orari di Lunedì a tutti i giorni aperti" })).toBeTruthy();
    expect(screen.queryByText(/Disponibilità settimanale|Seleziona un calendario|Salva disponibilità|Chiudi tutti$/)).toBeNull();
  });

  it("senza modifiche non c'è la barra; con una modifica compare «Modifiche non salvate» e «Salva gli orari», in vista", async () => {
    await apri();
    await screen.findByLabelText("Lunedì: dalle");
    expect(screen.queryByRole("button", { name: "Salva gli orari" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Martedì: dalle"), { target: { value: "08:30" } });
    expect(screen.getByText("Modifiche non salvate").getAttribute("role")).toBe("status");
    const barra = screen.getByRole("button", { name: "Salva gli orari" }).closest("div.sticky") as HTMLElement;
    expect(barra.className).toMatch(/bottom-0/);
    // Sul telefono «Annulla le modifiche» e «Salva gli orari» vanno a capo invece di uscire dalla scheda.
    expect((screen.getByRole("button", { name: "Salva gli orari" }).parentElement as HTMLElement).className).toMatch(/flex-wrap/);
  });

  it("sul telefono ogni giorno ha il nome su una riga e gli orari sotto (entrano senza uscire dalla scheda)", async () => {
    await apri();
    const casella = await screen.findByLabelText("Lunedì: dalle");
    const riga = casella.closest("div.flex-wrap") as HTMLElement;
    expect(riga).toBeTruthy();
    const nomeGiorno = within(riga).getByText("Lunedì").closest("label") as HTMLElement;
    expect(nomeGiorno.className).toMatch(/max-sm:w-full/);
    // La seconda fascia ha un segnaposto al posto del nome del giorno: sul telefono non occupa una riga vuota.
    const giorno = riga.parentElement as HTMLElement;
    fireEvent.click(within(giorno).getByRole("button", { name: /Aggiungi una seconda fascia/ }));
    const segnaposto = giorno.querySelector("span.w-36") as HTMLElement;
    expect(segnaposto).toBeTruthy();
    expect(segnaposto.className).toMatch(/max-sm:hidden/);
  });

  it("una seconda fascia (pausa pranzo) si aggiunge, e i giorni attivi si contano una volta sola", async () => {
    await apri();
    await screen.findByLabelText("Lunedì: dalle");
    fireEvent.click(screen.getAllByRole("button", { name: "+ Aggiungi una seconda fascia (per la pausa pranzo)" })[0]);
    expect(screen.getByLabelText("Lunedì, seconda fascia: dalle")).toBeTruthy();
    // Prima si contavano le fasce, non i giorni: «6 giorni attivi su 7» con un giorno a due fasce.
    expect(screen.getByText("5 giorni attivi su 7")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Togli la seconda fascia di Lunedì" })).toBeTruthy();
    expect(screen.queryByText(/\+ aggiungi fascia/)).toBeNull();
  });

  it("«Aggiungi una seconda fascia» su un giorno 9-18 divide il giorno (9-13 e 14:30-18) invece di creare una fascia vuota", async () => {
    await apri();
    await screen.findByLabelText("Lunedì: dalle");
    fireEvent.click(screen.getAllByRole("button", { name: "+ Aggiungi una seconda fascia (per la pausa pranzo)" })[0]);
    expect(screen.getByLabelText("Lunedì: dalle")).toHaveValue("09:00");
    expect(screen.getByLabelText("Lunedì: alle")).toHaveValue("13:00");
    expect(screen.getByLabelText("Lunedì, seconda fascia: dalle")).toHaveValue("14:30");
    expect(screen.getByLabelText("Lunedì, seconda fascia: alle")).toHaveValue("18:00");
    expect(screen.queryByText(/La fine deve essere dopo l'inizio/)).toBeNull();
    // Una seconda fascia che parte dove finisce la prima, quando la prima finisce presto, resta com'era: dalle 13 alle 18.
    fireEvent.click(screen.getByRole("button", { name: "Togli la seconda fascia di Lunedì" }));
    fireEvent.change(screen.getByLabelText("Lunedì: alle"), { target: { value: "12:00" } });
    fireEvent.click(screen.getAllByRole("button", { name: "+ Aggiungi una seconda fascia (per la pausa pranzo)" })[0]);
    expect(screen.getByLabelText("Lunedì, seconda fascia: dalle")).toHaveValue("12:00");
    expect(screen.getByLabelText("Lunedì, seconda fascia: alle")).toHaveValue("18:00");
  });

  it("«Chiudi tutti i giorni» e «Lunedì-venerdì 9-18» lavorano sulla bozza, non sul database", async () => {
    await apri();
    await screen.findByLabelText("Lunedì: dalle");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi tutti i giorni" }));
    expect(screen.getByText("0 giorni attivi su 7")).toBeTruthy();
    expect(scritture("delete", "marketing_calendar_availability")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Lunedì-venerdì 9-18" }));
    expect(screen.getByText("5 giorni attivi su 7")).toBeTruthy();
  });

  it("salva cancellando e riscrivendo le fasce del calendario scelto, nell'azienda", async () => {
    await apri();
    await screen.findByLabelText("Lunedì: dalle");
    fireEvent.change(screen.getByLabelText("Martedì: dalle"), { target: { value: "08:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva gli orari" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Orari salvati"));
    const [cancella] = scritture("delete", "marketing_calendar_availability");
    expect(cancella.ops.filter(([m]) => m === "eq").map(([, a]) => a)).toEqual([["calendar_id", "c1"], ["company_id", "azienda-1"]]);
    const [inserisce] = scritture("insert", "marketing_calendar_availability");
    const righe = argomenti(inserisce, "insert")[0] as Array<Record<string, unknown>>;
    expect(righe).toHaveLength(7);
    expect(righe.every((r) => r.calendar_id === "c1" && r.company_id === "azienda-1")).toBe(true);
    expect(righe.find((r) => r.day_of_week === 2)).toMatchObject({ start_time: "08:30", end_time: "18:00", is_enabled: true });
    await waitFor(() => expect(screen.queryByText("Modifiche non salvate")).toBeNull());
  });

  it("un orario con la fine prima dell'inizio non si salva e lo dice", async () => {
    await apri();
    await screen.findByLabelText("Lunedì: dalle");
    fireEvent.change(screen.getByLabelText("Lunedì: alle"), { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva gli orari" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Orario non valido per Lunedì: l'ora di fine deve essere successiva all'inizio."));
    expect(scritture("delete", "marketing_calendar_availability")).toHaveLength(0);
  });

  it("senza permesso gli orari si leggono ma non si toccano e non c'è la barra", async () => {
    permessi.ruolo = "company_staff";
    permessi.modifica = false;
    await apri();
    expect(await screen.findByLabelText("Lunedì: dalle")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Lunedì: aperto" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salva gli orari" })).toBeNull();
    expect(screen.queryByRole("button", { name: /seconda fascia/ })).toBeNull();
  });
});

describe("la finestra del calendario", () => {
  const apriNuovo = async () => {
    monta();
    const nuovo = await screen.findByRole("button", { name: "Nuovo calendario" });
    await waitFor(() => expect(nuovo).toBeEnabled());
    fireEvent.click(nuovo);
    return screen.findByRole("dialog");
  };
  const apriModifica = async (nome: string) => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: `Modifica «${nome}»` }));
    return screen.findByRole("dialog");
  };

  it("sul telefono la finestra ha una colonna sola che può restringersi (non si allarga e il contenuto non esce a destra)", async () => {
    const finestra = await apriNuovo();
    const griglia = finestra.querySelector("form > div.grid") as HTMLElement;
    expect(griglia).toBeTruthy();
    expect(griglia.className).toMatch(/(^|\s)grid-cols-\[minmax\(0,1fr\)\]/);
    expect(griglia.className).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_320px\]/);
  });

  it("all'apertura il cursore è sul nome (non sull'icona di aiuto, che aprirebbe da sola il suggerimento)", async () => {
    const finestra = await apriNuovo();
    await waitFor(() => expect(document.activeElement).toBe(within(finestra).getByLabelText("Nome del calendario")));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("sezioni numerate di seguito, da 1 a 7, con i nomi nuovi (prima c'erano due «4»)", async () => {
    const finestra = await apriNuovo();
    const titoli = within(finestra).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titoli).toEqual(["Nome e link", "Tipo e responsabile", "Dove finiscono gli appuntamenti", "Orari e regole", "Messaggi al cliente", "Come si svolge", "Base per i percorsi"]);
    const numeri = [...finestra.querySelectorAll("section > div > div.flex.h-8")].map((n) => n.textContent);
    expect(numeri).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("«Pronto per le prenotazioni» conta nome, link, durata e orari; responsabile e calendario esterno sono consigliati; la sede non c'è", async () => {
    const finestra = await apriNuovo();
    expect(within(finestra).getByText("Pronto per le prenotazioni")).toBeTruthy();
    // Un calendario nuovo parte con gli orari lunedì-venerdì 9-18; senza nome non c'è nemmeno il link (nasce dal nome): due su quattro.
    expect(within(finestra).getByText("2/4")).toBeTruthy();
    for (const voce of ["Nome pubblico", "Link di prenotazione", "Durata appuntamento", "Orari di prenotazione"]) expect(within(finestra).getAllByText(voce).length, voce).toBeGreaterThan(0);
    expect(within(finestra).getByText("Consigliato")).toBeTruthy();
    expect(within(finestra).getAllByText("Responsabile").length).toBeGreaterThan(0);
    expect(within(finestra).queryByText("Sede base")).toBeNull();
    expect(within(finestra).queryByText(/Pronto al booking/)).toBeNull();
    fireEvent.change(within(finestra).getByLabelText("Nome del calendario"), { target: { value: "Open day" } });
    expect(within(finestra).getByText("4/4")).toBeTruthy();
  });

  it("un calendario esistente senza orari non è «pronto»: il controllo sugli orari è spento", async () => {
    db.stato.orari = { c1: [], c2: settimana("c2") };
    const finestra = await apriModifica("Sopralluogo Milano");
    expect(within(finestra).getByText("3/4")).toBeTruthy();
  });

  it("un solo accesso agli orari («Imposta gli orari»); «Impostazioni avanzate» non c'è più", async () => {
    const finestra = await apriModifica("Commerciale Roma");
    expect(within(finestra).queryByText(/Impostazioni avanzate|Disponibilita'|Avanzate dopo il salvataggio/)).toBeNull();
    fireEvent.click(within(finestra).getByRole("button", { name: "Imposta gli orari" }));
    // Si apre «Orari» sul calendario che si stava modificando, non sul primo.
    expect(await screen.findByText("Orari di prenotazione")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Calendario" })).toHaveTextContent("Commerciale Roma");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("«Imposta gli orari» con modifiche non salvate chiede conferma prima di lasciare la finestra", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    const finestra = await apriModifica("Commerciale Roma");
    fireEvent.change(within(finestra).getByLabelText("Nome del calendario"), { target: { value: "Commerciale Roma nord" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Imposta gli orari" }));
    expect(conferma).toHaveBeenCalledTimes(1);
    // «Annulla» alla domanda: la finestra resta aperta, con le modifiche, e la scheda non cambia.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByLabelText("Nome del calendario")).toHaveValue("Commerciale Roma nord");
    // (nella finestra c'è anche la voce «Orari di prenotazione» dell'elenco «pronto»: la scheda si riconosce dal suo titolo)
    expect(screen.queryByRole("heading", { name: "Orari di prenotazione" })).toBeNull();
    conferma.mockReturnValue(true);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Imposta gli orari" }));
    expect(await screen.findByRole("heading", { name: "Orari di prenotazione" })).toBeTruthy();
  });

  it("per un calendario nuovo il pulsante degli orari è spento e dice cosa fare", async () => {
    const finestra = await apriNuovo();
    expect(within(finestra).getByRole("button", { name: "Salva prima il calendario" })).toBeDisabled();
    expect(within(finestra).getByText(/Dopo il salvataggio il calendario ha orari di partenza \(lunedì-venerdì 9-18\)/)).toBeTruthy();
  });

  it("chiudere con modifiche non salvate chiede conferma; senza modifiche chiude subito", async () => {
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    const finestra = await apriModifica("Sopralluogo Milano");
    fireEvent.click(within(finestra).getByRole("button", { name: "Annulla" }));
    expect(conferma).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const seconda = await apriModifica2();
    fireEvent.change(within(seconda).getByLabelText("Nome del calendario"), { target: { value: "Sopralluogo Milano nord" } });
    fireEvent.click(within(seconda).getByRole("button", { name: "Annulla" }));
    expect(conferma).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByLabelText("Nome del calendario")).toHaveValue("Sopralluogo Milano nord");

    conferma.mockReturnValue(true);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    conferma.mockRestore();
  });

  /** Riapre la finestra dello stesso calendario dopo averla chiusa (la pagina è già montata). */
  async function apriModifica2() {
    fireEvent.click(await screen.findByRole("button", { name: "Modifica «Sopralluogo Milano»" }));
    return screen.findByRole("dialog");
  }

  it("parole e accenti: niente «e'», «verra'», «Disponibilita'», «slug», «Link pubblico»", async () => {
    const finestra = await apriNuovo();
    const testo = finestra.textContent ?? "";
    expect(testo).not.toMatch(/(\be'|\bverra'|\bricevera'|Disponibilita'|\bslug\b|Link pubblico|Regole operative|Modalità incontro|Base operativa)/);
    expect(within(finestra).getByLabelText("Link di prenotazione")).toBeTruthy();
    expect(within(finestra).getByText("Scrivi la parte finale del link, per esempio sopralluogo-milano.")).toBeTruthy();
    expect(within(finestra).getByLabelText("Massimo al giorno")).toBeTruthy();
    expect(within(finestra).queryByText("Max al giorno")).toBeNull();
  });

  it("i messaggi al cliente stanno in un riquadro chiuso, non in mezzo alle regole", async () => {
    const finestra = await apriNuovo();
    const riquadro = within(finestra).getByText("Promemoria, firma e mittente").closest("details") as HTMLDetailsElement;
    expect(riquadro.open).toBe(false);
    expect(within(riquadro).getByLabelText("Firma dei messaggi")).toBeTruthy();
    expect(within(riquadro).getByText("Promemoria al cliente il giorno prima")).toBeTruthy();
    // E le regole di agenda restano nella sezione degli orari, fuori dal riquadro.
    expect(riquadro.contains(within(finestra).getByLabelText("Preavviso minimo (min)"))).toBe(false);
  });

  it("crea il calendario con gli orari di partenza, e il messaggio porta a «Cambia gli orari»", async () => {
    const finestra = await apriNuovo();
    fireEvent.change(within(finestra).getByLabelText("Nome del calendario"), { target: { value: "Open day" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea calendario" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [titolo, opzioni] = toast.success.mock.calls[0] as [string, { description: string; action?: { label: string; onClick: () => void } }];
    expect(titolo).toBe("Calendario creato");
    expect(opzioni.description).toBe("Orari di partenza: lunedì-venerdì 9-18. Puoi cambiarli dalla scheda «Orari».");
    expect(opzioni.action?.label).toBe("Cambia gli orari");
    const [nuovoCalendario] = scritture("insert", "marketing_calendars");
    expect(argomenti(nuovoCalendario, "insert")[0]).toMatchObject({ company_id: "azienda-1", name: "Open day", booking_slug: "open-day", duration_minutes: 30 });
    // Le sette fasce di partenza: lunedì-venerdì 9-18.
    const [fasce] = scritture("insert", "marketing_calendar_availability");
    const righe = argomenti(fasce, "insert")[0] as Array<Record<string, unknown>>;
    expect(righe.filter((r) => r.is_enabled).map((r) => r.day_of_week)).toEqual([1, 2, 3, 4, 5]);

    // Il pulsante nel messaggio apre la scheda «Orari».
    await act(async () => { opzioni.action!.onClick(); });
    expect(await screen.findByText("Orari di prenotazione")).toBeTruthy();
  });

  it("se gli orari di partenza non si salvano lo dice, e il messaggio rimanda a «Orari»", async () => {
    db.stato.erroreFasce = true;
    const finestra = await apriNuovo();
    fireEvent.change(within(finestra).getByLabelText("Nome del calendario"), { target: { value: "Open day" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea calendario" }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    const [titolo, opzioni] = toast.warning.mock.calls[0] as [string, { description: string; action?: { label: string } }];
    expect(titolo).toBe("Calendario creato, orari non salvati");
    expect(opzioni.description).toBe("Imposta gli orari dalla scheda «Orari», altrimenti nessuno potrà prenotare.");
    expect(opzioni.action?.label).toBe("Cambia gli orari");
    // Il calendario c'è, e il messaggio non promette gli orari di partenza.
    expect(toast.success).not.toHaveBeenCalled();
    expect(scritture("insert", "marketing_calendars")).toHaveLength(1);
  });
});

describe("messaggi di errore", () => {
  it("un link già usato da un altro calendario si rifiuta in italiano (non «e gia usato»)", async () => {
    db.stato.linkOccupato = true;
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Modifica «Sopralluogo Milano»" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.change(within(finestra).getByLabelText("Link di prenotazione"), { target: { value: "gia-preso" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Questo link è già usato da un altro calendario: scrivine un altro."));
    expect(scritture("update", "marketing_calendars")).toHaveLength(0);
  });

  it("un calendario senza la parte finale del link dice cosa scrivere", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Modifica «Sopralluogo Milano»" }));
    const finestra = await screen.findByRole("dialog");
    // Senza nome non si salva; senza link (e con un nome fatto solo di simboli) nemmeno.
    fireEvent.change(within(finestra).getByLabelText("Nome del calendario"), { target: { value: "***" } });
    fireEvent.change(within(finestra).getByLabelText("Link di prenotazione"), { target: { value: "" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Scrivi la parte finale del link, per esempio sopralluogo-milano."));
    expect(scritture("update", "marketing_calendars")).toHaveLength(0);
  });
});

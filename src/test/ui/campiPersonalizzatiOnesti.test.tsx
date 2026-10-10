/**
 * Campi personalizzati: la pagina dice la verità (10/10/2026).
 *
 * Prima la finestra «Nuovo campo» offriva tre controlli che nessun codice leggeva (Sezione, Campo obbligatorio, Testo di
 * aiuto), la pagina aveva una scheda «Cartelle» che nessuno leggeva (0 cartelle in tutto il database), il cartellino
 * «Solo API» era sbagliato in entrambi i sensi (dava per «mostrati» Prodotto, Famiglia, Tariffa, Categoria e POS, che
 * nessun form mostra, e per «solo API» Appuntamento, Attività, Dipendente e Magazzino, che invece hanno la sezione), un
 * campo con valori non si poteva eliminare (e il messaggio indicava una conferma che non c'era), e i campi eliminati
 * restavano nelle schede. Qui si tiene fermo:
 *   · niente «Sezione», «Campo obbligatorio», «Testo di aiuto», niente scheda «Cartelle»; il payload di creazione e di
 *     modifica non porta più is_required né help_text, e la sezione parte da quella dell'oggetto;
 *   · il cartellino «Non compare nelle schede» c'è solo dove nessuna scheda mostra il campo; il menu «Dove compare»
 *     divide gli oggetti in «Compare nelle schede» e «Non compare ancora nelle schede»;
 *   · i campi dell'azienda stanno in cima all'elenco; i nomi di sistema sono in italiano (id e chiavi non cambiano);
 *   · eliminare = spostare tra gli eliminati (deleted_at), anche se il campo ha valori; l'eliminazione definitiva ha una
 *     sua finestra e rifiuta, spiegando, se ci sono ancora valori;
 *   · i lettori delle schede (contatto, opportunità, altri oggetti, cataloghi) non leggono più i campi eliminati.
 */
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Op = [string, unknown[]];

const db = vi.hoisted(() => {
  type Operazione = [string, unknown[]];
  const stato = {
    chiamate: [] as Array<{ tabella: string; ops: Operazione[] }>,
    attivi: [] as unknown[],
    eliminati: [] as unknown[],
    conteggi: {} as Record<string, number>,
    erroreScrittura: null as unknown,
  };
  const risposta = (tabella: string, ops: Operazione[]): { data: unknown; error: unknown; count?: number } => {
    const ha = (m: string) => ops.some(([nome]) => nome === m);
    if (ha("insert") || ha("update") || ha("delete")) return { data: { id: "x" }, error: stato.erroreScrittura };
    if (tabella === "marketing_custom_fields") return { data: ha("not") ? stato.eliminati : stato.attivi, error: null };
    // I conteggi dei valori già scritti (una query per tabella dei valori).
    return { data: null, count: stato.conteggi[tabella] ?? 0, error: null };
  };
  const catena = (tabella: string): unknown => {
    const ops: Operazione[] = [];
    stato.chiamate.push({ tabella, ops });
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, metodo: string) {
          if (metodo === "then") {
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
              Promise.resolve(risposta(tabella, ops)).then(ok, ko);
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
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const permessi = vi.hoisted(() => ({ modifica: true }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsCustomization: permessi.modifica, isLoading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (tabella: string) => db.catena(tabella) } }));

import { BUILTIN_FIELDS, CustomFieldsConfig, FIELD_TYPES, FOLDER_LABELS, RENDERED_OBJECT_TYPES } from "@/components/settings/CustomFieldsConfig";
import { useCompanyCustomFields } from "@/hooks/useCompanyCustomFields";
import { useEntityCustomFields } from "@/hooks/useEntityCustomFields";
import { useContactCustomFields, useOpportunityCustomFields } from "@/hooks/useOpportunityDetailData";

// Una tendina Radix aperta dentro di una finestra (qui «Dove compare» e «Tipo») monta due FocusScope insieme. Con l'albero
// di bun.lock (CI e Cloudflare) condividono la stessa copia del modulo e la pila di Radix mette in pausa il primo; nella
// node_modules locale, installata con npm, sono due copie diverse e si rimandano il focus all'infinito: Chrome interrompe
// il rimbalzo, jsdom no, e il test non finisce più (RangeError da focusing.js). Qui il rimbalzo si ferma dopo pochi
// livelli, come nel browser; con l'albero giusto la protezione non scatta mai.
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

/** Un campo dell'azienda, com'è nel database. */
const campo = (extra: Record<string, unknown> = {}) => ({
  id: "f1",
  company_id: "azienda-1",
  name: "Tipo di caldaia",
  object_type: "contact",
  field_type: "select",
  options: ["Condensazione", "Ibrida"],
  section: "general_info",
  position: 0,
  created_at: "2026-09-01T10:00:00Z",
  deleted_at: null as unknown,
  is_required: false,
  help_text: null as unknown,
  folder_id: null as unknown,
  ...extra,
});

function monta() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CustomFieldsConfig />
    </QueryClientProvider>,
  );
}

/** Le chiamate al database sulla tabella, per metodo (insert, update, delete…). */
const chiamate = (metodo: string, tabella = "marketing_custom_fields") =>
  db.stato.chiamate.filter((c) => c.tabella === tabella && c.ops.some(([m]) => m === metodo));
const argomenti = (c: { ops: Op[] }, metodo: string) => c.ops.find(([m]) => m === metodo)?.[1] ?? [];
const ha = (c: { ops: Op[] }, metodo: string, ...args: unknown[]) =>
  c.ops.some(([m, a]) => m === metodo && JSON.stringify(a) === JSON.stringify(args));

async function apriNuovoCampo() {
  const aggiungi = screen.getByRole("button", { name: "Aggiungi campo" });
  await waitFor(() => expect(aggiungi).toBeEnabled());
  fireEvent.click(aggiungi);
  return screen.findByRole("dialog");
}

/** Apre una tendina Radix e sceglie la voce. */
async function scegli(tendina: string | RegExp, voce: string | RegExp) {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: tendina }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: voce }));
}

beforeEach(() => {
  db.stato.chiamate.length = 0;
  db.stato.attivi = [];
  db.stato.eliminati = [];
  db.stato.conteggi = {};
  db.stato.erroreScrittura = null;
  permessi.modifica = true;
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => cleanup());

describe("la finestra «Nuovo campo»", () => {
  it("non ha più «Sezione», «Campo obbligatorio» né «Testo di aiuto», e la pagina non ha la scheda «Cartelle»", async () => {
    monta();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Tutti i campi", "Campi eliminati"]);
    expect(screen.queryByRole("tab", { name: "Cartelle" })).toBeNull();

    const finestra = await apriNuovoCampo();
    expect(within(finestra).getByText("Nuovo campo")).toBeTruthy();
    expect(within(finestra).getByLabelText("Dove compare *")).toBeTruthy();
    expect(within(finestra).getByLabelText("Nome del campo *")).toBeTruthy();
    expect(within(finestra).getByLabelText("Tipo")).toBeTruthy();
    for (const morto of [/^Sezione$/, /Campo obbligatorio/, /Testo di aiuto/, /Anteprima campo/, /API.only/i, /Oggetto \*/]) {
      expect(within(finestra).queryByText(morto), String(morto)).toBeNull();
    }
    // Nessuna casella da spuntare: l'unico controllo a due stati era «Campo obbligatorio».
    expect(within(finestra).queryByRole("checkbox")).toBeNull();
  });

  it("crea il campo senza is_required né help_text, con la sezione di partenza del contatto", async () => {
    monta();
    await apriNuovoCampo();
    fireEvent.change(screen.getByLabelText("Nome del campo *"), { target: { value: "  Potenza   (kW) " } });
    // La riga «Nei testi si scrive» sostituisce l'anteprima.
    expect(screen.getByText("{{ contact.potenza_kw }}")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Campo aggiunto"));
    const [inserimento] = chiamate("insert");
    expect(argomenti(inserimento, "insert")[0]).toEqual({
      company_id: "azienda-1",
      name: "Potenza (kW)",
      field_type: "text",
      options: [],
      section: "general_info",
      position: 0,
      object_type: "contact",
    });
    // Non solo toEqual: le due colonne morte non devono comparire nemmeno come chiavi.
    expect(Object.keys(argomenti(inserimento, "insert")[0] as object)).not.toEqual(expect.arrayContaining(["is_required"]));
    expect(Object.keys(argomenti(inserimento, "insert")[0] as object)).not.toEqual(expect.arrayContaining(["help_text"]));
  });

  it.each([
    ["Opportunità", "opportunity", "opportunity_details", true],
    ["Giornale dei Lavori", "giornale_lavori", "giornale_lavori", true],
    ["Fattura", "invoice", "general_info", false],
    ["Prodotto (Articolo)", "product", "product", false],
  ])("su «%s» il campo nasce con la sezione di partenza dell'oggetto (%s → %s)", async (etichetta, oggetto, sezione, mostrato) => {
    monta();
    await apriNuovoCampo();
    await scegli("Dove compare *", etichetta);
    fireEvent.change(screen.getByLabelText("Nome del campo *"), { target: { value: "Potenza" } });
    // L'avviso onesto compare solo dove nessuna scheda mostra il campo.
    expect(!!screen.queryByText("Non compare nelle schede.")).toBe(!mostrato);
    expect(screen.getByText(`{{ ${oggetto}.potenza }}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Campo aggiunto"));
    expect(argomenti(chiamate("insert")[0], "insert")[0]).toMatchObject({ object_type: oggetto, section: sezione });
  });

  it("il menu «Dove compare» divide gli oggetti che mostrano il campo da quelli che ancora no", async () => {
    monta();
    await apriNuovoCampo();
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Dove compare *" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    const mostrati = within(await screen.findByRole("group", { name: "Compare nelle schede" }));
    const nascosti = within(screen.getByRole("group", { name: "Non compare ancora nelle schede" }));
    // Quelli che hanno davvero una sezione «Campi personalizzati» (verificato sulle schermate).
    for (const voce of ["Contatto", "Opportunità", "Appuntamento", "Task", "Dipendente", "Magazzino", "Ordine di Variazione", "Giornale dei Lavori", "DUVRI – Sicurezza"]) {
      expect(mostrati.getByRole("option", { name: voce }), voce).toBeTruthy();
    }
    // Quelli che nessun form mostra.
    for (const voce of ["Fattura", "Preventivo", "POS – Sicurezza", "Prodotto (Articolo)", "Famiglia Prodotto", "Tariffa / Manodopera", "Categoria Listino"]) {
      expect(nascosti.getByRole("option", { name: voce }), voce).toBeTruthy();
      expect(mostrati.queryByRole("option", { name: voce }), voce).toBeNull();
    }
  });

  it("i tipi hanno nomi di tutti i giorni", async () => {
    monta();
    await apriNuovoCampo();
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Tipo" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    const voci = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(voci).toEqual([
      "Testo breve", "Testo lungo", "Numero", "Importo", "Percentuale", "Data", "Ora",
      "Una scelta da un elenco", "Più scelte da un elenco", "Una sola scelta", "Spunta sì/no",
      "Telefono", "Email", "Indirizzo web", "File",
    ]);
    // Le chiavi dei tipi (salvate nel database) non sono cambiate.
    expect(FIELD_TYPES.map((t) => t.value)).toEqual([
      "text", "textarea", "number", "currency", "percent", "date", "time", "select", "multiselect", "radio", "checkbox", "phone", "email", "url", "file",
    ]);
  });

  it("le opzioni si spiegano con un esempio; sul contatto un tipo che la scheda non distingue lo dice", async () => {
    monta();
    await apriNuovoCampo();
    expect(screen.queryByLabelText("Opzioni")).toBeNull();
    await scegli("Tipo", "Una scelta da un elenco");
    expect(screen.getByLabelText("Opzioni")).toBeTruthy();
    expect(screen.getByText(/Separale con la virgola: Condensazione, Tradizionale, Ibrida/)).toBeTruthy();
    // Una scelta da un elenco la scheda del contatto la distingue: nessuna nota.
    expect(screen.queryByText(/si compila come testo semplice/)).toBeNull();

    await scegli("Tipo", "Spunta sì/no");
    expect(screen.getByText("Sulla scheda del contatto questo tipo si compila come testo semplice.")).toBeTruthy();

    // Sull'opportunità (CustomFieldInput) lo stesso tipo si distingue: la nota sparisce.
    await scegli("Dove compare *", "Opportunità");
    expect(screen.queryByText(/si compila come testo semplice/)).toBeNull();
  });

  it("senza opzioni valide un campo «a scelta» non si salva", async () => {
    monta();
    await apriNuovoCampo();
    await scegli("Tipo", "Una scelta da un elenco");
    fireEvent.change(screen.getByLabelText("Nome del campo *"), { target: { value: "Colore" } });
    expect(screen.getByRole("button", { name: "Aggiungi" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Opzioni"), { target: { value: "Rosso, rosso, Blu" } });
    expect(screen.getByText("Opzioni valide: Rosso, Blu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aggiungi" })).toBeEnabled();
  });

  it("un nome già usato sullo stesso oggetto è rifiutato in italiano, senza scrivere", async () => {
    db.stato.attivi = [campo()];
    monta();
    await screen.findByText("Tipo di caldaia");
    await apriNuovoCampo();
    fireEvent.change(screen.getByLabelText("Nome del campo *"), { target: { value: "tipo di caldaia" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Esiste già un campo «tipo di caldaia» su «Contatto»: scegli un altro nome."));
    expect(chiamate("insert")).toHaveLength(0);
  });

  it("un errore del database si legge in italiano, non com'è", async () => {
    db.stato.erroreScrittura = { message: "duplicate key value violates unique constraint", code: "23505" };
    monta();
    await apriNuovoCampo();
    fireEvent.change(screen.getByLabelText("Nome del campo *"), { target: { value: "Potenza" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("Esiste già un elemento con questi dati. Controlla e riprova.");
  });
});

describe("modificare un campo", () => {
  it("manda solo nome, tipo, opzioni e oggetto: niente is_required, help_text né sezione se l'oggetto è lo stesso", async () => {
    db.stato.attivi = [campo({ section: "additional_info" })];
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Modifica il campo «Tipo di caldaia»" }));
    expect(screen.getByText("Modifica campo")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nome del campo *"), { target: { value: "Tipo di caldaia (principale)" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Campo aggiornato"));
    const [aggiornamento] = chiamate("update");
    expect(argomenti(aggiornamento, "update")[0]).toEqual({
      name: "Tipo di caldaia (principale)",
      field_type: "select",
      options: ["Condensazione", "Ibrida"],
      object_type: "contact",
    });
    // Resta nell'azienda e sulla riga giusta.
    expect(ha(aggiornamento, "eq", "id", "f1")).toBe(true);
    expect(ha(aggiornamento, "eq", "company_id", "azienda-1")).toBe(true);
  });

  it("se il campo cambia scheda, la sezione lo segue", async () => {
    db.stato.attivi = [campo()];
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Modifica il campo «Tipo di caldaia»" }));
    await scegli("Dove compare *", "Opportunità");
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Campo aggiornato"));
    expect(argomenti(chiamate("update")[0], "update")[0]).toMatchObject({ object_type: "opportunity", section: "opportunity_details" });
  });

  it("se il campo ha già dei valori, il nome si cambia e il resto no, e lo dice in italiano", async () => {
    db.stato.attivi = [campo()];
    db.stato.conteggi = { marketing_contact_field_values: 5 };
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Modifica il campo «Tipo di caldaia»" }));
    expect(screen.getByText(/Se il campo ha già dei valori scritti, il tipo, dove compare e le opzioni non si possono cambiare/)).toBeTruthy();
    await scegli("Dove compare *", "Opportunità");
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Il campo ha già dei valori scritti: puoi cambiare il nome, ma non il tipo, dove compare o le opzioni."),
    );
    expect(chiamate("update")).toHaveLength(0);
  });
});

describe("l'elenco dei campi", () => {
  it("i campi dell'azienda stanno in cima, col tipo sotto il nome; le variabili di sistema dopo", async () => {
    db.stato.attivi = [campo()];
    monta();
    await screen.findByText("Tipo di caldaia");
    const righe = screen.getAllByRole("row");
    // righe[0] è l'intestazione.
    expect(within(righe[1]).getByText("Tipo di caldaia")).toBeTruthy();
    expect(within(righe[1]).getByText("Una scelta da un elenco")).toBeTruthy();
    expect(within(righe[1]).getByText("{{ contact.tipo_di_caldaia }}")).toBeTruthy();
    expect(within(righe[2]).getByText("ID Contatto")).toBeTruthy();
    // La data finta delle variabili di sistema (1/1/2024) non si mostra più.
    expect(screen.queryByText(/01 gen 2024/)).toBeNull();
  });

  it("le intestazioni e il filtro hanno parole italiane; la pagina spiega cosa sono le variabili", async () => {
    monta();
    await screen.findByText("Si scrive così nei testi");
    const intestazioni = within(screen.getAllByRole("row")[0]).getAllByRole("columnheader").map((h) => h.textContent);
    expect(intestazioni).toEqual(["Campo di sistema", "Nome del campo", "Dove compare", "Si scrive così nei testi", "Creato il", "Azioni"]);
    expect(screen.getByRole("combobox", { name: "Mostra solo un oggetto" })).toBeTruthy();
    expect(screen.queryByText(/Raggruppa per/)).toBeNull();
    expect(screen.getByText(/In cima i campi che hai aggiunto tu; sotto, le variabili di sistema/)).toBeTruthy();
  });

  it("senza campi propri dice come cominciare (e a chi non può modificare non offre di aggiungerne)", async () => {
    monta();
    expect(await screen.findByText(/Non hai ancora campi tuoi\. Aggiungine uno, per esempio «Tipo di caldaia» sul contatto\./)).toBeTruthy();
    cleanup();
    permessi.modifica = false;
    monta();
    const riga = await screen.findByText(/Non hai ancora campi tuoi\./);
    expect(riga.textContent).not.toMatch(/Aggiungine/);
  });

  it("«Non compare nelle schede» c'è solo sugli oggetti che nessuna scheda mostra, e il riepilogo li conta", async () => {
    db.stato.attivi = [
      campo({ id: "f1", name: "Tipo di caldaia", object_type: "contact" }),
      campo({ id: "f2", name: "Cantiere del giorno", object_type: "appointment" }),
      campo({ id: "f3", name: "Numero esterno", object_type: "invoice", field_type: "text", options: [] }),
      campo({ id: "f4", name: "Codice articolo", object_type: "product", field_type: "text", options: [] }),
    ];
    monta();
    await screen.findByText("Numero esterno");
    const cartellini = screen.getAllByText("Non compare nelle schede");
    expect(cartellini).toHaveLength(2);
    expect(cartellini[0].getAttribute("title")).toBe("Il valore si salva e si usa nei testi e nelle automazioni, ma questa scheda ancora non lo mostra.");
    for (const nome of ["Tipo di caldaia", "Cantiere del giorno"]) {
      expect(within(screen.getByText(nome).closest("tr") as HTMLElement).queryByText("Non compare nelle schede"), nome).toBeNull();
    }
    expect(within(screen.getByText("Numero esterno").closest("tr") as HTMLElement).getByText("Non compare nelle schede")).toBeTruthy();
    expect(screen.getByText(/2 campi sono su schede che ancora non li mostrano: i valori si salvano e si usano nei testi\./)).toBeTruthy();
    expect(screen.queryByText(/Solo API|solo API/)).toBeNull();
  });

  it("al singolare il riepilogo non sbaglia genere", async () => {
    db.stato.attivi = [campo({ id: "f3", name: "Numero esterno", object_type: "invoice", field_type: "text", options: [] })];
    monta();
    expect(await screen.findByText(/1 campo è su una scheda che ancora non lo mostra: i valori si salvano e si usano nei testi\./)).toBeTruthy();
  });

  it("RENDERED_OBJECT_TYPES elenca esattamente gli oggetti con un form che li mostra", () => {
    expect([...RENDERED_OBJECT_TYPES].sort()).toEqual(
      ["appointment", "contact", "duvri_document", "employee", "giornale_lavori", "opportunity", "ordini_variazione", "task", "warehouse"],
    );
  });

  it("la lettura prende solo i campi non eliminati, nell'azienda, nell'ordine delle schede", async () => {
    monta();
    await screen.findByText("Si scrive così nei testi");
    const lettura = db.stato.chiamate.find((c) => c.tabella === "marketing_custom_fields" && !c.ops.some(([m]) => m === "not"))!;
    expect(ha(lettura, "eq", "company_id", "azienda-1")).toBe(true);
    expect(ha(lettura, "is", "deleted_at", null)).toBe(true);
    expect(lettura.ops.filter(([m]) => m === "order").map(([, a]) => a[0])).toEqual(["position", "created_at"]);
  });
});

describe("dizionario di sistema", () => {
  it("i nomi in inglese sono tradotti; id e chiavi (che il motore dei testi riconosce) non cambiano", () => {
    const atteso: Record<string, [string, string]> = {
      sys_first_name: ["Nome", "{{ contact.first_name }}"],
      sys_last_name: ["Cognome", "{{ contact.last_name }}"],
      sys_full_name: ["Nome e Cognome", "{{ contact.full_name }}"],
      sys_phone: ["Telefono", "{{ contact.phone }}"],
      sys_dob: ["Data di Nascita", "{{ contact.date_of_birth }}"],
      sys_source: ["Origine del Contatto", "{{ contact.source }}"],
      sys_assigned_to: ["Assegnato a", "{{ contact.assigned_to }}"],
      sys_c_tags: ["Tag", "{{ contact.tags }}"],
      sys_opp_tags: ["Tag", "{{ opportunity.tags }}"],
      sys_c_lead_score: ["Punteggio Lead", "{{ contact.lead_score }}"],
      sys_c_icp_tier: ["Fascia Cliente Ideale", "{{ contact.icp_tier }}"],
      sys_company_name: ["Nome Azienda", "{{ contact.company_name }}"],
      sys_address: ["Indirizzo", "{{ contact.address }}"],
      sys_city: ["Città", "{{ contact.city }}"],
      sys_province: ["Provincia", "{{ contact.province }}"],
      sys_postal_code: ["CAP", "{{ contact.postal_code }}"],
      sys_country: ["Paese", "{{ contact.country }}"],
      sys_website: ["Sito Web", "{{ contact.website }}"],
      sys_opp_name: ["Nome Opportunità", "{{ opportunity.name }}"],
      sys_opp_stage: ["Fase", "{{ opportunity.stage_id }}"],
      sys_opp_status: ["Stato", "{{ opportunity.status }}"],
      sys_opp_value: ["Valore", "{{ opportunity.value }}"],
      sys_opp_owner: ["Responsabile", "{{ opportunity.assigned_to }}"],
      sys_opp_source: ["Origine", "{{ opportunity.source }}"],
      sys_opp_lost_reason: ["Motivo della Perdita", "{{ opportunity.loss_reason }}"],
      sys_opp_expected_close: ["Data di Chiusura Prevista", "{{ opportunity.expected_close_date }}"],
      sys_opp_contact_id: ["ID Contatto", "{{ opportunity.contact_id }}"],
    };
    for (const [id, [nome, chiave]] of Object.entries(atteso)) {
      const campoDizionario = BUILTIN_FIELDS.find((f) => f.id === id);
      expect(campoDizionario, id).toBeDefined();
      expect([campoDizionario!.name, campoDizionario!.uniqueKey], id).toEqual([nome, chiave]);
    }
    // Nessun nome del dizionario è rimasto in inglese.
    const inglese = /^(First Name|Last Name|Full Name|Phone|Date Of Birth|Contact Source|Assigned To|Tags|Lead Score|ICP Tier|ICP Score|Score|Business Name|Street Address|City|State|Postal Code|Country|Website|Opportunity Name|Stage|Status|Lead Value|Opportunity Owner|Opportunity Source|Lost Reason|Expected Close Date|Contact ID|Lead Time \(gg\))$/;
    expect(BUILTIN_FIELDS.filter((f) => inglese.test(f.name)).map((f) => f.id)).toEqual([]);
    expect(FOLDER_LABELS.general_info).toBe("Informazioni generali");
    expect(FOLDER_LABELS.additional_info).toBe("Informazioni aggiuntive");
  });
});

describe("eliminare un campo", () => {
  it("lo sposta tra gli eliminati (anche con valori), lo dice, e non cancella niente", async () => {
    db.stato.attivi = [campo()];
    db.stato.conteggi = { marketing_contact_field_values: 3 };
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Elimina il campo «Tipo di caldaia»" }));

    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Eliminare il campo «Tipo di caldaia»?")).toBeTruthy();
    expect(finestra.textContent).toContain("Il campo sparisce dalle schede e va in «Campi eliminati», da dove lo puoi ripristinare. I valori già scritti non si perdono.");
    // Il numero dei valori arriva con la lettura dei conteggi.
    await waitFor(() => expect(finestra.textContent).toContain("Ha 3 valori scritti."));
    // La vecchia frase («consentita solo se il campo non contiene valori»), con gli apostrofi al posto degli accenti, non c'è più.
    expect(finestra.textContent).not.toMatch(/consentita solo se|opportunita'/);

    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Campo spostato in «Campi eliminati». Lo puoi ripristinare quando vuoi."));
    const [spostamento] = chiamate("update");
    expect(argomenti(spostamento, "update")[0]).toEqual({ deleted_at: expect.any(String) });
    expect(ha(spostamento, "eq", "id", "f1")).toBe(true);
    expect(ha(spostamento, "eq", "company_id", "azienda-1")).toBe(true);
    expect(chiamate("delete")).toHaveLength(0);
  });

  it("senza valori la finestra non parla di valori", async () => {
    db.stato.attivi = [campo()];
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Elimina il campo «Tipo di caldaia»" }));
    const finestra = await screen.findByRole("alertdialog");
    await waitFor(() => expect(chiamate("select", "marketing_contact_field_values").length).toBeGreaterThan(0));
    expect(finestra.textContent).not.toMatch(/Ha \d+ valor/);
  });

  it("un campo con un solo valore parla al singolare", async () => {
    db.stato.attivi = [campo()];
    db.stato.conteggi = { entity_custom_field_values: 1 };
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Elimina il campo «Tipo di caldaia»" }));
    const finestra = await screen.findByRole("alertdialog");
    await waitFor(() => expect(finestra.textContent).toContain("Ha 1 valore scritto."));
  });
});

describe("la scheda «Campi eliminati»", () => {
  const apriEliminati = async () => {
    db.stato.eliminati = [campo({ id: "f9", name: "Vecchio campo", field_type: "date", options: [], deleted_at: "2026-09-30T10:00:00Z" })];
    monta();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Campi eliminati/ }), { button: 0, ctrlKey: false });
    await screen.findByText("Vecchio campo");
  };

  it("mostra il tipo con il suo nome, e la lettura prende solo gli eliminati", async () => {
    await apriEliminati();
    expect(screen.getByText("Data")).toBeTruthy();
    const lettura = db.stato.chiamate.find((c) => c.ops.some(([m]) => m === "not"))!;
    expect(ha(lettura, "not", "deleted_at", "is", null)).toBe(true);
    expect(ha(lettura, "eq", "company_id", "azienda-1")).toBe(true);
  });

  it("«Ripristina» toglie deleted_at nella riga e nell'azienda giusta", async () => {
    await apriEliminati();
    fireEvent.click(screen.getByRole("button", { name: "Ripristina il campo «Vecchio campo»" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Campo ripristinato"));
    const [ripristino] = chiamate("update");
    expect(argomenti(ripristino, "update")[0]).toEqual({ deleted_at: null });
    expect(ha(ripristino, "eq", "id", "f9")).toBe(true);
    expect(ha(ripristino, "eq", "company_id", "azienda-1")).toBe(true);
  });

  it("«Elimina definitivamente» chiede conferma in una finestra (non con window.confirm) e poi cancella", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await apriEliminati();
    fireEvent.click(screen.getByRole("button", { name: "Elimina definitivamente il campo «Vecchio campo»" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Eliminare definitivamente il campo «Vecchio campo»?")).toBeTruthy();
    expect(chiamate("delete")).toHaveLength(0);

    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina definitivamente" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Campo eliminato definitivamente"));
    const [cancellazione] = chiamate("delete");
    expect(ha(cancellazione, "eq", "id", "f9")).toBe(true);
    expect(ha(cancellazione, "eq", "company_id", "azienda-1")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("se il campo ha ancora valori l'eliminazione definitiva non parte, e il messaggio non rimanda a una via che non c'è", async () => {
    db.stato.conteggi = { entity_custom_field_values: 2 };
    await apriEliminati();
    fireEvent.click(screen.getByRole("button", { name: "Elimina definitivamente il campo «Vecchio campo»" }));
    const finestra = await screen.findByRole("alertdialog");
    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina definitivamente" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const messaggio = toast.error.mock.calls[0][0] as string;
    expect(messaggio).toBe("Non si può eliminare definitivamente: ha ancora 2 valori scritti. Resta tra i campi eliminati e non compare più nelle schede.");
    expect(messaggio).not.toMatch(/manualmente|confermando/);
    expect(chiamate("delete")).toHaveLength(0);
  });
});

describe("sola lettura e telefono", () => {
  it("senza il permesso non c'è nessun pulsante di modifica (non solo nascosto) e la riga non parla di cartelle", async () => {
    permessi.modifica = false;
    db.stato.attivi = [campo()];
    db.stato.eliminati = [campo({ id: "f9", name: "Vecchio campo", deleted_at: "2026-09-30T10:00:00Z" })];
    monta();
    await screen.findByText("Tipo di caldaia");
    expect(screen.getByText("Sola lettura: per aggiungere o modificare campi serve il permesso «Modifica» su Personalizzazione.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aggiungi campo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Modifica il campo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Elimina il campo/ })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Campi eliminati/ }), { button: 0, ctrlKey: false });
    await screen.findByText("Vecchio campo");
    expect(screen.queryByRole("button", { name: /Ripristina il campo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Elimina definitivamente/ })).toBeNull();
  });

  it("i pulsanti di riga hanno un nome che dice su quale campo agiscono e un bersaglio da 44 px sul telefono", async () => {
    db.stato.attivi = [campo()];
    monta();
    for (const nome of ["Modifica il campo «Tipo di caldaia»", "Elimina il campo «Tipo di caldaia»"]) {
      const pulsante = await screen.findByRole("button", { name: nome });
      expect(pulsante.className, nome).toMatch(/max-md:h-11/);
      expect(pulsante.className, nome).toMatch(/max-md:w-11/);
    }
    const copia = screen.getByRole("button", { name: "Copia la variabile di Tipo di caldaia" });
    expect(copia.className).toMatch(/max-md:h-11/);
    expect(copia.className).toMatch(/max-md:w-11/);
  });
});

describe("le schede non leggono più i campi eliminati", () => {
  function leggi<T>(hook: () => T) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderHook(hook, {
      wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
  }
  const lettureDelleDefinizioni = () => db.stato.chiamate.filter((c) => c.tabella === "marketing_custom_fields");

  it.each([
    ["contatto", () => useContactCustomFields(), "contact"],
    ["opportunità", () => useOpportunityCustomFields(), "opportunity"],
    ["appuntamento (altri oggetti)", () => useEntityCustomFields("appointment"), "appointment"],
    ["catalogo (stessa chiave di cache degli altri oggetti)", () => useCompanyCustomFields("product"), "product"],
  ] as const)("lettore %s", async (_nome, hook, oggetto) => {
    const { result } = leggi(hook as () => { isSuccess: boolean });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [lettura] = lettureDelleDefinizioni();
    expect(ha(lettura, "eq", "company_id", "azienda-1")).toBe(true);
    expect(ha(lettura, "eq", "object_type", oggetto)).toBe(true);
    expect(ha(lettura, "is", "deleted_at", null)).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsSopralluoghi, { TemplateDetailDialog } from "@/pages/azienda/impostazioni/SettingsSopralluoghi";

/**
 * Impostazioni → Sopralluoghi: i modelli con cui si fa un sopralluogo (10/10/2026).
 *
 * - Una sola testata (quella del layout), niente colori e margini propri.
 * - «template» non si dice più: si dice «modello», «Copia», «Di serie», «Tuo».
 * - Sola lettura onesta: chi ha «Personalizzazione» solo in vista consulta; chi lo ha in modifica cambia.
 * - Le finestre non perdono ciò che si è scritto senza chiedere; gli errori sono in italiano.
 */

const state = vi.hoisted(() => ({
  admin: false,
  edit: false,
  moduloAttivo: true,
  lista: vi.fn(),
  toggle: vi.fn(),
  clone: vi.fn(),
  creaVuoto: vi.fn(),
  aggiorna: vi.fn(),
  elimina: vi.fn(),
  toastOk: vi.fn(),
  toastErr: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: state.toastOk, error: state.toastErr } }));
vi.mock("@/hooks/useFeatureFlags", () => ({ useFeatureFlags: () => ({ isFeatureEnabled: () => state.moduloAttivo }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: state.admin, isLoading: false, canEditSettingsCustomization: state.edit }),
}));
vi.mock("@/lib/api/surveys", () => ({
  listTemplatesWithSettings: () => state.lista(),
  toggleTemplateEnabled: (...a: unknown[]) => state.toggle(...a),
  cloneTemplate: (...a: unknown[]) => state.clone(...a),
  createBlankTemplate: (...a: unknown[]) => state.creaVuoto(...a),
  updateTemplate: (...a: unknown[]) => state.aggiorna(...a),
  deleteTemplate: (...a: unknown[]) => state.elimina(...a),
}));

const radice = resolve(__dirname, "../../..");
const leggi = (percorso: string) => readFileSync(resolve(radice, percorso), "utf8");

const SCHEMA = {
  version: 1,
  header_schema: [
    {
      key: "dati_cliente",
      label: "Dati del cliente",
      fields: [
        { key: "referente", label: "Referente", type: "text", required: true },
        {
          key: "materiale", label: "Materiale", type: "select",
          options: [{ value: "pvc", label: "PVC" }, { value: "legno", label: "Legno" }],
        },
      ],
    },
  ],
  area_definition: {
    label: "Stanza", label_plural: "Stanze",
    fields: [{ key: "mq", label: "Metri quadri", type: "dimension", unit: "mq" }],
    required_photos: [{ key: "foto_stanza", label: "Foto della stanza", required: true }],
    name_suggestions: ["Soggiorno", "Cucina"],
  },
  element_types: [
    {
      key: "finestra", label: "Finestra", label_plural: "Finestre",
      sections: [
        { key: "misure", label: "Misure", fields: [{ key: "larghezza", label: "Larghezza", type: "dimension", unit: "cm", required: true }] },
      ],
      required_photos: [{ key: "foto_esterno", label: "Foto esterna", required: true }],
    },
  ],
  general_required_photos: [{ key: "facciata", label: "Facciata", required: true }],
};

const modello = (extra: Record<string, unknown> = {}) => ({
  id: "t-infissi",
  company_id: null as unknown,
  category: "infissi",
  name: "Rilievo Infissi",
  description: "Misure di finestre e porte",
  is_system: true,
  is_active: true,
  area_label: "Stanza",
  area_label_plural: "Stanze",
  element_label: "Infisso",
  schema: SCHEMA,
  version: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  created_by: null as unknown,
  enabled_for_company: true,
  sort_order_for_company: 0,
  ...extra,
});
const DI_SERIE = modello();
const TUO = modello({
  id: "t-mio", company_id: "az-1", category: "bagno", name: "Rilievo bagno nostro", description: "Il nostro bagno",
  is_system: false, enabled_for_company: false,
});

let cliente: QueryClient;
let alberoCorrente: () => ReactElement;
let utils: ReturnType<typeof render>;

function apri() {
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  alberoCorrente = () => (
    <QueryClientProvider client={cliente}>
      <SettingsSopralluoghi />
    </QueryClientProvider>
  );
  utils = render(alberoCorrente());
  return utils;
}
/** Rilegge i permessi (i mock di sopra cambiano) senza smontare la pagina. */
const ricarica = () => utils.rerender(alberoCorrente());

const testoVisibile = () => document.body.textContent ?? "";
const scrivi = (etichetta: string | RegExp, valore: string) => {
  fireEvent.change(screen.getByLabelText(etichetta), { target: { value: valore } });
};
/** La riga (la carta) di un modello, per cercare i suoi pulsanti. */
const riga = (nome: string) => within(screen.getByText(nome).closest(".rounded-lg") as HTMLElement);
const clic = (nome: string, pulsante: string) => fireEvent.click(riga(nome).getByRole("button", { name: pulsante }));

const PAROLE_VIETATE = [/template/i, /JSON schema/i, /read-only/i, /\bClona\b/i, /\bClonazione\b/i, /\bReplica/i];

beforeAll(() => {
  // Radix misura e scorre gli elementi: jsdom non lo sa fare.
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

beforeEach(() => {
  state.admin = false;
  state.edit = false;
  state.moduloAttivo = true;
  for (const f of [state.lista, state.toggle, state.clone, state.creaVuoto, state.aggiorna, state.elimina, state.toastOk, state.toastErr]) f.mockReset();
  state.lista.mockResolvedValue([DI_SERIE, TUO]);
  state.toggle.mockResolvedValue(undefined as unknown);
  state.clone.mockResolvedValue("t-copia");
  state.creaVuoto.mockResolvedValue("t-nuovo");
  state.aggiorna.mockResolvedValue(undefined as unknown);
  state.elimina.mockResolvedValue(undefined as unknown);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Sopralluoghi: chi può solo consultare", () => {
  it("gli interruttori sono spenti, non ci sono i comandi di scrittura e la frase dice cosa serve", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    expect(screen.getByRole("note")).toHaveTextContent("Stai consultando queste impostazioni: le cambia chi ha «Personalizzazione» in modifica.");
    for (const interruttore of screen.getAllByRole("switch")) expect(interruttore).toBeDisabled();
    for (const nome of ["Nuovo modello", "Copia", "Modifica", "Elimina"]) {
      expect(screen.queryByRole("button", { name: nome }), nome).toBeNull();
    }
    // Restano la consultazione: l'anteprima e i campi, anche per un modello tuo.
    expect(screen.getAllByRole("button", { name: "Anteprima" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Vedi i campi" })).toHaveLength(2);
  });

  it("l'interruttore spento non chiama il database", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    fireEvent.click(screen.getByRole("switch", { name: "Usa il modello Rilievo Infissi" }));
    expect(state.toggle).not.toHaveBeenCalled();
  });

  it("il dettaglio di un modello tuo non offre la modifica avanzata", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo bagno nostro", "Vedi i campi");
    const finestra = within(await screen.findByRole("dialog"));
    expect(finestra.getByText("Sezioni iniziali (1)")).toBeInTheDocument();
    expect(finestra.queryByText(/Modifica avanzata/)).toBeNull();
    expect(finestra.queryByRole("textbox")).toBeNull();
  });

  it("chi modifica non vede la frase e ha tutti i comandi", async () => {
    state.edit = true;
    apri();
    await screen.findByText("Rilievo Infissi");
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByRole("button", { name: "Nuovo modello" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copia" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Modifica" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Elimina" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Vedi i campi" })).toHaveLength(1);
    for (const interruttore of screen.getAllByRole("switch")) expect(interruttore).toBeEnabled();
  });

  it("l'amministratore modifica anche senza il permesso granulare", async () => {
    state.admin = true;
    apri();
    await screen.findByText("Rilievo Infissi");
    expect(screen.getByRole("button", { name: "Nuovo modello" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("Sopralluoghi: attivare e disattivare", () => {
  beforeEach(() => { state.edit = true; });

  it("l'interruttore ha il nome del modello, collegato al testo «Attivo» o «Disattivo»", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    const acceso = screen.getByRole("switch", { name: "Usa il modello Rilievo Infissi" });
    expect(acceso).toBeChecked();
    expect(acceso).toHaveAccessibleDescription("Attivo");
    const spento = screen.getByRole("switch", { name: "Usa il modello Rilievo bagno nostro" });
    expect(spento).not.toBeChecked();
    expect(spento).toHaveAccessibleDescription("Disattivo");
  });

  it("disattivare un modello lo dice con «Modello disattivato», attivarlo con «Modello attivato»", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    fireEvent.click(screen.getByRole("switch", { name: "Usa il modello Rilievo Infissi" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("Modello disattivato"));
    expect(state.toggle).toHaveBeenCalledWith("t-infissi", false);

    fireEvent.click(screen.getByRole("switch", { name: "Usa il modello Rilievo bagno nostro" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("Modello attivato"));
    expect(state.toggle).toHaveBeenLastCalledWith("t-mio", true);
  });

  it("se il database rifiuta, l'errore è una frase italiana senza «Error:» né «template»", async () => {
    state.toggle.mockRejectedValue(new Error("Toggle template fallito"));
    apri();
    await screen.findByText("Rilievo Infissi");
    fireEvent.click(screen.getByRole("switch", { name: "Usa il modello Rilievo Infissi" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][0]).toBe("Modello non aggiornato");
    const descrizione: string = state.toastErr.mock.calls[0][1].description;
    expect(descrizione).toBe("Non sono riuscito ad attivare o disattivare il modello. Riprova.");
    expect(descrizione).not.toMatch(/Error|template/i);
  });
});

describe("Sopralluoghi: una funzione di scrittura senza permesso non parte", () => {
  beforeEach(() => { state.edit = true; });

  /** Toglie il permesso di modifica mentre la finestra è già aperta. */
  const togliPermesso = () => { state.edit = false; ricarica(); };
  const rifiuto = () => {
    expect(state.toastErr).toHaveBeenCalledWith("Modello non modificato", {
      description: "Non puoi modificare i modelli: serve «Personalizzazione» in modifica.",
    });
  };

  it("nuovo modello", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    scrivi("Nome del nuovo modello", "Rilievo cucina");
    togliPermesso();
    fireEvent.click(screen.getByRole("button", { name: "Crea e modifica" }));
    expect(state.creaVuoto).not.toHaveBeenCalled();
    rifiuto();
  });

  it("copia", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo Infissi", "Copia");
    togliPermesso();
    fireEvent.click(screen.getByRole("button", { name: "Copia e crea" }));
    expect(state.clone).not.toHaveBeenCalled();
    rifiuto();
  });

  it("elimina", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo bagno nostro", "Elimina");
    const conferma = await screen.findByRole("alertdialog");
    togliPermesso();
    fireEvent.click(within(conferma).getByRole("button", { name: "Elimina" }));
    expect(state.elimina).not.toHaveBeenCalled();
    rifiuto();
  });

  it("aggiorna dall'editor a campi", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo bagno nostro", "Modifica");
    await screen.findByText("Modifica modello");
    scrivi("Nome del modello", "Rilievo bagno nuovo");
    togliPermesso();
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    expect(state.aggiorna).not.toHaveBeenCalled();
    rifiuto();
  });

});

describe("Sopralluoghi: titolo, riepilogo e parole", () => {
  it("nessun titolo di primo livello e nessun contenitore proprio: il layout pensa a titolo e margini", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(utils.container.querySelector(".container")).toBeNull();
    expect(screen.queryByText(/Beta/)).toBeNull();
    expect(screen.queryByText("Impostazioni Sopralluoghi")).toBeNull();
    for (const f of [
      "src/pages/azienda/impostazioni/SettingsSopralluoghi.tsx",
      "src/pages/azienda/impostazioni/SurveyTemplateEditor.tsx",
      "src/pages/azienda/impostazioni/SurveyTemplatePreview.tsx",
    ]) {
      expect(leggi(f), f).not.toContain("<h1");
    }
  });

  it("niente pulsanti arancioni fissi nella pagina e nelle finestre", () => {
    for (const f of [
      "src/pages/azienda/impostazioni/SettingsSopralluoghi.tsx",
      "src/pages/azienda/impostazioni/SurveyTemplateEditor.tsx",
    ]) {
      expect(leggi(f), f).not.toMatch(/bg-orange-600|hover:bg-orange-700|from-orange-500/);
    }
  });

  it("una riga sola di riepilogo al posto delle quattro tessere", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    expect(screen.getByText("1 attivo su 2 · 1 tuo")).toBeInTheDocument();
    for (const vecchia of ["Attivi", "Disponibili", "Sistema", "Personalizzati"]) {
      expect(screen.queryByText(vecchia), vecchia).toBeNull();
    }
  });

  it("il riepilogo conta attivi, totale e modelli tuoi", async () => {
    state.lista.mockResolvedValue([
      DI_SERIE, modello({ id: "t-bagno", name: "Rilievo Bagno" }), TUO, modello({ id: "t-mio2", name: "Altro nostro", is_system: false }),
    ]);
    apri();
    await screen.findByText("Rilievo Bagno");
    expect(screen.getByText("3 attivi su 4 · 2 tuoi")).toBeInTheDocument();
  });

  it("senza modelli tuoi il riepilogo non nomina i «tuoi»", async () => {
    state.lista.mockResolvedValue([DI_SERIE, modello({ id: "t-bagno", name: "Rilievo Bagno", enabled_for_company: false })]);
    apri();
    await screen.findByText("Rilievo Bagno");
    expect(screen.getByText("1 attivo su 2")).toBeInTheDocument();
  });

  it("i cartellini si chiamano «Di serie» e «Tuo»", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    expect(riga("Rilievo Infissi").getByText("Di serie")).toBeInTheDocument();
    expect(riga("Rilievo bagno nostro").getByText("Tuo")).toBeInTheDocument();
    expect(screen.queryByText("Sistema")).toBeNull();
    expect(screen.queryByText("Personalizzato")).toBeNull();
  });

  it("senza modelli dice cosa dovrebbe esserci", async () => {
    state.lista.mockResolvedValue([]);
    apri();
    expect(await screen.findByText("Nessun modello disponibile")).toBeInTheDocument();
    expect(screen.getByText("I modelli di serie (Infissi, Bagno, Fotovoltaico, Ristrutturazione) dovrebbero esserci. Se non li vedi, scrivici.")).toBeInTheDocument();
  });

  it("se i modelli non si leggono non finge che non ce ne siano", async () => {
    state.lista.mockRejectedValue(new Error("Errore caricamento template"));
    apri();
    expect(await screen.findByText("Non riesco a leggere i modelli")).toBeInTheDocument();
    expect(screen.getByText("Non sono riuscito a caricare i modelli. Riprova.")).toBeInTheDocument();
    expect(screen.queryByText("Nessun modello disponibile")).toBeNull();
    expect(screen.queryByText(/su \d/)).toBeNull();
    state.lista.mockResolvedValue([DI_SERIE, TUO]);
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Rilievo Infissi")).toBeInTheDocument();
  });

  it("il modulo spento resta con il suo testo, senza contenitore proprio", () => {
    state.moduloAttivo = false;
    apri();
    expect(screen.getByText("Modulo Sopralluoghi non attivo")).toBeInTheDocument();
    expect(screen.getByText(/disponibili solo per le aziende con il modulo Sopralluoghi abilitato/)).toBeInTheDocument();
    expect(utils.container.querySelector(".container")).toBeNull();
    expect(state.lista).not.toHaveBeenCalled();
  });

  it("la pagina, le finestre, il dettaglio, l'editor e l'anteprima non dicono «template», «JSON schema», «read-only», «Clona»", async () => {
    state.edit = true;
    apri();
    await screen.findByText("Rilievo Infissi");
    const controlla = (dove: string) => {
      for (const parola of PAROLE_VIETATE) expect(testoVisibile(), `${dove}: ${parola}`).not.toMatch(parola);
    };
    controlla("pagina");

    // Nuovo modello, da zero e da uno di serie
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    const nuovo = within(await screen.findByRole("dialog"));
    expect(nuovo.getByText("Nuovo modello di sopralluogo")).toBeInTheDocument();
    expect(nuovo.getByText("Parti da zero o da un modello di serie e personalizzalo.")).toBeInTheDocument();
    expect(nuovo.getByText("Da zero")).toBeInTheDocument();
    expect(nuovo.getByText("Modello vuoto: aggiungi tu sezioni, campi e foto")).toBeInTheDocument();
    expect(nuovo.getByText("Parti da uno di serie")).toBeInTheDocument();
    expect(nuovo.getByText("Copia un modello di serie (Infissi, Bagno…) e cambialo")).toBeInTheDocument();
    expect(nuovo.getByLabelText("Descrizione (facoltativa)")).toHaveAttribute("placeholder", "Cosa si rileva con questo modello e quando usarlo");
    expect(nuovo.getByLabelText("Categoria")).toHaveTextContent("Altro");
    expect(nuovo.getByRole("button", { name: "Crea e modifica" })).toBeInTheDocument();
    controlla("nuovo modello da zero");
    fireEvent.click(nuovo.getByText("Parti da uno di serie"));
    expect(nuovo.getByLabelText("Modello di serie da copiare")).toHaveTextContent("Scegli un modello…");
    expect(nuovo.getByRole("button", { name: "Copia e modifica" })).toBeInTheDocument();
    controlla("nuovo modello da uno di serie");
    fireEvent.click(nuovo.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Copia
    clic("Rilievo Infissi", "Copia");
    const copia = within(await screen.findByRole("dialog"));
    expect(copia.getByText("Copia «Rilievo Infissi»")).toBeInTheDocument();
    expect(copia.getByText("Fai una copia che puoi modificare: campi, foto richieste, sezioni.")).toBeInTheDocument();
    expect(copia.getByLabelText("Nome del nuovo modello")).toHaveValue("Copia di Rilievo Infissi");
    expect(copia.getByRole("button", { name: "Copia e crea" })).toBeInTheDocument();
    controlla("copia");
    fireEvent.click(copia.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Elimina
    clic("Rilievo bagno nostro", "Elimina");
    const elimina = within(await screen.findByRole("alertdialog"));
    expect(elimina.getByText("Eliminare «Rilievo bagno nostro»?")).toBeInTheDocument();
    expect(elimina.getByText("Il modello verrà eliminato per sempre. Si può eliminare solo un modello che nessun sopralluogo ha mai usato.")).toBeInTheDocument();
    controlla("elimina");
    fireEvent.click(elimina.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    // Anteprima
    clic("Rilievo Infissi", "Anteprima");
    await screen.findByText(/^Anteprima — /);
    expect(screen.getByRole("button", { name: "Mostra i dati inseriti" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Azzera" })).toBeInTheDocument();
    expect(screen.getByText("Prova: non si salva niente")).toBeInTheDocument();
    controlla("anteprima");
    for (const inglese of [/\bstate\b/i, /show_if/i, /\bReset\b/, /validation/i, /rendering/i, /\bHeader\b/, /Audio note/i]) {
      expect(testoVisibile(), `anteprima: ${inglese}`).not.toMatch(inglese);
    }
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Riepilogo" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Sezioni iniziali")).toBeInTheDocument();
    controlla("anteprima, riepilogo");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi anteprima" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Editor a campi
    clic("Rilievo bagno nostro", "Modifica");
    await screen.findByText("Modifica modello");
    for (const nome of ["Generale", "Dati iniziali (1)", "Aree", "Elementi (1)", "Foto generali (1)"]) {
      expect(screen.getByRole("tab", { name: nome }), nome).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Nome del modello")).toHaveValue("Rilievo bagno nostro");
    expect(screen.getByLabelText("Nome dell'area al singolare")).toBeInTheDocument();
    controlla("editor, generale");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dati iniziali (1)" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("button", { name: /Dati del cliente/ }));
    const nomiCampi = await screen.findAllByText("Nome");
    expect(nomiCampi.length).toBeGreaterThan(0);
    expect(screen.getAllByText("Testo di esempio nel campo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scelte possibili (una per riga, nel formato codice|nome da mostrare)").length).toBeGreaterThan(0);
    // La chiave tecnica c'è ancora, dentro «Per i tecnici», chiuso.
    const chiave = screen.getAllByText("Chiave tecnica (snake_case, no spazi)")[0];
    const perITecnici = chiave.closest("details") as HTMLDetailsElement;
    expect(perITecnici.querySelector("summary")).toHaveTextContent("Per i tecnici");
    expect(perITecnici.open).toBe(false);
    for (const inglese of [/\bLabel\b/, /\bPlaceholder\b/, /\bHeader\b/]) {
      expect(testoVisibile(), `editor: ${inglese}`).not.toMatch(inglese);
    }
    controlla("editor, dati iniziali");
  });

  it("il dettaglio di un modello di serie dice «Di serie: si può solo copiare» e usa «Sezioni iniziali»", async () => {
    // Con la modifica non c'è la frase di sola lettura, che nomina il permesso «Personalizzazione».
    state.edit = true;
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo Infissi", "Vedi i campi");
    const finestra = within(await screen.findByRole("dialog"));
    expect(finestra.getByText("Di serie: si può solo copiare")).toBeInTheDocument();
    expect(finestra.getByText("Sezioni iniziali (1)")).toBeInTheDocument();
    expect(finestra.getByText("Definizione Stanze")).toBeInTheDocument();
    expect(finestra.getByText("Nome al singolare:")).toBeInTheDocument();
    expect(finestra.getByText("Nome al plurale:")).toBeInTheDocument();
    expect(finestra.getByText("Tipologie elementi (1)")).toBeInTheDocument();
    fireEvent.click(finestra.getByRole("button", { name: /Dati del cliente/ }));
    // Il tipo del campo si legge a parole.
    expect(finestra.getByText("Scelta singola")).toBeInTheDocument();
    expect(finestra.queryByText("select")).toBeNull();
    for (const parola of PAROLE_VIETATE) expect(testoVisibile(), String(parola)).not.toMatch(parola);
  });

  it("i pulsanti dell'elenco hanno le parole nuove e i suggerimenti", async () => {
    state.edit = true;
    apri();
    await screen.findByText("Rilievo Infissi");
    expect(riga("Rilievo Infissi").getByRole("button", { name: "Anteprima" })).toHaveAttribute("title", "Prova il modello come lo vede il tecnico");
    expect(riga("Rilievo Infissi").getByRole("button", { name: "Copia" })).toHaveAttribute("title", "Fai una copia che puoi modificare");
  });
});

describe("Sopralluoghi: la modifica avanzata", () => {
  const apriDettaglio = (onClose = vi.fn(), puoModificare = true) => {
    cliente = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={cliente}>
        <TemplateDetailDialog template={TUO as never} puoModificare={puoModificare} onClose={onClose} />
      </QueryClientProvider>,
    );
    return onClose;
  };
  // Il pulsante «Chiudi» del piede (il primo: la «x» in alto a destra ha lo stesso nome ed è l'ultima).
  const piede = () => screen.getAllByRole("button", { name: "Chiudi" })[0];

  it("senza il permesso di modifica il blocco non c'è, nemmeno per un modello tuo", () => {
    apriDettaglio(vi.fn(), false);
    expect(screen.getByText("Sezioni iniziali (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Modifica avanzata/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Salva modifica avanzata/ })).toBeNull();
  });

  it("ha parole da tecnici dichiarate e non dice «JSON schema»", () => {
    apriDettaglio();
    expect(screen.getByText("Modifica avanzata (solo per tecnici)")).toBeInTheDocument();
    expect(screen.getByText(/Per chi conosce la struttura del modello: modifica direttamente il suo schema \(JSON\)\./)).toBeInTheDocument();
    expect(screen.getByText(/Un errore di sintassi blocca il salvataggio\. Per vedere come è fatto, copia un modello di serie\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva modifica avanzata" })).toBeInTheDocument();
    for (const parola of PAROLE_VIETATE) expect(testoVisibile(), String(parola)).not.toMatch(parola);
  });

  it("salva lo schema e lo dice con «Modifica avanzata salvata»", async () => {
    apriDettaglio();
    const campo = screen.getByRole("textbox", { name: "Schema del modello" });
    fireEvent.change(campo, { target: { value: JSON.stringify({ version: 1, header_schema: [] }) } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifica avanzata" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("Modifica avanzata salvata"));
    expect(state.aggiorna).toHaveBeenCalledWith("t-mio", { schema: { version: 1, header_schema: [] } });
  });

  it("un errore di sintassi non salva niente e lo dice in italiano", async () => {
    apriDettaglio();
    fireEvent.change(screen.getByRole("textbox", { name: "Schema del modello" }), { target: { value: "{ non è un JSON" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifica avanzata" }));
    expect(await screen.findByText(/^Errore di sintassi: controlla virgole, parentesi e virgolette\. Nulla è stato salvato\./)).toBeInTheDocument();
    expect(state.aggiorna).not.toHaveBeenCalled();
    expect(state.toastErr.mock.calls[0][0]).toBe("Modifica avanzata non salvata");
  });

  it("chiudere dopo aver scritto chiede conferma; dopo il salvataggio no", async () => {
    const chiuso = apriDettaglio();
    const campo = screen.getByRole("textbox", { name: "Schema del modello" });
    fireEvent.click(piede());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(chiuso).toHaveBeenCalledTimes(1);

    chiuso.mockClear();
    fireEvent.change(campo, { target: { value: JSON.stringify({ version: 2 }) } });
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(piede());
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(chiuso).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Salva modifica avanzata" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("Modifica avanzata salvata"));
    vi.mocked(window.confirm).mockClear();
    fireEvent.click(piede());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(chiuso).toHaveBeenCalledTimes(1);
  });
});

describe("Sopralluoghi: le finestre non perdono ciò che si è scritto", () => {
  beforeEach(() => { state.edit = true; });

  it("«Nuovo modello» chiude senza chiedere se non si è scritto niente", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("«Nuovo modello» chiede conferma se si è scritto un nome, da «Annulla» come da Esc", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    scrivi("Nome del nuovo modello", "Rilievo cucina");
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Nome del nuovo modello")).toHaveValue("Rilievo cucina");

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("«Nuovo modello» da zero crea il modello vuoto e dice «Modello creato»", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    expect(screen.getByRole("button", { name: "Crea e modifica" })).toBeDisabled();
    scrivi("Nome del nuovo modello", "Rilievo cucina");
    scrivi("Descrizione (facoltativa)", "Cucina su misura");
    fireEvent.click(screen.getByRole("button", { name: "Crea e modifica" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("Modello creato"));
    expect(state.creaVuoto).toHaveBeenCalledWith({ name: "Rilievo cucina", category: "custom", description: "Cucina su misura" });
  });

  it("«Nuovo modello» da uno di serie non si può confermare finché non si sceglie da quale", async () => {
    // La tendina non si apre nei test: Radix Select dentro una finestra rimbalza il focus all'infinito in
    // jsdom con la node_modules installata da npm (vedi la nota sui test che non finiscono).
    apri();
    await screen.findByText("Rilievo Infissi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    fireEvent.click(screen.getByText("Parti da uno di serie"));
    scrivi("Nome del nuovo modello", "Rilievo infissi miei");
    expect(screen.getByRole("button", { name: "Copia e modifica" })).toBeDisabled();
    expect(state.clone).not.toHaveBeenCalled();
  });

  it("«Copia» chiede conferma solo se il nome è stato cambiato", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo Infissi", "Copia");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.confirm).not.toHaveBeenCalled();

    clic("Rilievo Infissi", "Copia");
    scrivi("Nome del nuovo modello", "Il mio rilievo");
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Nome del nuovo modello")).toHaveValue("Il mio rilievo");
  });

  it("«Copia e crea» copia il modello e lo dice a parole", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo Infissi", "Copia");
    fireEvent.click(screen.getByRole("button", { name: "Copia e crea" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("Modello copiato: ora puoi personalizzarlo"));
    expect(state.clone).toHaveBeenCalledWith("t-infissi", "Copia di Rilievo Infissi");
  });

  it("l'editor a campi chiede conferma solo se qualcosa è cambiato rispetto a quando si è aperto", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo bagno nostro", "Modifica");
    await screen.findByText("Modifica modello");
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByText("Modifica modello")).toBeNull());
    expect(window.confirm).not.toHaveBeenCalled();

    clic("Rilievo bagno nostro", "Modifica");
    await screen.findByText("Modifica modello");
    scrivi("Nome del modello", "Rilievo bagno nuovo");
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Modifica modello")).toBeInTheDocument();

    // Rimettere il nome com'era non è una modifica.
    scrivi("Nome del modello", "Rilievo bagno nostro");
    vi.mocked(window.confirm).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(screen.queryByText("Modifica modello")).toBeNull());
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("l'editor a campi salva e dice «Modello salvato»", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo bagno nostro", "Modifica");
    await screen.findByText("Modifica modello");
    scrivi("Nome del modello", "Rilievo bagno nuovo");
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("Modello salvato"));
    expect(state.aggiorna).toHaveBeenCalledTimes(1);
    expect(state.aggiorna.mock.calls[0][0]).toBe("t-mio");
    expect(state.aggiorna.mock.calls[0][1]).toMatchObject({ name: "Rilievo bagno nuovo", category: "bagno" });
    await waitFor(() => expect(screen.queryByText("Modifica modello")).toBeNull());
  });

  it("l'editor a campi non mostra il testo del database se il salvataggio fallisce", async () => {
    state.aggiorna.mockRejectedValue(new Error("Aggiornamento template fallito: new row violates row-level security policy"));
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo bagno nostro", "Modifica");
    await screen.findByText("Modifica modello");
    fireEvent.click(screen.getByRole("button", { name: "Salva modello" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][0]).toBe("Modello non salvato");
    expect(state.toastErr.mock.calls[0][1].description).toBe("Non hai i permessi per questa operazione. Contatta l'amministratore.");
  });

  it("una copia che fallisce non mostra il testo del database né la parola «template»", async () => {
    state.clone.mockRejectedValue(new Error("Clonazione template fallita"));
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo Infissi", "Copia");
    fireEvent.click(screen.getByRole("button", { name: "Copia e crea" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][0]).toBe("Copia non riuscita");
    expect(state.toastErr.mock.calls[0][1].description).toBe("Non sono riuscito a copiare il modello. Riprova.");
    // La finestra resta aperta, con il nome scritto: si può riprovare.
    expect(screen.getByLabelText("Nome del nuovo modello")).toHaveValue("Copia di Rilievo Infissi");
  });

  it("un modello nuovo che non si crea dice perché, in italiano", async () => {
    state.creaVuoto.mockRejectedValue(new Error("Creazione template fallita: duplicate key value violates unique constraint"));
    apri();
    await screen.findByText("Rilievo Infissi");
    fireEvent.click(screen.getByRole("button", { name: "Nuovo modello" }));
    scrivi("Nome del nuovo modello", "Rilievo cucina");
    fireEvent.click(screen.getByRole("button", { name: "Crea e modifica" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][0]).toBe("Modello non creato");
    expect(state.toastErr.mock.calls[0][1].description).toBe("Esiste già un elemento con questi dati. Controlla e riprova.");
  });

  it("eliminare un modello dice «Modello eliminato»", async () => {
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo bagno nostro", "Elimina");
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.toastOk).toHaveBeenCalledWith("Modello eliminato"));
    expect(state.elimina).toHaveBeenCalledWith("t-mio");
  });

  it("un modello già usato non si elimina e il motivo è in italiano, senza «template» né «rilievi»", async () => {
    state.elimina.mockRejectedValue(new Error("Il template è usato da 3 rilievi: finché esistono non si può eliminare."));
    apri();
    await screen.findByText("Rilievo Infissi");
    clic("Rilievo bagno nostro", "Elimina");
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.toastErr).toHaveBeenCalled());
    expect(state.toastErr.mock.calls[0][0]).toBe("Modello non eliminato");
    expect(state.toastErr.mock.calls[0][1].description).toBe(
      "Questo modello è già stato usato in 3 sopralluoghi: finché esistono non si può eliminare.",
    );
  });
});

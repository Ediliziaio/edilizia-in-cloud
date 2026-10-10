/**
 * Impostazioni → Listino → Kit e pacchetti (10/10/2026).
 *
 * La pagina diceva tre volte «bundle» e una «template», mostrava quattro riquadri di totali che i tre pulsanti
 * già ripetevano, chiamava «Famiglia», «Prodotto» e «Tariffa» le tre voci con nomi che il Listino non usa, lasciava
 * spento per tutti il pulsante dei pacchetti di esempio (che servono ai soli serramentisti) e mostrava inglese
 * tecnico negli errori. Qui si fissa com'è adesso: parole, ordine dell'elenco, nomi dei comandi, errori in italiano,
 * sola lettura onesta. Database finto, componenti veri.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsBundle from "@/pages/azienda/settings/SettingsBundle";
import { traduciErrorePostgrest } from "@/lib/userErrorMessage";

type Riga = Record<string, unknown>;

const state = vi.hoisted(() => ({
  vertical: "serramentista" as string,
  fvModulo: false,
  isAdmin: true,
  canEdit: false,
  bundles: [] as Riga[],
  bundlesError: null as unknown,
  writeError: null as unknown,
  uploadError: null as unknown,
  writes: [] as { table: string; op: string; value: unknown; filtri: unknown[][] }[],
  famiglie: [] as Riga[],
  invoke: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  avvisoGenerico: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "company-1", vertical: state.vertical }, role: "company_admin" }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: state.isAdmin, canEditSettingsBundle: state.canEdit }),
}));
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: () => ({ isEnabled: state.fvModulo }) }));
vi.mock("@/hooks/useFamilies", () => ({ useFamilies: () => ({ families: state.famiglie }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...argomenti: unknown[]) => state.invoke(...argomenti) },
    storage: {
      from: () => ({
        upload: async () => ({ error: state.uploadError }),
        getPublicUrl: () => ({ data: { publicUrl: "https://esempio.test/foto.jpg" } }),
      }),
    },
    from: (table: string) => {
      let op = "select";
      const filtri: unknown[][] = [];
      const risposta = () => {
        if (op === "select") {
          if (table === "bundle_prodotti") {
            return { data: state.bundlesError ? (null as unknown) : state.bundles, error: state.bundlesError };
          }
          if (table === "article_templates") {
            return {
              data: [{ id: "art-1", name: "Rubinetto", unit_of_measure: "pz", unit_price: 10, prezzo_vendita: 12, immagine_url: null as unknown }],
              error: null as unknown,
            };
          }
          if (table === "tariffe_aziendali") {
            return {
              data: [{ id: "tar-1", nome: "Posa in opera", prezzo_vendita: 50, unita: "h", unita_fatturazione: "h" }],
              error: null as unknown,
            };
          }
        }
        if (state.writeError) return { data: null as unknown, error: state.writeError };
        if (op === "insert") {
          return { data: table === "bundle_voci" ? [{ id: "voce-nuova" }] : { id: "bundle-nuovo" }, error: null as unknown };
        }
        return { data: null as unknown, error: null as unknown };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        not: (...argomenti: unknown[]) => { filtri.push(["not", ...argomenti]); return builder; },
        eq: (...argomenti: unknown[]) => { filtri.push(["eq", ...argomenti]); return builder; },
        insert: (value: unknown) => { op = "insert"; state.writes.push({ table, op, value, filtri }); return builder; },
        update: (value: unknown) => { op = "update"; state.writes.push({ table, op, value, filtri }); return builder; },
        delete: () => { op = "delete"; state.writes.push({ table, op, value: null as unknown, filtri }); return builder; },
        single: async () => risposta(),
        then: (resolve: (v: ReturnType<typeof risposta>) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(risposta()).then(resolve, reject),
      };
      return builder;
    },
  },
}));

// ── dati ─────────────────────────────────────────────────────────────────────
const kit = (extra: Riga = {}): Riga => ({
  id: "b1", company_id: "company-1", nome: "Kit A", descrizione: null as unknown, sconto_bundle_pct: 0, attivo: true,
  vertical: "fotovoltaico", tipo_lavoro: "nuova", is_template: false,
  fv_kwp: 3, fv_accumulo_kwh: 0, prezzo_offerta: 9000, cover_image_url: null as unknown, created_at: "2026-10-01",
  voci: [] as Riga[],
  ...extra,
});
const voce = (extra: Riga): Riga => ({
  id: "v?", bundle_id: "b1", prodotto_id: null as unknown, tariffa_id: null as unknown, family_id: null as unknown,
  axis_selections: {} as Riga, larghezza_mm_default: null as unknown, altezza_mm_default: null as unknown,
  vano_label: null as unknown, quantita: 1, sort_order: 0, immagine_url: null as unknown,
  ...extra,
});
/** Tre kit in ordine alfabetico (come li dà il database) e un pacchetto senza potenza né prezzo. Potenza e prezzo vanno in ordine diverso. */
const quattroPacchetti = (): Riga[] => [
  kit({ id: "b1", nome: "Kit A", fv_kwp: 3, prezzo_offerta: 9000, tipo_lavoro: "nuova" }),
  kit({ id: "b2", nome: "Kit B", fv_kwp: 6, prezzo_offerta: 7000, tipo_lavoro: "sostituzione" }),
  kit({ id: "b3", nome: "Kit C", fv_kwp: 10, prezzo_offerta: 12000, attivo: false, tipo_lavoro: null as unknown }),
  kit({ id: "b4", nome: "Solo voci", fv_kwp: null as unknown, prezzo_offerta: null as unknown, tipo_lavoro: "ristrutturazione" }),
];
const pacchettoConVoci = (): Riga => kit({
  id: "b9", nome: "Bilocale", fv_kwp: null as unknown, prezzo_offerta: null as unknown, tipo_lavoro: "sostituzione",
  voci: [
    voce({ id: "v1", bundle_id: "b9", family_id: "fam-1", vano_label: "Camera", larghezza_mm_default: 800, altezza_mm_default: 1400, sort_order: 0 }),
    voce({ id: "v2", bundle_id: "b9", prodotto_id: "art-1", quantita: 2, sort_order: 1 }),
    voce({ id: "v3", bundle_id: "b9", tariffa_id: "tar-1", sort_order: 2 }),
  ],
});

function apri() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    // Come in App.tsx: una mutation che non si dichiara `silent` fa comparire anche l'avviso generico dell'app.
    mutationCache: new MutationCache({
      onError: (_errore, _variabili, _contesto, mutation) => {
        if (!(mutation.meta as { silent?: boolean } | undefined)?.silent) state.avvisoGenerico();
      },
    }),
  });
  return render(
    <QueryClientProvider client={client}>
      <SettingsBundle />
    </QueryClientProvider>,
  );
}
const nomiInTabella = () =>
  screen.getAllByRole("row").slice(1).map((riga) => within(riga).getAllByRole("cell")[0].textContent);
/** «Nome *»: l'asterisco è nascosto ai lettori di schermo, il nome del campo è «Nome». */
const campoNome = (radice: HTMLElement) => within(radice).getByRole("textbox", { name: "Nome" });
const intestazione = (nome: string) => screen.getByRole("columnheader", { name: nome });
/** Tutto quello che l'utente legge o sente: testi e attributi che li sostituiscono. */
function testiVisibili(): string {
  const attributi = Array.from(document.body.querySelectorAll("[title],[aria-label],[placeholder],[alt]")).flatMap((el) =>
    ["title", "aria-label", "placeholder", "alt"].map((a) => el.getAttribute(a) ?? ""),
  );
  return [document.body.textContent ?? "", ...attributi].join(" | ");
}
async function conElenco(righe: Riga[] = quattroPacchetti()) {
  state.bundles = righe;
  apri();
  await screen.findByRole("table", { name: "Elenco dei pacchetti" });
}
const scrittureDi = (table: string, op: string) => state.writes.filter((w) => w.table === table && w.op === op);

beforeEach(() => {
  state.vertical = "serramentista";
  state.fvModulo = false;
  state.isAdmin = true;
  state.canEdit = false;
  state.bundles = [];
  state.bundlesError = null;
  state.writeError = null;
  state.uploadError = null;
  state.writes.length = 0;
  state.famiglie = [{
    id: "fam-1", nome: "Finestra 1 anta", immagine_url: null as unknown,
    axes: [{ id: "ax-1", codice: "colore", nome: "Colore", values: [{ id: "val-1", valore: "bianco", label: "Bianco" }] }],
  }];
  state.invoke.mockReset();
  state.success.mockClear();
  state.error.mockClear();
  state.avvisoGenerico.mockClear();
});
afterEach(() => cleanup());

describe("Kit e pacchetti: le parole e il titolo", () => {
  it("non ripete il titolo del layout e non dice mai «bundle», «template» o «wizard»", async () => {
    state.fvModulo = true;
    await conElenco();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.queryByText(/Bundle & Pacchetti/i)).toBeNull();
    expect(testiVisibili()).not.toMatch(/bundle|template|wizard|upload|toggle|preset|opzional/i);
    expect(screen.getByRole("button", { name: "Nuovo pacchetto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Installa 5 pacchetti di esempio" })).toBeInTheDocument();
  });

  it("anche la finestra del pacchetto, coi suoi comandi, parla di pacchetti e dei tre tipi di voce col nome del Listino", async () => {
    state.fvModulo = true;
    await conElenco();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo pacchetto" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("Nuovo pacchetto")).toBeInTheDocument();
    expect(within(finestra).getByRole("button", { name: "Crea pacchetto" })).toBeInTheDocument();
    expect(testiVisibili()).not.toMatch(/bundle|template|wizard|famiglia|tariffa|preset|opzional|default|upload|toggle|fase 5|magazzino|marginalit|☀/i);
    expect(within(finestra).getByRole("button", { name: "Prodotto del listino" })).toBeInTheDocument();
    expect(within(finestra).getByRole("button", { name: "Articolo" })).toBeInTheDocument();
    expect(within(finestra).getByRole("button", { name: "Manodopera e servizi" })).toBeInTheDocument();
    for (const vecchio of ["Famiglia", "Prodotto", "Tariffa"]) {
      expect(within(finestra).queryByRole("button", { name: vecchio })).toBeNull();
    }
    expect(within(finestra).getByLabelText("Attivo: si può scegliere nel preventivo")).toBeInTheDocument();
  });

  it("il blocco del kit fotovoltaico dice quello che il preventivatore fotovoltaico fa davvero", async () => {
    state.fvModulo = true;
    await conElenco();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo pacchetto" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("Kit fotovoltaico")).toBeInTheDocument();
    expect(within(finestra).getByText(/Taglia e prezzo d'offerta del kit: il preventivatore fotovoltaico li usa quando scegli questo kit\. Le voci qui sotto sono facoltative/)).toBeInTheDocument();
  });

  it("chi non fa fotovoltaico non vede il blocco del kit e nemmeno le colonne di potenza e prezzo", async () => {
    await conElenco([pacchettoConVoci()]);
    expect(screen.queryByRole("columnheader", { name: "Potenza" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Prezzo offerta" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo pacchetto" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).queryByText("Kit fotovoltaico")).toBeNull();
  });
});

describe("Kit e pacchetti: i numeri stanno nei pulsanti, non in quattro riquadri", () => {
  it("non ci sono i riquadri Totali / Attivi / Disattivi / Voci totali; i tre pulsanti hanno i numeri e filtrano", async () => {
    await conElenco();
    expect(screen.queryByText("Voci totali")).toBeNull();
    expect(screen.queryByText("Totali")).toBeNull();
    const tutti = screen.getByRole("button", { name: "Tutti (4)" });
    const attivi = screen.getByRole("button", { name: "Attivi (3)" });
    const disattivi = screen.getByRole("button", { name: "Disattivi (1)" });
    expect(tutti).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(disattivi);
    expect(disattivi).toHaveAttribute("aria-pressed", "true");
    expect(tutti).toHaveAttribute("aria-pressed", "false");
    expect(nomiInTabella()).toEqual(["Kit C"]);
    fireEvent.click(attivi);
    expect(nomiInTabella()).toEqual(["Kit A", "Kit B", "Solo voci"]);
  });
});

describe("Kit e pacchetti: l'ordine dell'elenco", () => {
  it("un clic su «Potenza» ordina per kWp, il secondo inverte, il terzo torna all'ordine per nome; senza potenza resta in fondo", async () => {
    state.fvModulo = true;
    // il database li dà per nome: qui in ordine inverso di potenza, per vedere che l'ordine lo fa la pagina
    await conElenco([
      kit({ id: "b2", nome: "Kit B", fv_kwp: 10 }),
      kit({ id: "b3", nome: "Kit C", fv_kwp: 3 }),
      kit({ id: "b1", nome: "Kit D", fv_kwp: 6 }),
      kit({ id: "b4", nome: "Kit E", fv_kwp: null as unknown, prezzo_offerta: null as unknown }),
    ]);
    expect(nomiInTabella()).toEqual(["Kit B", "Kit C", "Kit D", "Kit E"]);
    expect(intestazione("Potenza")).toHaveAttribute("aria-sort", "none");
    fireEvent.click(within(intestazione("Potenza")).getByRole("button", { name: "Potenza" }));
    expect(nomiInTabella()).toEqual(["Kit C", "Kit D", "Kit B", "Kit E"]);
    expect(intestazione("Potenza")).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(within(intestazione("Potenza")).getByRole("button", { name: "Potenza" }));
    expect(nomiInTabella()).toEqual(["Kit B", "Kit D", "Kit C", "Kit E"]);
    expect(intestazione("Potenza")).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(within(intestazione("Potenza")).getByRole("button", { name: "Potenza" }));
    expect(nomiInTabella()).toEqual(["Kit B", "Kit C", "Kit D", "Kit E"]);
    expect(intestazione("Potenza")).toHaveAttribute("aria-sort", "none");
  });

  it("«Prezzo offerta» ordina per prezzo, e cambiare colonna spegne l'indicazione dell'altra", async () => {
    state.fvModulo = true;
    await conElenco(); // potenza: A 3, B 6, C 10 — prezzo: B 7.000, A 9.000, C 12.000
    fireEvent.click(within(intestazione("Prezzo offerta")).getByRole("button", { name: "Prezzo offerta" }));
    expect(nomiInTabella()).toEqual(["Kit B", "Kit A", "Kit C", "Solo voci"]);
    expect(intestazione("Prezzo offerta")).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(within(intestazione("Potenza")).getByRole("button", { name: "Potenza" }));
    expect(nomiInTabella()).toEqual(["Kit A", "Kit B", "Kit C", "Solo voci"]);
    expect(intestazione("Prezzo offerta")).toHaveAttribute("aria-sort", "none");
    expect(intestazione("Potenza")).toHaveAttribute("aria-sort", "ascending");
  });

  it("il prezzo ha i punti dei migliaia e dice «+ IVA»; la potenza dice kWp", async () => {
    state.fvModulo = true;
    await conElenco();
    const riga = screen.getAllByRole("row")[1]; // Kit A
    expect(riga.textContent).toMatch(/3\skWp/);
    expect(riga.textContent).toMatch(/9\.000\s€\s\+\sIVA/);
  });

  it("la ricerca trova anche col nome italiano del tipo di lavoro («installazione» trova «Nuova installazione»)", async () => {
    await conElenco();
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca un pacchetto" }), { target: { value: "installazione" } });
    expect(nomiInTabella()).toEqual(["Kit A"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca un pacchetto" }), { target: { value: "zzz" } });
    expect(screen.getByText("Nessun pacchetto corrisponde ai filtri attuali.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    expect(nomiInTabella()).toHaveLength(4);
  });
});

describe("Kit e pacchetti: il tipo di lavoro si legge in italiano", () => {
  it("la tabella mostra «Nuova installazione», «Sostituzione», «Ristrutturazione», non le chiavi del database", async () => {
    await conElenco();
    const righe = screen.getAllByRole("row").slice(1);
    expect(within(righe[0]).getByText("Nuova installazione")).toBeInTheDocument();
    expect(within(righe[1]).getByText("Sostituzione")).toBeInTheDocument();
    expect(within(righe[3]).getByText("Ristrutturazione")).toBeInTheDocument();
    expect(screen.queryByText("nuova")).toBeNull();
    expect(screen.queryByText("sostituzione")).toBeNull();
    expect(screen.queryByText("ristrutturazione")).toBeNull();
  });
});

describe("Kit e pacchetti: pacchetti di esempio solo per i serramentisti", () => {
  it("per chi non ha Serramenti come settore il pulsante non c'è (non resta spento)", async () => {
    for (const settore of ["fotovoltaico", "generico", "bagno"]) {
      state.vertical = settore;
      state.bundles = [];
      const { unmount } = apri();
      await screen.findByText("Nessun pacchetto ancora creato.");
      expect(screen.queryByText(/Installa 5/)).toBeNull();
      expect(screen.getByText("Crea un pacchetto a mano.")).toBeInTheDocument();
      unmount();
    }
  });

  it("per un serramentista c'è, lo scrive nella pagina vuota, e installa mandando azienda e settore", async () => {
    state.invoke.mockResolvedValue({ data: { bundles_creati: 5, voci_create: 12, saltati: [] as string[] }, error: null as unknown });
    apri();
    await screen.findByText("Nessun pacchetto ancora creato.");
    expect(screen.getByText("Crea un pacchetto a mano oppure installa i 5 pacchetti di esempio.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Installa 5 pacchetti di esempio" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.invoke).toHaveBeenCalledWith("installa-bundle-template", { body: { company_id: "company-1", vertical: "serramentista" } });
    expect(state.success).toHaveBeenCalledWith("Installati 5 pacchetti di esempio (12 voci).");
  });

  it("dice quanti ne ha saltati e perché; se c'erano già tutti lo dice", async () => {
    state.invoke.mockResolvedValueOnce({ data: { bundles_creati: 3, voci_create: 6, saltati: ["bundle-esistente:A", "voce-no-famiglia:B → Zanzariera"] }, error: null as unknown });
    apri();
    await screen.findByText("Nessun pacchetto ancora creato.");
    fireEvent.click(screen.getByRole("button", { name: "Installa 5 pacchetti di esempio" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    expect(state.success.mock.calls[0][0]).toBe("Installati 3 pacchetti di esempio (6 voci). 2 saltati: già presenti o senza il prodotto nel listino.");
    state.invoke.mockResolvedValueOnce({ data: { bundles_creati: 0, voci_create: 0, saltati: ["bundle-esistente:A"] }, error: null as unknown });
    fireEvent.click(screen.getByRole("button", { name: "Installa 5 pacchetti di esempio" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(2));
    expect(state.success.mock.calls[1][0]).toBe("I pacchetti di esempio c'erano già: non ho aggiunto niente.");
  });

  it("se l'installazione non riesce l'avviso è in italiano, senza il testo tecnico della funzione", async () => {
    state.invoke.mockResolvedValue({ data: null as unknown, error: { message: "Edge Function returned a non-2xx status code" } });
    apri();
    await screen.findByText("Nessun pacchetto ancora creato.");
    fireEvent.click(screen.getByRole("button", { name: "Installa 5 pacchetti di esempio" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Installazione non riuscita", { description: "Riprova tra poco." });
    expect(JSON.stringify(state.error.mock.calls)).not.toMatch(/Edge Function|non-2xx/);
    // e non si aggiunge l'avviso generico di App.tsx: l'esito lo dice già la pagina (un solo avviso, non due)
    expect(state.avvisoGenerico).not.toHaveBeenCalled();
  });
});

describe("Kit e pacchetti: interruttori e pulsanti con un nome, bersagli da telefono", () => {
  it("l'interruttore «Stato» ha il nome del pacchetto, e cambiato scrive solo lo stato", async () => {
    await conElenco();
    const interruttore = screen.getByRole("switch", { name: "Attivo: Kit A" });
    expect(interruttore).toBeChecked();
    fireEvent.click(interruttore);
    await waitFor(() => expect(scrittureDi("bundle_prodotti", "update")).toHaveLength(1));
    expect(scrittureDi("bundle_prodotti", "update")[0].value).toEqual({ attivo: false });
    expect(scrittureDi("bundle_prodotti", "update")[0].filtri).toContainEqual(["eq", "id", "b1"]);
  });

  it("Duplica, Modifica ed Elimina dicono quale pacchetto toccano", async () => {
    await conElenco();
    expect(screen.getByRole("button", { name: "Duplica il pacchetto Kit B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modifica il pacchetto Kit B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimina il pacchetto Kit B" })).toBeInTheDocument();
  });

  it("l'area di tocco dell'interruttore supera i 44 px da telefono, e nessun pulsante della pagina si sottrae alla regola dei 44 px", async () => {
    await conElenco();
    expect(screen.getByRole("switch", { name: "Attivo: Kit A" }).className).toMatch(/max-md:before:-inset-y-3/);
    for (const pulsante of screen.getAllByRole("button")) {
      expect(pulsante.className, pulsante.textContent ?? "").not.toMatch(/tap-compact/);
    }
  });

  it("la tabella sta in un contenitore che scorre di lato e ha una larghezza minima: a 375 px non si schiaccia", async () => {
    await conElenco();
    const tabella = screen.getByRole("table", { name: "Elenco dei pacchetti" });
    expect(tabella.parentElement?.className).toMatch(/overflow-auto/);
    expect(tabella.className).toMatch(/min-w-\[\d+px\]/);
  });
});

describe("Kit e pacchetti: la finestra del pacchetto", () => {
  it("ogni campo ha un'etichetta collegata (prima 1 su 15)", async () => {
    state.fvModulo = true;
    await conElenco([pacchettoConVoci()]);
    fireEvent.click(screen.getByRole("button", { name: "Modifica il pacchetto Bilocale" }));
    const finestra = await screen.findByRole("dialog");
    const campi = Array.from(finestra.querySelectorAll<HTMLElement>('input:not([type="file"]), textarea, button[role="combobox"]'));
    // nome, descrizione, tipo, sconto, 3 campi del kit + 3 voci (scelta, quantità, vano) + misure e colore della prima = 17
    expect(campi.length).toBeGreaterThanOrEqual(15);
    const senzaNome = campi.filter((campo) => {
      const etichette = Array.from((campo as HTMLInputElement).labels ?? []);
      return !campo.getAttribute("aria-label") && etichette.every((e) => !e.textContent?.trim());
    });
    expect(senzaNome.map((c) => c.outerHTML)).toEqual([]);
    // e si raggiungono per nome
    expect(campoNome(finestra)).toBeInTheDocument();
    for (const nome of ["Descrizione", "Tipo di lavoro", "Sconto del pacchetto (%)", "Potenza (kWp)", "Accumulo (kWh)", "Prezzo offerta (€, IVA esclusa)"]) {
      expect(within(finestra).getByLabelText(nome), nome).toBeInTheDocument();
    }
    const prima = within(finestra).getByRole("group", { name: "Voce 1: Prodotto del listino" });
    for (const nome of ["Prodotto del listino", "Quantità", "Vano (facoltativo)", "Larghezza di partenza (mm)", "Altezza di partenza (mm)", "Colore"]) {
      expect(within(prima).getByLabelText(nome), nome).toBeInTheDocument();
    }
  });

  it("le voci hanno il nome dei tipi del Listino e il pulsante per toglierle dice quale voce toglie", async () => {
    await conElenco([pacchettoConVoci()]);
    fireEvent.click(screen.getByRole("button", { name: "Modifica il pacchetto Bilocale" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByRole("group", { name: "Voce 1: Prodotto del listino" })).toBeInTheDocument();
    expect(within(finestra).getByRole("group", { name: "Voce 2: Articolo" })).toBeInTheDocument();
    expect(within(finestra).getByRole("group", { name: "Voce 3: Manodopera e servizi" })).toBeInTheDocument();
    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina la voce 2" }));
    expect(within(finestra).queryByRole("group", { name: /Articolo/ })).toBeNull();
    expect(within(finestra).getByRole("group", { name: "Voce 2: Manodopera e servizi" })).toBeInTheDocument();
  });

  it("aggiungendo una voce vuota il segnaposto dice cosa scegliere, con le parole del Listino", async () => {
    await conElenco([pacchettoConVoci()]);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo pacchetto" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText(/Nessuna voce\. Aggiungi un prodotto del listino, un articolo o una voce di manodopera e servizi\./)).toBeInTheDocument();
    fireEvent.click(within(finestra).getByRole("button", { name: "Prodotto del listino" }));
    fireEvent.click(within(finestra).getByRole("button", { name: "Articolo" }));
    fireEvent.click(within(finestra).getByRole("button", { name: "Manodopera e servizi" }));
    expect(within(finestra).getByText("Scegli il prodotto del listino")).toBeInTheDocument();
    expect(within(finestra).getByText("Scegli l'articolo")).toBeInTheDocument();
    expect(within(finestra).getByText("Scegli la voce di manodopera o servizi")).toBeInTheDocument();
  });

  it("il pulsante di salvataggio, se è spento, dice perché", async () => {
    await conElenco([pacchettoConVoci()]);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo pacchetto" }));
    const finestra = await screen.findByRole("dialog");
    const salva = within(finestra).getByRole("button", { name: "Crea pacchetto" });
    expect(salva).toBeDisabled();
    expect(within(finestra).getByText("Scrivi il nome del pacchetto.")).toBeInTheDocument();
    expect(salva).toHaveAccessibleDescription("Scrivi il nome del pacchetto.");
    fireEvent.change(campoNome(finestra), { target: { value: "   " } });
    expect(within(finestra).getByText("Scrivi il nome del pacchetto.")).toBeInTheDocument(); // solo spazi: è ancora vuoto
    fireEvent.change(campoNome(finestra), { target: { value: "Prova" } });
    expect(within(finestra).getByText("Aggiungi almeno una voce.")).toBeInTheDocument();
    fireEvent.click(within(finestra).getByRole("button", { name: "Articolo" }));
    expect(within(finestra).getByText("Scegli cosa va in ogni voce.")).toBeInTheDocument();
    expect(salva).toBeDisabled();
  });

  it("un kit fotovoltaico con la potenza ma senza prezzo non si salva, e la finestra dice quale prezzo manca", async () => {
    state.fvModulo = true;
    await conElenco();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo pacchetto" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.change(campoNome(finestra), { target: { value: "Kit 5 kWp" } });
    fireEvent.change(within(finestra).getByLabelText("Potenza (kWp)"), { target: { value: "5" } });
    expect(within(finestra).getByText("Scrivi il prezzo d'offerta del kit: senza, nel preventivo andrebbe a 0 €.")).toBeInTheDocument();
    expect(within(finestra).getByRole("button", { name: "Crea pacchetto" })).toBeDisabled();
    fireEvent.change(within(finestra).getByLabelText("Prezzo offerta (€, IVA esclusa)"), { target: { value: "6500" } });
    expect(within(finestra).getByRole("button", { name: "Crea pacchetto" })).toBeEnabled();
  });

  it("crea un kit fotovoltaico con potenza e prezzo e nessuna voce, e dice «Pacchetto creato»", async () => {
    state.fvModulo = true;
    await conElenco();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo pacchetto" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.change(campoNome(finestra), { target: { value: "  Kit 5 kWp  " } });
    fireEvent.change(within(finestra).getByLabelText("Potenza (kWp)"), { target: { value: "5" } });
    fireEvent.change(within(finestra).getByLabelText("Prezzo offerta (€, IVA esclusa)"), { target: { value: "6500" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea pacchetto" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Pacchetto creato"));
    const [scrittura] = scrittureDi("bundle_prodotti", "insert");
    expect(scrittura.value).toMatchObject({ company_id: "company-1", nome: "Kit 5 kWp", fv_kwp: 5, prezzo_offerta: 6500, attivo: true, vertical: "serramentista" });
    expect(scrittureDi("bundle_voci", "insert")).toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("salvando un pacchetto con voci riscrive le voci intere, nello stesso ordine, e dice «Pacchetto aggiornato»", async () => {
    await conElenco([pacchettoConVoci()]);
    fireEvent.click(screen.getByRole("button", { name: "Modifica il pacchetto Bilocale" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.change(campoNome(finestra), { target: { value: "Bilocale standard" } });
    const salva = within(finestra).getByRole("button", { name: "Salva modifiche" });
    expect(salva).toBeEnabled();
    fireEvent.click(salva);
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Pacchetto aggiornato"));
    const [master] = scrittureDi("bundle_prodotti", "update");
    expect(master.value).toMatchObject({ nome: "Bilocale standard", tipo_lavoro: "sostituzione" });
    expect(master.filtri).toContainEqual(["eq", "id", "b9"]);
    const [voci] = scrittureDi("bundle_voci", "insert");
    expect((voci.value as Riga[]).map((v) => [v.family_id, v.prodotto_id, v.tariffa_id, v.quantita, v.vano_label])).toEqual([
      ["fam-1", null, null, 1, "Camera"],
      [null, "art-1", null, 2, null],
      [null, null, "tar-1", 1, null],
    ]);
  });

  it("su telefono la finestra non fissa 90vh (copre la barra di Safari) e i pulsanti per aggiungere voci vanno a capo", async () => {
    await conElenco();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo pacchetto" }));
    const finestra = await screen.findByRole("dialog");
    expect(finestra.className).not.toMatch(/max-h-\[90vh\]/);
    expect(within(finestra).getByRole("group", { name: "Aggiungi:" }).className).toMatch(/flex-wrap/);
  });
});

describe("Kit e pacchetti: gli errori si leggono in italiano", () => {
  async function salvaConErrore(errore: unknown) {
    await conElenco([pacchettoConVoci()]);
    fireEvent.click(screen.getByRole("button", { name: "Modifica il pacchetto Bilocale" }));
    const finestra = await screen.findByRole("dialog");
    state.writeError = errore;
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    return state.error.mock.calls[0] as [string, { description: string }];
  }

  it("un permesso negato dal database: nel browser il messaggio inglese arriva già tradotto dal client, e la frase non si perde", async () => {
    // Come in produzione: il client Supabase riscrive il corpo dell'errore prima che l'hook lo legga.
    const comeArrivaDalClient = traduciErrorePostgrest({ message: 'new row violates row-level security policy for table "bundle_prodotti"', code: "42501" });
    expect(comeArrivaDalClient).toMatchObject({ message: "Non hai i permessi per questa operazione. Contatta l'amministratore." });
    const [titolo, opzioni] = await salvaConErrore(comeArrivaDalClient);
    expect(titolo).toBe("Salvataggio non riuscito");
    expect(opzioni.description).toBe("Non hai i permessi per questa operazione. Contatta l'amministratore.");
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // la finestra resta aperta, le modifiche non si perdono
  });

  it("lo stesso permesso negato, se arriva ancora in inglese, è tradotto lo stesso", async () => {
    const [, opzioni] = await salvaConErrore({ message: 'new row violates row-level security policy for table "bundle_prodotti"', code: "42501" });
    expect(opzioni.description).toBe("Non hai i permessi per questa operazione. Contatta l'amministratore.");
  });

  it("un valore duplicato o non valido, già tradotto dal client, si legge com'è", async () => {
    const duplicato = traduciErrorePostgrest({ message: 'duplicate key value violates unique constraint "bundle_prodotti_nome_key"', code: "23505" });
    const [, opzioni] = await salvaConErrore(duplicato);
    expect(opzioni.description).toBe("Esiste già un elemento con questi dati. Controlla e riprova.");
  });

  it("la rete che manca", async () => {
    const [, opzioni] = await salvaConErrore({ message: "TypeError: Failed to fetch" });
    expect(opzioni.description).toBe("Connessione persa. Controlla la rete e riprova.");
  });

  it("un errore che nessuno riconosce non arriva a schermo com'è", async () => {
    const [, opzioni] = await salvaConErrore({ message: "column bundle_prodotti.xyz does not exist" });
    expect(opzioni.description).toBe("Controlla i dati e riprova tra poco.");
    expect(JSON.stringify(state.error.mock.calls)).not.toMatch(/column|does not exist|bundle_prodotti/);
  });

  it("eliminare e cambiare lo stato: titolo suo, motivo in italiano", async () => {
    await conElenco();
    state.writeError = { message: "Failed to fetch" };
    fireEvent.click(screen.getByRole("switch", { name: "Attivo: Kit A" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Cambio di stato non riuscito", { description: "Connessione persa. Controlla la rete e riprova." }));
    fireEvent.click(screen.getByRole("button", { name: "Elimina il pacchetto Kit B" }));
    const conferma = await screen.findByRole("alertdialog");
    expect(within(conferma).getByText("Elimina pacchetto")).toBeInTheDocument();
    expect(within(conferma).getByText(/Vuoi eliminare il pacchetto .Kit B.\? Non si può annullare\. Se vuoi solo metterlo da parte, disattivalo\./)).toBeInTheDocument();
    fireEvent.click(within(conferma).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Eliminazione non riuscita", { description: "Connessione persa. Controlla la rete e riprova." }));
  });

  it("eliminare un pacchetto: «Pacchetto eliminato»", async () => {
    await conElenco();
    fireEvent.click(screen.getByRole("button", { name: "Elimina il pacchetto Kit B" }));
    const conferma = await screen.findByRole("alertdialog");
    fireEvent.click(within(conferma).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Pacchetto eliminato"));
    expect(scrittureDi("bundle_prodotti", "delete")[0].filtri).toContainEqual(["eq", "id", "b2"]);
  });

  it("il caricamento della copertina che non riesce non dice «Upload fallito»", async () => {
    state.fvModulo = true;
    await conElenco();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo pacchetto" }));
    const finestra = await screen.findByRole("dialog");
    state.uploadError = new Error("Failed to fetch");
    const file = new File(["x"], "copertina.jpg", { type: "image/jpeg" });
    const campoFile = finestra.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(campoFile, { target: { files: [file] } });
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error).toHaveBeenCalledWith("Caricamento non riuscito", { description: "Connessione persa. Controlla la rete e riprova." });
  });
});

describe("Kit e pacchetti: non si legge l'elenco, e chi può solo consultare", () => {
  it("se i pacchetti non si leggono lo dice e offre «Riprova», invece di far credere che non ce ne siano", async () => {
    state.bundlesError = { message: "Failed to fetch" };
    apri();
    expect(await screen.findByText(/Non riesco a leggere i pacchetti/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
    expect(screen.queryByText("Nessun pacchetto ancora creato.")).toBeNull();
  });

  it("sola lettura: l'avviso, i comandi che cambiano spenti con la frase che dice perché, e il pacchetto si può aprire", async () => {
    state.isAdmin = false;
    state.canEdit = false;
    await conElenco([...quattroPacchetti(), pacchettoConVoci()]);
    expect(screen.getByText(/Stai consultando i pacchetti/)).toBeInTheDocument();
    for (const nome of ["Nuovo pacchetto", "Installa 5 pacchetti di esempio", "Duplica il pacchetto Kit A", "Elimina il pacchetto Kit A"]) {
      const pulsante = screen.getByRole("button", { name: nome });
      expect(pulsante, nome).toBeDisabled();
      expect(pulsante, nome).toHaveAttribute("title", "Serve il permesso di modificare i pacchetti");
    }
    expect(screen.getByRole("switch", { name: "Attivo: Kit A" })).toBeDisabled();
    // «Bilocale» ha le voci complete: in scrittura si potrebbe salvare, quindi se «Salva» è spento è per il permesso.
    fireEvent.click(screen.getByRole("button", { name: "Apri il pacchetto Bilocale" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("Pacchetto")).toBeInTheDocument();
    expect(within(finestra).getByText(/Stai consultando questo pacchetto/)).toBeInTheDocument();
    expect(campoNome(finestra)).toBeDisabled();
    expect(campoNome(finestra)).toHaveValue("Bilocale");
    expect(within(finestra).getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
    expect(within(finestra).getByRole("button", { name: "Salva modifiche" })).toHaveAttribute("title", "Serve il permesso di modificare i pacchetti");
    expect(within(finestra).queryByText(/Aggiungi almeno una voce|Scegli cosa va in ogni voce|Scrivi il nome/)).toBeNull();
    for (const interruttore of within(finestra).getAllByRole("combobox")) expect(interruttore).toBeDisabled();
    expect(within(finestra).getByRole("button", { name: "Elimina la voce 1" })).toBeDisabled();
    expect(within(finestra).getByRole("button", { name: "Torna all'elenco" })).toBeEnabled();
    expect(state.writes).toEqual([]);
  });

  it("con il permesso di modificare i pacchetti (senza essere amministratore) tutto è acceso e non c'è l'avviso", async () => {
    state.isAdmin = false;
    state.canEdit = true;
    await conElenco();
    expect(screen.queryByText(/Stai consultando i pacchetti/)).toBeNull();
    expect(screen.getByRole("button", { name: "Nuovo pacchetto" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Attivo: Kit A" })).toBeEnabled();
  });
});

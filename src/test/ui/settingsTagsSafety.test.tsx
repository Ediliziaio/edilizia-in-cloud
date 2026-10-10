/**
 * Tag: permessi, bozze e dati. Dal 09/10/2026 anche i conteggi oltre le 1.000 righe.
 *
 * Il database finto fa quello che fa PostgREST: una risposta ha al massimo 1.000 righe (`TETTO`), e dice in `count`
 * quante ce ne sarebbero. Il vecchio codice scaricava `id, tags` di tutti i contatti in una sola richiesta e contava
 * nel browser: con più di mille contatti con tag il conteggio era troppo basso e la guardia che impedisce di eliminare
 * un tag in uso lasciava passare l'eliminazione.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TagsConfig } from "@/components/settings/TagsConfig";

type RigaOpportunita = { id: string; tags: string[] | null };
type Scrittura = { table: string; op: string; payload?: unknown };

const TETTO = 1000;
const state = vi.hoisted(() => ({
  edit: true,
  usageError: false,
  readError: false,
  writeError: false,
  writes: [] as Array<{ table: string; op: string; payload?: unknown }>,
  chiamateFunzione: [] as Array<{ funzione: string; argomenti: unknown }>,
  intervalliOpportunita: [] as Array<[number, number]>,
  catalogoVuoto: false,
  contattiPerTag: [{ valore: "cliente caldo", etichetta: "cliente caldo", contatti: 0 }] as Array<{ valore: string; etichetta: string; contatti: number }>,
  opportunita: [] as Array<{ id: string; tags: string[] | null }>,
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: false, isLoading: false, canEditSettingsCustomization: state.edit }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    // La funzione che alimenta già i filtri dei Contatti: i tag in uso con quanti contatti li hanno.
    rpc: (funzione: string, argomenti: unknown) => {
      state.chiamateFunzione.push({ funzione, argomenti });
      return Promise.resolve(
        state.usageError
          ? { data: null as unknown, error: { message: "errore simulato" } }
          : { data: state.contattiPerTag, error: null as unknown },
      );
    },
    from: (table: string) => {
      let write: string | null = null;
      let intervallo: [number, number] | null = null;
      const result = () => {
        if (write) {
          return { data: null as unknown, count: null as number | null, error: state.writeError ? { message: "errore simulato" } : null };
        }
        if (table === "marketing_tags") {
          return {
            data: (state.catalogoVuoto ? [] : [{ id: "t1", company_id: "company-1", name: "cliente caldo", color: "#2563eb", created_at: "2026-10-08" }]) as unknown,
            count: null as number | null,
            error: state.readError ? { message: "errore simulato" } : null,
          };
        }
        if (table === "marketing_opportunities") {
          const [da, a] = intervallo ?? [0, TETTO - 1];
          state.intervalliOpportunita.push([da, a]);
          // Come PostgREST: mai più di TETTO righe per risposta, e il totale in `count`.
          return {
            data: state.opportunita.slice(da, Math.min(a + 1, da + TETTO)) as unknown,
            count: state.opportunita.length as number | null,
            error: null,
          };
        }
        return { data: [] as unknown, count: 0 as number | null, error: null };
      };
      const registra = (op: string, payload?: unknown) => {
        write = op;
        state.writes.push({ table, op, payload });
        return builder;
      };
      const builder = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        order: () => builder,
        range: (da: number, a: number) => {
          intervallo = [da, a];
          return builder;
        },
        insert: (payload: unknown) => registra("insert", payload),
        update: (payload: unknown) => registra("update", payload),
        delete: () => registra("delete"),
        upsert: (payload: unknown) => registra("upsert", payload),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return builder;
    },
  },
}));

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <TagsConfig />
    </QueryClientProvider>,
  );
const righeOpportunita = (n: number, tags: (i: number) => string[] | null): RigaOpportunita[] =>
  Array.from({ length: n }, (_, i) => ({ id: `o${String(i).padStart(5, "0")}`, tags: tags(i) }));
const scritture = (): Scrittura[] => state.writes;

beforeEach(() => {
  state.edit = true;
  state.usageError = false;
  state.readError = false;
  state.writeError = false;
  state.writes.length = 0;
  state.chiamateFunzione.length = 0;
  state.intervalliOpportunita.length = 0;
  state.catalogoVuoto = false;
  state.contattiPerTag = [{ valore: "cliente caldo", etichetta: "cliente caldo", contatti: 0 }];
  state.opportunita = [];
  state.success.mockClear();
  state.error.mockClear();
});
afterEach(cleanup);

describe("Tag: permessi, bozze e dati", () => {
  it("in sola lettura non propone modifica, eliminazione, creazione né aggiunta dei tag mancanti", async () => {
    state.edit = false;
    state.contattiPerTag = [
      { valore: "cliente caldo", etichetta: "cliente caldo", contatti: 3 },
      { valore: "dvs ai", etichetta: "dvs ai", contatti: 1586 },
    ];
    open();
    await screen.findByText("cliente caldo");
    expect(screen.queryByRole("button", { name: "Modifica tag cliente caldo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Elimina tag cliente caldo" })).toBeNull();
    expect(screen.queryByLabelText("Nuovo tag")).toBeNull();
    // I tag fuori elenco si vedono (è consultare), ma nessun pulsante per aggiungerli.
    expect(await screen.findByText("Tag usati ma non in elenco")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aggiungi i tag mancanti" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Aggiungi all'elenco/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Stai solo consultando");
    expect(scritture()).toHaveLength(0);
  });
  it("un errore di lettura blocca creazione e aggiunta dei tag mancanti", async () => {
    state.readError = true;
    open();
    await screen.findByText("Tag non disponibili");
    expect(screen.getByLabelText("Nuovo tag")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Aggiungi i tag mancanti" })).toBeNull();
  });
  it("non identifica come inutilizzati i tag con conteggi non disponibili", async () => {
    state.usageError = true;
    open();
    await screen.findByText("Utilizzi non aggiornati");
    // Nessun «0 non usati» inventato: lo dice, e non lascia eliminare.
    expect(screen.getByText(/non riesco a contare quanti sono usati/)).toBeInTheDocument();
    expect(screen.queryByText(/non usati$/)).toBeNull();
    expect(screen.getByRole("button", { name: "Elimina tag cliente caldo" })).toBeDisabled();
  });
  it("richiede conferma prima di aggiungere i tag mancanti", async () => {
    state.contattiPerTag = [
      { valore: "cliente caldo", etichetta: "cliente caldo", contatti: 3 },
      { valore: "dvs ai", etichetta: "dvs ai", contatti: 1586 },
    ];
    open();
    await screen.findByText("cliente caldo");
    fireEvent.click(await screen.findByRole("button", { name: "Aggiungi i tag mancanti" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("modifica i dati dell'azienda");
    expect(scritture()).toHaveLength(0);
  });
  it("un errore di creazione mantiene il nome da correggere", async () => {
    state.writeError = true;
    open();
    await screen.findByText("cliente caldo");
    fireEvent.change(screen.getByLabelText("Nuovo tag"), { target: { value: "Nuovo cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Nuovo tag")).toHaveValue("Nuovo cliente");
    expect(state.success).not.toHaveBeenCalled();
  });
});

describe("Tag: conteggi oltre le 1.000 righe", () => {
  it("i contatti si contano nel database: 21.880 contatti sono 21.880, non 1.000", async () => {
    state.contattiPerTag = [{ valore: "cliente caldo", etichetta: "cliente caldo", contatti: 21880 }];
    open();
    const riga = (await screen.findByText("cliente caldo")).closest("tr") as HTMLElement;
    await waitFor(() => expect(within(riga).getByText("21.880 tot.")).toBeInTheDocument());
    expect(state.chiamateFunzione).toContainEqual({
      funzione: "marketing_valori_filtro_contatti",
      argomenti: { p_company: "company-1", p_campo: "tags" },
    });
  });

  it("le grafie diverse dello stesso tag si sommano («Cliente caldo» + «cliente  caldo»)", async () => {
    state.contattiPerTag = [
      { valore: "Cliente caldo", etichetta: "Cliente caldo", contatti: 10 },
      { valore: "cliente  caldo", etichetta: "cliente  caldo", contatti: 5 },
    ];
    open();
    const riga = (await screen.findByText("cliente caldo")).closest("tr") as HTMLElement;
    await waitFor(() => expect(within(riga).getByText("15 tot.")).toBeInTheDocument());
    // Sono lo stesso tag: non finiscono fra «i tag fuori elenco».
    expect(screen.queryByText("Tag usati ma non in elenco")).toBeNull();
  });

  it("le opportunità si leggono a pagine fino alla fine: 2500 opportunità sono 2500", async () => {
    state.opportunita = righeOpportunita(2500, () => ["Cliente caldo"]);
    open();
    const riga = (await screen.findByText("cliente caldo")).closest("tr") as HTMLElement;
    // In italiano il punto delle migliaia c'è da cinque cifre in su (2500, 21.880), come nei filtri dei Contatti.
    await waitFor(() => expect(within(riga).getByText("2500 tot.")).toBeInTheDocument());
    // Tre pagine da mille, non una sola.
    expect(state.intervalliOpportunita).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("un'opportunità oltre la millesima ferma l'eliminazione del tag (prima non si vedeva)", async () => {
    // Le prime 1.100 opportunità hanno altri tag: solo l'ultima ha «cliente caldo». Con una lettura sola da mille
    // righe il tag sembrava inutilizzato e si poteva eliminare.
    state.opportunita = righeOpportunita(1101, (i) => (i === 1100 ? ["cliente caldo"] : ["altro tag"]));
    open();
    await screen.findByText("cliente caldo");
    const elimina = await screen.findByRole("button", { name: "Elimina tag cliente caldo" });
    await waitFor(() => expect(elimina).toBeEnabled());
    fireEvent.click(elimina);
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error.mock.calls[0][0]).toMatch(/ancora su 1 contatto o opportunità/);
    expect(scritture().filter((w) => w.op === "delete")).toHaveLength(0);
  });

  it("un tag usato da 1500 contatti non si elimina", async () => {
    state.contattiPerTag = [{ valore: "cliente caldo", etichetta: "cliente caldo", contatti: 1500 }];
    open();
    await screen.findByText("cliente caldo");
    const elimina = await screen.findByRole("button", { name: "Elimina tag cliente caldo" });
    await waitFor(() => expect(elimina).toBeEnabled());
    fireEvent.click(elimina);
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error.mock.calls[0][0]).toMatch(/ancora su 1500 tra contatti e opportunità/);
    expect(scritture().filter((w) => w.op === "delete")).toHaveLength(0);
  });

  it("un tag che nessuno usa si elimina", async () => {
    state.contattiPerTag = [];
    open();
    await screen.findByText("cliente caldo");
    const elimina = await screen.findByRole("button", { name: "Elimina tag cliente caldo" });
    await waitFor(() => expect(elimina).toBeEnabled());
    fireEvent.click(elimina);
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Tag eliminato"));
    expect(scritture().filter((w) => w.op === "delete")).toHaveLength(1);
  });

  it("se l'elenco dei tag dei contatti è incompleto (500 tag diversi) un tag non visto non si elimina", async () => {
    // La funzione ritorna al massimo 500 tag: se «cliente caldo» non c'è, potrebbe essere fra quelli tagliati.
    state.contattiPerTag = Array.from({ length: 500 }, (_, i) => ({ valore: `tag ${i}`, etichetta: `tag ${i}`, contatti: 1 }));
    open();
    await screen.findByText("cliente caldo");
    const elimina = await screen.findByRole("button", { name: "Elimina tag cliente caldo" });
    await waitFor(() => expect(elimina).toBeEnabled());
    fireEvent.click(elimina);
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(state.error.mock.calls[0][0]).toMatch(/Non riesco a controllare se il tag è usato/);
    expect(scritture().filter((w) => w.op === "delete")).toHaveLength(0);
  });
});

describe("Tag: quelli che contatti e opportunità hanno già ma non sono nell'elenco", () => {
  beforeEach(() => {
    state.contattiPerTag = [
      { valore: "cliente caldo", etichetta: "cliente caldo", contatti: 3 },
      { valore: "DVS AI", etichetta: "DVS AI", contatti: 1586 },
    ];
    state.opportunita = [{ id: "o1", tags: ["Fiera Milano"] }];
  });

  it("li elenca, con quanti sono, anche se vengono solo dalle opportunità", async () => {
    open();
    const sezione = (await screen.findByRole("heading", { level: 2, name: "Tag usati ma non in elenco" })).closest("section") as HTMLElement;
    expect(within(sezione).getByText("dvs ai")).toBeInTheDocument();
    expect(within(sezione).getByText("fiera milano")).toBeInTheDocument();
    expect(within(sezione).getAllByText("Non in elenco")).toHaveLength(2);
    expect(screen.getByText(/Altri 2 tag sono sui contatti o sulle opportunità ma non in questo elenco/)).toBeInTheDocument();
    // La riga di riepilogo, una sola: quanti tag e quanti non usati.
    expect(screen.queryByText("Tag catalogo")).toBeNull();
    expect(screen.queryByText("Tag non usati")).toBeNull();
  });

  it("«Aggiungi i tag mancanti» scrive solo nell'elenco dei tag, mai sui contatti né sulle opportunità", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Aggiungi i tag mancanti" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sì, aggiungili" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("2 tag aggiunti all'elenco"));
    expect(scritture().map((w) => `${w.table}:${w.op}`)).toEqual(["marketing_tags:upsert"]);
    const nomi = (scritture()[0].payload as Array<{ name: string }>).map((r) => r.name).sort();
    expect(nomi).toEqual(["dvs ai", "fiera milano"]);
  });

  it("«Aggiungi all'elenco» di una riga aggiunge solo quel tag", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Aggiungi all'elenco il tag dvs ai" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Tag aggiunto all'elenco"));
    expect((scritture()[0].payload as Array<{ name: string }>).map((r) => r.name)).toEqual(["dvs ai"]);
  });

  it("con l'elenco vuoto ma i contatti già taggati lo dice, invece di «Nessun tag creato»", async () => {
    state.catalogoVuoto = true;
    state.contattiPerTag = [{ valore: "dvs ai", etichetta: "dvs ai", contatti: 40 }];
    state.opportunita = [];
    open();
    expect(await screen.findByText("L'elenco è vuoto, ma i tuoi contatti hanno già dei tag (sotto).")).toBeInTheDocument();
    expect(screen.queryByText(/Nessun tag creato/)).toBeNull();
    const sezione = (await screen.findByRole("heading", { level: 2, name: "Tag usati ma non in elenco" })).closest("section") as HTMLElement;
    expect(within(sezione).getByText("dvs ai")).toBeInTheDocument();
  });

  it("senza tag da nessuna parte dice di aggiungere il primo", async () => {
    state.catalogoVuoto = true;
    state.contattiPerTag = [];
    state.opportunita = [];
    open();
    expect(await screen.findByText("Nessun tag creato. Aggiungi il primo tag qui sopra.")).toBeInTheDocument();
    expect(screen.queryByText("Tag usati ma non in elenco")).toBeNull();
  });
});

describe("Tag: testi e accessibilità", () => {
  it("i colori hanno un nome e dicono quale è scelto", async () => {
    open();
    await screen.findByText("cliente caldo");
    const gruppo = screen.getByRole("group", { name: "Colore del nuovo tag" });
    const blu = within(gruppo).getByRole("button", { name: "Colore Blu" });
    expect(blu).toHaveAttribute("aria-pressed", "true");
    expect(within(gruppo).getByRole("button", { name: "Colore Verde" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(gruppo).getByRole("button", { name: "Colore Verde" }));
    expect(within(gruppo).getByRole("button", { name: "Colore Verde" })).toHaveAttribute("aria-pressed", "true");
  });

  it("nel modulo di modifica un tag già usato non si rinomina, e lo spiega", async () => {
    state.contattiPerTag = [{ valore: "cliente caldo", etichetta: "cliente caldo", contatti: 12 }];
    open();
    await screen.findByText("cliente caldo");
    await waitFor(() => expect(screen.getByRole("button", { name: "Modifica tag cliente caldo" })).toBeEnabled());
    await screen.findByText("12 tot.");
    fireEvent.click(screen.getByRole("button", { name: "Modifica tag cliente caldo" }));
    expect(await screen.findByText(/Questo tag è su 12 tra contatti e opportunità: per rinominarlo toglilo prima da lì/)).toBeInTheDocument();
    expect(screen.getByText(/Il colore lo puoi cambiare quando vuoi/)).toBeInTheDocument();
    // Niente «verra» senza accento né «elemento/i».
    expect(screen.queryByText(/verra\b/)).toBeNull();
    expect(screen.queryByText(/elemento\/i/)).toBeNull();
  });
});

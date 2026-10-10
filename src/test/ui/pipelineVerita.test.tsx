/**
 * Pipeline di vendita: un nome solo, le fasi si spiegano da sole, il salvataggio non lascia a metà (10/10/2026).
 *
 * Prima la stessa cosa si chiamava in tre modi («Pipeline di vendita» nel menu, «Sequenze (Pipeline)» nella pagina, «Crea
 * Sequenza» nei pulsanti: e in marketing «sequenza» è un'altra cosa, i messaggi in serie); cosa fa «Esito automatico» si
 * leggeva solo passando il mouse (title del menu); «Alert ferma (gg)» era gergo; le frecce per riordinare erano da 16×24 px e
 * si chiamavano tutte «Sposta su»; il pulsante «Salva» stava in cima alla scheda e con dieci fasi usciva dallo schermo; e se il
 * salvataggio falliva a metà (cancella, poi aggiorna una per una, poi inserisce) il database restava cambiato a metà senza
 * che la pagina lo dicesse. «Prob. vittoria %» NON si è tolta (decisione di Florin) ma la pagina dice che non entra nelle
 * statistiche. Qui si tiene fermo tutto questo.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Riga = Record<string, unknown>;

const db = vi.hoisted(() => {
  type Op = [string, unknown[]];
  const stato = {
    chiamate: [] as Array<{ tabella: string; ops: Op[] }>,
    pipeline: [] as Array<Record<string, unknown>>,
    fasi: [] as Array<Record<string, unknown>>,
    opportunita: 0,
    /** Quante scritture riescono prima che una fallisca. */
    scrittureOk: Number.POSITIVE_INFINITY,
    scritture: 0,
  };
  const risposta = (tabella: string, ops: Op[]): { data: unknown; error: unknown; count?: number } => {
    const ha = (m: string) => ops.some(([n]) => n === m);
    const argomenti = (m: string) => ops.find(([n]) => n === m)?.[1] ?? [];
    const filtri = ops.filter(([n]) => n === "eq").map(([, a]) => a as [string, unknown]);
    const righe = tabella === "marketing_pipelines" ? stato.pipeline : tabella === "marketing_pipeline_stages" ? stato.fasi : [];
    const corrisponde = (r: Record<string, unknown>) => filtri.every(([k, v]) => k === "company_id" || k === "pipeline_id" || r[k] === v);
    if (ha("insert") || ha("update") || ha("delete")) {
      stato.scritture++;
      if (stato.scritture > stato.scrittureOk) return { data: null, error: new Error("Scrittura negata") };
      if (ha("update")) righe.filter(corrisponde).forEach((r) => Object.assign(r, argomenti("update")[0] as object));
      if (ha("delete")) {
        for (const r of righe.filter(corrisponde)) righe.splice(righe.indexOf(r), 1);
      }
      if (ha("insert")) {
        const dati = argomenti("insert")[0];
        const nuove = (Array.isArray(dati) ? dati : [dati]) as Array<Record<string, unknown>>;
        nuove.forEach((r, i) => righe.push({ id: `nuova-${righe.length + i}`, updated_at: "2026-10-01T10:00:00Z", ...r }));
      }
      return { data: { id: "x" }, error: null };
    }
    if (tabella === "marketing_pipelines") {
      return { data: stato.pipeline.map((p) => ({ ...p, marketing_pipeline_stages: stato.fasi.filter((f) => f.pipeline_id === p.id) })), error: null };
    }
    if (tabella === "marketing_pipeline_stages") {
      return { data: stato.fasi.filter((f) => f.pipeline_id === (filtri.find(([k]) => k === "pipeline_id")?.[1] ?? f.pipeline_id)).map((f) => ({ ...f })), error: null };
    }
    if (tabella === "marketing_opportunities") return { data: null, count: stato.opportunita, error: null };
    return { data: null, error: null };
  };
  const catena = (tabella: string): unknown => {
    const ops: Op[] = [];
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
const permessi = vi.hoisted(() => ({ modifica: true }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditSettingsCustomization: permessi.modifica, isLoading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (tabella: string) => db.catena(tabella) } }));

import { PipelineStagesConfig } from "@/components/settings/PipelineStagesConfig";
import { PipelinesConfig } from "@/components/settings/PipelinesConfig";
import { AUTO_STATUS_OPTIONS } from "@/types/opportunities";

// Un menu o una tendina Radix aperti insieme a una finestra montano due FocusScope: con l'albero di bun.lock (CI e
// Cloudflare) condividono la stessa copia e la pila di Radix mette in pausa il primo; nella node_modules locale (npm) sono
// copie diverse e si rimandano il focus all'infinito in jsdom (RangeError da focusing.js). Il rimbalzo si ferma dopo pochi
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

const fase = (id: string, nome: string, posizione: number, extra: Riga = {}): Riga => ({
  id,
  pipeline_id: "p1",
  company_id: "azienda-1",
  name: nome,
  position: posizione,
  auto_status: null as unknown,
  win_probability: null as unknown,
  stalled_threshold_days: 14,
  ...extra,
});
const pipeline = (id: string, nome: string, posizione: number): Riga => ({
  id,
  name: nome,
  position: posizione,
  company_id: "azienda-1",
  updated_at: "2026-09-30T10:00:00Z",
});

function monta(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
const scritture = (metodo: string, tabella: string) =>
  db.stato.chiamate.filter((c) => c.tabella === tabella && c.ops.some(([m]) => m === metodo));
const letture = (tabella: string) =>
  db.stato.chiamate.filter((c) => c.tabella === tabella && c.ops.some(([m]) => m === "select") && !c.ops.some(([m]) => ["insert", "update", "delete"].includes(m)));

beforeEach(() => {
  db.stato.chiamate.length = 0;
  db.stato.pipeline = [];
  db.stato.fasi = [];
  db.stato.opportunita = 0;
  db.stato.scrittureOk = Number.POSITIVE_INFINITY;
  db.stato.scritture = 0;
  permessi.modifica = true;
  Object.values(toast).forEach((f) => f.mockReset());
});
afterEach(() => cleanup());

describe("le fasi di una pipeline", () => {
  const apri = async () => {
    db.stato.fasi = [
      fase("s1", "Nuovo contatto", 0),
      fase("s2", "Contratto firmato", 1, { auto_status: "won", win_probability: 100 }),
      fase("s3", "Fuori zona", 2, { auto_status: "abandoned" }),
    ];
    monta(<PipelineStagesConfig pipelineId="p1" pipelineName="Vendita edile" />);
    await screen.findByDisplayValue("Nuovo contatto");
  };

  it("titolo e descrizione: dove entrano i nuovi contatti dei moduli", async () => {
    await apri();
    expect(screen.getByText("Fasi di «Vendita edile»")).toBeTruthy();
    expect(screen.getByText("Trascina per cambiare l'ordine. La prima fase è dove entrano i nuovi contatti dei moduli.")).toBeTruthy();
  });

  it("cosa succede quando una trattativa arriva in una fase è scritto sotto il menu, non solo nel title", async () => {
    await apri();
    const etichette = screen.getAllByText("Quando una trattativa arriva qui diventa…");
    expect(etichette).toHaveLength(3);
    const frase = (valore: string) => AUTO_STATUS_OPTIONS.find((o) => o.value === valore)!.hint;
    // La frase dell'opzione scelta di OGNI fase è sullo schermo (nessuna va cercata col mouse).
    expect(screen.getAllByText(frase("none"))).toHaveLength(1);
    expect(screen.getAllByText(frase("won"))).toHaveLength(1);
    expect(screen.getAllByText(frase("abandoned"))).toHaveLength(1);
    // E il menu la richiama come descrizione accessibile.
    const tendine = screen.getAllByRole("combobox");
    expect(tendine).toHaveLength(3);
    const descritta = document.getElementById(tendine[1].getAttribute("aria-describedby") ?? "");
    expect(descritta?.textContent).toBe(frase("won"));
    // Ogni menu ha il suo nome (l'etichetta visibile).
    for (const t of tendine) expect(t.id).toBeTruthy();
    expect(screen.getAllByLabelText("Quando una trattativa arriva qui diventa…")).toHaveLength(3);
  });

  it("«Ferma da (giorni)» al posto del gergo; «Prob. vittoria %» resta, con la riga che dice che non entra nelle statistiche", async () => {
    await apri();
    expect(screen.queryByText(/Alert ferma/)).toBeNull();
    expect(screen.getAllByLabelText("Ferma da (giorni)")).toHaveLength(3);
    expect(screen.getAllByLabelText("Ferma da (giorni)")[0].getAttribute("title")).toBe("Dopo quanti giorni nella fase una trattativa risulta ferma.");
    // La probabilità non si è tolta: è una decisione aperta.
    expect(screen.getAllByLabelText("Prob. vittoria %")).toHaveLength(3);
    expect((screen.getAllByLabelText("Prob. vittoria %")[1] as HTMLInputElement).value).toBe("100");
    expect(screen.getByText(/si salva, ma oggi non entra nelle statistiche/)).toBeTruthy();
  });

  it("il nome di una fase non cambia mentre lo si scrive (etichetta con il numero)", async () => {
    await apri();
    const campo = screen.getByLabelText("Nome della fase 1");
    fireEvent.change(campo, { target: { value: "Primo contatto" } });
    expect(screen.getByLabelText("Nome della fase 1")).toBe(campo);
    expect(screen.getByRole("button", { name: "Trascina la fase 1 per cambiare l'ordine" })).toBeTruthy();
  });

  it("bersagli da 44 px sul telefono: maniglia, nome, cestino e campi numerici", async () => {
    await apri();
    const regole: Array<[HTMLElement, string]> = [
      [screen.getByRole("button", { name: "Trascina la fase 1 per cambiare l'ordine" }), "grip"],
      [screen.getByLabelText("Nome della fase 1"), "nome"],
      [screen.getByRole("button", { name: "Elimina la fase «Nuovo contatto»" }), "cestino"],
      [screen.getAllByLabelText("Ferma da (giorni)")[0], "ferma"],
      [screen.getAllByLabelText("Prob. vittoria %")[0], "probabilità"],
      [screen.getAllByRole("combobox")[0], "esito"],
    ];
    for (const [el, nome] of regole) expect(el.className, nome).toMatch(/max-md:h-11/);
  });

  it("la barra «Salva le fasi» compare solo con modifiche, dice «Modifiche non salvate», e sparisce a salvataggio fatto", async () => {
    await apri();
    expect(screen.queryByRole("button", { name: "Salva le fasi" })).toBeNull();
    expect(screen.queryByText("Modifiche non salvate")).toBeNull();

    fireEvent.change(screen.getByLabelText("Nome della fase 1"), { target: { value: "Primo contatto" } });
    // (il trascinamento ha una sua zona «status» per i lettori di schermo: si cerca per testo.)
    expect(screen.getByText("Modifiche non salvate").getAttribute("role")).toBe("status");
    const barra = screen.getByRole("button", { name: "Salva le fasi" }).parentElement as HTMLElement;
    // Resta in vista nello scorrimento: è «sticky» in fondo alla scheda.
    expect(barra.className).toMatch(/sticky/);
    expect(barra.className).toMatch(/bottom-0/);

    fireEvent.click(screen.getByRole("button", { name: "Salva le fasi" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Fasi salvate"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Salva le fasi" })).toBeNull());
    // Dopo il salvataggio l'elenco è quello riletto dal database.
    expect(screen.getByDisplayValue("Primo contatto")).toBeTruthy();
    expect(scritture("update", "marketing_pipeline_stages")).toHaveLength(3);
  });

  it("se il salvataggio riesce a metà lo dice, rilegge il database e tiene la bozza", async () => {
    await apri();
    fireEvent.change(screen.getByLabelText("Nome della fase 1"), { target: { value: "Primo contatto" } });
    fireEvent.change(screen.getByLabelText("Nome della fase 2"), { target: { value: "Contratto" } });
    db.stato.scrittureOk = 1; // la prima scrittura riesce, la seconda no
    const lettureAllaPartenza = letture("marketing_pipeline_stages").length;

    fireEvent.click(screen.getByRole("button", { name: "Salva le fasi" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Scrittura negata"));
    expect(toast.warning).toHaveBeenCalledWith(
      "Una parte delle modifiche era già stata salvata. Ho riletto le fasi: controlla e premi «Salva le fasi» di nuovo.",
    );
    expect(toast.success).not.toHaveBeenCalled();
    // Il database è stato riletto, e la bozza non è andata persa (il pulsante è ancora lì, pronto per riprovare).
    await waitFor(() => expect(letture("marketing_pipeline_stages").length).toBeGreaterThan(lettureAllaPartenza));
    expect(screen.getByDisplayValue("Primo contatto")).toBeTruthy();
    expect(screen.getByDisplayValue("Contratto")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salva le fasi" })).toBeEnabled();

    // Riprovando, tutto riesce e le fasi sono quelle della bozza.
    db.stato.scrittureOk = Number.POSITIVE_INFINITY;
    fireEvent.click(screen.getByRole("button", { name: "Salva le fasi" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Fasi salvate"));
    expect(db.stato.fasi.map((f) => f.name)).toEqual(["Primo contatto", "Contratto", "Fuori zona"]);
  });

  it("se non è stato scritto niente, l'errore è uno solo (nessun avviso di salvataggio a metà)", async () => {
    await apri();
    fireEvent.change(screen.getByLabelText("Nome della fase 1"), { target: { value: "Primo contatto" } });
    db.stato.scrittureOk = 0;
    fireEvent.click(screen.getByRole("button", { name: "Salva le fasi" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Scrittura negata"));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("una fase nuova entra con «Aggiungi una fase» e si salva con il suo esito", async () => {
    await apri();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi una fase" }));
    fireEvent.change(screen.getByDisplayValue("Nuova fase"), { target: { value: "Preventivo inviato" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva le fasi" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Fasi salvate"));
    const [inserimento] = scritture("insert", "marketing_pipeline_stages");
    expect(inserimento.ops.find(([m]) => m === "insert")?.[1][0]).toEqual([
      expect.objectContaining({ pipeline_id: "p1", company_id: "azienda-1", name: "Preventivo inviato", position: 3, stalled_threshold_days: 14 }),
    ]);
    expect(db.stato.fasi.map((f) => f.name)).toContain("Preventivo inviato");
  });

  it("senza il permesso: niente aggiungere né salvare, i campi sono spenti e la riga lo spiega", async () => {
    permessi.modifica = false;
    await apri();
    expect(screen.getByText("Sola lettura: per modificare le fasi serve il permesso «Modifica» su Personalizzazione.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aggiungi una fase" })).toBeNull();
    expect(screen.getByLabelText("Nome della fase 1")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome della fase 1"), { target: { value: "Altro" } });
    expect(screen.queryByRole("button", { name: "Salva le fasi" })).toBeNull();
  });
});

describe("l'elenco delle pipeline", () => {
  const apri = async () => {
    db.stato.pipeline = [pipeline("p1", "Vendita edile", 0), pipeline("p2", "Sopralluoghi", 1)];
    db.stato.fasi = [fase("s1", "Nuovo", 0), fase("s2", "Vinto", 1, { auto_status: "won" }), fase("s3", "Richiesta", 0, { pipeline_id: "p2" })];
    monta(<PipelinesConfig />);
    await screen.findByText("Vendita edile");
  };

  it("un nome solo: «pipeline», mai «sequenza»", async () => {
    await apri();
    expect(screen.getByText("Le tue pipeline")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nuova pipeline" })).toBeTruthy();
    expect(screen.queryByText(/sequenz/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/sequenz/i);
    // La prima per posizione è quella che si apre in Opportunità: la pagina lo dice.
    expect(screen.getByText("La prima pipeline dell'elenco è quella che si apre in Opportunità.")).toBeTruthy();
  });

  it("il numero delle fasi è al singolare quando è una sola", async () => {
    await apri();
    // Vendita edile ha due fasi, Sopralluoghi una sola: prima la seconda diceva «1 fasi».
    expect(screen.getByText(/2 fasi · Aggiornata/)).toBeTruthy();
    expect(screen.getByText(/1 fase · Aggiornata/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b1 fasi/);
  });

  it("le frecce dicono quale pipeline spostano, sono da 44 px sul telefono, e quelle senza dove andare sono spente", async () => {
    await apri();
    const su1 = screen.getByRole("button", { name: "Sposta «Vendita edile» più in alto" });
    const giu1 = screen.getByRole("button", { name: "Sposta «Vendita edile» più in basso" });
    const su2 = screen.getByRole("button", { name: "Sposta «Sopralluoghi» più in alto" });
    const giu2 = screen.getByRole("button", { name: "Sposta «Sopralluoghi» più in basso" });
    expect(su1).toBeDisabled();
    expect(giu1).toBeEnabled();
    expect(su2).toBeEnabled();
    expect(giu2).toBeDisabled();
    for (const freccia of [su1, giu1, su2, giu2]) {
      expect(freccia.className).toMatch(/max-md:h-11/);
      expect(freccia.className).toMatch(/max-md:w-11/);
    }
    expect(screen.getByRole("button", { name: "Azioni Vendita edile" }).className).toMatch(/max-md:h-11/);
    expect(screen.queryByRole("button", { name: "Sposta su" })).toBeNull();
  });

  it("spostare più in basso riscrive le posizioni di quella pipeline e dell'altra, nell'azienda", async () => {
    await apri();
    fireEvent.click(screen.getByRole("button", { name: "Sposta «Vendita edile» più in basso" }));
    await waitFor(() => expect(scritture("update", "marketing_pipelines")).toHaveLength(2));
    const nuovePosizioni = scritture("update", "marketing_pipelines").map((c) => ({
      posizione: (c.ops.find(([m]) => m === "update")?.[1][0] as { position: number }).position,
      id: (c.ops.filter(([m]) => m === "eq").find(([, a]) => a[0] === "id")?.[1][1]),
      azienda: (c.ops.filter(([m]) => m === "eq").find(([, a]) => a[0] === "company_id")?.[1][1]),
    }));
    expect(nuovePosizioni).toEqual([
      { posizione: 0, id: "p2", azienda: "azienda-1" },
      { posizione: 1, id: "p1", azienda: "azienda-1" },
    ]);
  });

  it("«Nuova pipeline»: titolo, campo e messaggio parlano di pipeline; il nome nuovo si crea con le sue fasi", async () => {
    await apri();
    fireEvent.click(screen.getByRole("button", { name: "Nuova pipeline" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("Nuova pipeline")).toBeTruthy();
    expect(within(finestra).getByLabelText("Nome della pipeline")).toBeTruthy();
    expect(within(finestra).getByText("Fasi della pipeline")).toBeTruthy();
    expect(within(finestra).getByLabelText("Parti da un modello")).toBeTruthy();
    fireEvent.change(within(finestra).getByLabelText("Nome della pipeline"), { target: { value: "Consulenze" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Pipeline creata con le fasi"));
    expect(scritture("insert", "marketing_pipelines")).toHaveLength(1);
    expect(scritture("insert", "marketing_pipeline_stages")).toHaveLength(1);
  });

  it("un nome già usato è rifiutato in italiano, senza scrivere", async () => {
    await apri();
    fireEvent.click(screen.getByRole("button", { name: "Nuova pipeline" }));
    const finestra = await screen.findByRole("dialog");
    fireEvent.change(within(finestra).getByLabelText("Nome della pipeline"), { target: { value: "vendita edile" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Esiste già una pipeline con questo nome."));
    expect(scritture("insert", "marketing_pipelines")).toHaveLength(0);
  });

  it("eliminare una pipeline con opportunità collegate spiega cosa fare, parlando di pipeline", async () => {
    await apri();
    db.stato.opportunita = 3;
    fireEvent.pointerDown(screen.getByRole("button", { name: "Azioni Vendita edile" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Elimina" }));
    const finestra = await screen.findByRole("alertdialog");
    expect(within(finestra).getByText("Eliminare questa pipeline?")).toBeTruthy();
    expect(finestra.textContent).toContain("Le fasi verranno rimosse insieme alla pipeline.");
    fireEvent.click(within(finestra).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(
      "Questa pipeline ha 3 opportunità collegate. Spostale in un'altra pipeline o eliminale: archiviarle non basta, restano collegate.",
    );
    expect(scritture("delete", "marketing_pipelines")).toHaveLength(0);
  });

  it("«Rinomina pipeline» ha il suo titolo e il campo col nome giusto", async () => {
    await apri();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Azioni Vendita edile" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rinomina" }));
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).getByText("Rinomina pipeline")).toBeTruthy();
    expect(within(finestra).getByLabelText("Nome della pipeline")).toHaveValue("Vendita edile");
  });

  it("aprire una pipeline porta alle sue fasi, e «Torna alle pipeline» all'elenco", async () => {
    await apri();
    fireEvent.click(screen.getByRole("button", { name: "Apri fasi di Vendita edile" }));
    expect(await screen.findByText("Fasi di «Vendita edile»")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Torna alle pipeline" }));
    expect(await screen.findByText("Le tue pipeline")).toBeTruthy();
  });

  it("senza pipeline: «Nessuna pipeline creata»; senza permesso nessun pulsante e la riga lo spiega", async () => {
    permessi.modifica = false;
    monta(<PipelinesConfig />);
    expect(await screen.findByText("Nessuna pipeline creata")).toBeTruthy();
    expect(screen.getByText("Sola lettura: per creare o modificare le pipeline serve il permesso «Modifica» su Personalizzazione.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nuova pipeline" })).toBeNull();
  });
});

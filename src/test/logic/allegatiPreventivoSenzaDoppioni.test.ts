/**
 * Schede tecniche rifiutate dal database: niente preventivi doppi e niente
 * allegati persi in silenzio (26/09/2026).
 *
 * Dal 26/09 un trigger rifiuta l'allegato la cui scheda non è dell'azienda del
 * preventivo, o il cui file sta nella cartella di un'altra azienda. Due punti
 * lo subivano male:
 *  - la creazione rapida dalla scheda Opportunità allegava DOPO aver creato il
 *    preventivo e, all'errore, lasciava il modulo aperto: chi riprovava
 *    creava un secondo preventivo;
 *  - la copia di un preventivo non guardava l'errore: una scheda rifiutata e
 *    le altre sparivano tutte, senza avviso.
 *
 * Il database finto fa quello che fa il vero: un inserimento di più righe è
 * tutto o niente, la coppia preventivo-scheda è unica, il trigger risponde
 * 42501 col messaggio scritto nella migrazione.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { allegaSchedeTecniche, avvisoSchedeNonAllegate, type SchedaNonAllegata } from "@/lib/quotes/allegatiPreventivo";
import { duplicaPreventivo } from "@/lib/quotes/duplicaPreventivo";

const stato = vi.hoisted(() => ({ db: null as unknown as DatabaseFinto }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => stato.db.from(tabella),
    rpc: (nome: string) => stato.db.rpc(nome),
    auth: { getUser: () => stato.db.getUser() },
  },
}));

/** Il messaggio del trigger, dalla migrazione: se cambia lì, questi test lo vedono. */
const MESSAGGIO_TRIGGER = (() => {
  const cartella = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(cartella).find((f) => f.endsWith("_allegati_preventivo_stessa_azienda.sql"));
  const sql = readFileSync(join(cartella, file!), "utf8");
  return sql.match(/raise exception '([^']+)'/)![1];
})();

type Errore = { code: string; message: string };
type Risposta = { data: unknown; error: Errore | null };
type Allegato = { quote_id: string; material_id: string; sort_order: number | null };
interface Consulta {
  select: () => Consulta;
  eq: () => Consulta;
  order: () => Consulta;
  single: () => Consulta;
  insert: (d: unknown) => Consulta;
  then: (ok: (r: Risposta) => unknown, ko?: (e: unknown) => unknown) => Promise<unknown>;
}

class DatabaseFinto {
  preventivi: Array<Record<string, unknown>> = [];
  righe: Array<Record<string, unknown>> = [];
  allegati: Allegato[] = [];
  rpcChiamate: string[] = [];
  inserimentiAllegati = 0;
  /** Schede che il trigger rifiuta (il file sta nella cartella di un'altra azienda). */
  estranee = new Set<string>();
  righeRifiutate = false;
  letturaAllegatiRotta = false;
  /** Il prossimo inserimento di allegati riesce, ma la risposta si perde per strada. */
  rispostaPersa = false;
  originale = { id: "q-orig", company_id: "az-1", title: "Bagno", status: "accettata", quote_number: "OFF-2026-001" };
  righeOriginale: Array<Record<string, unknown>> = [
    { id: "r-1", parent_item_id: null, item_type: "product", name: "Piatto doccia", quantity: 1, unit_price: 300, unit_of_measure: "pz" },
  ];
  allegatiOriginale = [
    { material_id: "m-buona", sort_order: 0, quote_pdf_materials: { name: "Scheda buona" } },
    { material_id: "m-copiata", sort_order: 1, quote_pdf_materials: { name: "Scheda copiata" } },
  ];

  from(tabella: string): Consulta {
    let azione: "select" | "insert" = "select";
    let dati: unknown = null;
    const q: Consulta = {
      select: () => q,
      eq: () => q,
      order: () => q,
      single: () => q,
      insert: (d: unknown) => { azione = "insert"; dati = d; return q; },
      then: (ok: (r: Risposta) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve().then(() => this.esegui(tabella, azione, dati)).then(ok, ko),
    };
    return q;
  }

  rpc(nome: string): Promise<Risposta> {
    this.rpcChiamate.push(nome);
    return Promise.resolve(nome === "generate_quote_number"
      ? { data: "OFF-2026-099", error: null }
      : { data: { ok: true }, error: null });
  }

  getUser() {
    return Promise.resolve({ data: { user: { id: "u-1" } }, error: null });
  }

  private esegui(tabella: string, azione: "select" | "insert", dati: unknown): Risposta {
    if (tabella === "quotes" && azione === "insert") {
      const id = `q-nuovo-${this.preventivi.length + 1}`;
      this.preventivi.push({ ...(dati as Record<string, unknown>), id });
      return { data: { id }, error: null };
    }
    if (tabella === "quotes") return { data: this.originale, error: null };

    if (tabella === "quote_items" && azione === "insert") {
      if (this.righeRifiutate) {
        return { data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "quote_items"' } };
      }
      this.righe.push(...(dati as Array<Record<string, unknown>>));
      return { data: null, error: null };
    }
    if (tabella === "quote_items") return { data: this.righeOriginale, error: null };

    if (tabella === "quote_pdf_attachments" && azione === "insert") {
      this.inserimentiAllegati++;
      const nuove = (Array.isArray(dati) ? dati : [dati]) as Allegato[];
      // Un solo INSERT: basta una riga rifiutata e non entra nessuna.
      if (nuove.some((a) => this.estranee.has(a.material_id))) {
        return { data: null, error: { code: "42501", message: MESSAGGIO_TRIGGER } };
      }
      const chiave = (a: Allegato) => `${a.quote_id}|${a.material_id}`;
      const presenti = new Set(this.allegati.map(chiave));
      if (nuove.some((a) => presenti.has(chiave(a)))) {
        return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "quote_pdf_attachments_quote_id_material_id_key"' } };
      }
      this.allegati.push(...nuove.map((a) => ({ quote_id: a.quote_id, material_id: a.material_id, sort_order: a.sort_order })));
      if (this.rispostaPersa) {
        this.rispostaPersa = false;
        return { data: null, error: { code: "", message: "TypeError: Failed to fetch" } };
      }
      return { data: null, error: null };
    }
    if (tabella === "quote_pdf_attachments") {
      if (this.letturaAllegatiRotta) return { data: null, error: { code: "PGRST000", message: "Lettura non riuscita" } };
      return { data: this.allegatiOriginale, error: null };
    }
    throw new Error(`Tabella inattesa nel test: ${tabella}`);
  }
}

let db: DatabaseFinto;
beforeEach(() => {
  db = new DatabaseFinto();
  stato.db = db;
});

const scheda = (material_id: string, nome: string | null, errore: SchedaNonAllegata["errore"]): SchedaNonAllegata =>
  ({ material_id, nome, errore });
const dalTrigger = { code: "42501", message: MESSAGGIO_TRIGGER };

describe("allegaSchedeTecniche: una scheda rifiutata non si porta via le altre", () => {
  it("tutte buone: una sola chiamata, nessuna scheda fuori", async () => {
    const fuori = await allegaSchedeTecniche("q-1", [
      { material_id: "m-a", sort_order: 0 },
      { material_id: "m-b", sort_order: 1 },
    ]);
    expect(fuori).toEqual([]);
    expect(db.inserimentiAllegati).toBe(1);
    expect(db.allegati.map((a) => a.material_id)).toEqual(["m-a", "m-b"]);
  });

  it("una di un'altra azienda: le buone entrano, quella torna col nome e col motivo", async () => {
    db.estranee.add("m-copiata");
    const fuori = await allegaSchedeTecniche("q-1", [
      { material_id: "m-buona", sort_order: 0, nome: "Scheda buona" },
      { material_id: "m-copiata", sort_order: 1, nome: "Scheda copiata" },
      { material_id: "m-altra", sort_order: 2, nome: "Scheda altra" },
    ]);
    expect(fuori).toEqual([scheda("m-copiata", "Scheda copiata", dalTrigger)]);
    expect(db.allegati).toEqual([
      { quote_id: "q-1", material_id: "m-buona", sort_order: 0 },
      { quote_id: "q-1", material_id: "m-altra", sort_order: 2 },
    ]);
  });

  it("risposta persa dopo un inserimento riuscito: niente doppioni, niente falsi avvisi", async () => {
    db.rispostaPersa = true;
    const fuori = await allegaSchedeTecniche("q-1", [
      { material_id: "m-a", sort_order: 0 },
      { material_id: "m-b", sort_order: 1 },
    ]);
    expect(fuori).toEqual([]);
    expect(db.allegati).toHaveLength(2);
  });

  it("nessuna scheda scelta: nessuna chiamata", async () => {
    expect(await allegaSchedeTecniche("q-1", [])).toEqual([]);
    expect(db.inserimentiAllegati).toBe(0);
  });
});

describe("avvisoSchedeNonAllegate: cosa legge chi salva", () => {
  it("tutte allegate: nessun avviso", () => {
    expect(avvisoSchedeNonAllegate([])).toBeNull();
  });

  it("una scheda col file di un'altra azienda, col messaggio vero del trigger", () => {
    // Si parla del file: la scheda l'utente la vede fra le sue, è il file che sta altrove.
    expect(avvisoSchedeNonAllegate([scheda("m-1", "Scheda copiata", dalTrigger)])).toEqual({
      conteggio: "una scheda tecnica non allegata",
      descrizione: "Il file della scheda tecnica «Scheda copiata» non è di questa azienda: non si può allegare.",
    });
  });

  it("più schede, e il nome che l'utente non può vedere", () => {
    expect(avvisoSchedeNonAllegate([scheda("m-1", "A", dalTrigger), scheda("m-2", "B", dalTrigger)])).toEqual({
      conteggio: "2 schede tecniche non allegate",
      descrizione: "I file delle schede tecniche «A» e «B» non sono di questa azienda: non si possono allegare.",
    });
    expect(avvisoSchedeNonAllegate([scheda("m-1", null, dalTrigger)])?.descrizione)
      .toBe("Il file di una scheda tecnica non è di questa azienda: non si può allegare.");
    expect(avvisoSchedeNonAllegate([scheda("m-1", "A", dalTrigger), scheda("m-2", null, dalTrigger)])?.descrizione)
      .toBe("I file di 2 schede tecniche non sono di questa azienda: non si possono allegare.");
  });

  it("un altro errore non viene spacciato per «di un'altra azienda»", () => {
    const rete = { code: "", message: "TypeError: Failed to fetch" };
    expect(avvisoSchedeNonAllegate([scheda("m-1", "A", dalTrigger), scheda("m-2", "B", rete)])?.descrizione).toBe(
      "Il file della scheda tecnica «A» non è di questa azienda: non si può allegare. " +
      "La scheda tecnica «B» non è stata allegata. Connessione persa. Controlla la rete e riprova.",
    );
  });
});

describe("duplicaPreventivo: le schede rifiutate non si perdono in silenzio", () => {
  it("la copia prende le schede buone e dice quale è rimasta fuori, senza fallire", async () => {
    db.estranee.add("m-copiata");
    const esito = await duplicaPreventivo("q-orig", "az-1", { comeRevisione: false });
    expect(esito.id).toBe("q-nuovo-1");
    expect(esito.nonAllegate).toEqual([scheda("m-copiata", "Scheda copiata", dalTrigger)]);
    expect(db.allegati).toEqual([{ quote_id: "q-nuovo-1", material_id: "m-buona", sort_order: 0 }]);
    expect(db.preventivi).toHaveLength(1);
  });

  it("senza schede rifiutate le copia tutte", async () => {
    const esito = await duplicaPreventivo("q-orig", "az-1", { comeRevisione: false });
    expect(esito.nonAllegate).toEqual([]);
    expect(db.allegati.map((a) => a.material_id)).toEqual(["m-buona", "m-copiata"]);
  });

  it("se non riesce a leggere le schede si ferma PRIMA di creare la copia: riprovare non fa doppioni", async () => {
    db.letturaAllegatiRotta = true;
    await expect(duplicaPreventivo("q-orig", "az-1", { comeRevisione: false })).rejects.toThrow("Lettura non riuscita");
    expect(db.preventivi).toEqual([]);
    expect(db.rpcChiamate).not.toContain("generate_quote_number");
  });
});

// Il gestore vero della creazione rapida, eseguito con servizi finti: così si
// vede l'ordine delle operazioni senza montare la pagina (come quoteSaveHandlers.test.ts).
function gestoreVero(file: string, nome: string, contesto: Record<string, unknown>) {
  const sorgente = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let inizializzatore: ts.Expression | undefined;
  const visita = (nodo: ts.Node) => {
    if (ts.isVariableDeclaration(nodo) && nodo.name.getText(sorgente) === nome) inizializzatore = nodo.initializer;
    ts.forEachChild(nodo, visita);
  };
  visita(sorgente);
  if (!inizializzatore) throw new Error(`Gestore mancante: ${nome}`);
  const codice = ts.transpileModule(`globalThis.gestore = ${inizializzatore.getText(sorgente)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.createContext(contesto);
  vm.runInContext(codice, contesto);
  return contesto.gestore as () => Promise<void>;
}

function creazioneRapida(selectedMaterials = ["m-buona", "m-copiata"]) {
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
  const resetForm = vi.fn();
  const navigate = vi.fn();
  const salva = gestoreVero("src/components/opportunities/OpportunityQuotesTab.tsx", "handleSave", {
    companyId: "az-1", user: { id: "u-1" }, contactId: "mc-1", opportunityId: "op-1",
    contact: { first_name: "Mario", last_name: "Bianchi" },
    title: "Preventivo", notes: "", validityDays: 30, discountPercent: 0,
    items: [{ name: "Box doccia", description: "", quantity: 1, unit_price: 500, discount_percent: 0, vat_rate: 22, unit_of_measure: "pz", article_template_id: null }],
    selectedMaterials,
    materials: [{ id: "m-buona", name: "Scheda buona", category: null }, { id: "m-copiata", name: "Scheda copiata", category: null }],
    supabase, allegaSchedeTecniche, avvisoSchedeNonAllegate,
    toast, resetForm, navigate, routePrefix: "/azienda/marketing",
    setSaving: () => {}, queryClient: { invalidateQueries: () => {} },
  });
  return { salva, toast, resetForm, navigate };
}

describe("Opportunità → Crea preventivo rapido: nessun preventivo doppio", () => {
  it("tutto a posto: un preventivo, le schede allegate, modulo chiuso", async () => {
    const f = creazioneRapida();
    await f.salva();
    expect(db.preventivi).toHaveLength(1);
    expect(db.allegati.map((a) => a.material_id)).toEqual(["m-buona", "m-copiata"]);
    expect(f.toast.success).toHaveBeenCalledWith("Preventivo creato in bozza");
    expect(f.resetForm).toHaveBeenCalledTimes(1);
  });

  it("una scheda rifiutata: il preventivo c'è, con le altre schede, e l'avviso dice quale manca", async () => {
    db.estranee.add("m-copiata");
    const f = creazioneRapida();
    await f.salva();
    expect(db.preventivi).toHaveLength(1);
    expect(db.righe).toHaveLength(1);
    expect(db.allegati).toEqual([{ quote_id: "q-nuovo-1", material_id: "m-buona", sort_order: 0 }]);
    expect(f.toast.warning).toHaveBeenCalledWith("Preventivo creato in bozza: una scheda tecnica non allegata", {
      description: "Il file della scheda tecnica «Scheda copiata» non è di questa azienda: non si può allegare.",
      duration: 10000,
    });
    expect(f.toast.error).not.toHaveBeenCalled();
    // Il modulo si chiude come dopo ogni salvataggio: un altro «Salva» non trova niente da ricreare.
    expect(f.resetForm).toHaveBeenCalledTimes(1);
  });

  it("righe rifiutate dopo la creazione: modulo chiuso e «Apri preventivo», non un invito a riprovare", async () => {
    db.righeRifiutate = true;
    const f = creazioneRapida();
    await f.salva();
    expect(db.preventivi).toHaveLength(1);
    expect(db.inserimentiAllegati).toBe(0);
    expect(f.resetForm).toHaveBeenCalledTimes(1);
    // Le schede vengono dopo le righe: non sono entrate nemmeno loro, e il messaggio lo dice.
    expect(f.toast.error).toHaveBeenCalledWith("Preventivo creato, ma senza i prodotti", expect.objectContaining({
      description: "I prodotti e le schede tecniche non sono stati salvati: apri il preventivo per aggiungerli, invece di crearne un altro.",
      action: expect.objectContaining({ label: "Apri preventivo" }),
    }));
    const [, opzioni] = f.toast.error.mock.calls[0] as [string, { action: { onClick: () => void } }];
    opzioni.action.onClick();
    expect(f.navigate).toHaveBeenCalledWith("/azienda/marketing/preventivi/q-nuovo-1");
  });

  it("righe rifiutate senza schede scelte: il messaggio parla solo dei prodotti", async () => {
    db.righeRifiutate = true;
    const f = creazioneRapida([]);
    await f.salva();
    expect(db.preventivi).toHaveLength(1);
    expect(f.toast.error).toHaveBeenCalledWith("Preventivo creato, ma senza i prodotti", expect.objectContaining({
      description: "I prodotti non sono stati salvati: apri il preventivo per aggiungerli, invece di crearne un altro.",
    }));
  });
});

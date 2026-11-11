/**
 * La edge function `silvio-commessa` (fase 1, lotto 1.2), col gestore vero: database e
 * storage finti (dbFinto), provider AI finto al posto di `aiRouterComplete`, PDF letti dal
 * vero `readPdfPages` su pagine finte (così i segni «--- Pagina N ---» sono quelli veri).
 *
 * Otto documenti inventati (src/test/fixtures/silvioCommessaDocumenti.ts): escono i valori
 * giusti, con la pagina e la citazione; quello che il modello s'inventa resta una proposta
 * debole; la funzione non scrive niente nel database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbFinto, denoFinto } from "../helpers/dbFinto";
import type { PdfDocumentLike, PdfTextItem } from "../../../supabase/functions/_shared/pdfExtraction";
import type { CondizioniContratto, FaseDelPiano, Frammento, RataDelPiano } from "../../../shared/silvio-commessa/piano.ts";
import {
  BYTE_JPEG, BYTE_PNG, CAPITOLATO, CONTRATTO_PRIVATO, CONTRATTO_PUBBLICO, FOTO_BAGNO, OTTO_DOCUMENTI, PIANTINA,
  RELAZIONE_SOPRALLUOGO, TESTO_BAGNO, TESTO_TINTEGGIATURA, type DocumentoDiProva,
} from "../fixtures/silvioCommessaDocumenti";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const ALTRA_AZIENDA = "e7bc8fd0-fcab-4c02-bcfe-98a1488c3e7e";
const UTENTE = "1dbe6ceb-6b04-4d43-a617-8a709cb22f07";

interface ChiamataAI { taskKey: string; messages: Array<{ role: string; content: unknown }>; idempotencyKey?: string; turnControl?: { remainingMs: () => number } }

const runtime = vi.hoisted(() => ({
  db: null as unknown as DbFinto,
  pagamento: null as Response | null,
  chiamate: [] as ChiamataAI[],
  risposte: new Map<string, unknown>(),
  errore: null as Error | null,
}));

vi.mock("../../../supabase/functions/_shared/conversioneHeic.ts", () => ({ heicInJpeg: vi.fn(async () => new Uint8Array([255, 216, 255, 217])) }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => runtime.db.client }));
vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({
  requireAuth: async () => ({ userId: UTENTE, supabaseAdmin: runtime.db.client }),
  requireCompanyAccess: async (_db: unknown, _u: string, companyId: string) => {
    if (companyId !== AZIENDA) throw new Response(JSON.stringify({ error: "Accesso negato" }), { status: 403 });
  },
}));
vi.mock("../../../supabase/functions/_shared/requirePaymentMethod.ts", () => ({
  gateAiPayment: async () => runtime.pagamento,
}));
vi.mock("../../../supabase/functions/_shared/aiRouter.ts", () => {
  // Con il nome delle classi vere: _shared/erroriAi riconosce gli errori dal nome (11/11/2026).
  class AiRouterError extends Error { name = "AiRouterError"; }
  class AiCompanyCreditError extends AiRouterError { name = "AiCompanyCreditError"; }
  return {
    AiRouterError,
    AiCompanyCreditError,
    // Il provider finto: riconosce il documento dal nome scritto nella richiesta.
    aiRouterComplete: async (opts: ChiamataAI) => {
      runtime.chiamate.push(opts);
      if (runtime.errore) throw runtime.errore;
      const richiesta = JSON.stringify(opts.messages[1]?.content ?? "");
      const nome = [...runtime.risposte.keys()].find((n) => richiesta.includes(`«${n}»`));
      const risposta = nome ? runtime.risposte.get(nome) : "{}";
      return {
        content: typeof risposta === "string" ? risposta : JSON.stringify(risposta),
        rawResponse: { choices: [{ finish_reason: "stop" }] },
        modelUsed: "finto/lettore", costBilledEur: 0.004, costRealEur: 0.003, totalTokens: 9000,
      };
    },
  };
});
vi.mock("../../../supabase/functions/_shared/pdfExtraction.ts", async () => {
  const vero = await vi.importActual<typeof import("../../../supabase/functions/_shared/pdfExtraction")>(
    "../../../supabase/functions/_shared/pdfExtraction",
  );
  // Un «PDF» finto: dopo l'intestazione, le pagine in JSON. Lo legge il vero readPdfPages.
  const documento = (bytes: ArrayBuffer): PdfDocumentLike => {
    const pagine = JSON.parse(new TextDecoder().decode(bytes).slice(9)) as string[][];
    return {
      numPages: pagine.length,
      getPage: async (n: number) => ({
        getTextContent: async () => ({
          items: pagine[n - 1].map((riga, i): PdfTextItem => ({ str: riga, transform: [1, 0, 0, 1, 40, 800 - i * 14], hasEOL: true })),
        }),
      }),
    };
  };
  return {
    ...vero,
    // L'OCR riceve la pagina come la riceverebbe dal vero estrattore (un PDF di una pagina).
    extractPdfWithCoverage: async (bytes: ArrayBuffer, opzioni: { maxChars: number; maxOcrPages?: number; deadlineMs?: number; ocrPage?: (n: number, b: Uint8Array) => Promise<{ text: string }> }) =>
      vero.readPdfPages(documento(bytes), {
        ...opzioni, imageOps: [],
        ocrPage: opzioni.ocrPage ? (n: number) => opzioni.ocrPage!(n, new Uint8Array([0x25, 0x50, 0x44, 0x46])) : undefined,
      }),
  };
});

let gestore: ((req: Request) => Promise<Response>) | null = null;

beforeEach(() => {
  runtime.db = new DbFinto();
  runtime.db.rispostaRpc.has_permission_for_company = true;
  runtime.pagamento = null;
  runtime.chiamate = [];
  runtime.risposte = new Map();
  runtime.errore = null;
});
afterEach(() => vi.unstubAllGlobals());

async function chiama(corpo: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  if (!gestore) {
    vi.resetModules();
    const d = denoFinto({ SUPABASE_URL: "https://finto.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "chiave-finta" });
    vi.stubGlobal("Deno", d.deno);
    const percorso = "../../../supabase/functions/silvio-commessa/index.ts";
    await import(/* @vite-ignore */ percorso);
    gestore = d.gestore();
  }
  const r = await gestore(new Request("https://finto.supabase.co/functions/v1/silvio-commessa", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:8080" }, body: JSON.stringify(corpo),
  }));
  return { status: r.status, data: (await r.json()) as Record<string, unknown> };
}

/** Carica il documento nello storage finto (o lo passa come testo) e lo legge. */
async function leggi(doc: DocumentoDiProva, extra: Record<string, unknown> = {}) {
  runtime.risposte.set(doc.nome, doc.risposta);
  if (doc.tipo === "testo") {
    return await chiama({ company_id: AZIENDA, fonte: { tipo: doc.fonte, etichetta: doc.nome }, testo: doc.testo, ...extra });
  }
  const percorso = `${AZIENDA}/${UTENTE}/commessa-1730300000000-${doc.nome.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
  const bytes = doc.tipo === "pdf"
    ? new TextEncoder().encode(`%PDF-1.7\n${JSON.stringify(doc.pagine)}`)
    : new Uint8Array(doc.tipo === "jpeg" ? BYTE_JPEG : BYTE_PNG);
  runtime.db.file.set(`silvio-uploads/${percorso}`, { bytes, contentType: null });
  return await chiama({ company_id: AZIENDA, fonte: { tipo: doc.fonte, etichetta: doc.nome }, file_path: percorso, ...extra });
}

const valore = (fr: Frammento, chiave: string) => {
  const area = chiave.split(".")[0] as keyof Frammento["aree"];
  return fr.aree[area]?.[chiave];
};

describe("silvio-commessa: otto documenti inventati", () => {
  it("una foto HEIC viene convertita per la visione, mantenendo l'originale", async () => {
    const path = `${AZIENDA}/${UTENTE}/commessa-foto.heic`;
    const bytes = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]);
    runtime.db.file.set(`silvio-uploads/${path}`, { bytes, contentType: "image/heic" });
    const r = await chiama({ company_id: AZIENDA, fonte: { tipo: "documento", etichetta: "Foto.heic" }, file_path: path });
    expect(r.status).toBe(200);
    expect(JSON.stringify(runtime.chiamate.at(-1)?.messages)).toContain("data:image/jpeg;base64,");
    expect(runtime.db.file.get(`silvio-uploads/${path}`)?.bytes).toEqual(bytes);
  });

  it("un HEIC danneggiato non chiama il modello e restituisce un errore recuperabile", async () => {
    const decoder = await import("../../../supabase/functions/_shared/conversioneHeic.ts");
    vi.mocked(decoder.heicInJpeg).mockRejectedValueOnce(new Error("HEIC illeggibile"));
    const path = `${AZIENDA}/${UTENTE}/commessa-rotta.heic`;
    runtime.db.file.set(`silvio-uploads/${path}`, { bytes: new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]), contentType: "image/heic" });
    const r = await chiama({ company_id: AZIENDA, file_path: path });
    expect(r.status).toBe(422); expect(r.data.error).toMatch(/originale.*conservato/);
    expect(runtime.chiamate).toHaveLength(0);
  });

  it("un testo allegato troppo lungo avvisa che il finale non è stato letto", async () => {
    const path = `${AZIENDA}/${UTENTE}/commessa-lunga.txt`;
    runtime.db.file.set(`silvio-uploads/${path}`, { bytes: new TextEncoder().encode("Lavori di prova. ".repeat(4500)), contentType: "text/plain" });
    const r = await chiama({ company_id: AZIENDA, file_path: path });
    expect(r.status).toBe(200);
    expect((r.data.frammento as Frammento).avvisi?.join(" ")).toMatch(/Documento lungo.*Dividi il documento/);
  });

  it("contratto d'appalto pubblico: importo, IVA, tempi, penali, ritenuta, anticipo, SAL, subappalto, CIG e CUP, con la pagina", async () => {
    const r = await leggi(CONTRATTO_PUBBLICO);
    expect(r.status).toBe(200);
    const fr = r.data.frammento as Frammento;
    expect(fr.fonte).toMatchObject({ tipo: "contratto", etichetta: "Contratto_appalto_Tigli.pdf" });

    expect(valore(fr, "economia.total_amount")).toMatchObject({
      valore: 184500, stato: "fatto", fiducia: 0.95,
      fonte: { tipo: "contratto", dove: "pagina 2", citazione: "L'importo dei lavori è di € 184.500,00" },
    });
    expect(valore(fr, "economia.vat_rate")).toMatchObject({ valore: 10, stato: "fatto", fonte: { dove: "pagina 2" } });
    expect(valore(fr, "fasi.work_start_date")).toMatchObject({ valore: "2027-03-01", stato: "fatto", fonte: { dove: "pagina 2" } });
    // La fine l'ha calcolata il modello: nella citazione la data non c'è.
    expect(valore(fr, "fasi.work_end_date")).toMatchObject({ valore: "2027-06-28", stato: "proposta" });
    expect(valore(fr, "fasi.work_end_date")!.fiducia).toBeLessThanOrEqual(0.4);

    const cond = valore(fr, "economia.condizioni_contratto")!;
    expect(cond.stato).toBe("fatto");
    expect(cond.valore).toMatchObject({
      numero_contratto: "2027/014", durata_giorni: 120, penale_giorno_permille: 0.5, penale_massima_pct: 10,
      ritenuta_garanzia_pct: 0.5, anticipo_pct: 20, pagamento_giorni: 60, subappalto_ammesso: true,
      subappalto_massimo_pct: 50, cig: "9A1B2C3D4E", cup: "J41B27000080001",
    } satisfies CondizioniContratto);
    const fonti = (cond.valore as CondizioniContratto).fonti!;
    expect(fonti.penale_giorno_permille).toEqual({ dove: "pagina 2", citazione: "una penale pari allo 0,5 per mille dell'importo contrattuale" });
    expect(fonti.cig.dove).toBe("pagina 1");
    expect(fonti.ritenuta_garanzia_pct.dove).toBe("pagina 3");
    expect(cond.fonte?.dove).toBe("pagina 1, pagina 2, pagina 3");

    // L'anticipo del 20 % sul totale con l'IVA: 184.500 × 1,10 × 20 %.
    expect(valore(fr, "pagamenti.rate")!.valore).toEqual([
      { label: "Anticipazione", type: "deposit", amount: 40590, percent: 20, daPercentuale: true, trigger_evento: "firma_contratto" },
    ] satisfies RataDelPiano[]);
    expect(valore(fr, "sal_scadenze.sal")!.valore).toEqual({ cadenza: "a importo", importo_minimo_eur: 40000 });
    expect(valore(fr, "cliente.nome")!.valore).toEqual({ client_company: "Condominio Via dei Tigli 12" });
    expect(valore(fr, "cantiere.indirizzo")!.valore).toEqual({ indirizzo_lavori: "Via dei Tigli 12, 20900 Monza (MB)" });
    expect(valore(fr, "comunicazione.direttore_lavori")!.valore).toEqual({ dl_notification_email: "dl.verdi@esempio.invalid" });

    expect(r.data.lettura).toMatchObject({ metodo: "pdf", pagine: 3, modello: "finto/lettore", costo_eur: 0.004 });
    expect(fr.costoEur).toBe(0.004);
  });

  it("scrittura privata: rate dalle percentuali, penale in euro, subappalto vietato; la data inventata resta proposta", async () => {
    const fr = (await leggi(CONTRATTO_PRIVATO)).data.frammento as Frammento;
    expect(valore(fr, "economia.total_amount")).toMatchObject({ valore: 38000, stato: "fatto", fonte: { dove: "pagina 1" } });
    expect(valore(fr, "fasi.work_start_date")).toMatchObject({ valore: "2027-01-15", stato: "fatto", fonte: { dove: "pagina 2" } });
    expect(valore(fr, "cliente.contatto")!.valore).toEqual({ client_phone: "333 1234567", client_email: "mario.rossi@esempio.invalid" });
    expect(valore(fr, "economia.condizioni_contratto")!.valore).toMatchObject({ penale_giorno_eur: 50, subappalto_ammesso: false, garanzia_anni: 2 });
    // 38.000 + IVA 10 % = 41.800: 30 / 40 / 30. L'evento «a metà lavori» non esiste: da scegliere.
    expect((valore(fr, "pagamenti.rate")!.valore as RataDelPiano[]).map((x) => [x.amount, x.trigger_evento])).toEqual([
      [12540, "firma_contratto"], [16720, null], [12540, "fine_lavori"],
    ]);
    const inventata = valore(fr, "fasi.expected_date")!;
    expect(inventata).toMatchObject({ stato: "proposta", fiducia: 0.3 });
    expect(inventata.nota).toMatch(/non si trova nel documento/);
  });

  it("capitolato: fasi coi nomi del documento e le durate del modello del tetto, come proposta", async () => {
    const fr = (await leggi(CAPITOLATO, { fonte: { tipo: "documento", etichetta: CAPITOLATO.nome } })).data.frammento as Frammento;
    expect(fr.fonte.tipo).toBe("documento");
    expect(valore(fr, "economia.total_amount")).toMatchObject({ valore: 96000, stato: "fatto", fonte: { dove: "pagina 2" } });
    expect(valore(fr, "economia.condizioni_contratto")!.valore).toMatchObject({ ritenuta_garanzia_pct: 0.5 });
    expect(valore(fr, "cantiere.materials_location")).toMatchObject({ valore: "Cortile interno, lato nord", fonte: { dove: "pagina 2" } });
    const fasi = valore(fr, "fasi.order_work_phases")!;
    expect(fasi.stato).toBe("proposta");
    expect(fasi.fiducia).toBeLessThanOrEqual(0.5);
    expect(fasi.nota).toMatch(/modello del tetto/);
    const elenco = fasi.valore as FaseDelPiano[];
    expect(elenco.map((f) => f.name)).toEqual([
      "Montaggio dei ponteggi", "Rimozione del manto esistente", "Isolamento termico", "Posa del nuovo manto in lamiera", "Lattoneria",
    ]);
    // Ogni fase ha giorni e inizio, una dopo l'altra; la posa prende la durata del «Nuovo manto», non della rimozione.
    elenco.forEach((f, i) => {
      expect(f.giorni).toBeGreaterThan(0);
      expect(f.giorno_inizio).toBe(i === 0 ? 1 : elenco[i - 1].giorno_inizio! + elenco[i - 1].giorni!);
    });
    expect(elenco[3].giorni).toBeGreaterThan(elenco[1].giorni!);
  });

  it("relazione di sopralluogo: cliente e cantiere; le chiavi fuori registro o da non leggere vanno negli avvisi", async () => {
    const fr = (await leggi(RELAZIONE_SOPRALLUOGO)).data.frammento as Frammento;
    expect(valore(fr, "cliente.nome")).toMatchObject({ valore: { client_name: "Anna Verdi" }, stato: "fatto", fonte: { dove: "pagina 1", citazione: "Cliente: Anna Verdi" } });
    expect(valore(fr, "identita.tipo_lavoro")!.valore).toBe("serramenti");
    expect(valore(fr, "cantiere.indirizzo")!.valore).toEqual({ indirizzo_lavori: "Via delle Rose 21, 24100 Bergamo" });
    expect(fr.aree.persone).toBeUndefined();
    expect(fr.avvisi).toEqual(expect.arrayContaining([
      "la relazione non dice l'importo",
      expect.stringMatching(/accesso.*che la commessa non ha/),
      expect.stringMatching(/Responsabile.*non si legge da un documento/),
    ]));
  });

  it("foto: passa dalla visione; niente è «fatto» e senza citazione la fiducia è bassa", async () => {
    const r = await leggi(FOTO_BAGNO);
    expect(r.status).toBe(200);
    const contenuto = runtime.chiamate.at(-1)!.messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(contenuto.find((c) => c.type === "image_url")?.image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
    const fr = r.data.frammento as Frammento;
    expect(valore(fr, "identita.internal_notes")).toMatchObject({ stato: "proposta", fiducia: 0.6, fonte: { dove: "foto", citazione: "vasca" } });
    expect(valore(fr, "economia.total_amount")).toMatchObject({ valore: 9000, stato: "proposta", fiducia: 0.3 });
    expect(r.data.lettura).toMatchObject({ metodo: "visione" });
  });

  it("piantina: locali e metri quadri, letti come proposta", async () => {
    const r = await leggi(PIANTINA);
    const contenuto = runtime.chiamate.at(-1)!.messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(contenuto.find((c) => c.type === "image_url")?.image_url?.url).toMatch(/^data:image\/png;base64,/);
    const fr = r.data.frammento as Frammento;
    expect(valore(fr, "identita.work_description")).toMatchObject({
      valore: "Appartamento: soggiorno 24,5 mq, cucina 10 mq, camera 14 mq, bagno 5,5 mq", stato: "proposta", fonte: { dove: "piantina" },
    });
  });

  it("testo libero: «12k» vale 12.000, la data scritta in parole si riconosce, il punto è «testo»", async () => {
    const r = await leggi(TESTO_BAGNO);
    expect(r.status).toBe(200);
    const fr = r.data.frammento as Frammento;
    expect(fr.fonte).toMatchObject({ tipo: "testo", etichetta: "testo scritto" });
    expect(valore(fr, "economia.total_amount")).toMatchObject({ valore: 12000, stato: "fatto", fonte: { dove: "testo", citazione: "12k" } });
    expect(valore(fr, "fasi.work_start_date")).toMatchObject({ valore: "2027-03-08", stato: "fatto" });
    expect(valore(fr, "cantiere.indirizzo")!.valore).toEqual({ indirizzo_lavori: "via Inventata 3, Monza" });
    expect(r.data.lettura).toMatchObject({ metodo: "testo", costo_eur: 0.004 });
  });

  it("testo libero con invenzioni: restano proposte deboli; la chiave fuori registro è un avviso", async () => {
    const fr = (await leggi(TESTO_TINTEGGIATURA)).data.frammento as Frammento;
    expect(valore(fr, "economia.total_amount")).toMatchObject({ valore: 4500, stato: "fatto" });
    expect(valore(fr, "economia.vat_rate")).toMatchObject({ valore: 22, stato: "fatto" });
    // La via non c'è nel testo (e il modello l'ha messa nell'area sbagliata: va nella sua).
    expect(valore(fr, "cantiere.indirizzo")).toMatchObject({ stato: "proposta", fiducia: 0.3 });
    expect(valore(fr, "fasi.work_start_date")).toMatchObject({ stato: "proposta", fiducia: 0.3, nota: expect.stringMatching(/Senza citazione/) });
    expect(fr.avvisi?.join(" ")).toMatch(/margine previsto/);
    expect(fr.avvisi?.join(" ")).not.toMatch(/economia\./);
  });

  it("su tutti e otto: una sola chiamata al modello ciascuno, solo chiavi del registro, nessuna scrittura nel database", async () => {
    for (const doc of OTTO_DOCUMENTI) {
      const prima = runtime.chiamate.length;
      const r = await leggi(doc);
      expect(r.status, doc.nome).toBe(200);
      expect(runtime.chiamate.length - prima, doc.nome).toBe(1);
      expect(runtime.chiamate.at(-1)!.taskKey).toBe("silvio_commessa_lettura");
      const fr = r.data.frammento as Frammento;
      for (const [area, valori] of Object.entries(fr.aree)) {
        for (const [chiave, v] of Object.entries(valori ?? {})) {
          expect(chiave.startsWith(`${area}.`), chiave).toBe(true);
          expect(v.fonte?.etichetta, chiave).toBe(doc.nome);
          if (v.stato === "fatto") expect(v.fonte?.citazione, `${doc.nome} ${chiave}`).toBeTruthy();
        }
      }
    }
    expect(runtime.db.operazioni.filter((o) => o.modo !== "select")).toEqual([]);
  });
});

describe("silvio-commessa: le porte", () => {
  it("risposta malformata del modello: 200 con il frammento vuoto e l'avviso, niente si rompe", async () => {
    const r = await leggi({ ...TESTO_BAGNO, risposta: "Ecco i dati: {importo: 12k" });
    expect(r.status).toBe(200);
    const fr = r.data.frammento as Frammento;
    expect(fr.aree).toEqual({});
    expect(fr.avvisi?.join(" ")).toMatch(/non si legge/);
  });

  it("crediti AI finiti: 402 col messaggio del router", async () => {
    const { AiCompanyCreditError } = await import("../../../supabase/functions/_shared/aiRouter.ts");
    runtime.errore = new AiCompanyCreditError("Credito insufficiente o bloccato: ricarica", "silvio_commessa_lettura");
    const r = await leggi(TESTO_BAGNO);
    expect(r.status).toBe(402);
    expect(r.data.error).toMatch(/Credito insufficiente/);
  });

  it("errore del provider: 502 e «riprova», il resto della commessa va avanti", async () => {
    runtime.errore = new Error("OpenRouter 503");
    const r = await leggi(TESTO_BAGNO);
    expect(r.status).toBe(502);
    expect(r.data.error).toMatch(/riprova/);
  });

  it("senza metodo di pagamento si ferma prima di scaricare il file e di chiamare il modello", async () => {
    runtime.pagamento = new Response(JSON.stringify({ error: "Serve un metodo di pagamento", code: "payment_method_required" }), { status: 402 });
    const r = await leggi(CONTRATTO_PUBBLICO);
    expect(r.status).toBe(402);
    expect(r.data.code).toBe("payment_method_required");
    expect(runtime.chiamate).toEqual([]);
  });

  it("file di un'altra azienda, percorso che cambia l'indirizzo, azienda non mia", async () => {
    expect((await chiama({ company_id: AZIENDA, file_path: `${ALTRA_AZIENDA}/${UTENTE}/commessa-1-a.pdf` })).status).toBe(403);
    expect((await chiama({ company_id: AZIENDA, file_path: `${AZIENDA}/%2e%2e/%2e%2e/rest/v1/profiles` })).status).toBe(400);
    expect((await chiama({ company_id: ALTRA_AZIENDA, testo: "rifare bagno" })).status).toBe(403);
    expect(runtime.chiamate).toEqual([]);
  });

  it("serve un file o un testo, uno dei due; formati non letti rifiutati", async () => {
    expect((await chiama({ company_id: AZIENDA })).status).toBe(400);
    expect((await chiama({ company_id: AZIENDA, testo: "x", file_path: `${AZIENDA}/${UTENTE}/a.pdf` })).status).toBe(400);
    const percorso = `${AZIENDA}/${UTENTE}/commessa-1-foglio.xlsx`;
    runtime.db.file.set(`silvio-uploads/${percorso}`, { bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), contentType: null });
    expect((await chiama({ company_id: AZIENDA, file_path: percorso })).status).toBe(415);
    expect((await chiama({ company_id: AZIENDA, file_path: `${AZIENDA}/${UTENTE}/manca.pdf` })).status).toBe(404);
  });

  it("E8: PDF scansionato con i crediti finiti durante l'OCR: 402 col messaggio del router, non «carica una foto nitida»", async () => {
    const { AiCompanyCreditError } = await import("../../../supabase/functions/_shared/aiRouter.ts");
    runtime.errore = new AiCompanyCreditError("Credito insufficiente o bloccato: ricarica", "pdf_vision_extract");
    const scansionato: DocumentoDiProva = { ...CONTRATTO_PUBBLICO, nome: "Scansione.pdf", pagine: [[""], [""]] } as DocumentoDiProva;
    const r = await leggi(scansionato);
    expect(r.status).toBe(402);
    expect(r.data.error).toMatch(/Credito insufficiente/);
    // Alla prima pagina rifiutata ci si ferma: non si riprova pagina per pagina.
    expect(runtime.chiamate).toHaveLength(1);
  });

  it("E9: OCR e lettura hanno un tempo che si accorcia, sotto i 150 secondi del gateway", async () => {
    const r = await leggi(CONTRATTO_PUBBLICO);
    expect(r.status).toBe(200);
    const turno = runtime.chiamate.at(-1)!.turnControl!;
    expect(turno).toBeTruthy();
    expect(turno.remainingMs()).toBeLessThanOrEqual(140_000);
    expect(turno.remainingMs()).toBeGreaterThan(100_000);
  });

  it("D11: a «Riprova» l'OCR non si ripaga: la chiave delle pagine non cambia col tentativo, quella della lettura sì", async () => {
    const scansionato: DocumentoDiProva = { ...CONTRATTO_PUBBLICO, nome: "Scansione.pdf", pagine: [[""], [""]] } as DocumentoDiProva;
    await leggi(scansionato, { tentativo: 0 });
    const prima = runtime.chiamate.map((c) => ({ task: c.taskKey, chiave: c.idempotencyKey }));
    runtime.chiamate.length = 0;
    await leggi(scansionato, { tentativo: 1 });
    const dopo = runtime.chiamate.map((c) => ({ task: c.taskKey, chiave: c.idempotencyKey }));
    const ocr = (l: typeof prima) => l.filter((c) => c.task === "pdf_vision_extract").map((c) => c.chiave);
    const lettura = (l: typeof prima) => l.filter((c) => c.task !== "pdf_vision_extract").map((c) => c.chiave);
    expect(ocr(prima).length).toBeGreaterThan(0);
    expect(ocr(dopo)).toEqual(ocr(prima));
    expect(lettura(dopo)).not.toEqual(lettura(prima));
  });

  it("«Riprova» è una lettura nuova: la chiave d'idempotenza cambia col tentativo", async () => {
    await leggi(TESTO_BAGNO);
    await leggi(TESTO_BAGNO);
    await leggi(TESTO_BAGNO, { tentativo: 1 });
    const chiavi = runtime.chiamate.map((c) => c.idempotencyKey);
    expect(chiavi[0]).toBe(chiavi[1]);
    expect(chiavi[2]).not.toBe(chiavi[0]);
  });
});

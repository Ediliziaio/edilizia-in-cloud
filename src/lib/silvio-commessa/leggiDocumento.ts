/**
 * Un documento qualsiasi diventa frammenti del piano della commessa (31/10/2026, fase 1,
 * lotto 1.2). Vedi docs/piano-silvio-commessa-ai.md, sezioni 3.3 e 5.3.
 *
 * Il giro, per ogni file che l'utente trascina nel popup:
 *   1. le prime righe (la prima pagina di un PDF, l'inizio di un XML o di un testo);
 *   2. il riconoscitore sceglie il lettore;
 *   3. i computi di PriMus si leggono qui, nel browser, senza AI e senza caricare niente;
 *      le offerte delle ditte vanno a `rdo-ai-estrai-offerta`; il resto si carica in
 *      silvio-uploads (`<azienda>/<utente>/commessa-…`, la cartella che la policy dello
 *      storage già concede a chi carica) e lo legge `silvio-commessa`.
 *
 * Il bucket è quello degli allegati della chat di Silvio: nessun bucket nuovo. Quando nascerà
 * la bozza (lotto 1.4) il file passerà alla commessa con lei.
 *
 * Un documento che sta già da qualche parte (fase 3) non si ricarica: `origine` dice dove.
 * Un documento della commessa o un allegato di un'email passano come riferimento alla riga
 * (`RifDocumento`), un file già in silvio-uploads (un allegato della chat) col suo percorso.
 * Così non restano copie orfane in silvio-uploads.
 *
 * Se il documento non dice le fasi ma si capisce il lavoro («rifare bagno 6 mq»), si aggiunge
 * il frammento del modello per tipo di lavoro (lotto 1.3), come stima.
 *
 * I servizi (storage, edge function, PDF) si passano da fuori: i test li sostituiscono.
 */
import { erroreLeggibile } from "./testoErrore";
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import type { CalendarioCantiere } from "../../../shared/silvio-commessa/calendario.ts";
import { dataVera } from "../../../shared/silvio-commessa/date.ts";
import { riconosciDocumento, type Riconosciuto } from "../../../shared/silvio-commessa/riconoscitore.ts";
import type { FonteLetturaAI } from "../../../shared/silvio-commessa/letturaAI.ts";
import type { RifDocumento } from "../../../shared/silvio-commessa/ingressi.ts";
import {
  frammentoDalModello, frammentoDalTesto, MODELLI_LAVORO, misuraDalTesto, riconosciTipoLavoro,
} from "../../../shared/silvio-commessa/modelliLavoro.ts";
import { frammentoDaFileComputo } from "./lettori/computo";
import type { ComputoStrutturato } from "@/lib/computo/computoStrutturato";

export const BUCKET_DOCUMENTI_COMMESSA = "silvio-uploads";

export interface ServiziLettura {
  carica(percorso: string, file: File): Promise<void>;
  /** Chiama una edge function; lancia un Error col messaggio leggibile se non riesce. */
  invoca(funzione: string, body: Record<string, unknown>): Promise<unknown>;
  leggiComputo(file: File): Promise<ComputoStrutturato>;
  primeRighe(file: File): Promise<string>;
}

export interface OpzioniLettura {
  companyId: string;
  userId: string;
  /** Inizio lavori AAAA-MM-GG, se già deciso: le fasi dei modelli e dei computi prendono le date. */
  inizio?: string | null;
  /** Il calendario dell'azienda per quelle date (revisione 1/11, L10): senza, le sole feste nazionali. */
  calendario?: CalendarioCantiere;
  /** Per «Riprova»: una lettura nuova, non quella già pagata. */
  tentativo?: number;
  /** Scelto dalla persona: sembrava un'offerta, ma va letto come un documento qualsiasi (revisione 2/11, P6). */
  comeDocumento?: boolean;
  /** L'offerta di una ditta si legge dentro la sua richiesta d'offerta. */
  rfqSupplierId?: string | null;
  /** Dove sta già il documento: si legge lì, senza caricarlo di nuovo. */
  origine?: OrigineDocumento | null;
}

export type OrigineDocumento = { documento: RifDocumento } | { percorso: string };

export interface EsitoLettura {
  riconosciuto: Riconosciuto;
  frammenti: Frammento[];
  /** Dove è stato caricato il file (solo per le letture AI di un file nuovo: va con la bozza). */
  percorso?: string;
  /** L'id della fonte nei frammenti: per la ⓘ, che riapre il documento. */
  idFonte?: string;
  /** La proposta di `rdo-ai-estrai-offerta`, da mostrare nella griglia della richiesta. */
  offerta?: unknown;
  /** Cosa manca per leggerlo (per le offerte: la richiesta d'offerta a cui appartiene). */
  daCollegare?: "richiesta_offerta";
}

/** Un nome di file che non cambia l'indirizzo dello storage (niente %, ?, #, spazi). */
export function nomePerLoStorage(nome: string): string {
  const pulito = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_").replace(/^[._]+/, "");
  return (pulito || "documento").slice(-80);
}

/** Il percorso nella cartella che la policy di silvio-uploads concede a chi carica. */
export function percorsoDocumento(opz: Pick<OpzioniLettura, "companyId" | "userId">, nome: string, adesso = Date.now()): string {
  return `${opz.companyId}/${opz.userId}/commessa-${adesso}-${nomePerLoStorage(nome)}`;
}

/**
 * Se il frammento capisce il lavoro ma non dice le fasi, il modello per tipo di lavoro le
 * propone. Il tipo di lavoro lo dice già il documento: il modello non lo ripete, così non
 * nasce un conflitto per niente. Se non c'è un inizio già deciso vale quello che dice il
 * documento: «si parte il 16/11» dà le date alle fasi.
 */
export function conModelloSeMancanoLeFasi(fr: Frammento, inizio?: string | null, calendario?: CalendarioCantiere): Frammento[] {
  if (fr.aree.fasi?.["fasi.order_work_phases"]) return [fr];
  const testi = [fr.aree.identita?.["identita.description"]?.valore, fr.aree.identita?.["identita.work_description"]?.valore]
    .filter((x): x is string => typeof x === "string").join(" ");
  const tipo = riconosciTipoLavoro(testi);
  if (!tipo) return [fr];
  const detto = fr.aree.fasi?.["fasi.work_start_date"]?.valore;
  const data = inizio || (typeof detto === "string" && dataVera(detto) ? detto : null);
  const modello = frammentoDalModello(tipo, { misura: misuraDalTesto(testi, MODELLI_LAVORO[tipo].unita), inizio: data, calendario });
  if (fr.aree.identita?.["identita.tipo_lavoro"]) delete modello.aree.identita;
  return [fr, modello];
}

async function leggiConSilvio(
  servizi: ServiziLettura, opz: OpzioniLettura,
  corpo: { fonte: { tipo: FonteLetturaAI; etichetta: string; id?: string }; file_path?: string; documento?: RifDocumento; testo?: string },
): Promise<Frammento> {
  const risposta = await servizi.invoca("silvio-commessa", { company_id: opz.companyId, tentativo: opz.tentativo ?? 0, ...corpo });
  const frammento = (risposta as { frammento?: Frammento } | null)?.frammento;
  if (!frammento || typeof frammento !== "object" || !frammento.fonte) throw new Error("Silvio non ha restituito la lettura: riprova.");
  return frammento;
}

/** Legge un file caricato nel popup: riconosce, sceglie il lettore, restituisce i frammenti. */
export async function leggiDocumento(file: File, opz: OpzioniLettura, servizi: ServiziLettura = serviziVeri): Promise<EsitoLettura> {
  const inizio = await servizi.primeRighe(file).catch(() => "");
  const riconosciuto = riconosciDocumento({ nome: file.name, mime: file.type, inizio });

  switch (riconosciuto.lettore) {
    case "non_letto":
      throw new Error(riconosciuto.motivo);

    case "computo_xpwe":
      return { riconosciuto, frammenti: [frammentoDaFileComputo(await servizi.leggiComputo(file), file.name, { inizio: opz.inizio, calendario: opz.calendario })] };

    case "computo_primus": {
      let computo: ComputoStrutturato;
      try {
        computo = await servizi.leggiComputo(file);
      } catch {
        // Sembrava PriMus e non lo è: lo legge Silvio, come un documento qualsiasi.
        return await leggiFile(file, opz, servizi, {
          ...riconosciuto, lettore: "silvio_commessa", fonte: "documento", ai: true,
          motivo: "PDF con un computo non di PriMus: lettore unico di Silvio",
        });
      }
      return { riconosciuto, frammenti: [frammentoDaFileComputo(computo, file.name, { inizio: opz.inizio, calendario: opz.calendario })] };
    }

    case "offerta_ditta": {
      if (opz.comeDocumento) return await leggiFile(file, opz, servizi, { ...riconosciuto, lettore: "silvio_commessa", fonte: "documento" });
      // Il totale di un'offerta è un costo, non l'importo della commessa: senza la richiesta
      // d'offerta a cui risponde non si legge (lo collegano le ditte e i costi, fase 4).
      if (!opz.rfqSupplierId) return { riconosciuto, frammenti: [], daCollegare: "richiesta_offerta" };
      const offerta = await servizi.invoca("rdo-ai-estrai-offerta", {
        rfq_supplier_id: opz.rfqSupplierId,
        document_base64: await comeBase64(file),
      });
      return { riconosciuto, frammenti: [], offerta };
    }

    case "silvio_commessa":
      return await leggiFile(file, opz, servizi, riconosciuto);
  }
}

async function leggiFile(file: File, opz: OpzioniLettura, servizi: ServiziLettura, riconosciuto: Riconosciuto): Promise<EsitoLettura> {
  return leggiConAI(file.name, opz, servizi, riconosciuto, async () => {
    const percorso = percorsoDocumento(opz, file.name);
    await servizi.carica(percorso, file);
    return percorso;
  });
}

/** La lettura AI: dove sta già il documento (`origine`), oppure caricandolo. */
async function leggiConAI(
  nome: string, opz: OpzioniLettura, servizi: ServiziLettura, riconosciuto: Riconosciuto, carica: () => Promise<string>,
): Promise<EsitoLettura> {
  const fonte = riconosciuto.fonte === "computo" || riconosciuto.fonte === "offerta" ? "documento" : riconosciuto.fonte;
  const o = opz.origine;
  const percorso = o ? null : await carica();
  const documento = o && "documento" in o ? o.documento : null;
  const dove = documento ? { documento } : { file_path: o && "percorso" in o ? o.percorso : percorso! };
  const frammento = await leggiConSilvio(servizi, opz, { fonte: { tipo: fonte, etichetta: nome }, ...dove });
  return {
    riconosciuto, frammenti: conModelloSeMancanoLeFasi(frammento, opz.inizio, opz.calendario),
    ...(percorso ? { percorso } : {}),
    ...(frammento.fonte.id ? { idFonte: frammento.fonte.id } : {}),
  };
}

/**
 * Un documento che il browser non può scaricare (un allegato di un'email): il lettore si
 * sceglie dal nome e dal tipo, e lo legge Silvio dove sta. Un computo XPWE o un foglio
 * vanno scaricati e caricati tra le fonti: si leggono nel browser.
 */
export async function leggiDocumentoRemoto(
  documento: RifDocumento, meta: { nome: string; mime?: string | null }, opz: OpzioniLettura, servizi: ServiziLettura = serviziVeri,
): Promise<EsitoLettura> {
  const riconosciuto = riconosciDocumento({ nome: meta.nome, mime: meta.mime ?? "" });
  if (riconosciuto.lettore === "non_letto") throw new Error(riconosciuto.motivo);
  if (riconosciuto.lettore === "offerta_ditta" && !opz.comeDocumento) return { riconosciuto, frammenti: [], daCollegare: "richiesta_offerta" };
  if (riconosciuto.lettore === "computo_xpwe") {
    throw new Error("È un computo: scaricalo e trascinalo tra le fonti, lo leggo senza AI.");
  }
  const ai = riconosciuto.lettore === "silvio_commessa" ? riconosciuto
    : { ...riconosciuto, lettore: "silvio_commessa" as const, fonte: "documento" as const, ai: true, motivo: "PDF letto da Silvio" };
  return leggiConAI(meta.nome, { ...opz, origine: { documento } }, servizi, ai, async () => { throw new Error("da non caricare"); });
}

/**
 * Un id stabile per un testo letto (revisione 1/11, L1): due testi diversi sono due fonti, e
 * rileggere lo stesso testo sostituisce la lettura di prima. I file e i documenti l'id ce
 * l'hanno già: è il percorso, che la funzione mette nel frammento (e la ⓘ usa per riaprirli).
 */
export function idDelTesto(testo: string): string {
  let h = 5381;
  for (let i = 0; i < testo.length; i++) h = ((h << 5) + h + testo.charCodeAt(i)) >>> 0;
  return `testo:${h.toString(36)}:${testo.length}`;
}

/**
 * Il testo libero o dettato («rifare bagno 6 mq a Monza, 12k»). Se la lettura AI non riesce,
 * resta il modello per tipo di lavoro, che non costa niente: la commessa va avanti lo stesso.
 */
export async function leggiTesto(testo: string, opz: OpzioniLettura, servizi: ServiziLettura = serviziVeri): Promise<EsitoLettura> {
  const riconosciuto: Riconosciuto = { lettore: "silvio_commessa", fonte: "testo", ai: true, immagine: false, motivo: "testo: lettore unico di Silvio" };
  try {
    const frammento = await leggiConSilvio(servizi, opz, { fonte: { tipo: "testo", etichetta: "testo scritto", id: idDelTesto(testo) }, testo });
    return { riconosciuto, frammenti: conModelloSeMancanoLeFasi(frammento, opz.inizio, opz.calendario) };
  } catch (e) {
    const modello = frammentoDalTesto(testo, opz.inizio, opz.calendario);
    if (!modello) throw e;
    modello.avvisi = [...(modello.avvisi ?? []), `lettura con l'AI non riuscita (${erroreLeggibile(e, "il servizio non ha risposto")}): ho usato solo il modello del lavoro`];
    return { riconosciuto: { ...riconosciuto, ai: false, motivo: "testo: modello del lavoro, senza AI" }, frammenti: [modello] };
  }
}

/** Il file come lo vogliono le edge function: base64, con il prefisso data: per le immagini. */
export async function comeBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const base64 = btoa(bin);
  return file.type.startsWith("image/") ? `data:${file.type};base64,${base64}` : base64;
}

// ── I servizi veri: storage, edge function, PDF ─────────────────────────────

/** Il testo delle prime due pagine di un PDF, o l'inizio di un file di testo; niente per le immagini. */
async function primeRighe(file: File): Promise<string> {
  const nome = file.name.toLowerCase();
  if (file.type === "application/pdf" || nome.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    const { pdfTextByLines } = await import("../../../supabase/functions/_shared/pdfExtraction");
    const caricamento = pdfjs.getDocument({ data: await file.arrayBuffer() });
    try {
      const pdf = await caricamento.promise;
      const pagine: string[] = [];
      for (let n = 1; n <= Math.min(2, pdf.numPages); n++) {
        const pagina = await pdf.getPage(n);
        pagine.push(pdfTextByLines((await pagina.getTextContent()).items as Parameters<typeof pdfTextByLines>[0]));
        pagina.cleanup();
      }
      return pagine.join("\n").slice(0, 6000);
    } finally {
      await caricamento.destroy();
    }
  }
  if (file.type.startsWith("image/")) return "";
  return (await file.slice(0, 8000).text()).slice(0, 6000);
}

export const serviziVeri: ServiziLettura = {
  carica: async (percorso, file) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase.storage.from(BUCKET_DOCUMENTI_COMMESSA)
      .upload(percorso, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw new Error(`File non caricato: ${error.message}`);
  },
  invoca: async (funzione, body) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { readInvokeError } = await import("@/lib/readInvokeError");
    const { data, error } = await supabase.functions.invoke(funzione, { body });
    if (error) throw new Error(await readInvokeError(error));
    return data;
  },
  leggiComputo: async (file) => (await import("@/lib/computo/leggiFileComputo")).leggiFileComputo(file),
  primeRighe,
};

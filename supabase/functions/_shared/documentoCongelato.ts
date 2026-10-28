/**
 * Il documento che si firma, congelato all'invio (FEA, DPCM 22/02/2013 art. 56).
 *
 * Al momento dell'invio si salva una COPIA dei byte del documento in
 * `quote-pdfs/<azienda>/richieste/<richiesta>.pdf` e se ne calcola l'impronta
 * SHA-256. Da lì in poi chi firma vede quella copia, la firma si appoggia a
 * quella copia e alla firma l'impronta si ricalcola: se il file non è più lo
 * stesso, non si firma. Prima il documento si leggeva dalla sua fonte viva
 * (preventivo, progetto, modulo): rigenerarlo dopo l'invio cambiava quello che
 * il cliente firmava, e per gli ordini dell'app operai non c'era alcun documento.
 *
 * Il fotovoltaico conserva l'HTML originale per l'anteprima: prima dell'invio
 * lo stampa con Chromium e congela il PDF completo, non il solo certificato.
 *
 * Per gli ordini il documento è un verbale costruito qui, con i dati della
 * commessa, il tipo di documento e le note scritte da chi lo manda.
 */

import { fotovoltaicoPdfOriginale } from "./fotovoltaicoPdfOriginale.ts";
import { fvSchedeFirma } from "./fvSchedeFirma.ts";
export const BUCKET_RICHIESTE = "quote-pdfs";
const MAX_DOCUMENTO = 25 * 1024 * 1024;

import { sha256Hex } from "./improntaDocumento.ts";
export { sha256Hex } from "./improntaDocumento.ts";

export const pathDocumentoCongelato = (companyId: string, richiestaId: string, estensione: "pdf" | "html" = "pdf") =>
  `${companyId}/richieste/${richiestaId}.${estensione}`;

export const eUnPdf = (b: Uint8Array) => b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
/** Una pagina HTML (il preventivo fotovoltaico): comincia con «<» dopo spazi e BOM. */
export const eUnaPaginaHtml = (b: Uint8Array) => {
  const testa = new TextDecoder().decode(b.subarray(0, 512)).replace(/^\uFEFF/, "").trimStart();
  return testa.startsWith("<");
};

/** Errore da mostrare a chi manda il documento (frase semplice, niente dettagli tecnici). */
export class DocumentoNonPronto extends Error {}

export const CATEGORIE_VERBALE: Record<string, string> = {
  verbale_consegna: "Verbale di consegna",
  collaudo_finale: "Collaudo fine lavori",
  accettazione_lavori: "Accettazione lavori",
  verbale_sopralluogo: "Verbale di sopralluogo",
  presa_misure: "Presa misure",
  altro: "Documento",
};

interface DatiVerbale {
  azienda: string;
  titolo: string;
  commessa: string;
  descrizione: string | null;
  cliente: string | null;
  indirizzo: string | null;
  note: string | null;
  firmatario: string;
  data: string;
}

/** Il verbale di un ordine (app operai): una pagina A4 di testo, con quello che si firma. */
export async function costruisciVerbaleOrdine(d: DatiVerbale): Promise<Uint8Array> {
  // Caricati qui: chi usa solo l'impronta o la copia non si porta dietro pdf-lib.
  const { PDFDocument, StandardFonts, rgb } = await import("https://esm.sh/pdf-lib@1.17.1");
  const { aCapo, perPdf } = await import("./pdfFirmato.ts");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const larghezza = 595.28 - 2 * 56;
  let pagina = pdf.addPage([595.28, 841.89]);
  let y = 841.89 - 64;
  const scrivi = (testo: string, opz: { font?: typeof regular; size?: number; colore?: number; spazio?: number } = {}) => {
    const font = opz.font ?? regular;
    const size = opz.size ?? 10.5;
    for (const riga of aCapo(perPdf(testo), font, size, larghezza)) {
      if (y < 70) { pagina = pdf.addPage([595.28, 841.89]); y = 841.89 - 64; }
      pagina.drawText(riga, { x: 56, y, size, font, color: rgb(opz.colore ?? 0.07, opz.colore ?? 0.07, opz.colore ?? 0.07) });
      y -= size * 1.45;
    }
    y -= opz.spazio ?? 4;
  };
  scrivi(d.azienda, { font: bold, size: 11, colore: 0.3 });
  y -= 10;
  scrivi(d.titolo.toUpperCase(), { font: bold, size: 16, spazio: 14 });
  scrivi(`Commessa: ${d.commessa}`, { font: bold });
  if (d.descrizione) scrivi(`Lavori: ${d.descrizione}`);
  if (d.cliente) scrivi(`Cliente: ${d.cliente}`);
  if (d.indirizzo) scrivi(`Luogo dei lavori: ${d.indirizzo}`);
  scrivi(`Data: ${d.data}`, { spazio: 14 });
  scrivi("Contenuto", { font: bold, size: 12 });
  scrivi(d.note?.trim() || "Nessuna annotazione.", { spazio: 16 });
  scrivi(`Con la firma elettronica ${d.firmatario} conferma di aver letto il presente documento e di approvarne il contenuto.`, { spazio: 8 });
  pdf.setTitle(perPdf(`${d.titolo} - ${d.commessa}`));
  pdf.setProducer("Edilizia in Cloud");
  return await pdf.save();
}

// deno-lint-ignore no-explicit-any
async function scaricaDaStorage(sb: any, bucket: string, path: string): Promise<Uint8Array> {
  const { data: file, error } = await sb.storage.from(bucket).download(path);
  if (error || !file) throw new DocumentoNonPronto("Il documento da firmare non si apre: preparalo di nuovo e riprova.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_DOCUMENTO) throw new DocumentoNonPronto("Il documento da firmare è troppo grande (oltre 25 MB).");
  return bytes;
}

async function scaricaDaIndirizzo(url: string): Promise<Uint8Array> {
  let res: Response;
  try { res = await fetch(url, { signal: AbortSignal.timeout(15_000) }); } catch {
    throw new DocumentoNonPronto("Il documento da firmare non si apre: riprova tra qualche istante.");
  }
  if (!res.ok) throw new DocumentoNonPronto("Il documento da firmare non si apre: preparalo di nuovo e riprova.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_DOCUMENTO) throw new DocumentoNonPronto("Il documento da firmare è troppo grande (oltre 25 MB).");
  return bytes;
}

export interface FonteDocumento {
  tipo: string;
  documentoId: string;
  companyId: string;
  aziendaNome: string;
  categoria?: string | null;
  note?: string | null;
  firmatario: string;
  /** Per i preventivi: il PDF appena generato da send-quote-signature. */
  pathPdf?: string | null;
}

/** I byte del documento da firmare, presi dalla sua fonte. Lancia `DocumentoNonPronto` se manca. */
// deno-lint-ignore no-explicit-any
export async function bytesDelDocumento(sb: any, f: FonteDocumento): Promise<Uint8Array> {
  if (f.pathPdf) return await scaricaDaStorage(sb, BUCKET_RICHIESTE, f.pathPdf);
  switch (f.tipo) {
    case "subappalto": {
      const { data } = await sb.from("contratti_subappalto").select("pdf_path").eq("id", f.documentoId).maybeSingle();
      if (!data?.pdf_path) throw new DocumentoNonPronto("Prepara prima il PDF del contratto da firmare");
      return await scaricaDaStorage(sb, BUCKET_RICHIESTE, data.pdf_path);
    }
    case "quote": {
      const { data } = await sb.from("quotes").select("pdf_storage_path").eq("id", f.documentoId).maybeSingle();
      if (!data?.pdf_storage_path) throw new DocumentoNonPronto("Prepara prima il PDF del preventivo");
      return await scaricaDaStorage(sb, BUCKET_RICHIESTE, data.pdf_storage_path);
    }
    case "fv": {
      const { data } = await sb.from("fv_progetti").select("pdf_vendita_url, pdf_vendita_con_condizioni").eq("id", f.documentoId).maybeSingle();
      if (!data?.pdf_vendita_url) throw new DocumentoNonPronto("Genera prima il preventivo (ultimo passo, «Genera ed emetti preventivo»): è il documento che il cliente firma.");
      // Il preventivo firmato è il contratto: la versione senza condizioni contrattuali — quella del primo
      // invio, in cui si mostra solo il prezzo — non si manda in firma. L'applicazione la rigenera da sé con
      // le condizioni dentro; se non ci è riuscita, lo si dice invece di far firmare un contratto muto.
      if (data.pdf_vendita_con_condizioni === false) {
        throw new DocumentoNonPronto("Il preventivo emesso è senza condizioni contrattuali: rimettile e rigeneralo (ultimo passo, «Genera ed emetti preventivo») prima di mandarlo in firma.");
      }
      return await scaricaDaStorage(sb, "fv-progetti", data.pdf_vendita_url);
    }
    case "sessione": {
      const { data } = await sb.from("documento_sessioni").select("pdf_url").eq("id", f.documentoId).maybeSingle();
      if (!data?.pdf_url) throw new DocumentoNonPronto("Prepara prima il PDF del modulo da firmare");
      return await scaricaDaIndirizzo(data.pdf_url);
    }
    case "order": {
      const { data: o } = await sb.from("orders")
        .select("order_code, description, work_description, client_name, client_company, indirizzo_lavori, work_address")
        .eq("id", f.documentoId).maybeSingle();
      if (!o) throw new DocumentoNonPronto("Commessa non trovata");
      return await costruisciVerbaleOrdine({
        azienda: f.aziendaNome,
        titolo: CATEGORIE_VERBALE[String(f.categoria ?? "altro")] ?? "Documento",
        commessa: String(o.order_code ?? ""),
        descrizione: o.work_description ?? o.description ?? null,
        cliente: o.client_company || o.client_name || null,
        indirizzo: o.indirizzo_lavori || o.work_address || null,
        note: f.note ?? null,
        firmatario: f.firmatario,
        data: new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "long", year: "numeric" }),
      });
    }
    default:
      throw new DocumentoNonPronto("Questo tipo di documento non si può mandare in firma da qui.");
  }
}

/**
 * Salva la copia congelata del documento per la richiesta e ne restituisce
 * percorso e impronta. Da chiamare PRIMA di creare la richiesta, con l'id che
 * la richiesta avrà.
 */
// deno-lint-ignore no-explicit-any
export async function congelaDocumento(sb: any, f: FonteDocumento, richiestaId: string): Promise<{ path: string; hash: string }> {
  let bytes = await bytesDelDocumento(sb, f);
  if (f.tipo === "fv" && !eUnPdf(bytes)) {
    if (!eUnaPaginaHtml(bytes)) throw new DocumentoNonPronto("Il preventivo fotovoltaico non contiene un documento valido.");
    try {
      bytes = await fotovoltaicoPdfOriginale(bytes, await fvSchedeFirma(sb, f.companyId, f.documentoId));
    } catch (error) {
      throw new DocumentoNonPronto(error instanceof Error ? error.message : "PDF completo non disponibile. Riprova prima di inviare per la firma.");
    }
  }
  if (f.tipo === "fv") {
    try {
      const { PDFDocument } = await import("https://esm.sh/pdf-lib@1.17.1");
      if (!(await PDFDocument.load(bytes)).getPageCount()) throw new Error("PDF vuoto");
    } catch {
      throw new DocumentoNonPronto("Il PDF del fotovoltaico non è leggibile. Rigenera il preventivo prima di inviare la firma.");
    }
  }
  const pdf = eUnPdf(bytes);
  if (!pdf && !eUnaPaginaHtml(bytes)) throw new DocumentoNonPronto("Il documento da firmare deve essere un PDF.");
  const path = pathDocumentoCongelato(f.companyId, richiestaId, pdf ? "pdf" : "html");
  const { error } = await sb.storage.from(BUCKET_RICHIESTE).upload(path, bytes, { contentType: pdf ? "application/pdf" : "text/html", upsert: false });
  if (error) throw new Error(`Copia del documento non salvata: ${error.message}`);
  return { path, hash: await sha256Hex(bytes) };
}

/** I byte della copia congelata e se l'impronta è ancora quella registrata. */
// deno-lint-ignore no-explicit-any
export async function rileggiDocumentoCongelato(sb: any, path: string, hashAtteso: string | null): Promise<{ bytes: Uint8Array; hash: string; integro: boolean }> {
  const bytes = await scaricaDaStorage(sb, BUCKET_RICHIESTE, path);
  const hash = await sha256Hex(bytes);
  return { bytes, hash, integro: !!hashAtteso && hash === hashAtteso };
}

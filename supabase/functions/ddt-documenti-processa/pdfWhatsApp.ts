import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gruppiDdtVerificabili, numeroBollaDaTesto, paginaDiTotale } from "../../../shared/ddtPaginePdf.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { conRegoleDocumento } from "../_shared/documentoNonFidato.ts";
import { estraiPagineTestoPdf } from "../_shared/pdfExtraction.ts";
import { parteFileDdt } from "../_shared/lettoreDdt.ts";
import { leggiJsonDalModello } from "../_shared/rispostaModello.ts";
import type { DocumentoJob } from "./worker.ts";

const LIMITE_PAGINE = 120;
const LIMITE_PAGINE_OCR = 40;
const PAGINE_PER_LETTURA = 5;
const LIMITE_PARTE = 18 * 1024 * 1024;

async function impronta(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return Array.from(hash, b => b.toString(16).padStart(2, "0")).join("");
}

async function idDellaParte(idOriginale: string, hash: string): Promise<string> {
  const id = await impronta(new TextEncoder().encode(`${idOriginale}:${hash}`));
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-5${id.slice(13, 16)}-8${id.slice(17, 20)}-${id.slice(20, 32)}`;
}

async function intestazioniDaScansione(db: SupabaseClient, job: DocumentoJob, pagine: number[], pdf: Uint8Array): Promise<Map<number, string>> {
  const ai = await aiRouterComplete({
    supabase: db, companyId: job.company_id, userId: job.created_by ?? undefined, taskKey: "pdf_vision_extract",
    idempotencyKey: `ddt_intestazioni_v1_${job.company_id}_${job.file_hash}_${pagine.join("-")}`,
    messages: [
      { role: "system", content: conRegoleDocumento(
        "Trascrivi le intestazioni di documenti di trasporto, una pagina alla volta. Riporta solo il tipo documento, il numero DDT, fornitore, data e indicazione pagina X di Y quando sono visibili. " +
        "Non usare il numero d’ordine, fattura o riferimento cliente al posto del numero del DDT. Non dedurre numeri da altre pagine. " +
        'Rispondi con {"pagine":[{"pagina":1,"intestazione":"testo letterale"}]}. Usa la numerazione interna del piccolo PDF da 1 in poi e una stringa vuota per intestazioni illeggibili.',
      ) },
      { role: "user", content: [
        { type: "text", text: `Trascrivi le ${pagine.length} intestazioni nell’ordine del file. Ignora le righe della merce.` },
        parteFileDdt({ base64: bytesToBase64(pdf), mime: "application/pdf", fileName: "intestazioni-ddt.pdf" }),
      ] },
    ],
    params: { temperature: 0, max_tokens: 220 * pagine.length },
    responseFormat: { type: "json_object" },
  });
  const risultato = leggiJsonDalModello(ai.content);
  const voci = risultato?.pagine;
  const lette = new Map<number, string>();
  if (!Array.isArray(voci) || voci.length !== pagine.length) return lette;
  const pagineViste = new Set<number>();
  for (const riga of voci) {
    if (!riga || !Number.isInteger(riga.pagina) || riga.pagina < 1 || riga.pagina > pagine.length ||
      typeof riga.intestazione !== "string" || riga.intestazione.length > 600) return new Map();
    const pagina = pagine[riga.pagina - 1];
    if (pagineViste.has(pagina)) return new Map();
    pagineViste.add(pagina);
    const testo = riga.intestazione.trim();
    if (numeroBollaDaTesto(testo) || paginaDiTotale(testo)) lette.set(pagina, testo);
  }
  return lette;
}

/** La copia di ogni parte è ripetibile. Solo la transazione finale rende le bolle visibili. */
export async function preparaPdfWhatsApp(db: SupabaseClient, job: DocumentoJob, bytes: Uint8Array) {
  // @ts-ignore -- dipendenza della edge, già usata da pdfExtraction
  const { PDFDocument } = await import(/* @vite-ignore */ "https://esm.sh/pdf-lib@1.17.1");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false }).catch((): null => null);
  if (!pdf) return "da_controllare";
  const numeroPagine = pdf.getPageCount();
  if (numeroPagine === 1) return "singola";
  if (numeroPagine > LIMITE_PAGINE) return "da_controllare";
  const testo = await estraiPagineTestoPdf(bytes, LIMITE_PAGINE, 180_000).catch((): null => null);
  const pagine = Array<string>(numeroPagine).fill("");
  for (const riga of testo?.pagine ?? []) pagine[riga.pagina - 1] = riga.testo;
  const daLeggere = pagine.flatMap((p, i) => numeroBollaDaTesto(p) || paginaDiTotale(p) ? [] : [i]);
  if (daLeggere.length > LIMITE_PAGINE_OCR) return "da_controllare";
  const blocchi: number[][] = [];
  for (let i = 0; i < daLeggere.length; i += PAGINE_PER_LETTURA) blocchi.push(daLeggere.slice(i, i + PAGINE_PER_LETTURA));
  for (let i = 0; i < blocchi.length; i += 2) {
    const estratte = await Promise.all(blocchi.slice(i, i + 2).map(async indici => {
      const fascicolo = await PDFDocument.create({ updateMetadata: false });
      for (const pagina of await fascicolo.copyPages(pdf, indici)) fascicolo.addPage(pagina);
      const copia = new Uint8Array(await fascicolo.save());
      return copia.byteLength <= LIMITE_PARTE ? intestazioniDaScansione(db, job, indici, copia) : new Map<number, string>();
    }));
    for (const lettura of estratte) for (const [indice, intestazione] of lettura) pagine[indice] = intestazione;
    if (estratte.some((lettura, offset) => lettura.size !== blocchi[i + offset].length)) return "da_controllare";
  }
  const gruppi = gruppiDdtVerificabili(pagine);
  if (!gruppi?.length) return "da_controllare";
  if (gruppi.length === 1) return "singola";

  const parti = [];
  for (const gruppo of gruppi) {
    const parte = await PDFDocument.create({ updateMetadata: false });
    for (const pagina of await parte.copyPages(pdf, gruppo)) parte.addPage(pagina);
    const dati = new Uint8Array(await parte.save());
    if (!dati.byteLength || dati.byteLength > LIMITE_PARTE) return "da_controllare";
    const sha256 = await impronta(dati);
    const id = await idDellaParte(job.id, sha256);
    const path = `${job.company_id}/${job.created_by}/${id}/1-originale.pdf`;
    const { error } = await db.storage.from("ddt-documenti").upload(path, dati, { contentType: "application/pdf", upsert: false });
    if (error && String(error.statusCode) !== "409" && !/already exists|duplicate/i.test(error.message)) {
      throw new Error("Salvataggio parti PDF temporaneamente non disponibile");
    }
    const numero = numeroBollaDaTesto(pagine[gruppo[0]]) ?? String(gruppo[0] + 1);
    parti.push({ id, name: `Bolla ${numero.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf`, size: dati.byteLength, sha256,
      file_hash: await impronta(new TextEncoder().encode(sha256)) });
  }
  const { data, error } = await db.rpc("ddt_whatsapp_dividi_pdf", {
    p_id: job.id, p_lease: job.lease_id, p_figli: parti,
  });
  if (error) throw new Error("Salvataggio divisione PDF temporaneamente non disponibile");
  return data === true ? "split" : "lease_scaduta";
}

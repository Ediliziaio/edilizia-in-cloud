/**
 * Commessa generale dai documenti — preparazione nel browser (lotto 1 del piano
 * docs/piano-commessa-generale-da-documenti.md, §3.1-3.2).
 *
 * Tutto quello che si può fare senza AI e senza la CPU del server lo fa il browser:
 * - computi, elenchi prezzi e stime della sicurezza in XPWE, Excel o PDF di PriMus: letti con
 *   `leggiFileComputo` (gli stessi lettori del popup «Importa voci»);
 * - PDF: pagina per pagina, il testo nativo si tiene; una pagina che è un'immagine si ritaglia in
 *   un PDF di una pagina e si carica per l'OCR; una pagina-immagine quasi bianca (si guarda il
 *   disegno in piccolo) non va all'OCR;
 * - foto (JPG, PNG, WEBP): una pagina da leggere.
 * Poi `generale_lettura_crea` registra la lettura con le pagine e la stima.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasLargePdfImage, pdfTextByLines, type PdfTextItem } from "../../../../../supabase/functions/_shared/pdfExtraction";
import { leggiFileComputo, PdfDaLeggereConAi } from "@/lib/computo/leggiFileComputo";
import { riconosciPagina } from "./pagine";
import type { Strutturati, Strutturato } from "./strutturati";
import type { TipoDaDocumenti } from "./catalogo";

export const BUCKET_LETTURE = "documenti-smart";
export const MAX_BYTE_FILE = 100 * 1024 * 1024;
export const MAX_PAGINE = 400;
const DOCUMENTI_STRUTTURABILI = new Set(["computo", "elenco_prezzi", "sicurezza"]);

export interface FileDaLeggere { file: File; documento: string }

export interface FileRegistrato {
  id: string; nome: string; documento: string; percorso: string; mime: string; byte: number; pagine: number; strutturato: boolean;
}

export interface PaginaPreparata {
  file_id: string; numero: number; stato: "in_coda" | "testo" | "bianca" | "parser" | "esclusa";
  classe?: string; testo?: string | null; percorso?: string; hash?: string;
}

export type AvanzamentoPreparazione = (testo: string, quota: number) => void;

const nomeSicuro = (n: string) => n.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-80) || "file";

async function sha256(byte: ArrayBuffer | Uint8Array): Promise<string> {
  const copia = byte instanceof Uint8Array ? byte.slice().buffer : byte.slice(0);
  const h = await crypto.subtle.digest("SHA-256", copia as ArrayBuffer);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function tipoDelFile(f: File): "pdf" | "immagine" | "computo" | "altro" {
  const n = f.name.toLowerCase();
  if (n.endsWith(".xpwe") || n.endsWith(".xlsx")) return "computo";
  if (n.endsWith(".pdf") || f.type === "application/pdf") return "pdf";
  if (/\.(jpe?g|png|webp)$/.test(n) || /^image\/(jpeg|png|webp)$/.test(f.type)) return "immagine";
  return "altro";
}

/** Se un file si può caricare, o perché no. */
export function fileAccettabile(f: File): string | null {
  if (f.size > MAX_BYTE_FILE) return `${f.name}: supera i 100 MB.`;
  const t = tipoDelFile(f);
  if (t === "altro") {
    if (/\.(heic|heif)$/i.test(f.name)) return `${f.name}: le foto HEIC si salvano prima in JPG.`;
    if (/\.dcf$/i.test(f.name)) return `${f.name}: il file .dcf di PriMus va esportato in XPWE.`;
    return `${f.name}: si caricano PDF, foto JPG/PNG, file XPWE ed Excel .xlsx.`;
  }
  return null;
}

function strutturatoDa(c: Awaited<ReturnType<typeof leggiFileComputo>>, documento: string): Strutturato {
  const voci = c.voci.filter((v) => !v.is_detrazione).map((v) => ({
    codice: v.codice_tariffa || null,
    descrizione: v.descrizione ?? "",
    unita: v.unita_misura ?? "",
    quantita: v.quantita ?? 0,
    prezzo: v.prezzo_unitario ?? 0,
    importo: v.importo ?? 0,
    capitolo: v.categoria?.nome ?? v.super_categoria?.nome ?? null,
  }));
  const somma = Math.round(voci.reduce((s, v) => s + (v.importo || 0), 0) * 100) / 100;
  return {
    formato: c.formato, documento, voci,
    totale: c.totale_netto ?? c.totale_dichiarato ?? somma,
    oggetto: c.metadata.oggetto_lavori ?? null,
    committente: c.metadata.committente ?? null,
  };
}

/** Quanto «inchiostro» c'è in una pagina disegnata in piccolo: sotto lo 0,2% è bianca. */
async function quasiBianca(pagina: { getViewport(o: { scale: number }): { width: number; height: number }; render(o: unknown): { promise: Promise<void> } }): Promise<boolean> {
  try {
    const vista = pagina.getViewport({ scale: 0.25 });
    const tela = document.createElement("canvas");
    tela.width = Math.max(1, Math.round(vista.width)); tela.height = Math.max(1, Math.round(vista.height));
    const ctx = tela.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, tela.width, tela.height);
    await pagina.render({ canvasContext: ctx, viewport: vista, canvas: tela }).promise;
    const { data } = ctx.getImageData(0, 0, tela.width, tela.height);
    let scuri = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 600) scuri++;
    return scuri / (data.length / 4) < 0.002;
  } catch {
    return false;
  }
}

async function caricaSu(db: SupabaseClient, percorso: string, corpo: Blob | Uint8Array, mime: string) {
  const { error } = await db.storage.from(BUCKET_LETTURE).upload(percorso, corpo, { upsert: true, contentType: mime });
  if (error) throw new Error(`Caricamento non riuscito: ${error.message}`);
}

/** Lavori in parallelo, al massimo `n` alla volta. */
async function aGruppi<T>(lavori: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(lavori.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lavori.length) }, async () => {
    while (i < lavori.length) { const k = i++; out[k] = await lavori[k](); }
  }));
  return out;
}

async function preparaPdf(db: SupabaseClient, f: FileDaLeggere, fileId: string, cartella: string, avanza: AvanzamentoPreparazione): Promise<PaginaPreparata[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const { PDFDocument } = await import("pdf-lib");
  const byte = await f.file.arrayBuffer();
  const caricamento = pdfjs.getDocument({ data: byte.slice(0) });
  const pdf = await caricamento.promise.catch((e: unknown) => {
    if ((e as { name?: string })?.name === "PasswordException") throw new Error(`${f.file.name}: il PDF è protetto da password.`);
    throw new Error(`${f.file.name}: il PDF è danneggiato o non si apre.`);
  });
  if (pdf.numPages > MAX_PAGINE) { await caricamento.destroy(); throw new Error(`${f.file.name}: ha ${pdf.numPages} pagine, il massimo è ${MAX_PAGINE}. Dividilo.`); }
  const OPS = pdfjs.OPS as Record<string, number>;
  const opzioni = {
    imageOps: [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObjectRepeat, OPS.paintInlineImageXObjectGroup].filter(Number.isFinite),
    transformOp: OPS.transform, saveOp: OPS.save, restoreOp: OPS.restore,
  };
  let sorgente: Awaited<ReturnType<typeof PDFDocument.load>> | null = null;
  const pagine: PaginaPreparata[] = [];
  const daCaricare: (() => Promise<void>)[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      avanza(`${f.file.name}: pagina ${n} di ${pdf.numPages}`, n / pdf.numPages);
      const pagina = await pdf.getPage(n);
      const testo = pdfTextByLines((await pagina.getTextContent()).items as PdfTextItem[]);
      const operatori = await pagina.getOperatorList();
      const immagine = hasLargePdfImage(operatori, opzioni, pagina.getViewport({ scale: 1 }));
      if (testo.trim() && !immagine) {
        const r = riconosciPagina(testo);
        pagine.push(r.esclusa
          ? { file_id: fileId, numero: n, stato: "esclusa", classe: r.classe, testo: null }
          : { file_id: fileId, numero: n, stato: "testo", classe: r.classe, testo });
      } else if (!testo.trim() && (operatori.fnArray.length === 0 || await quasiBianca(pagina as never))) {
        pagine.push({ file_id: fileId, numero: n, stato: "bianca", classe: "Pagina bianca" });
      } else {
        sorgente ??= await PDFDocument.load(byte, { ignoreEncryption: true, updateMetadata: false });
        const una = await PDFDocument.create({ updateMetadata: false });
        const [copia] = await una.copyPages(sorgente, [n - 1]);
        una.addPage(copia);
        const unaByte = await una.save({ useObjectStreams: false });
        const hash = await sha256(unaByte);
        const percorso = `${cartella}${fileId}/p${String(n).padStart(4, "0")}.pdf`;
        pagine.push({ file_id: fileId, numero: n, stato: "in_coda", percorso, hash });
        daCaricare.push(() => caricaSu(db, percorso, new Blob([unaByte.slice().buffer as ArrayBuffer], { type: "application/pdf" }), "application/pdf"));
      }
      pagina.cleanup();
    }
  } finally {
    await caricamento.destroy();
  }
  let fatte = 0;
  await aGruppi(daCaricare.map((l) => async () => { await l(); fatte++; avanza(`${f.file.name}: caricate ${fatte} di ${daCaricare.length} pagine da leggere`, fatte / daCaricare.length); }), 4);
  return pagine;
}

export interface Preparazione { file: FileRegistrato[]; pagine: PaginaPreparata[]; strutturati: Strutturati; cartella: string }

/** Prepara i file e li carica. Non registra ancora la lettura: lo fa `registraLettura`. */
export async function preparaFile(db: SupabaseClient, companyId: string, files: FileDaLeggere[], avanza: AvanzamentoPreparazione): Promise<Preparazione> {
  const cartella = `${companyId}/generali-letture/${crypto.randomUUID()}/`;
  const registrati: FileRegistrato[] = [];
  const pagine: PaginaPreparata[] = [];
  const strutturati: Strutturati = {};
  for (const [i, f] of files.entries()) {
    const motivo = fileAccettabile(f.file);
    if (motivo) throw new Error(motivo);
    const id = `f${i + 1}`;
    const percorso = `${cartella}${id}-${nomeSicuro(f.file.name)}`;
    avanza(`Carico ${f.file.name}`, 0);
    await caricaSu(db, percorso, f.file, f.file.type || "application/octet-stream");
    const tipo = tipoDelFile(f.file);
    let strutturato: Strutturato | null = null;
    if (tipo === "computo" || (tipo === "pdf" && DOCUMENTI_STRUTTURABILI.has(f.documento))) {
      try {
        strutturato = strutturatoDa(await leggiFileComputo(f.file), f.documento);
      } catch (e) {
        if (tipo === "computo" || !(e instanceof PdfDaLeggereConAi)) throw new Error(`${f.file.name}: ${(e as Error).message}`, { cause: e });
      }
    }
    let nPagine = 1;
    if (strutturato) {
      strutturati[id] = strutturato;
      pagine.push({ file_id: id, numero: 1, stato: "parser", classe: `${f.documento === "sicurezza" ? "Stima della sicurezza" : "Computo"} (senza AI)` });
    } else if (tipo === "pdf") {
      const p = await preparaPdf(db, f, id, cartella, avanza);
      nPagine = p.length;
      pagine.push(...p);
    } else {
      // Una foto: è già la pagina da leggere.
      const byte = await f.file.arrayBuffer();
      pagine.push({ file_id: id, numero: 1, stato: "in_coda", percorso, hash: await sha256(byte) });
    }
    registrati.push({ id, nome: f.file.name, documento: f.documento, percorso, mime: f.file.type, byte: f.file.size, pagine: nPagine, strutturato: !!strutturato });
  }
  return { file: registrati, pagine, strutturati, cartella };
}

export async function registraLettura(
  db: SupabaseClient, companyId: string, tipo: TipoDaDocumenti, forma: string | null, generaleId: string | null, p: Preparazione,
): Promise<string> {
  const { data, error } = await db.rpc("generale_lettura_crea" as never, {
    p_company: companyId, p_tipo: tipo, p_forma: forma, p_generale: generaleId,
    p_file: p.file, p_pagine: p.pagine, p_strutturati: p.strutturati,
  } as never);
  if (error) throw new Error(error.message);
  return data as unknown as string;
}

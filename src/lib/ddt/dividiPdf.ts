/**
 * Un PDF con tante bolle dentro (05/11/2026): dove finisce una e comincia l'altra. Si guarda il testo
 * di ogni pagina, senza spendere una lettura AI: il numero di bolla e il «pagina X di Y». Il taglio è
 * una proposta: la persona lo vede sulle miniature e lo sposta. Una bolla tagliata male smista male tutto.
 */

const NUMERO = /(?:d\.?\s?d\.?\s?t\.?|documento\s+di\s+trasporto|bolla(?:\s+di\s+consegna)?|doc(?:umento)?\.?)\s*(?:di\s+vendita\s+)?(?:n(?:r|um(?:ero)?)?\s*[.°º:]*\s*|numero\s*:?\s*)([A-Za-z0-9][A-Za-z0-9/._-]{0,24})/i;
const PAGINA = /\bpag(?:ina|\.)?\s*(\d{1,3})\s*(?:di|\/|of)\s*(\d{1,3})\b/i;

export function numeroBollaDaTesto(testo: string): string | null {
  const m = testo.replace(/\s+/g, " ").match(NUMERO);
  return m ? m[1].replace(/[./_-]+$/, "").toUpperCase() : null;
}

export function paginaDiTotale(testo: string): { pagina: number; totale: number } | null {
  const m = testo.match(PAGINA);
  if (!m) return null;
  const pagina = Number(m[1]);
  const totale = Number(m[2]);
  return pagina >= 1 && totale >= pagina ? { pagina, totale } : null;
}

export interface PropostaTagli {
  /** Le pagine (da 0) con cui comincia una bolla nuova. La prima non si elenca. */
  tagli: number[];
  /** Pagine senza testo: una scansione, dove si taglia a ogni pagina e va guardato. */
  senzaTesto: number;
}

export function tagliProposti(testi: ReadonlyArray<string>): PropostaTagli {
  const tagli: number[] = [];
  let senzaTesto = testi.length > 0 && !testi[0].trim() ? 1 : 0;
  let numeroCorrente = testi.length > 0 ? numeroBollaDaTesto(testi[0]) : null;
  for (let i = 1; i < testi.length; i++) {
    const testo = testi[i];
    if (!testo.trim()) {
      // Scansione: la maggior parte delle bolle sta su una pagina. Meglio un taglio da togliere che due bolle fuse.
      senzaTesto += 1;
      tagli.push(i);
      numeroCorrente = null;
      continue;
    }
    const pag = paginaDiTotale(testo);
    const numero = numeroBollaDaTesto(testo);
    const nuova = pag ? pag.pagina === 1 : !!numero && !!numeroCorrente && numero !== numeroCorrente;
    if (nuova) tagli.push(i);
    if (numero && (nuova || !numeroCorrente)) numeroCorrente = numero;
  }
  return { tagli, senzaTesto };
}

/** Da tagli a gruppi di pagine: [2, 3] su 5 pagine → [[0,1],[2],[3,4]]. */
export function gruppiDaTagli(pagine: number, tagli: ReadonlyArray<number>): number[][] {
  const inizi = [0, ...[...new Set(tagli)].filter((t) => t > 0 && t < pagine).sort((a, b) => a - b)];
  return inizi.map((inizio, i) => {
    const fine = i + 1 < inizi.length ? inizi[i + 1] : pagine;
    return Array.from({ length: fine - inizio }, (_, k) => inizio + k);
  });
}

export const MAX_PAGINE_DIVISIONE = 300;
/** Un PDF da dividere può pesare più di una bolla: il limite vale per i pezzi. */
export const MAX_BYTE_DA_DIVIDERE = 300 * 1024 * 1024;

export interface PdfDaDividere {
  file: File;
  testi: string[];
  miniature: string[];
}

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  if (typeof worker === "string" && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

/** Quante pagine ha, senza leggerlo tutto. Null se il PDF non si apre (protetto o rotto). */
export async function contaPagine(file: File): Promise<number | null> {
  try {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: `${import.meta.env.BASE_URL}pdfjs-wasm/` }).promise;
    const n = doc.numPages;
    void doc.loadingTask.destroy();
    return n;
  } catch {
    return null;
  }
}

export async function leggiPerDividere(file: File, progresso?: (pagina: number, totale: number) => void, annullato?: () => boolean): Promise<PdfDaDividere> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: `${import.meta.env.BASE_URL}pdfjs-wasm/` }).promise;
  try {
    const testi: string[] = [];
    const miniature: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (annullato?.()) throw new Error("Preparazione annullata");
      progresso?.(n, doc.numPages);
      const pagina = await doc.getPage(n);
      const contenuto = await pagina.getTextContent();
      testi.push(contenuto.items.map((i) => ("str" in i ? i.str : "")).join(" "));
      const base = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: 150 / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pagina.render({ canvas, viewport }).promise;
      miniature.push(canvas.toDataURL("image/jpeg", 0.6));
      canvas.width = 0; canvas.height = 0;
      pagina.cleanup();
    }
    return { file, testi, miniature };
  } finally {
    void doc.loadingTask.destroy();
  }
}

/** Un file per gruppo di pagine, che poi entra nel caricamento come se fosse stato scelto da solo. */
export async function dividiFile(file: File, gruppi: ReadonlyArray<ReadonlyArray<number>>): Promise<File[]> {
  const { PDFDocument } = await import("pdf-lib");
  const sorgente = await PDFDocument.load(await file.arrayBuffer());
  const base = file.name.replace(/\.pdf$/i, "");
  const pezzi: File[] = [];
  for (let i = 0; i < gruppi.length; i++) {
    const out = await PDFDocument.create();
    for (const pagina of await out.copyPages(sorgente, [...gruppi[i]])) out.addPage(pagina);
    const byte = await out.save();
    pezzi.push(new File([byte as unknown as BlobPart], `${base}-bolla-${i + 1}.pdf`, { type: "application/pdf" }));
  }
  return pezzi;
}

/** Rilettura di una scansione singola: l'originale resta il PDF, all'AI va una foto leggibile. */
export async function scansioneComeFoto(file: File): Promise<File> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: `${import.meta.env.BASE_URL}pdfjs-wasm/`, isOffscreenCanvasSupported: false, isImageDecoderSupported: false }).promise;
  const canvas = document.createElement("canvas");
  try {
    if (doc.numPages !== 1) throw new Error("Dividi prima il PDF in singole bolle: la rilettura non deve perdere pagine.");
    const pagina = await doc.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: 1800 / Math.max(base.width, base.height) });
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await pagina.render({ canvas, viewport, background: "#ffffff" }).promise;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Impossibile verificare la scansione.");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      if (pixels[i + 3] > 0 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 220) ink++;
    }
    if (ink < 50) throw new Error("La scansione risulta vuota: la lettura precedente è conservata.");
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Non riesco a preparare la scansione")), "image/jpeg", 0.95));
    return new File([blob], `${file.name.replace(/\.pdf$/i, "")}-rilettura.jpg`, { type: "image/jpeg" });
  } finally {
    canvas.width = 0; canvas.height = 0;
    await doc.loadingTask.destroy();
  }
}

/**
 * Le pagine del PDF come immagini, per guardarle accanto alle righe con lo zoom
 * (12/11/2026). Larghe abbastanza da leggere un codice articolo ingrandendo.
 */
export async function paginePdfComeImmagini(file: File, larghezza = 1600, massimo = 30): Promise<string[]> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: `${import.meta.env.BASE_URL}pdfjs-wasm/` }).promise;
  try {
    const pagine: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, massimo); n++) {
      const pagina = await doc.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: larghezza / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pagina.render({ canvas, viewport, background: "#ffffff" }).promise;
      pagine.push(canvas.toDataURL("image/jpeg", 0.85));
      canvas.width = 0; canvas.height = 0;
      pagina.cleanup();
    }
    return pagine;
  } finally {
    void doc.loadingTask.destroy();
  }
}

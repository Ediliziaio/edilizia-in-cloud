/** Lettore server: i moduli PDF vengono inclusi nel bundle Edge. */
import { pdfTextByLines, readPdfPages, type PdfDocumentLike, type PdfPageLike } from "./pdfLettura.ts";
export * from "./pdfLettura.ts";

// deno-lint-ignore no-explicit-any -- remote PDF libraries are loaded dynamically.
let modules: Promise<{ pdfjs: any; pdfLib: any }> | undefined;
async function pdfModules() {
  modules ??= (async () => {
    // Indirizzi scritti dentro import() (18/10/2026): il deploy delle edge function
    // include nel pacchetto solo i moduli che riesce a leggere nel codice. Passati
    // da una variabile restavano fuori, e ogni lettura finiva in «Module not found»
    // (computi e PDF in chat falliti dal 15/10).
    // Stessa versione del lettore, dal pacchetto ufficiale verificato dal lock.
    // Il bundle CDN cambiava byte allo stesso URL e falliva il controllo SHA.
    const [pdfjs, worker, pdfLib] = await Promise.all([
      // @ts-ignore -- modulo remoto: lo risolve Deno al deploy
      import(/* @vite-ignore */ "npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs"),
      // @ts-ignore -- modulo remoto: lo risolve Deno al deploy
      import(/* @vite-ignore */ "npm:pdfjs-dist@4.0.379/legacy/build/pdf.worker.mjs"),
      // @ts-ignore -- modulo remoto: lo risolve Deno al deploy
      import(/* @vite-ignore */ "https://esm.sh/pdf-lib@1.17.1"),
    ]);
    (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    pdfjs.GlobalWorkerOptions.workerSrc = "";
    return { pdfjs, pdfLib };
  })().catch(error => { modules = undefined; throw error; });
  return await modules;
}

/** Bounded text-layer read. Pages without usable text are reported by number. */
export function estraiPagineTestoPdf(bytes: Uint8Array, maxPages: number, maxChars: number) {
  return leggiPagineTestoPdf(bytes, maxPages, maxChars, 80);
}

export function estraiPagineTestoRapportoRumore(bytes: Uint8Array) {
  return leggiPagineTestoPdf(bytes, 70, 125_000, 1, true);
}

async function leggiPagineTestoPdf(bytes: Uint8Array, maxPages: number, maxChars: number, minCharsPerPage: number, conservaColonne = false) {
  const started = Date.now();
  const { pdfjs } = await pdfModules();
  const loading = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true, isEvalSupported: false, verbosity: 0 });
  const pagine: { pagina: number; testo: string }[] = [];
  const illeggibili: number[] = [];
  let consumati = 0;
  let ispezionate = 0;
  try {
    const pdf: PdfDocumentLike = await loading.promise;
    for (let pagina = 1; pagina <= Math.min(pdf.numPages, maxPages); pagina++) {
      if (Date.now() - started >= 8_000 || consumati >= maxChars) break;
      ispezionate = pagina;
      let page: PdfPageLike | undefined;
      try {
        page = await pdf.getPage(pagina);
        const righe = pdfTextByLines((await page.getTextContent()).items);
        const testo = conservaColonne ? righe : righe.replace(/\t/g, " ");
        if (testo.trim().length < minCharsPerPage) {
          illeggibili.push(pagina);
          continue;
        }
        if (consumati + testo.length > maxChars) {
          ispezionate--;
          break;
        }
        pagine.push({ pagina, testo });
        consumati += testo.length;
      } catch {
        illeggibili.push(pagina);
      } finally { page?.cleanup?.(); }
    }
    return { pagine, illeggibili, ispezionate, totale: pdf.numPages };
  } finally { await loading.destroy(); }
}

/** OCR gets just its page, never the entire scanned document with one output budget. */
export async function extractPdfWithCoverage(bytes: ArrayBuffer, options: {
  maxChars: number;
  keepPositions?: boolean;
  maxPages?: number;
  pagineOcr?: number[];
  pagineSelezionate?: number[];
  interrompiSuErrore?: (errore: unknown) => boolean;
  maxOcrPages?: number;
  deadlineMs?: number;
  ocrPage: (page: number, bytes: Uint8Array) => Promise<{ text: string; finishReason?: string }>;
}) {
  const { pdfjs, pdfLib } = await pdfModules();
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), useSystemFonts: false, disableFontFace: true, isEvalSupported: false, verbosity: 0 });
  const pdf: PdfDocumentLike = await loading.promise;
  // deno-lint-ignore no-explicit-any -- pdf-lib dynamic module interop.
  let source: any;
  try {
    return await readPdfPages(pdf, {
      ...options,
      imageOps: [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject,
        pdfjs.OPS.paintImageXObjectRepeat, pdfjs.OPS.paintImageMaskXObjectRepeat, pdfjs.OPS.paintInlineImageXObjectGroup].filter(Number.isFinite),
      transformOp: pdfjs.OPS.transform, saveOp: pdfjs.OPS.save, restoreOp: pdfjs.OPS.restore,
      ocrPage: async page => {
        source ??= await pdfLib.PDFDocument.load(bytes);
        const one = await pdfLib.PDFDocument.create();
        const [copied] = await one.copyPages(source, [page - 1]); one.addPage(copied);
        return options.ocrPage(page, await one.save());
      },
    });
  } finally { await pdf.destroy?.(); }
}

/** Chunks end at rows and repeat only their source page marker, not data rows. */

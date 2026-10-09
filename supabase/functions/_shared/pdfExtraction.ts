/** Shared PDF reader: preserve rows/columns, inspect every page, report real coverage. */
export interface PdfTextItem { str?: string; transform?: number[]; hasEOL?: boolean }
export interface PdfPageLike {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  getOperatorList?(): Promise<{ fnArray: number[]; argsArray?: unknown[][] }>;
  getViewport?(options: { scale: number }): { width: number; height: number };
  cleanup?(): void;
}
export interface PdfDocumentLike {
  numPages: number;
  getPage(page: number): Promise<PdfPageLike>;
  destroy?(): Promise<void>;
}
export interface PdfReadPage { page: number; text: string; method: "native" | "ocr" | "blank" | "unreadable"; warning?: string }

/** Ignore small logos, but detect a scanned table even with a long native header. */
export function hasLargePdfImage(operators: { fnArray: number[]; argsArray?: unknown[][] }, options: {
  imageOps: number[]; transformOp?: number; saveOp?: number; restoreOp?: number;
}, viewport?: { width: number; height: number }): boolean {
  let matrix = [1, 0, 0, 1, 0, 0]; const stack: number[][] = []; let imageArea = 0;
  for (let i = 0; i < operators.fnArray.length; i++) {
    const op = operators.fnArray[i];
    if (op === options.saveOp) stack.push([...matrix]);
    else if (op === options.restoreOp) matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (op === options.transformOp) {
      const raw = operators.argsArray?.[i];
      if (!raw || raw.length < 6 || raw.some(x => typeof x !== "number" || !Number.isFinite(x))) continue;
      const [a, b, c, d, e, f] = raw as number[], [x, y, z, w, u, v] = matrix;
      matrix = [x*a+z*b, y*a+w*b, x*c+z*d, y*c+w*d, x*e+z*f+u, y*e+w*f+v];
    } else if (options.imageOps.includes(op)) {
      if (!viewport || !operators.argsArray || options.transformOp === undefined) return true;
      const area = Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]);
      imageArea += area;
      // Tiled scans may contain many smaller images rather than one full-page image.
      if (imageArea / Math.max(1, viewport.width * viewport.height) >= 0.05) return true;
    }
  }
  return false;
}

export function pdfTextByLines(items: PdfTextItem[]): string {
  const lines: Array<{ y: number | null; cells: Array<{ x: number; text: string }> }> = [];
  let forceLine = false;
  for (const item of items) {
    const text = typeof item.str === "string" ? item.str.replace(/[\t\r\n]+/g, " ").trim() : "";
    if (!text) { if (item.hasEOL) forceLine = true; continue; }
    const y = Number.isFinite(item.transform?.[5]) ? item.transform![5] : null;
    const x = Number.isFinite(item.transform?.[4]) ? item.transform![4] : 0;
    let line = !forceLine ? lines.at(-1) : undefined;
    if (!line || (y !== null && line.y !== null && Math.abs(y - line.y) > 2)) {
      line = { y, cells: [] }; lines.push(line);
    }
    line.cells.push({ x, text }); forceLine = item.hasEOL === true;
  }
  // Tabs retain cell boundaries; newline preserves rows and chapter headings.
  return lines.map(line => line.cells.sort((a, b) => a.x - b.x).map(c => c.text).join("\t")).join("\n").trim();
}

export function pdfCoverage(pages: PdfReadPage[], total: number, truncated = false) {
  const unread = pages.filter(p => p.method === "unreadable").map(p => p.page);
  const inspected = new Set(pages.map(p => p.page));
  for (let page = 1; page <= total; page++) if (!inspected.has(page)) unread.push(page);
  return {
    pages_total: total, pages_inspected: inspected.size,
    pages_native: pages.filter(p => p.method === "native").map(p => p.page),
    pages_ocr: pages.filter(p => p.method === "ocr").map(p => p.page),
    pages_blank: pages.filter(p => p.method === "blank").map(p => p.page),
    pages_unreadable: unread.sort((a, b) => a - b),
    text_truncated: truncated,
    complete: total > 0 && unread.length === 0 && !truncated,
  };
}

export async function readPdfPages(pdf: PdfDocumentLike, options: {
  maxChars: number;
  imageOps: number[];
  transformOp?: number;
  saveOp?: number;
  restoreOp?: number;
  maxOcrPages?: number;
  maxPages?: number;
  deadlineMs?: number;
  ocrPage?: (page: number) => Promise<{ text: string; finishReason?: string }>;
}) {
  const pages: PdfReadPage[] = [];
  const maxChars = Math.max(1, Math.min(1_000_000, Math.floor(options.maxChars)));
  const deadline = Date.now() + (options.deadlineMs ?? 90_000);
  let ocrCalls = 0;
  for (let number = 1; number <= Math.min(pdf.numPages, options.maxPages ?? 250); number++) {
    if (Date.now() >= deadline) break;
    let page: PdfPageLike | undefined;
    try {
      page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = pdfTextByLines(content.items);
      // A short header on top of a scanned table must not bypass OCR.
      const operators = page.getOperatorList ? await page.getOperatorList() : null;
      const image = operators ? hasLargePdfImage(operators, options, page.getViewport?.({ scale: 1 })) : false;
      if (text && !image) pages.push({ page: number, text, method: "native" });
      else if (!text && operators?.fnArray.length === 0) pages.push({ page: number, text: "", method: "blank" });
      else if (options.ocrPage && ocrCalls < (options.maxOcrPages ?? 8)) {
        ocrCalls++;
        const result = await options.ocrPage(number);
        if (!result.text.trim() || result.finishReason !== "stop") {
          pages.push({ page: number, text: result.text.trim(), method: "unreadable", warning: "OCR vuoto, interrotto o completezza non confermata." });
        } else pages.push({ page: number, text: result.text.trim(), method: "ocr" });
      } else pages.push({ page: number, text, method: "unreadable", warning: "Pagina da leggere con OCR: limite di elaborazione raggiunto." });
    } catch {
      pages.push({ page: number, text: "", method: "unreadable", warning: "Lettura della pagina non riuscita." });
    } finally { try { page?.cleanup?.(); } catch { /* Cleanup does not change page coverage. */ } }
  }
  const full = pages.map(p => `--- Pagina ${p.page} (${p.method}) ---\n${p.text}${p.warning ? `\n[${p.warning}]` : ""}`).join("\n\n");
  const truncated = full.length > maxChars;
  return { text: full.slice(0, maxChars), pages, coverage: pdfCoverage(pages, pdf.numPages, truncated) };
}

// deno-lint-ignore no-explicit-any -- remote PDF libraries are loaded dynamically.
let modules: Promise<{ pdfjs: any; pdfLib: any }> | undefined;
async function pdfModules() {
  modules ??= (async () => {
    const jsUrl = "https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs?bundle&no-check";
    const workerUrl = "https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.worker.mjs?bundle&no-check";
    const libUrl = "https://esm.sh/pdf-lib@1.17.1";
    const [pdfjs, worker, pdfLib] = await Promise.all([import(/* @vite-ignore */ jsUrl), import(/* @vite-ignore */ workerUrl), import(/* @vite-ignore */ libUrl)]);
    (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    pdfjs.GlobalWorkerOptions.workerSrc = "";
    return { pdfjs, pdfLib };
  })().catch(error => { modules = undefined; throw error; });
  return await modules;
}

/** OCR gets just its page, never the entire scanned document with one output budget. */
export async function extractPdfWithCoverage(bytes: ArrayBuffer, options: {
  maxChars: number;
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
export function splitPdfTextAtRows(text: string, limit = 28_000): string[] {
  if (!Number.isInteger(limit) || limit < 100) throw new Error("Limite blocco non valido");
  const chunks: string[] = []; let current = ""; let lastPage = "";
  for (const line of text.split("\n")) {
    const isMarker = /^--- Pagina \d+/.test(line);
    if (line.length > limit) throw new Error("Una riga supera il limite: suddividi il documento senza tagliare una voce.");
    if (current.length + line.length + 1 > limit) {
      if (current) chunks.push(current);
      current = lastPage && !isMarker ? lastPage : "";
      if (current.length + line.length + 1 > limit) throw new Error("Riga troppo lunga per conservare anche la pagina originale: suddividi il documento.");
    }
    current += (current ? "\n" : "") + line;
    if (isMarker) lastPage = line;
  }
  if (current) chunks.push(current);
  return chunks;
}

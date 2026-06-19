/**
 * Estrazione della SCADENZA da un DURC On Line (INAIL/INPS).
 *
 * Il DURC è un PDF con layer testo che riporta "Scadenza validità <gg/mm/aaaa>".
 * Fallback legale: "Data richiesta <gg/mm/aaaa>" + 120 giorni (validità del DURC).
 *
 * - parseDurcExpiry(text): PURA (unit-testabile).
 * - extractDurcExpiryFromPdf(blob): legge il testo delle prime pagine via
 *   pdfjs-dist (worker bundled da Vite, stesso pattern di QuoteFromCaptureDialog).
 *   Nessun OCR: i DURC On Line hanno il testo selezionabile.
 */

function toIso(year: number, month: number, day: number): string | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(dt.getTime())) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Estrae la data di scadenza DURC dal testo. Ritorna ISO yyyy-mm-dd o null. */
export function parseDurcExpiry(text: string): string | null {
  if (!text) return null;
  const norm = text.replace(/\s+/g, " ");
  // 1) "Scadenza validità <gg/mm/aaaa>" (forma canonica del DURC On Line)
  const m = norm.match(/scadenza\s*validit[àa][^0-9]{0,25}(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/i);
  if (m) {
    const iso = toIso(Number(m[3]), Number(m[2]), Number(m[1]));
    if (iso) return iso;
  }
  // 2) Fallback: "Data richiesta <gg/mm/aaaa>" + 120 giorni di validità legale
  const r = norm.match(/data\s*richiesta[^0-9]{0,25}(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/i);
  if (r) {
    const base = new Date(Date.UTC(Number(r[3]), Number(r[2]) - 1, Number(r[1])));
    if (!Number.isNaN(base.getTime())) {
      base.setUTCDate(base.getUTCDate() + 120);
      return base.toISOString().slice(0, 10);
    }
  }
  return null;
}

/** Legge il testo delle prime 2 pagine del PDF ed estrae la scadenza DURC. */
export async function extractDurcExpiryFromPdf(file: Blob): Promise<string | null> {
  try {
    const type = (file as File).type ?? "";
    const name = (file as File).name ?? "";
    if (type && !/pdf/i.test(type) && !/\.pdf$/i.test(name)) return null;
    const pdfjsLib = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const maxPages = Math.min(pdf.numPages, 2);
    let text = "";
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      text += " " + content.items.map((it: any) => (typeof it?.str === "string" ? it.str : "")).join(" ");
    }
    try { await pdf.destroy(); } catch { /* noop */ }
    return parseDurcExpiry(text);
  } catch {
    return null;
  }
}

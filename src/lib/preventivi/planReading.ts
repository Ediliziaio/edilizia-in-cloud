export type PlanText = { text: string; confidence: number; bbox: [number, number, number, number] };
export type PlanReading = { version: 1; engine: "Apple Vision locale" | "Testo PDF nel browser" | "Immagine nel browser"; page: number; pages: number; width: number; height: number; lines: PlanText[] };
export type PlanAttachment = { id: string; name: string; mime: string; size: number; reading: PlanReading | null; localFileMissing?: true };
export type PlanRoom = { id: string; label: string; line: number; manual?: boolean };
export type PlanRectangle = { roomId: string; a: number; b: number; area: number; perimeter: number; page: number; basis: string };
export const PLAN_MAX_BYTES = 12 * 1024 * 1024;
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Risultato della lettura non valido.");
  return v as Record<string, unknown>;
};
export function readPlanReading(value: unknown): PlanReading {
  const r = object(value);
  const integer = (v: unknown, max: number) => Number.isInteger(v) && Number(v) > 0 && Number(v) <= max;
  if (r.version !== 1 || !["Apple Vision locale", "Testo PDF nel browser", "Immagine nel browser"].includes(String(r.engine)) || !integer(r.page, 20) || !integer(r.pages, 20) || Number(r.page) > Number(r.pages)
    || !integer(r.width, 4800) || !integer(r.height, 4800) || !Array.isArray(r.lines) || r.lines.length > 500) throw new Error("Lettura fuori dai limiti consentiti.");
  const lines = r.lines.map(value => {
    const l = object(value);
    if (typeof l.text !== "string" || l.text.length > 500 || typeof l.confidence !== "number" || !Number.isFinite(l.confidence) || l.confidence < 0 || l.confidence > 1
      || !Array.isArray(l.bbox) || l.bbox.length !== 4 || l.bbox.some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1)
      || l.bbox[0] + l.bbox[2] > 1.001 || l.bbox[1] + l.bbox[3] > 1.001) throw new Error("Testo o posizione OCR non validi.");
    return { text: l.text, confidence: l.confidence, bbox: l.bbox as PlanText["bbox"] };
  });
  return { version: 1, engine: r.engine as PlanReading['engine'], page: Number(r.page), pages: Number(r.pages), width: Number(r.width), height: Number(r.height), lines };
}
export function planCandidates(reading: PlanReading) {
  const labels: Record<string, string> = { letto: "Camera", camera: "Camera", cucina: "Cucina", soggiorno: "Soggiorno", wc: "WC", bagno: "Bagno", rip: "Ripostiglio", ripostiglio: "Ripostiglio", terrazzo: "Terrazzo", giardino: "Giardino", corridoio: "Corridoio", disimpegno: "Disimpegno" };
  const rooms: PlanRoom[] = [];
  const numbers: Array<{ line: number; text: string; value: number }> = [];
  reading.lines.forEach((l, i) => {
    const label = labels[l.text.trim().toLowerCase().replace(/[.]/g, "")];
    if (label) rooms.push({ id: `p${reading.page}-l${i}`, label, line: i });
    const numeric = l.text.trim().replace(/^[-•\s]+|[-\s]+$/g, "");
    if (/^\d{1,3}[.,]\d{1,3}$/.test(numeric)) {
      const value = Number(numeric.replace(",", "."));
      if (value > 0 && value <= 100) numbers.push({ line: i, text: l.text, value });
    }
  });
  rooms.sort((a, b) => reading.lines[a.line].bbox[1] - reading.lines[b.line].bbox[1] || reading.lines[a.line].bbox[0] - reading.lines[b.line].bbox[0]);
  return { rooms: rooms.slice(0, 100), numbers };
}
/** No automatic pairing of nearby dimensions or deriving floor area from pixels. */
export function confirmPlanRectangle(text: string, roomId: string, reading: PlanReading): PlanRectangle | null {
  const match = /^confermo\s+rettangolo\s+(\d{1,3}(?:[.,]\d{1,3})?)\s*[x×]\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*m\s*(?:netti)?\s*$/i.exec(text.trim());
  if (!match) return null;
  const a = Number(match[1].replace(",", ".")); const b = Number(match[2].replace(",", "."));
  if (a <= 0 || b <= 0 || a > 100 || b > 100) return null;
  const area = Math.round((a * b + Number.EPSILON) * 100) / 100;
  if (!area) return null;
  return { roomId, a, b, area, perimeter: Math.round(2 * (a + b) * 100) / 100, page: reading.page,
    basis: `Conferma manuale di ambiente rettangolare netto: ${a} × ${b} m = ${a * b} m², quantità esposta ${area} m². Pagina ${reading.page}. Non è la superficie totale dell’abitazione.` };
}
export async function readPlanLocally(blob: Blob, page: number, signal: AbortSignal): Promise<PlanReading> {
  if (!blob.size || blob.size > PLAN_MAX_BYTES) throw new Error("Usa un file non vuoto, massimo 12 MB.");
  signal.throwIfAborted();
  // Apple Vision belongs to the local lab, never to the published web app.
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    const { readPlanInBrowser } = await import('./quoteBrowserPlan');
    return readPlanReading(await readPlanInBrowser(blob, page, signal));
  }
  const controller = new AbortController(); const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 130_000); // first local Swift compilation may take longer
  try {
    const res = await fetch(`/__quote-lab/ocr?page=${page}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: blob, signal: controller.signal });
    if (!res.ok) throw new Error(res.status === 404 ? "Servizio OCR locale non avviato. Nessun servizio esterno utilizzato." : res.status === 429 ? "È già in corso una lettura. Attendi e riprova." : "Documento non leggibile: usa PNG, JPEG o PDF non protetto, massimo 12 MB e 20 pagine.");
    const value: unknown = await res.json(); controller.signal.throwIfAborted();
    return readPlanReading(value);
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}

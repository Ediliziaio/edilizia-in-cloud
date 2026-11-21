import { normalizeFvPdfPagesOrder } from "./pdfPages";
const pagineAnalisi = new Set(["produzione", "flussi", "risparmio"]);
function ordine(template: object) {
  const valore = (template as { pdf_pages_order?: unknown }).pdf_pages_order;
  return normalizeFvPdfPagesOrder(Array.isArray(valore) ? valore : undefined);
}
export function analisiNelPdfFv(template: object) {
  return ordine(template).filter(p => pagineAnalisi.has(p.id)).every(p => p.visible);
}
/** Cambia solo le tre sezioni del documento, preservando ordine e altre scelte. */
export function conAnalisiNelPdfFv<T extends object>(template: T, attiva: boolean) {
  return { ...template, pdf_pages_order: ordine(template).map(p => pagineAnalisi.has(p.id) ? { ...p, visible: attiva } : p) };
}

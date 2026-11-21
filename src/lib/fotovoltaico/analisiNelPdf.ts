import { normalizeFvPdfPagesOrder } from "./pdfPages";
const pagineAnalisi = new Set(["produzione", "flussi", "risparmio"]);
export function analisiNelPdfFv(template: Record<string, unknown>) {
  return normalizeFvPdfPagesOrder(template.pdf_pages_order).filter(p => pagineAnalisi.has(p.id)).every(p => p.visible);
}
/** Cambia solo le tre sezioni del documento, preservando ordine e altre scelte. */
export function conAnalisiNelPdfFv(template: Record<string, unknown>, attiva: boolean) {
  return { ...template, pdf_pages_order: normalizeFvPdfPagesOrder(template.pdf_pages_order).map(p => pagineAnalisi.has(p.id) ? { ...p, visible: attiva } : p) };
}

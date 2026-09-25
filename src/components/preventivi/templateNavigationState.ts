import { PAGINE_EDITOR_EDILI, paginaEditor } from "./pagineEditor";
import { capitoloVisibile } from "./pdf/ordineCapitoli";
import { edileChapterAllowed, type EdileVisibilitySettings } from "./edilePageVisibility";

// Stable editing order, not the company's customizable PDF order.
const SECTION_ORDER = [
  ["page_ordine"], ["page_cover"], ["page_chi_siamo"], ["page_percorso"],
  ["page_come_funziona"], ["page_render"], ["page_protezione"], ["page_controlli"],
  ["page_confronto"], ["page_lavori"], ["page_testimonianze", "page_recensioni"],
  ["page_compreso"], ["garanzie", "page_garanzie"], ["page_documenti"], ["page_diario"],
  ["page_crono"], ["page_domande", "page_faq"], ["page_chiusura", "page_cta"],
  ["page_condizioni"], ["page_consulente"], ["page_conversione"],
];
const ranks = new Map(SECTION_ORDER.flatMap((ids, rank) => ids.map(id => [id, rank] as const)));

export function orderTemplateNavigationItems<T extends { id: string }>(items: readonly T[]): T[] {
  // Data/settings groups may have overlapping legacy IDs (e.g. Sr "garanzie").
  if (!items.some(item => item.id.startsWith("page_"))) return [...items];
  return [...items].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity));
}

type EdileNavigationSettings = EdileVisibilitySettings;

/** Only exclusion by settings. Content-dependent rendering is confirmed by the PDF. */
export function edileSectionExcluded(form: EdileNavigationSettings, section: string): boolean {
  const chapter = PAGINE_EDITOR_EDILI.find(item => item.id === section)?.pagina;
  if (!chapter) return false;
  if (!edileChapterAllowed(form, chapter)) return true;
  return !capitoloVisibile(form.pdf_ordine_capitoli, form.pdf_pagine_libere, chapter);
}

/** Receive the engine's normalized page order, including its original defaults. */
export function orderedSectionExcluded(engine: "serramenti" | "fotovoltaico", pages: readonly { id: string; visible: boolean }[], section: string, settings?: { confronto_attivo?: boolean | null; chi_siamo_attivo?: boolean | null; percorso_cliente?: unknown }): boolean {
  if (engine === "serramenti") {
    if (section === "page_confronto" && settings?.confronto_attivo === false) return true;
    if (section === "page_chi_siamo" && settings?.chi_siamo_attivo === false) return true;
    const path = settings?.percorso_cliente;
    if (section === "page_percorso" && path && typeof path === "object" && "attivo" in path && path.attivo === false) return true;
  }
  const page = section === "page_cover" ? "cover" : paginaEditor(engine, section)?.pagina;
  return !!page && pages.some(item => item.id === page && item.visible === false);
}

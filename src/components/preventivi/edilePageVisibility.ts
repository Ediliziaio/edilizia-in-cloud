import { leggiOrdine, leggiPagineLibere, ordineEffettivo, type VoceOrdine } from "./pdf/ordineCapitoli";

export interface EdileVisibilitySettings {
  show_chi_siamo?: boolean | null;
  show_percorso?: boolean | null;
  show_cronoprogramma?: boolean | null;
  show_garanzie?: boolean | null;
  usp?: unknown;
  pdf_ordine_capitoli?: unknown;
  pdf_pagine_libere?: unknown;
}

/** Legacy flags describe content, not always the whole page. No writes on read. */
export function edileChapterAllowed(settings: EdileVisibilitySettings, chapter: string): boolean {
  if (chapter === "chiSiamo") {
    // The renderer keeps verified distinguishing points even without an introduction.
    const hasUsp = Array.isArray(settings.usp) && settings.usp.some(item =>
      item && typeof item === "object" && typeof item.titolo === "string" && item.titolo.trim());
    return settings.show_chi_siamo !== false || hasUsp;
  }
  if (chapter === "percorso") return settings.show_percorso !== false;
  if (chapter === "tempi") return settings.show_cronoprogramma !== false;
  if (chapter === "garanzie" || chapter === "domande") return settings.show_garanzie !== false;
  return true;
}

/** Visibility in the editor agrees with all legacy PDF flags; empty content is separate. */
export function edileEditorOrder(settings: EdileVisibilitySettings): VoceOrdine[] {
  return ordineEffettivo(leggiOrdine(settings.pdf_ordine_capitoli), leggiPagineLibere(settings.pdf_pagine_libere, { ancheVuote: true }))
    .map(item => ({ ...item, visibile: item.visibile && edileChapterAllowed(settings, item.chiave) }));
}

/** Explicit user action only. Keeps texts, photographs, positions and unrelated flags. */
export function withEdilePageVisibility<T extends EdileVisibilitySettings>(settings: T, chapter: string, visible: boolean): T {
  if (chapter === "investimento") return settings;
  const order = edileEditorOrder(settings);
  if (!order.some(item => item.chiave === chapter)) return settings;
  const next = { ...settings, pdf_ordine_capitoli: order.map(item => item.chiave === chapter ? { ...item, visibile: visible } : item) };
  // An excluded introduction stays excluded when hiding the page. Re-enabling a
  // whole page explicitly re-enables its content; siblings retain effective visibility.
  if (visible) {
    if (chapter === "chiSiamo") next.show_chi_siamo = true;
    if (chapter === "percorso") next.show_percorso = true;
    if (chapter === "tempi") next.show_cronoprogramma = true;
    if (chapter === "garanzie" || chapter === "domande") next.show_garanzie = true;
  }
  return next;
}

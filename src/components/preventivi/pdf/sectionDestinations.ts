/** Stable metadata only: never derive navigation from editable titles or page numbers. */
export const edileSectionDestination = (chapter: string) => `edile.section.${encodeURIComponent(chapter)}`;

const EDITOR_CHAPTERS: Record<string, readonly string[]> = {
  brand: ["cover"], page_cover: ["cover"],
  contenuti: ["progetto"], page_progetto: ["progetto"], page_apertura: ["apertura"],
  page_chi_siamo: ["chiSiamo"], page_percorso: ["percorso"],
  page_come_funziona: ["comeFunziona"], page_protezione: ["protezione"],
  page_controlli: ["controlli"], page_lavori: ["lavori"], page_foto: ["foto"],
  page_testimonianze: ["recensioni"], page_recensioni: ["recensioni"],
  page_compreso: ["compreso"], garanzie: ["garanzie"], page_garanzie: ["garanzie"],
  page_documenti: ["documenti"], page_diario: ["diario"], page_crono: ["tempi"],
  page_domande: ["domande"], page_faq: ["domande"], page_chiusura: ["chiusura"],
  page_computo: ["piano"], page_investimento: ["investimento"],
  // This editor includes both contract terms and payment terms. When the legal
  // attachment is disabled, the payment terms still belong to the investment.
  page_condizioni: ["condizioni", "investimento"],
  page_firma: ["firma"], page_recesso: ["recesso"],
};
const CHAPTERS = new Set(Object.values(EDITOR_CHAPTERS).flat());

export function edileEditorDestinations(section?: string | null): string[] {
  if (!section) return [];
  const chapters = EDITOR_CHAPTERS[section]
    ?? (CHAPTERS.has(section) || (section.startsWith("libera:") && section.length > 7) ? [section] : []);
  // Order/options/profile do not represent a PDF page: keep the current view.
  return chapters.map(edileSectionDestination);
}

type PdfReference = { num: number; gen: number };
export interface SectionDestinationDocument {
  numPages: number;
  getDestination?: (id: string) => Promise<unknown[] | null>;
  getPageIndex?: (ref: PdfReference) => Promise<number>;
}

/** The actual first page comes from the PDF name tree, after native pagination.
 * IDs are attached to non-wrapping headings, not spanning chapter containers:
 * continuation pages must never overwrite the chapter's first destination.
 */
export async function resolveEdileSectionPage(document: SectionDestinationDocument, section?: string | null): Promise<number | null> {
  if (!document.getDestination) return null;
  for (const id of edileEditorDestinations(section)) {
    try {
      const destination = await document.getDestination(id);
      if (!Array.isArray(destination) || !destination.length) continue;
      const ref = destination[0];
      const index = typeof ref === "number" ? ref
        : ref && typeof ref === "object" && "num" in ref && "gen" in ref && document.getPageIndex
          ? await document.getPageIndex(ref as PdfReference) : -1;
      if (Number.isInteger(index) && index >= 0 && index < document.numPages) return index + 1;
    } catch {
      // Old PDFs, missing/hidden sections and disposed proxies are non-fatal.
    }
  }
  return null;
}

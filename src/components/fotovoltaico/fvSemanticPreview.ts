import { PAGINE_EDITOR_FOTOVOLTAICO } from "@/components/preventivi/pagineEditor";

export function fvEditorPreviewSection(section: string): string | null {
  if (section === "page_cover") return "cover";
  const page = PAGINE_EDITOR_FOTOVOLTAICO.find(p => p.id === section)?.pagina;
  if (page) return page;
  const extra: Record<string, string> = {
    page_consulente: "decisione", page_render: "anteprima",
    prodotti: "componenti", strategia: "investimento", contenuti: "investimento",
    page_conversione: "garanzie",
  };
  return extra[section] ?? null;
}

/** First actual page of a semantic chapter, independent of copy and ordering. */
export function fvPreviewTarget(doc: Document, section: string): HTMLElement | null {
  const target = fvEditorPreviewSection(section);
  return target ? doc.querySelector<HTMLElement>(`[data-fv-section="${target}"]`)?.closest<HTMLElement>(".page") ?? null : null;
}

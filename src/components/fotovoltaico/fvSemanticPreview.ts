import { PAGINE_EDITOR_FOTOVOLTAICO } from "@/components/preventivi/pagineEditor";

export function fvEditorPreviewSection(section: string): string | null {
  if(/^pdf:[\w-]+(?:__\d+)?$/.test(section))return section.slice(4).replace(/__\d+$/,"");
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
  if(!target)return null;
  const parte=section.startsWith("pdf:")?Number(section.match(/__(\d+)$/)?.[1]??1):1;
  return doc.querySelectorAll<HTMLElement>(`[data-fv-section="${target}"]`)[parte-1]?.closest<HTMLElement>(".page")??null;
}

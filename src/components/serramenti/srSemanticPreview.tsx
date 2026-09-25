import React, { type ReactNode } from "react";
import { Page } from "@react-pdf/renderer";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PAGINE_EDITOR_SERRAMENTI } from "@/components/preventivi/pagineEditor";

/** Machine identifier in PDF outline metadata, never a user-editable heading. */
export const srSectionAnchor = (section: string) => `sr-section:${section}`;

export function srEditorPreviewSection(section: string): string | null {
  // The older local editor still sends these two unprefixed identifiers.
  if (section === "page_cover" || section === "cover") return "cover";
  if (section === "cta") return "cta";
  const page = PAGINE_EDITOR_SERRAMENTI.find(p => p.id === section)?.pagina;
  if (page) return page;
  const extra: Record<string, string> = {
    page_consulente: "allegato_tecnico", page_conversione: "investimento",
    contenuti: "proposta", macro: "macro_dedicate", garanzie: "proposta", condizioni: "condizioni",
  };
  return extra[section] ?? null;
}

/** Annotate the first actual Page, including pages inside fragments/arrays.
 * Bookmarks, unlike named destinations, are not copied onto continuation pages
 * by react-pdf. No wrapper, dimensions, text or pagination props are changed.
 */
export function withSrSectionAnchor(node: ReactNode, section: string): ReactNode {
  let marked = false;
  const visit = (child: ReactNode): ReactNode => {
    if (marked) return child;
    if (Array.isArray(child)) return child.map(visit);
    if (!React.isValidElement<{ children?: ReactNode; bookmark?: string }>(child)) return child;
    if (child.type === Page) {
      marked = true;
      return React.cloneElement(child, { bookmark: srSectionAnchor(section) });
    }
    if (child.type === React.Fragment) {
      const children = visit(child.props.children);
      return React.cloneElement(child, {}, ...(Array.isArray(children) ? children : [children]));
    }
    return child;
  };
  return visit(node);
}

/** Resolve the actual page reference; absent/hidden chapters are a no-op. */
export async function srPreviewPage(
  pdf: Pick<PDFDocumentProxy, "getOutline" | "getDestination" | "getPageIndex">,
  section: string,
): Promise<number | null> {
  type Outline = NonNullable<Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>>;
  const find = (items: Outline): Outline[number] | undefined => {
    for (const item of items) {
      if (item.title === srSectionAnchor(section)) return item;
      const nested = find(item.items);
      if (nested) return nested;
    }
  };
  const item = find(await pdf.getOutline() ?? []);
  if (!item?.dest) return null;
  const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
  if (!destination || destination[0] == null) return null;
  const ref = destination[0];
  const index = typeof ref === "number" ? ref : await pdf.getPageIndex(ref);
  return index + 1;
}

import { describe, expect, it } from "vitest";
import { renderFvPdfHtml, getFvPdfRenderedPagesCount } from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { FULL_FV_MODULES, createFullFvTemplate } from "@/lib/moduli-vendita/fullFvModules";
import { buildFvPreviewBase } from "@/lib/moduli-vendita/fvPreviewData";
import { fvEditorPreviewSection, fvPreviewTarget } from "@/components/fotovoltaico/fvSemanticPreview";
import { PAGINE_EDITOR_FOTOVOLTAICO } from "@/components/preventivi/pagineEditor";

describe("FV semantic HTML chapters", () => {
  it("maps every page registry entry and distinguishes controls without a page", () => {
    for (const section of PAGINE_EDITOR_FOTOVOLTAICO.filter(p => p.pagina)) expect(fvEditorPreviewSection(section.id)).toBe(section.pagina);
    expect(fvEditorPreviewSection("page_render")).toBe("anteprima");
    expect(fvEditorPreviewSection("page_consulente")).toBe("decisione");
    for (const id of ["brand", "default", "page_ordine", "not-a-section"]) expect(fvEditorPreviewSection(id)).toBeNull();
  });
  it.each(FULL_FV_MODULES)("%s: renamed/reordered/hidden sections, no text fallback", id => {
    const template = createFullFvTemplate({}, "qa", id);
    template.pdf_blocchi.controlli = { ...template.pdf_blocchi.controlli as object, titolo: "Titolo privato completamente diverso" };
    const order = template.pdf_pages_order!;
    template.pdf_pages_order = [order.find(p => p.id === "controlli")!, ...order.filter(p => p.id !== "controlli")].map(p => p.id === "diario" ? { ...p, visible: false } : p);
    const data = { ...buildFvPreviewBase(template), template };
    const doc = new DOMParser().parseFromString(renderFvPdfHtml(data), "text/html");
    const pages = Array.from(doc.querySelectorAll(".page"));
    expect(pages).toHaveLength(getFvPdfRenderedPagesCount(data));
    expect(pages.every(p => p.querySelector("[data-fv-section]"))).toBe(true);
    expect(new Set(pages.map(p => p.querySelector("[data-fv-section]")!.id)).size).toBe(pages.length);
    const target = fvPreviewTarget(doc, "page_controlli")!;
    expect(target.textContent).toContain("Titolo privato completamente diverso");
    expect(pages.indexOf(target)).toBeLessThan(pages.findIndex(p => p.querySelector('[data-fv-section="investimento"]')));
    expect(fvPreviewTarget(doc, "page_diario")).toBeNull();
    expect(fvPreviewTarget(doc, "page_render")).toBeNull();
    expect(fvPreviewTarget(doc, "page_consulente")).toBe(fvPreviewTarget(doc, "page_cta"));
  });
  it("uses the first semantic page for long FAQ without changing page counts", () => {
    const template = createFullFvTemplate({}, "qa", "nuovo");
    template.faq_items = Array.from({ length: 30 }, (_, i) => ({ domanda: `Domanda personalizzata ${i}`, risposta: "Risposta estesa. ".repeat(18) }));
    const data = { ...buildFvPreviewBase(template), template };
    const doc = new DOMParser().parseFromString(renderFvPdfHtml(data), "text/html");
    const faq = doc.querySelectorAll('[data-fv-section="faq"]');
    expect(faq.length).toBeGreaterThan(1);
    expect(fvPreviewTarget(doc, "page_faq")).toBe(faq[0].closest(".page"));
    expect(doc.querySelectorAll(".page").length).toBe(getFvPdfRenderedPagesCount(data));
  });
});

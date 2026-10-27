import { describe, expect, it } from "vitest";
import { createFullFvTemplate, FULL_FV_MODULES } from "@/lib/moduli-vendita/fullFvModules";
import { buildFvPreviewBase } from "@/lib/moduli-vendita/fvPreviewData";
import { renderFvPdfHtml, getFvPdfRenderedPagesCount } from "../../../supabase/functions/_shared/fvHtmlTemplate";

describe("Fotovoltaico: copie con lo stesso layout originale", () => {
  it.each(FULL_FV_MODULES)("%s: copiare cliente e riferimento non cambia stili o pagine", id => {
    const template = createFullFvTemplate({} as never, "azienda-qa", id);
    const original = { ...buildFvPreviewBase(template), template };
    const copy = structuredClone(original);
    copy.cliente.nome = "Cliente della copia QA";
    copy.progetto.numero = "COPIA-QA";
    const html = renderFvPdfHtml(original);
    const copiedHtml = renderFvPdfHtml(copy);
    const originalDom = new DOMParser().parseFromString(html, "text/html");
    const copyDom = new DOMParser().parseFromString(copiedHtml, "text/html");
    expect(copyDom.querySelector("style")?.textContent).toBe(originalDom.querySelector("style")?.textContent);
    expect(copyDom.querySelectorAll(".page").length).toBe(originalDom.querySelectorAll(".page").length);
    expect(getFvPdfRenderedPagesCount(copy)).toBe(getFvPdfRenderedPagesCount(original));
    expect(copiedHtml).toContain("Cliente della copia QA");
    expect(copiedHtml).toContain("COPIA-QA");
    expect(copy.costi).toEqual(original.costi);
    expect(copy.componenti).toEqual(original.componenti);
    expect(original.cliente.nome).not.toBe(copy.cliente.nome);
  });
});

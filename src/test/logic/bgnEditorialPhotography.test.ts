import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createFullBgnTemplate, FULL_BGN_MODULES } from "@/lib/moduli-vendita/fullBgnModules";
import { BGN_CHECK_IMAGES, BGN_ACCESSIBILITY_CHECK_IMAGE, BGN_EDITORIAL_PHOTO_REPLACEMENTS, BGN_GENERATED_CHECK_IMAGES } from "@/lib/moduli-vendita/bgnEditorialPhotography";
import { leggiBlocco, leggiFotoPagina, fotoDellaLibreria } from "../../../supabase/functions/_shared/blocchiPreventivo";
import type { BgnTemplatePdf } from "@/types/bagni";

const base = { id: "qa", company_id: "qa" } as BgnTemplatePdf;
describe("Bagni editorial photos, audit corrections", () => {
  it.each(FULL_BGN_MODULES)("assigns actual controls, defaults and local assets for %s", id => {
    const template = createFullBgnTemplate(base, id);
    const photo = BGN_CHECK_IMAGES[id];
    const controls = leggiBlocco("controlli", "bagni", template.pdf_blocchi);
    expect(controls.foto).toEqual([photo]);
    expect(existsSync(`public${photo}`)).toBe(true);
    expect(fotoDellaLibreria("bagni", template.pdf_blocchi).some(image => image.url === photo)).toBe(true);
    expect(JSON.stringify(template.pdf_blocchi)).not.toContain("/pdf-stock/comune/controllo-finale.jpg");
    const defaults = template.pdf_blocchi?.modulo_defaults as Record<string, unknown>;
    expect(leggiBlocco("controlli", "bagni", defaults).foto).toEqual([photo]);
    if (BGN_GENERATED_CHECK_IMAGES.includes(photo)) expect(controls.nota).toContain("generata con AI");
    expect(template.gallery_lavori).toEqual([]);
    expect(template.testimonianze).toEqual([]);
  });
  it("uses an adaptation operation on accessibility pages 4 and 12, never the cover", () => {
    const template = createFullBgnTemplate(base, "accessibilita");
    for (const key of ["comeFunziona", "diario"] as const) {
      const block = leggiBlocco(key, "bagni", template.pdf_blocchi);
      expect(block.foto).toEqual([BGN_ACCESSIBILITY_CHECK_IMAGE]);
      expect(block.nota).toContain("generata con AI");
    }
    expect(BGN_ACCESSIBILITY_CHECK_IMAGE).not.toBe(template.cover_image_url);
    expect(JSON.stringify(template.pdf_blocchi)).not.toContain("/pdf-stock/bagni/installazione.jpg");
  });
  it("exports only explicit old/new replacements for opt-in refresh", () => {
    for (const [id, blocks] of Object.entries(BGN_EDITORIAL_PHOTO_REPLACEMENTS)) {
      const template = createFullBgnTemplate(base, id as typeof FULL_BGN_MODULES[number]);
      for (const [key, replacement] of Object.entries(blocks)) {
        expect(replacement.oldUrl).not.toBe(replacement.newUrl);
        if (key === "pagina_chiusura") expect(leggiFotoPagina("chiusura", "bagni", template.pdf_blocchi)).toBe(replacement.newUrl);
        else expect(leggiBlocco(key as "controlli", "bagni", template.pdf_blocchi).foto).toEqual([replacement.newUrl]);
      }
    }
    expect(BGN_EDITORIAL_PHOTO_REPLACEMENTS.doccia).toEqual({});
  });
});

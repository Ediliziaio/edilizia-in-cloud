import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createFullIdrTemplate, buildIdrModulePreview, FULL_IDR_MODULES } from "@/lib/moduli-vendita/fullIdrModules";
import { loadLocalIdrTemplate, saveLocalIdrTemplate } from "@/lib/moduli-vendita/localIdrTemplates";
import { idrCopyChoices } from "@/lib/moduli-vendita/idrInterventionCopy";
import type { IdrTemplatePdf } from "@/types/termoidraulico";
import { IDR_PHOTO_CORRECTIONS } from "@/lib/moduli-vendita/idrPhotoCorrections";
const base = { id: "online", company_id: "demo", ragione_sociale: "Azienda", default_detrazione_pct: 50, chi_siamo: "La nostra azienda" } as IdrTemplatePdf;
describe("modelli Termoidraulico indipendenti", () => {
  it.each(IDR_PHOTO_CORRECTIONS)("$moduleId/$key applies the audited photo before the shared fallback", correction => {
    const id = FULL_IDR_MODULES.find(id => id === correction.moduleId)!;
    const blocks = createFullIdrTemplate(base, id).pdf_blocchi as Record<string, any>;
    const expected = correction.newUrl ? [correction.newUrl] : [];
    expect(blocks[correction.key].foto).toEqual(expected);
    expect(blocks[correction.key].senzaFoto).toBe(!correction.newUrl);
    expect(blocks.modulo_defaults[correction.key].foto).toEqual(expected);
    if (correction.newUrl) expect(existsSync("public" + correction.newUrl)).toBe(true);
  });
  it.each(FULL_IDR_MODULES)("%s ha pagine, fotografie, testi e dati coerenti", id => {
    const model = createFullIdrTemplate(base, id);
    expect(model.company_id).toBe("demo");
    expect(model.ragione_sociale).toBe("Azienda");
    expect(model.faq).toHaveLength(8); expect(model.cronoprogramma).toHaveLength(4);
    expect(model.testimonianze).toEqual([]); expect(model.gallery_lavori).toEqual([]);
    expect(model.default_detrazione_pct).toBe(0);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"]) expect(model.pdf_blocchi?.[key]).toBeDefined();
    const photos = model.pdf_blocchi?.modulo_foto as { url: string }[];
    const blocks = model.pdf_blocchi as Record<string, any>;
    expect(JSON.stringify(blocks)).not.toContain("/pdf-stock/comune/controllo-finale.jpg");
    expect(blocks.pagina_chiusura.foto).toHaveLength(1);
    const internalPhotos = ["comeFunziona", "protezione", "controlli", "documenti", "diario", "pagina_investimento"]
      .flatMap(key => blocks[key].foto ?? []);
    expect(internalPhotos).not.toContain(blocks.pagina_chiusura.foto[0]);
    expect(photos.length).toBeGreaterThanOrEqual(2);
    for (const image of photos) expect(existsSync(`public${image.url}`)).toBe(true);
    expect(idrCopyChoices(id, model)).toHaveLength(10);
    const preview = buildIdrModulePreview("demo", model, id);
    expect(preview.computo).toHaveLength(3);
    expect(preview.progetto.detrazione_pct).toBe(0);
    expect(preview.progetto.immobile_superficie_mq).toBeNull();
    expect(base.id).toBe("online"); expect(base.default_detrazione_pct).toBe(50);
  });
  it("mantiene separati azienda, intervento e revisioni", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const hybrid = createFullIdrTemplate(base, "ibrido");
    const saved = saveLocalIdrTemplate("demo", "ibrido", hybrid, null, storage);
    expect(loadLocalIdrTemplate("demo", "ibrido", storage)?.template.cover_title).toBe(hybrid.cover_title);
    expect(loadLocalIdrTemplate("demo", "acqua-calda", storage)).toBeNull();
    expect(loadLocalIdrTemplate("altra", "ibrido", storage)).toBeNull();
    expect(() => saveLocalIdrTemplate("demo", "ibrido", hybrid, null, storage)).toThrow("altra scheda");
    expect(() => saveLocalIdrTemplate("altra", "ibrido", hybrid, saved.savedAt, storage)).toThrow("altra azienda");
  });
});

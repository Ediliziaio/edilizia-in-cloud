import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { buildClmModulePreview, createFullClmTemplate, FULL_CLM_MODULES, CLM_MODULE_COVERS, CLM_MODULE_TITLES } from "@/lib/moduli-vendita/fullClmModules";
import { localClmTemplateKey, loadLocalClmTemplate, saveLocalClmTemplate } from "@/lib/moduli-vendita/localClmTemplates";
import { clmCopyChoices } from "@/lib/moduli-vendita/clmInterventionCopy";
import type { ClmTemplatePdf } from "@/types/climatizzazione";
import { calcTotaliComputo } from "@/lib/climatizzazione/calcoli";
import { GENERATED_CLM_ASSETS } from "@/lib/moduli-vendita/generatedClmAssets";
import { CLM_PHOTO_CORRECTIONS, CLM_COVER_PHOTO_CORRECTIONS } from "@/lib/moduli-vendita/clmPhotoCorrections";

const base = { id: "online", company_id: "company-a", color_primary: "#234567", logo_url: null, cover_logo_url: null, condizioni_legali_testo: "OLD", default_detrazione_pct: 50 } as ClmTemplatePdf;
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
describe("Six native Climatizzazione modules", () => {
  it("hands off only existing, changed URLs matching the final factory", () => {
    for (const [id, changes] of Object.entries(CLM_PHOTO_CORRECTIONS)) {
      const blocks = createFullClmTemplate(base, id as "canalizzato" | "vmc" | "manutenzione").pdf_blocchi as Record<string, any>;
      for (const [key, change] of Object.entries(changes)) {
        expect(change.oldUrl).not.toBe(change.newUrl);
        expect(existsSync("public" + change.oldUrl)).toBe(true);
        expect(existsSync("public" + change.newUrl)).toBe(true);
        expect(blocks[key].foto).toEqual([change.newUrl]);
      }
    }
    expect(createFullClmTemplate(base, "vmc").cover_image_url).toBe(CLM_COVER_PHOTO_CORRECTIONS.vmc.newUrl);
  });
  it.each(["canalizzato", "vmc"] as const)("%s checks show air terminals, never a window inspection", id => {
    const blocks = createFullClmTemplate(base, id).pdf_blocchi as Record<string, any>;
    expect(blocks.controlli.foto).toEqual([`/module-art/climatizzazione-${id}-editorial.jpg`]);
    expect(JSON.stringify(blocks)).not.toContain("/pdf-stock/comune/controllo-finale.jpg");
    expect(blocks.controlli.nota).toContain("non documenta una misura di portata");
  });
  it.each(["vmc", "canalizzato", "manutenzione"] as const)("%s assigns center-safe subjects to the actual configuration page", id => {
    const t = createFullClmTemplate(base, id);
    const blocks = t.pdf_blocchi as Record<string, any>;
    expect(blocks.comeFunziona.foto).toEqual([GENERATED_CLM_ASSETS[id].path]);
    expect(blocks.modulo_defaults.comeFunziona.foto).toEqual(blocks.comeFunziona.foto);
    if (id === "vmc") expect(t.cover_image_url).toBe(GENERATED_CLM_ASSETS.vmc.path);
    expect(existsSync("public" + GENERATED_CLM_ASSETS[id].path)).toBe(true);
  });
  it.each(FULL_CLM_MODULES)("%s uses original pages with assigned images and honest example totals", id => {
    const t = createFullClmTemplate(base, id);
    expect(base.id).toBe("online");
    expect(t.color_primary).toBe(base.color_primary);
    expect(t.id).toBe(`local-climatizzazione-${id}`);
    expect(t.testimonianze).toEqual([]); expect(t.gallery_lavori).toEqual([]);
    expect(t.faq).toHaveLength(8); expect(t.cronoprogramma).toHaveLength(4);
    expect(t.default_detrazione_pct).toBe(0); expect(t.finanziamento_promo).toBeNull();
    expect(t.condizioni_legali_attivo).toBe(false);
    expect(t.pdf_ordine_capitoli!.length).toBeGreaterThan(15);
    expect(t.pdf_blocchi!.modulo_intervento).toBe(id);
    const blocks = t.pdf_blocchi as Record<string, any>;
    const internalPhotos = ["comeFunziona", "protezione", "controlli", "documenti", "diario"].flatMap(key => {
      expect(blocks[key].foto).toHaveLength(1);
      expect(blocks[key].senzaFoto).toBe(false);
      expect(blocks[key].nota).toMatch(/illustrativ/i);
      return blocks[key].foto as string[];
    });
    expect(new Set(internalPhotos).size).toBe(5);
    expect(blocks.pagina_chiusura.foto).toHaveLength(1);
    expect(internalPhotos).not.toContain(blocks.pagina_chiusura.foto[0]);
    expect(blocks.pagina_investimento.senzaFoto).toBe(true);
    expect(blocks.pagina_domande.senzaFoto).toBe(true);
    expect(blocks.modulo_defaults.controlli.foto).toEqual(blocks.controlli.foto);
    for (const photo of blocks.modulo_foto) expect(existsSync("public" + photo.url)).toBe(true);
    expect(CLM_MODULE_COVERS[id]).toBe(t.cover_image_url);
    expect(CLM_MODULE_TITLES[id]).toBeTruthy();
    const data = buildClmModulePreview(base.company_id, t, id);
    expect(data.localOnly).toBe(true);
    expect(data.progetto.detrazione_pct).toBe(0);
    expect(data.progetto.mostra_finanziamento).toBe(false);
    expect(data.progetto.totale).toBe(calcTotaliComputo(data.computo, { iva_pct: 22, sconto_pct: 0 }).totale);
    expect(JSON.stringify(data.computo)).not.toMatch(/Demolizione tramezzi|Posa pavimento/);
    expect(clmCopyChoices(id, t).length).toBeGreaterThan(8);
  });
  it("scopes copies by company/module, protects stale revisions and corrupt storage", () => {
    const port = storage();
    const t = createFullClmTemplate(base, "monosplit");
    const first = saveLocalClmTemplate("company-a", "monosplit", t, null, port);
    expect(loadLocalClmTemplate("company-b", "monosplit", port)).toBeNull();
    expect(loadLocalClmTemplate("company-a", "vmc", port)).toBeNull();
    expect(() => saveLocalClmTemplate("company-a", "monosplit", t, null, port)).toThrow(/altra scheda/);
    const second = saveLocalClmTemplate("company-a", "monosplit", { ...t, cover_title: "Edited" }, first.savedAt, port);
    expect(second.savedAt).not.toBe(first.savedAt);
    expect(loadLocalClmTemplate("company-a", "monosplit", port)?.template.cover_title).toBe("Edited");
    expect(() => saveLocalClmTemplate("company-b", "monosplit", t, null, port)).toThrow(/altra azienda/);
    port.setItem(localClmTemplateKey("company-a", "vmc"), "{broken");
    expect(() => loadLocalClmTemplate("company-a", "vmc", port)).toThrow(/danneggiata/);
    expect(port.getItem(localClmTemplateKey("company-a", "vmc"))).toBe("{broken");
  });
  it("reports quota failures without marking a draft saved", () => {
    const t = createFullClmTemplate(base, "vmc");
    expect(() => saveLocalClmTemplate("company-a", "vmc", t, null, { getItem: () => null, setItem: () => { throw Error("Quota"); } })).toThrow(/spazio esaurito/);
  });
});

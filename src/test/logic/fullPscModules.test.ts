import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createFullPscTemplate, buildPscModulePreview, FULL_PSC_MODULES, PSC_MODULE_COVERS } from "@/lib/moduli-vendita/fullPscModules";
import { loadLocalPscTemplate, saveLocalPscTemplate, localPscTemplateKey } from "@/lib/moduli-vendita/localPscTemplates";
import { leggiBlocco, leggiFotoPagina } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import { pscCopyChoices } from "@/lib/moduli-vendita/pscInterventionCopy";
import type { PisTemplatePdf } from "@/types/piscine";
const base = { id: "online", company_id: "demo", ragione_sociale: "Azienda", default_detrazione_pct: 50, chi_siamo: "La nostra azienda" } as PisTemplatePdf;
describe("modelli Piscine indipendenti", () => {
  it.each(FULL_PSC_MODULES)("%s ha pagine, fotografie, testi e dati coerenti", id => {
    const model = createFullPscTemplate(base, id);
    expect(model.company_id).toBe("demo");
    expect(model.ragione_sociale).toBe("Azienda");
    expect(model.faq).toHaveLength(8); expect(model.cronoprogramma).toHaveLength(4);
    expect(model.testimonianze).toEqual([]); expect(model.gallery_lavori).toEqual([]);
    expect(model.default_detrazione_pct).toBe(0);
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "piscine", model.pdf_blocchi);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.foto.length).toBeGreaterThan(0);
      for (const photo of block.foto) expect(existsSync(`public${photo}`)).toBe(true);
      expect(block.nota).toContain("illustrativa");
      // The native renderer suppresses a closing image already used in a block.
      expect(block.foto).not.toContain(leggiFotoPagina("chiusura", "piscine", model.pdf_blocchi));
      const reset = { ...model.pdf_blocchi, [key]: {} };
      expect(leggiBlocco(key, "piscine", reset)).toEqual(block);
    }
    expect(leggiFotoPagina("chiusura", "piscine", model.pdf_blocchi)).toMatch(/^\/(?:pdf-stock|cover-stock)\/piscine\//);
    expect(model.pdf_ordine_capitoli?.filter(p => ["recensioni", "foto", "lavori"].includes(p.chiave)).every(p => !p.visibile)).toBe(true);
    const photos = model.pdf_blocchi?.modulo_foto as { url: string }[];
    expect(photos.length).toBeGreaterThanOrEqual(2);
    for (const image of photos) expect(existsSync(`public${image.url}`)).toBe(true);
    expect(pscCopyChoices(id, model)).toHaveLength(10);
    const preview = buildPscModulePreview("demo", model, id);
    expect(preview.computo).toHaveLength(3);
    expect(preview.progetto.detrazione_pct).toBe(0);
    expect(preview.progetto.immobile_superficie_mq).toBeNull();
    expect(base.id).toBe("online"); expect(base.default_detrazione_pct).toBe(50);
  });
  it("copre esattamente gli ID di areas.ts", () => {
    expect(FULL_PSC_MODULES).toEqual(SALES_AREAS.find(area => area.id === "piscine")?.interventions.map(item => item.id));
  });
  it("Accessori distingue documenti, diario e chiusura anche nella libreria", () => {
    const model = createFullPscTemplate(base, "accessori");
    const documenti = leggiBlocco("documenti", "piscine", model.pdf_blocchi).foto[0];
    const diario = leggiBlocco("diario", "piscine", model.pdf_blocchi).foto[0];
    const chiusura = leggiFotoPagina("chiusura", "piscine", model.pdf_blocchi);
    expect(diario).toBe("/pdf-stock/piscine/famiglia.jpg");
    expect(chiusura).toBe("/cover-stock/piscine/1.jpg");
    expect(new Set([documenti, diario, chiusura]).size).toBe(3);
    for (const url of [diario, chiusura]) expect(model.pdf_blocchi?.modulo_foto).toContainEqual(expect.objectContaining({ url }));
  });
  it.each([
    ["accessori", "/module-art/piscine-copertura-rullo.jpg", 3],
    ["rivestimento", "/module-art/piscine-posa-pvc.jpg", 2],
  ] as const)("%s usa il nuovo asset nelle pagine native senza ripeterlo ovunque", (id, asset, occurrences) => {
    const model = createFullPscTemplate(base, id);
    expect(PSC_MODULE_COVERS[id]).toBe(asset);
    expect(model.cover_image_url).toBe(asset);
    expect(leggiBlocco("comeFunziona", "piscine", model.pdf_blocchi).foto).toEqual([asset]);
    expect(leggiBlocco("controlli", "piscine", model.pdf_blocchi).foto).toEqual([id === "accessori" ? asset : "/pdf-stock/piscine/tecnica-vasca.jpg"]);
    const assigned = [model.cover_image_url, ...(["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const).flatMap(key => leggiBlocco(key, "piscine", model.pdf_blocchi).foto), ...(["investimento", "chiusura"] as const).map(key => leggiFotoPagina(key, "piscine", model.pdf_blocchi))];
    expect(assigned.filter(photo => photo === asset)).toHaveLength(occurrences);
    for (const photo of new Set(assigned)) expect(assigned.filter(item => item === photo).length).toBeLessThanOrEqual(photo === asset ? occurrences : 2);
    expect(model.pdf_blocchi?.modulo_foto).toContainEqual(expect.objectContaining({ url: asset }));
  });
  it("rimuove gli alias di copertina ereditati e conserva i controlli Piscine originali", () => {
    const model = createFullPscTemplate({ ...base, pdf_cover_hero: "Titolo vecchio", pdf_cover_image_url: "/vecchia.jpg", pdf_cover_title_size: 90 } as PisTemplatePdf, "nuova");
    const raw = model as unknown as Record<string, unknown>;
    expect(raw.pdf_cover_hero).toBeUndefined(); expect(raw.pdf_cover_image_url).toBeUndefined(); expect(raw.pdf_cover_title_size).toBeUndefined();
    expect(model.cover_title_size).toBe(35);
    expect(pscCopyChoices("nuova", model).every(choice => !Object.keys(choice.patch).some(key => key.startsWith("pdf_cover_")))).toBe(true);
  });
  it("preserva copie corrotte e segnala storage pieno senza sovrascrivere", () => {
    const model = createFullPscTemplate(base, "nuova");
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const key = localPscTemplateKey("demo", "nuova");
    values.set(key, "{broken");
    expect(() => saveLocalPscTemplate("demo", "nuova", model, null, storage)).toThrow("danneggiata");
    expect(values.get(key)).toBe("{broken"); values.clear();
    expect(() => saveLocalPscTemplate("demo", "nuova", model, null, { ...storage, setItem: () => { throw new Error("quota"); } })).toThrow("spazio esaurito");
    expect(values.size).toBe(0);
    expect(() => saveLocalPscTemplate("demo", "impianti", model, null, storage)).toThrow("altro intervento");
  });
  it("mantiene separati azienda, intervento e revisioni", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const hybrid = createFullPscTemplate(base, "impianti");
    const saved = saveLocalPscTemplate("demo", "impianti", hybrid, null, storage);
    expect(loadLocalPscTemplate("demo", "impianti", storage)?.template.cover_title).toBe(hybrid.cover_title);
    expect(loadLocalPscTemplate("demo", "manutenzione", storage)).toBeNull();
    expect(loadLocalPscTemplate("altra", "impianti", storage)).toBeNull();
    expect(() => saveLocalPscTemplate("demo", "impianti", hybrid, null, storage)).toThrow("altra scheda");
    expect(() => saveLocalPscTemplate("altra", "impianti", hybrid, saved.savedAt, storage)).toThrow("altra azienda");
  });
});

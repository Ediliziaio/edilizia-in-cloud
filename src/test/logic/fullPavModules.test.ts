import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { FULL_PAV_MODULES, PAV_EDITORIAL, PAV_MODULE_COVERS, buildPavModulePreview, createFullPavTemplate } from "@/lib/moduli-vendita/fullPavModules";
import { loadLocalPavTemplate, localPavTemplateKey, saveLocalPavTemplate } from "@/lib/moduli-vendita/localPavTemplates";
import { pavCopyChoices } from "@/lib/moduli-vendita/pavInterventionCopy";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import { PAV_OPERATIONAL_IMAGES } from "@/lib/moduli-vendita/pavEditorialContent";
import { leggiBlocco, leggiFotoPagina } from "../../../supabase/functions/_shared/blocchiPreventivo";

describe("Six original Pavimenti modules", () => {
  it.each(["resina", "parquet", "pareti", "esterni"] as const)("%s binds its own operational illustration to printed blocks, not the cover or actual gallery", id => {
    const template = createFullPavTemplate({ company_id: "a" }, id);
    const expected = PAV_OPERATIONAL_IMAGES[id];
    expect(expected).not.toBe(template.cover_image_url);
    expect(readFileSync(path.resolve("public", expected.slice(1))).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    for (const key of ["comeFunziona", "diario"] as const) {
      const block = leggiBlocco(key, "pavimenti", template.pdf_blocchi);
      expect(block.foto).toEqual([expected]);
      expect(block.nota).toContain("generata con AI");
    }
    if (id === "esterni") expect(leggiBlocco("controlli", "pavimenti", template.pdf_blocchi).foto).toEqual([expected]);
    expect(template.gallery_lavori).toEqual([]);
    expect(template.testimonianze).toEqual([]);
  });
  it("covers the exact intervention IDs", () => {
    expect(FULL_PAV_MODULES).toEqual(SALES_AREAS.find(a => a.id === "pavimenti")!.interventions.map(i => i.id));
  });
  it.each(FULL_PAV_MODULES)("%s has specific copy, real asset bindings and honest examples", id => {
    const base = { company_id: "a", chi_siamo: "La nostra impresa" };
    const t = createFullPavTemplate(base, id);
    expect(t.id).toBe("local-pavimenti-" + id);
    expect(t.cover_image_url).toBe(PAV_MODULE_COVERS[id]);
    expect(t.faq).toHaveLength(8);
    expect(t.testimonianze).toEqual([]);
    expect(t.gallery_lavori).toEqual([]);
    expect(t.default_detrazione_pct).toBe(0);
    expect(t.show_chi_siamo).toBe(true);
    expect(createFullPavTemplate({ company_id: "a" }, id).show_chi_siamo).toBe(false);
    expect(base).toEqual({ company_id: "a", chi_siamo: "La nostra impresa" });
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const block = leggiBlocco(key, "pavimenti", t.pdf_blocchi);
      expect(block.foto.length).toBeGreaterThan(0);
      expect(block.voci.length).toBeGreaterThanOrEqual(3);
      expect(block.nota).toMatch(/illustrativa/);
      for (const url of block.foto) expect(existsSync(path.resolve("public", url.slice(1)))).toBe(true);
    }
    expect(leggiFotoPagina("chiusura", "pavimenti", t.pdf_blocchi)).toBe("/pdf-stock/comune/pulizia-consegna.jpg");
    const data = buildPavModulePreview("a", t, id);
    expect(data.localOnly).toBe(true);
    expect(data.media).toEqual([]);
    expect(data.computo).toHaveLength(PAV_EDITORIAL[id].rows.length);
    expect(data.progetto.tipo_intervento).toBe(PAV_EDITORIAL[id].title);
    expect(data.progetto.note).toContain("DIMOSTRATIVA");
    expect(JSON.stringify(data.computo)).not.toMatch(/Demolizione tramezzi|impianto elettrico certificato/);
    const choices = pavCopyChoices(id, t);
    expect(choices.find(c => c.id === "faq-breve")!.patch.faq).toHaveLength(4);
    expect(choices.find(c => c.id === "cover-editoriale")!.patch.cover_title).toBe(t.cover_title);
  });
  it("keeps local records independent, detects collisions and preserves corrupt data", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const t = createFullPavTemplate({ company_id: "a" }, "parquet");
    const saved = saveLocalPavTemplate("a", "parquet", t, null, storage);
    expect(loadLocalPavTemplate("a", "parquet", storage)).toEqual(saved);
    expect(loadLocalPavTemplate("b", "parquet", storage)).toBeNull();
    expect(loadLocalPavTemplate("a", "resina", storage)).toBeNull();
    expect(() => saveLocalPavTemplate("a", "parquet", t, null, storage)).toThrow(/altra scheda/);
    expect(() => saveLocalPavTemplate("b", "parquet", t, null, storage)).toThrow(/altra azienda/);
    const next = saveLocalPavTemplate("a", "parquet", { ...t, cover_title: "Modificato" }, saved.savedAt, storage);
    expect(Date.parse(next.savedAt)).toBeGreaterThan(Date.parse(saved.savedAt));
    const key = localPavTemplateKey("a", "parquet");
    values.set(key, "{broken");
    expect(() => loadLocalPavTemplate("a", "parquet", storage)).toThrow(/danneggiata/);
    expect(() => saveLocalPavTemplate("a", "parquet", t, next.savedAt, storage)).toThrow();
    expect(values.get(key)).toBe("{broken");
  });
  it("reports storage quota failures without claiming a save", () => {
    const t = createFullPavTemplate({ company_id: "a" }, "resina");
    expect(() => saveLocalPavTemplate("a", "resina", t, null, { getItem: () => null, setItem: () => { throw new Error("quota"); } })).toThrow(/spazio esaurito/);
  });
  it("retains the native renderer", () => {
    const source = readFileSync("src/components/pavimenti/PavimentiPDF.tsx", "utf8");
    expect(source).toContain("<DocumentoEdilePDF dati={dati}");
  });
});

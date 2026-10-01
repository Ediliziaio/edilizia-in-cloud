import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import { FAC_EDITORIAL } from "@/lib/moduli-vendita/facEditorialContent";
import { FAC_FIXTURE_NOTICE, FAC_MODULE_COVERS, FAC_MODULE_TITLES, FULL_FAC_MODULES, buildFacModulePreview, createFullFacTemplate, prepareFacPhotoRefresh, isFacLocalImage, type FullFacModuleId } from "@/lib/moduli-vendita/fullFacModules";
import { assertFacTemplate, loadLocalFacTemplate, localFacTemplateKey, saveLocalFacTemplate } from "@/lib/moduli-vendita/localFacTemplates";
import { facCopyChoices } from "@/lib/moduli-vendita/facInterventionCopy";
import { leggiBlocco, leggiFotoPagina } from "../../../supabase/functions/_shared/blocchiPreventivo";
const expectedTotals: Record<FullFacModuleId, number> = { cappotto: 19434.6, rifacimento: 8723, balconi: 4894.64, tinteggiatura: 5136.2, interno: 4715.3, riparazioni: 1595.76 };
const make = (id: FullFacModuleId = "cappotto", company_id = "company-a") => createFullFacTemplate({ company_id, ragione_sociale: "Azienda esempio" }, id);
beforeEach(() => localStorage.clear());

describe("six native Facciate editions", () => {
  it("offers an opt-in photo refresh of early drafts without replacing edits or removals", () => {
    const t = make(), defaults = t.pdf_blocchi.modulo_defaults as Record<string, unknown>;
    const before = t.pdf_blocchi.protezione as Record<string, unknown>;
    t.pdf_blocchi.protezione = { ...before, titolo: "Titolo utente", foto: [], senzaFoto: true };
    defaults.protezione = { ...before, foto: [], senzaFoto: true };
    t.pdf_blocchi.controlli = { ...(t.pdf_blocchi.controlli as object), foto: [], senzaFoto: true }; // explicit removal, old default had a photo
    const snapshot = structuredClone(t), refreshed = prepareFacPhotoRefresh(t, "cappotto");
    expect(t).toEqual(snapshot); expect(refreshed.added).toBe(1);
    expect(refreshed.blocks.protezione).toMatchObject({ titolo: "Titolo utente", foto: ["/module-art/serramenti-persiane-protezione.jpg"] });
    expect(refreshed.blocks.controlli).toEqual(t.pdf_blocchi.controlli);
    expect(prepareFacPhotoRefresh(make(), "cappotto").added).toBe(0);
  });
  // La scheda Facciate ora gira sul motore Ristrutturazioni (fullFacciate.ts): l'area elenca questi
  // sei modelli più ventilata/pietra/pulizia. Il motore fac resta un'isola coerente con sé stessa.
  it("resta coerente e contenuto nell'area Facciate", () => {
    expect(new Set(FULL_FAC_MODULES)).toEqual(new Set(Object.keys(FAC_EDITORIAL)));
    const areaIds = SALES_AREAS.find(a => a.id === "facciate")?.interventions.map(i => i.id) ?? [];
    for (const id of FULL_FAC_MODULES) expect(areaIds).toContain(id);
  });
  it.each(FULL_FAC_MODULES)("%s has a complete, isolated editorial and fixture", id => {
    const c = FAC_EDITORIAL[id], template = make(id), data = buildFacModulePreview("company-a", template, id);
    expect(() => assertFacTemplate(template, "company-a", id)).not.toThrow();
    expect(template.faq).toHaveLength(8); expect(new Set(template.faq.map(f => f.domanda)).size).toBe(8);
    expect(c.specs).toHaveLength(4); expect(c.stages).toHaveLength(5); expect(c.included.length).toBeGreaterThanOrEqual(3); expect(c.excluded.length).toBeGreaterThanOrEqual(3);
    expect(data.modulo.chiave).toBe("facciate"); expect(data.tipoIntervento).toBe(FAC_MODULE_TITLES[id]);
    expect(data.totali.totale).toBeCloseTo(expectedTotals[id], 2);
    expect(data.totali.detrazionePct).toBe(0); expect(data.mostraFinanziamento).toBe(false);
    expect(data.azienda.votiOnline).toEqual([]); expect(data.modello.testimonianze).toEqual([]); expect(data.modello.galleriaLavori).toEqual([]);
    expect(data.modello.condizioniLegali).toEqual([]); expect(data.modello.testoValidita).toContain(FAC_FIXTURE_NOTICE);
    expect(data.modello.cronoprogramma.every(f => f.durata === "Da concordare")).toBe(true);
    expect(existsSync(path.resolve("public", FAC_MODULE_COVERS[id].slice(1)))).toBe(true);
    const defaults = template.pdf_blocchi.modulo_defaults as Record<string, unknown>;
    for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const) {
      const reset = { ...template.pdf_blocchi }; delete reset[key];
      expect(leggiBlocco(key, "ristrutturazione", reset)).toEqual(leggiBlocco(key, "ristrutturazione", template.pdf_blocchi));
      expect(defaults[key]).not.toBe(template.pdf_blocchi[key]);
    }
    expect(leggiFotoPagina("chiusura", "ristrutturazione", template.pdf_blocchi)).toBeTruthy();
    for (const key of ["comeFunziona", "protezione", "controlli", "documenti", "diario"] as const) {
      expect(data.modello.blocchi[key].foto.length).toBeGreaterThan(0);
      const slot = template.pdf_blocchi[key] as { foto: string[]; senzaFoto: boolean; nota: string };
      expect(slot.senzaFoto).toBe(false); expect(slot.nota).toContain("illustrativ");
      for (const photo of slot.foto) expect(existsSync(path.resolve("public", photo.slice(1)))).toBe(true);
    }
    expect(data.modello.fotoRiempimento.percorso).toBeTruthy();
    expect(facCopyChoices(id, template).every(choice => Object.keys(choice.patch).length === 1)).toBe(true);
  });
  it("whitelists branding without inheriting content, money or false endorsements", () => {
    const base = { company_id: "company-a", ragione_sociale: "Brand originale", color_primary: "#abcd12", logo_url: "https://remote.invalid/logo.png", cover_title: "Ristrutturazione", default_detrazione_pct: 50, testimonianze: [{ testo: "Inventata" }] };
    const snapshot = structuredClone(base), template = createFullFacTemplate(base, "interno");
    expect(base).toEqual(snapshot); expect(template.ragione_sociale).toBe("Brand originale"); expect(template.color_primary).toBe("#abcd12");
    expect(template.logo_url).toBeNull(); expect(template.default_detrazione_pct).toBe(0); expect(template.testimonianze).toEqual([]);
    expect(template.cover_title).not.toBe(base.cover_title);
  });
  it("keeps disclaimer after edits and supports manual/100% fixtures", () => {
    const t = make(); t.validity_text = "Nota editata";
    expect(buildFacModulePreview("company-a", t, "cappotto").modello.testoValidita).toContain(FAC_FIXTURE_NOTICE);
    expect(buildFacModulePreview("company-a", t, "cappotto", { discountPct: 100 }).totali.totale).toBe(0);
    expect(buildFacModulePreview("company-a", t, "cappotto", { manualPrice: 1000, discountPct: 10 }).totali.totale).toBe(1098);
    expect(() => buildFacModulePreview("company-b", t, "cappotto")).toThrow();
    t.condizioni_legali_attivo = true; t.condizioni_legali_testo = " ";
    expect(buildFacModulePreview("company-a", t, "cappotto").modello.condizioniLegali).toEqual([]);
  });
  it("has no online call path, placeholder editor or shared PDF hook in its owned components", () => {
    for (const filename of ["FacciateTemplateEditor.tsx", "FacciateModuleTemplatePanel.tsx", "FacciateLocalImageField.tsx", "facPdfAdapter.tsx"]) {
      const source = readFileSync(path.resolve("src/components/facciate", filename), "utf8");
      expect(source).not.toMatch(/from ["']@\/integrations\/supabase|useRistrutturazionePDF|LocalModuleDocumentEditor|\.upload\(|\.upsert\(|\.insert\(/);
    }
    expect(readFileSync("src/components/facciate/facPdfAdapter.tsx", "utf8")).toContain("<DocumentoEdilePDF dati={dati}");
  });
});

describe("company-scoped optimistic storage", () => {
  it("reloads edits and isolates all six modules and companies", () => {
    for (const id of FULL_FAC_MODULES) for (const company of ["company-a", "company-b"]) {
      const template = make(id, company); template.cover_title = `${id}:${company}`;
      saveLocalFacTemplate(company, id, template, null);
    }
    for (const id of FULL_FAC_MODULES) for (const company of ["company-a", "company-b"]) expect(loadLocalFacTemplate(company, id)?.template.cover_title).toBe(`${id}:${company}`);
    expect(localFacTemplateKey("a:b", "interno")).toContain("a%3Ab");
  });
  it("rejects stale and deleted revisions, and produces monotonic revisions", () => {
    const t = make(), first = saveLocalFacTemplate("company-a", "cappotto", t, null);
    const second = saveLocalFacTemplate("company-a", "cappotto", t, first.savedAt);
    expect(Date.parse(second.savedAt)).toBeGreaterThan(Date.parse(first.savedAt));
    expect(() => saveLocalFacTemplate("company-a", "cappotto", t, first.savedAt)).toThrow(/altra scheda/);
    expect(() => saveLocalFacTemplate("company-a", "cappotto", t, null)).toThrow(/altra scheda/);
    localStorage.removeItem(localFacTemplateKey("company-a", "cappotto"));
    expect(() => saveLocalFacTemplate("company-a", "cappotto", t, second.savedAt)).toThrow(/altra scheda/);
  });
  it("never overwrites corrupt or foreign data", () => {
    const key = localFacTemplateKey("company-a", "cappotto"); localStorage.setItem(key, "broken");
    expect(() => saveLocalFacTemplate("company-a", "cappotto", make(), null)).toThrow(/danneggiata/);
    expect(localStorage.getItem(key)).toBe("broken");
    expect(() => saveLocalFacTemplate("company-b", "cappotto", make(), null)).toThrow(/altra azienda/);
    const t = make(); t.faq = null!; expect(() => saveLocalFacTemplate("company-a", "cappotto", t, null)).toThrow(/non valida/);
  });
  it("surfaces quota/read failures", () => {
    const setItem = vi.fn(() => { throw new Error("QuotaExceeded"); });
    expect(() => saveLocalFacTemplate("company-a", "cappotto", make(), null, { getItem: () => null, setItem })).toThrow(/spazio esaurito/);
    expect(() => loadLocalFacTemplate("company-a", "cappotto", { getItem: () => { throw new Error("Denied"); }, setItem })).toThrow(/leggere/);
  });
  it.each(["https://example.com/a.jpg", "//example.com/a.jpg", "/module-art/../secret.png", "blob:abc", "data:image/svg+xml;base64,AAAA"])("rejects non-local or unsupported image %s", url => {
    expect(isFacLocalImage(url)).toBe(false); const t = make(); t.pdf_cover_image_url = url;
    expect(() => assertFacTemplate(t, "company-a", "cappotto")).toThrow();
  });
});

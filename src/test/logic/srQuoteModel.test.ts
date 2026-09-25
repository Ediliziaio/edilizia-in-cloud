import { describe, expect, it, vi } from "vitest";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { SR_OPERATIONAL_MODELS, isSrQuoteModelId, makeSrQuoteModelSnapshot, quoteModelTemplate, readSrQuoteModelSnapshot, srModelProjectDefaults, resolveSrDocumentTemplate } from "@/lib/serramenti/quoteModel";
import { modelCatalogTypes, suggestedModelTypes } from "@/lib/serramenti/modelCatalog";
import { AREE_STANDARD } from "@/lib/listino/areeStandard";
import type { TipologiaListino } from "@/lib/listino/lineeListino";

describe("Serramenti model → stored document", () => {
  it("real PDF resolution prefers snapshot even when the caller requests a fresh general template", async () => {
    const modello_snapshot = makeSrQuoteModelSnapshot("A", "persiane", createFullSerramentiTemplate({ company_id: "A" }, "persiane"));
    const load = vi.fn(async () => ({ pdf_cover_hero: "Wrong general template" }));
    const resolved = await resolveSrDocumentTemplate({ company_id: "A", modello_snapshot }, { pdf_cover_hero: "Wrong cache" }, true, load);
    expect(resolved?.pdf_blocchi?.modulo_intervento).toBe("persiane");
    expect(load).not.toHaveBeenCalled();
  });
  it("preserves draft preview and fresh company lookup for legacy projects", async () => {
    const draft = { pdf_cover_hero: "Draft unsaved" };
    const load = vi.fn(async () => ({ pdf_cover_hero: "Fresh general" }));
    expect(await resolveSrDocumentTemplate({ company_id: "A" }, draft, false, load)).toBe(draft);
    expect(load).not.toHaveBeenCalled();
    expect(await resolveSrDocumentTemplate({ company_id: "A" }, draft, true, load)).toEqual({ pdf_cover_hero: "Fresh general" });
    expect(load).toHaveBeenCalledExactlyOnceWith("A");
  });
  it.each(SR_OPERATIONAL_MODELS)("round-trips %s independently of later template edits", modelId => {
    const source = createFullSerramentiTemplate({ company_id: "A" }, modelId);
    source.pdf_cover_hero = `Titolo personalizzato ${modelId}`;
    const snapshot = makeSrQuoteModelSnapshot("A", modelId, source);
    source.pdf_cover_hero = "Modifica successiva";
    const saved = JSON.parse(JSON.stringify(snapshot));
    const reopened = quoteModelTemplate({ company_id: "A", modello_snapshot: saved });
    expect(reopened?.pdf_cover_hero).toBe(`Titolo personalizzato ${modelId}`);
    expect(reopened?.pdf_blocchi?.modulo_intervento).toBe(modelId);
    expect(reopened?.pdf_blocchi).not.toHaveProperty("modulo_defaults");
    expect(source.pdf_blocchi).toHaveProperty("modulo_defaults");
    expect(reopened?.pdf_cover_image_url).toBe(source.pdf_cover_image_url);
    const defaults = srModelProjectDefaults(snapshot);
    expect(defaults.esigenze?.length).toBeGreaterThan(0);
    for (const key of ["totale_min", "totale_max", "cliente_nome", "serramenti", "iva_percentuale", "fin_anticipo_pct"]) expect(defaults).not.toHaveProperty(key);
  });
  it("never changes legacy projects into models by guessing the title", () => {
    expect(quoteModelTemplate({ company_id: "A" })).toBeNull();
    expect(isSrQuoteModelId("Serramenti")).toBe(false);
    expect(isSrQuoteModelId("zanzariere")).toBe(false);
    expect(isSrQuoteModelId(null)).toBe(false);
  });
  it("rejects a template belonging to another company", () => {
    expect(() => makeSrQuoteModelSnapshot("B", "persiane", createFullSerramentiTemplate({ company_id: "A" }, "persiane"))).toThrow(/azienda/);
  });
  it.each(["company", "version", "model", "pages", "hero", "intervention", "date"])("fails closed for invalid %s instead of another PDF", corruption => {
    const s = makeSrQuoteModelSnapshot("A", "persiane", createFullSerramentiTemplate({ company_id: "A" }, "persiane"));
    const malformed = JSON.parse(JSON.stringify(s));
    if (corruption === "company") malformed.template.company_id = "B";
    if (corruption === "version") malformed.version = 2;
    if (corruption === "model") malformed.modelId = "unknown";
    if (corruption === "pages") malformed.template.pdf_pages_order = [{ id: "cover" }];
    if (corruption === "hero") malformed.template.pdf_cover_hero = "";
    if (corruption === "intervention") malformed.template.pdf_blocchi.modulo_intervento = "finestre";
    if (corruption === "date") malformed.capturedAt = "yesterday";
    expect(() => readSrQuoteModelSnapshot(malformed, "A")).toThrow(/non è valido/);
  });
});

const types = AREE_STANDARD.find(a => a.chiave === "serramenti")!.tipologie.map((standard, i): TipologiaListino => ({
  chiave: `company-specific-${i}`, nome: `Custom label ${i}`, fonte: "macrocategoria", macrocategoriaId: `macro-${i}`,
  categoriaId: null, immagineUrl: null, accessorio: standard.accessorio, categoriaTipo: null,
  collegamento: "area", attiva: true, standard, articoli: 1, linee: [],
}));
describe("model-specific catalog suggestions", () => {
  it("uses canonical type, not company labels or IDs", () => {
    expect(suggestedModelTypes(types, "persiane").map(t => t.standard?.nome)).toEqual(["Persiane e scuri"]);
    expect(suggestedModelTypes(types, "finestre").map(t => t.standard?.nome)).toEqual(["Serramenti"]);
  });
  it("combined offers share the exact same catalog objects", () => {
    const combined = suggestedModelTypes(types, "combinato");
    expect(combined.map(t => t.standard?.nome)).toEqual(["Serramenti", "Persiane e scuri", "Zanzariere", "Tapparelle", "Cassonetti"]);
    expect(combined[0]).toBe(suggestedModelTypes(types, "finestre")[0]);
    expect(combined[1]).toBe(suggestedModelTypes(types, "persiane")[0]);
  });
  it("all-catalog escape hatch and empty suggestions preserve existing products", () => {
    expect(modelCatalogTypes(types, "persiane", true)).toBe(types);
    const noShutters = types.filter(t => t.standard?.nome !== "Persiane e scuri");
    expect(modelCatalogTypes(noShutters, "persiane", false)).toBe(noShutters);
    expect(modelCatalogTypes(types, undefined, false)).toBe(types);
  });
  it("does not suggest disabled or disconnected types and never mutates listino", () => {
    const original = JSON.stringify(types);
    expect(suggestedModelTypes(types.map(t => ({ ...t, attiva: false })), "combinato")).toEqual([]);
    expect(suggestedModelTypes(types.map(t => ({ ...t, collegamento: "nessuno" as const })), "combinato")).toEqual([]);
    modelCatalogTypes(types, "combinato", false);
    expect(JSON.stringify(types)).toBe(original);
  });
});

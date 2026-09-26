import { describe, expect, it, vi } from "vitest";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
import { FULL_MODULE_COVERS } from "@/lib/moduli-vendita/fullModuleCatalog";
import { MODULE68_EXPECTED, MODULE68_FACTORIES, MODULE68_MODELS, attachModule68AssetIssues, decodeModule68Assets, inspectModule68, isAuditLocalAsset, runModule68Audit } from "../audits/module68ContentAudit";

vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in module68 audit"); }));
const report = runModule68Audit();
describe("94 clean factory templates: independent content and local asset inventory", () => {
  it("covers exactly the agreed 94 models across 13 areas, with no missing or extra registry entries", () => {
    expect(MODULE68_MODELS).toHaveLength(94); expect(Object.keys(MODULE68_EXPECTED)).toHaveLength(13);
    const keys = MODULE68_MODELS.map(m => m.key).sort();
    expect(SALES_AREAS.flatMap(area => area.interventions.map(model => `${area.id}/${model.id}`)).sort()).toEqual(keys);
    expect(Object.keys(FULL_MODULE_COVERS).sort()).toEqual(keys);
    for (const [area, ids] of Object.entries(MODULE68_EXPECTED)) expect([...MODULE68_FACTORIES[area as keyof typeof MODULE68_FACTORIES].ids].sort()).toEqual([...ids].sort());
  });
  describe.each(report.models)("$key", model => {
    it("has authored required text, correct metadata, section order and clean proof fields", () => {
      const problems = model.issues.filter(i => i.severity === "error" && !/photo|asset/.test(i.code));
      expect(problems, JSON.stringify(problems, null, 2)).toEqual([]);
    });
    it("assigns photos to operational sections and a non-suppressed closing, not just the library", () => {
      const problems = model.issues.filter(i => i.severity === "error" && /photo/.test(i.code));
      expect(problems, JSON.stringify(problems, null, 2)).toEqual([]);
    });
    it("uses only local, fully decodable assets and deterministic non-mutating factory output", () => {
      const problems = model.issues.filter(i => i.severity === "error" && /asset/.test(i.code));
      expect(problems, JSON.stringify(problems, null, 2)).toEqual([]);
      expect(model.photos.every(photo => isAuditLocalAsset(photo.url))).toBe(true);
      expect(inspectModule68(model.area, model.id).contentSha256).toBe(model.contentSha256);
    });
  });
  it("does not use the network or falsely label this audit as PDF visual inspection", () => {
    expect(fetch).not.toHaveBeenCalled();
    expect(report.models.every(m => m.visualPdfInspection === "not-performed" && m.actualPdfImageEmbedding === "not-tested")).toBe(true);
  });
  it("records full decode metadata, content hashes and all raw factory text fields", () => {
    for (const asset of report.assets) {
      expect(asset.decoded).toBe(true); expect(asset.width).toBeGreaterThan(0); expect(asset.height).toBeGreaterThan(0);
      expect(asset.bytes).toBeGreaterThan(0); expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/); expect(["JPEG", "PNG", "WEBP"]).toContain(asset.format);
    }
    for (const model of report.models) expect(model.textFields["pdf_blocchi.controlli.intro"]).toBeTruthy();
  });
  it("also decodes raw library entries rejected by a sector picker", () => {
    // Synthetic regression: fresh Facciate no longer carry these unused textures.
    const template = MODULE68_FACTORIES.facciate.make("cappotto"), blocks = template.pdf_blocchi as Record<string, unknown>;
    const url = "/render-references/facades/Facciata-Intonaco-Liscio-Dipinto.webp";
    blocks.modulo_foto = [...blocks.modulo_foto as object[], { url, nome: "Texture di test" }];
    const model = inspectModule68("facciate", "cappotto", template);
    expect(model.issues.some(i => i.code === "shared-chooser-rejects-local-library-entry")).toBe(true);
    expect(decodeModule68Assets([model]).some(a => a.url === url && a.decoded)).toBe(true);
  });
  it("has no missing refresh identities or filtered fresh library references after the fixes", () => {
    expect(report.models.flatMap(m => m.issues.filter(i => ["missing-refresh-module-id", "shared-chooser-rejects-local-library-entry"].includes(i.code)))).toEqual([]);
  });
});

describe("audit detector regressions", () => {
  it("rejects traversal, remote, blob, data and unsupported assets", () => {
    for (const url of ["https://example.invalid/x.jpg", "//example.invalid/x.jpg", "/module-art/../secret.jpg", "blob:123", "data:image/png;base64,AAAA", "/module-art/asset.svg"]) expect(isAuditLocalAsset(url)).toBe(false);
    expect(isAuditLocalAsset("/module-art/piscine-posa-pvc.jpg")).toBe(true);
  });
  it("detects a missing authored title even if the shared block reader supplies a fallback", () => {
    const template = MODULE68_FACTORIES.piscine.make("nuova"), blocks = template.pdf_blocchi as Record<string, unknown>;
    blocks.controlli = { ...(blocks.controlli as object), titolo: "" };
    expect(inspectModule68("piscine", "nuova", template).issues.some(i => i.code === "missing-authored-block-text" && i.field.endsWith("controlli.titolo"))).toBe(true);
  });
  it("does not treat a library-only photograph as a populated operational page", () => {
    const template = MODULE68_FACTORIES.piscine.make("nuova"), blocks = template.pdf_blocchi as Record<string, unknown>;
    blocks.controlli = { ...(blocks.controlli as object), foto: [], senzaFoto: true };
    expect(inspectModule68("piscine", "nuova", template).issues.some(i => i.code === "missing-operational-photo")).toBe(true);
  });
  it("detects closing duplication that the Edile renderer would suppress", () => {
    const template = MODULE68_FACTORIES.tetti.make("isolamento"), blocks = template.pdf_blocchi as Record<string, unknown>;
    blocks.pagina_chiusura = { foto: ["/pdf-stock/tetti/isolamento.jpg"] };
    expect(inspectModule68("tetti", "isolamento", template).issues.some(i => i.code === "suppressed-closing-photo")).toBe(true);
  });
  it("detects literal placeholder residue without flagging ordinary illustrative disclaimers", () => {
    const template = MODULE68_FACTORIES.piscine.make("nuova"); template.cover_title = "Lorem ipsum";
    expect(inspectModule68("piscine", "nuova", template).issues.some(i => i.code === "placeholder-residue")).toBe(true);
  });
  it("detects a missing local asset without writing any fixture file", () => {
    const model = structuredClone(report.models[0]);
    model.photos = [{ url: "/module-art/module68-intentionally-missing-fixture.jpg", role: "block.controlli", origin: "factory" }];
    model.issues = [];
    const assets = decodeModule68Assets([model]);
    expect(assets[0]).toMatchObject({ exists: false, decoded: false });
    expect(attachModule68AssetIssues([model], assets)[0].issues.some(i => i.code === "asset-decode-failed")).toBe(true);
  });
  it("detects a cross-module metadata residue", () => {
    const template = MODULE68_FACTORIES.piscine.make("nuova");
    (template.pdf_blocchi as Record<string, unknown>).modulo_intervento = "manutenzione";
    expect(inspectModule68("piscine", "nuova", template).issues.some(i => i.code === "intervention-id-mismatch")).toBe(true);
  });
  it("detects an empty introduction and an incomplete authored item", () => {
    const template = MODULE68_FACTORIES.piscine.make("nuova"), blocks = template.pdf_blocchi as Record<string, unknown>;
    blocks.controlli = { ...(blocks.controlli as object), intro: " ", voci: [{ titolo: "Controllo", testo: "" }] };
    const issues = inspectModule68("piscine", "nuova", template).issues;
    expect(issues.some(i => i.code === "missing-authored-block-text" && i.field.endsWith("controlli.intro"))).toBe(true);
    expect(issues.some(i => i.code === "missing-item-text" && i.field.includes("controlli.voci"))).toBe(true);
  });
});

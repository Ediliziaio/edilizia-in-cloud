import { describe, expect, it, vi } from "vitest";
import { buildFacModulePreview, createFullFacTemplate } from "@/lib/moduli-vendita/fullFacModules";
import { inlineFacPdfImages } from "@/components/facciate/facPdfAdapter";
const png = "data:image/png;base64,AAAA";
const make = () => buildFacModulePreview("a", createFullFacTemplate({ company_id: "a" }, "cappotto"), "cappotto");
describe("Facciate PDF image preparation", () => {
  it("inlines every native image slot, deduplicates conversion, and does not mutate input", async () => {
    const data = make(), src = "/module-art/facciate.jpg";
    data.azienda.logoUrl = src; data.azienda.logoChiaroUrl = src;
    data.modello.copertina.logoUrl = src; data.modello.chiSiamoFotoUrl = src;
    data.modello.blocchi.comeFunziona.foto = [{ src, diSerie: true }];
    for (const block of Object.values(data.modello.blocchi)) block.foto = [{ src, diSerie: true }];
    data.modello.copertina.immagineUrl = src;
    data.modello.fotoChiusura = { src, diSerie: true };
    data.modello.fotoRiempimento = { percorso: { src, diSerie: true } };
    data.modello.pagineLibere = [{ id: "p", titolo: "P", occhiello: null, testoHtml: null, fotoUrl: src, didascalia: null }];
    data.modello.galleriaLavori = [{ id: "g", url: src }]; data.fotoProgetto = [{ id: "f", url: src }];
    const snapshot = structuredClone(data), resolver = vi.fn(async () => png), out = await inlineFacPdfImages(data, resolver);
    expect(resolver).toHaveBeenCalledOnce(); expect(data).toEqual(snapshot);
    expect(out.modello.blocchi.comeFunziona.foto[0]).toEqual({ src: png, diSerie: true });
    expect(out.modello.fotoChiusura?.src).toBe(png); expect(out.modello.fotoRiempimento.percorso?.src).toBe(png);
    expect(out.modello.pagineLibere[0].fotoUrl).toBe(png); expect(out.modello.galleriaLavori[0].url).toBe(png); expect(out.fotoProgetto[0].url).toBe(png);
    expect(out.azienda.logoUrl).toBe(png); expect(out.modello.copertina.immagineUrl).toBe(png);
  });
  it("converts inline WebP and refuses a resolver's unsupported/remote fallback", async () => {
    const data = make(); data.modello.copertina.immagineUrl = "data:image/webp;base64,AAAA";
    const resolver = vi.fn(async () => png); await inlineFacPdfImages(data, resolver);
    expect(resolver).toHaveBeenCalledWith("data:image/webp;base64,AAAA");
    await expect(inlineFacPdfImages(data, async source => source)).rejects.toThrow(/PNG o JPEG/);
  });
  it("fails before the renderer can fetch a remote URL and surfaces missing images", async () => {
    const data = make(); data.modello.copertina.immagineUrl = "https://remote.invalid/logo.png";
    const resolver = vi.fn(async () => png); await expect(inlineFacPdfImages(data, resolver)).rejects.toThrow(/remota/);
    expect(resolver).not.toHaveBeenCalled();
    await expect(inlineFacPdfImages(make(), async () => { throw new Error("404"); })).rejects.toThrow("404");
  });
});

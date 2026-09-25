import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPavModulePreview, createFullPavTemplate } from "@/lib/moduli-vendita/fullPavModules";
const calls = vi.hoisted(() => ({ remote: vi.fn(() => { throw new Error("Remote access forbidden"); }), image: vi.fn(async (url: string | null) => url ? "data:image/jpeg;base64,local" : null) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: calls.remote, storage: { from: calls.remote } } }));
vi.mock("@/hooks/usePavimentiProgetto", () => ({ getPavTemplatePdf: calls.remote }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: calls.image }));
import { enrichPavimentiPdf } from "@/hooks/usePavimentiPDF";
beforeEach(() => vi.clearAllMocks());
const payload = () => buildPavModulePreview("a", createFullPavTemplate({ company_id: "a" }, "parquet"), "parquet");
describe("Pavimenti local enrichment", () => {
  it("inlines assigned photos, omits online reviews, and calculates totals without remote access", async () => {
    const result = await enrichPavimentiPdf(payload());
    expect(calls.remote).not.toHaveBeenCalled();
    expect(result.totali.totale).toBe(2830.4);
    const template = result.template as unknown as Record<string, any>;
    expect(template.pdf_voti_online).toEqual([]);
    for (const key of ["comeFunziona", "protezione", "controlli", "documenti"]) expect(template.pdf_blocchi_foto[key]).toHaveLength(1);
    expect(template.pdf_pagine_foto.chiusura).toBe("data:image/jpeg;base64,local");
  });
  it.each(["https://example.invalid/photo.jpg", "//example.invalid/photo.jpg", "bucket/private.jpg"])("rejects %s before fetching", async url => {
    const data = payload();
    data.template.cover_image_url = url;
    await expect(enrichPavimentiPdf(data)).rejects.toThrow(/solo immagini locali/);
    expect(calls.remote).not.toHaveBeenCalled();
    expect(calls.image).not.toHaveBeenCalled();
  });
  it("requires the explicit local source template", async () => {
    await expect(enrichPavimentiPdf({ ...payload(), template: null })).rejects.toThrow(/modello esplicito/);
    expect(calls.remote).not.toHaveBeenCalled();
  });
  it("honors zero discount totals and native manual-price semantics", async () => {
    const data = payload();
    data.progetto.sconto_pct = 100;
    expect((await enrichPavimentiPdf(data)).totali.totale).toBe(0);
    Object.assign(data.progetto, { prezzo_manuale: 1000, sconto_pct: 10 });
    expect((await enrichPavimentiPdf(data)).totali.totale).toBe(1098);
    Object.assign(data.progetto, { prezzo_manuale: 0, sconto_pct: 0 });
    const zero = await enrichPavimentiPdf(data);
    // The native calculator uses a strictly positive manual price; zero resets to the rows.
    expect(zero.totali.totale).toBe(2830.4);
    expect(zero.totali.prezzoManuale).toBe(false);
  });
});

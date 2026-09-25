import { beforeEach, describe, expect, it, vi } from "vitest";
import { SERRAMENTI_TEMPLATE_MODULES, createSerramentiModuleTemplate } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { loadLocalSerramentiTemplate, saveLocalSerramentiTemplate, localSerramentiTemplateKey } from "@/lib/moduli-vendita/localSerramentiTemplates";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import { normalizePdfPagesOrder } from "@/types/serramenti";

vi.mock("@/lib/storage/immaginiModelloPdf", () => ({ CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmagine: async (): Promise<null> => null, firmaImmaginiModello: async (t: unknown) => t }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (): Promise<null> => null }));
vi.mock("@/lib/pdf/fotoBlocchi", () => ({ blocchiAccesi: (): never[] => [], fotoDeiBlocchi: async () => ({}), fotoDellePagine: async () => ({}) }));
vi.mock("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: vi.fn(() => { throw new Error("No reviews in local preview"); }) }));
const base = { company_id: "company-a", ragione_sociale: "Azienda test", pdf_cover_hero: "Vecchio", logo_url: "/logo.png", condizioni_legali_testo: "Condizioni generali da non copiare" };
const seed = () => createSerramentiModuleTemplate(base, "zanzariere");
beforeEach(() => localStorage.clear());
describe("sette moduli PDF Serramenti indipendenti", () => {
  it.each(SERRAMENTI_TEMPLATE_MODULES)("$id: contenuti e dati demo dedicati", async m => {
    const t = createSerramentiModuleTemplate(base, m.id);
    const payload = await buildMockPdfData({ template: t, moduleId: m.id });
    expect(t.logo_url).toBe(base.logo_url);
    expect(t.pdf_cover_hero).toBe(m.title);
    expect(t.condizioni_legali_attivo).toBe(false);
    expect(t.condizioni_legali_testo).toBe("");
    expect(payload.detail.progetto.intervento_titolo).toBe(m.title);
    expect(payload.detail.progetto.esigenze).toEqual(t.esigenze_default);
    expect(payload.detail.serramenti[0].tipologia_label).toBe(m.sample);
    expect(payload.detail.serramenti.every(r => r.vetro === null && r.family_id === null)).toBe(true);
    expect(payload.detail.progetto.totale_min).toBe(payload.detail.serramenti.reduce((sum, r) => sum + (r.prezzo_totale ?? 0), 0));
    expect(payload.detail.progetto.fin_piani).toEqual([]);
    expect(payload.detail.progetto.detrazione_aliquota).toBe(0);
    expect(payload.detail.progetto.risparmio_calcolato).toBe(false);
    expect(payload.lineeDedicate).toEqual([]);
    expect(payload.familiesById).toEqual({});
    expect(payload.publicUrl).toBeNull();
    expect(payload.consulente).toBeNull();
    expect(normalizePdfPagesOrder(t.pdf_pages_order).filter(p => p.visible).map(p => p.id)).not.toContain("come_funziona");
  });
  it("riflette i testi modificati anche nei dati del PDF", async () => {
    const t = { ...seed(), esigenze_default: [{ titolo: "La mia esigenza", descrizione: "Testo personalizzato" }] };
    const p = await buildMockPdfData({ template: t, moduleId: "zanzariere" });
    expect(p.detail.progetto.esigenze).toEqual(t.esigenze_default);
  });
  it("separa azienda e modulo, conserva la personalizzazione", () => {
    const first = saveLocalSerramentiTemplate("company-a", "zanzariere", seed(), null);
    saveLocalSerramentiTemplate("company-a", "zanzariere", { ...first.template, pdf_cover_hero: "Titolo mio" }, first.savedAt);
    expect(loadLocalSerramentiTemplate("company-a", "zanzariere")?.template.pdf_cover_hero).toBe("Titolo mio");
    expect(loadLocalSerramentiTemplate("company-b", "zanzariere")).toBeNull();
    expect(loadLocalSerramentiTemplate("company-a", "persiane")).toBeNull();
    expect(base.pdf_cover_hero).toBe("Vecchio");
  });
  it("rifiuta salvataggi con azienda errata e conflitti tra schede", () => {
    expect(() => saveLocalSerramentiTemplate("company-b", "zanzariere", seed(), null)).toThrow("non appartiene");
    saveLocalSerramentiTemplate("company-a", "zanzariere", seed(), null);
    expect(() => saveLocalSerramentiTemplate("company-a", "zanzariere", seed(), null)).toThrow("un'altra scheda");
  });
  it("non sovrascrive dati danneggiati", () => {
    const key = localSerramentiTemplateKey("company-a", "zanzariere");
    localStorage.setItem(key, "invalid");
    expect(() => saveLocalSerramentiTemplate("company-a", "zanzariere", seed(), null)).toThrow("danneggiata");
    expect(localStorage.getItem(key)).toBe("invalid");
  });
  it("segnala quota esaurita", () => {
    expect(() => saveLocalSerramentiTemplate("company-a", "zanzariere", seed(), null, { getItem: () : null => null, setItem: () => { throw new Error("quota"); } })).toThrow("Spazio locale esaurito");
  });
});

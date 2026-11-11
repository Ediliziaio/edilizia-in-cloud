import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
const state = vi.hoisted(() => ({ db: null as unknown as DbMinimo, destroy: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => state.db.from(t) } }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: () => ({ destroy: state.destroy, promise: Promise.resolve({ numPages: 2, destroy: state.destroy, getPage: async () => ({ getViewport: () => ({ width: 600, height: 850 }), render: () => ({ promise: Promise.resolve() }) }) }) }) }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));
import { costruisciPagineSchedeTecniche, inserisciPagineSchede } from "../../lib/fotovoltaico/schedeTecnichePreventivo";
beforeEach(() => {
  state.db = new DbMinimo(); state.destroy.mockClear();
  state.db.tabelle.articoli_native_documenti = [
    { articolo_id: "a1", company_id: "c1", nome: "Pannello scelto", url: "https://example.test/a.pdf", autorizzata: true },
    { articolo_id: "a2", company_id: "c1", nome: "Non scelto", url: "https://example.test/b.pdf", autorizzata: true },
    { articolo_id: "a1", company_id: "c2", nome: "Altra azienda", url: "https://example.test/c.pdf", autorizzata: true },
  ];
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AA==");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("allegati tecnici dei prodotti FV", () => {
  it("allega tutte le pagine dei soli prodotti scelti, senza duplicare prodotti o aziende", async () => {
    const html = await costruisciPagineSchedeTecniche(["a1", "a1", null], "c1");
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledWith("https://example.test/a.pdf");
    expect(html.match(/class="page"/g)).toHaveLength(2); expect(html).toContain("Pannello scelto"); expect(state.destroy).toHaveBeenCalledOnce();
  });
  it("non reinserisce una scheda disattivata tramite il vecchio campo", async () => {
    state.db.tabelle.articoli_native_documenti[0].autorizzata = false;
    state.db.tabelle.articoli_native = [{ id: "a1", company_id: "c1", scheda_tecnica_url: "https://example.test/a.pdf" }];
    expect(await costruisciPagineSchedeTecniche(["a1"], "c1")).toBe(""); expect(fetch).not.toHaveBeenCalled();
  });
  it("ferma il download quando manca una scheda autorizzata, senza consegnare un PDF parziale", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(costruisciPagineSchedeTecniche(["a1"], "c1")).rejects.toThrow("Pannello scelto");
  });
  it("se non può leggere il catalogo non lo considera un preventivo senza allegati", async () => {
    state.db = { from: () => ({ select: () => ({ eq: () => ({ in: () => ({ order: () => ({ order: async () => ({ data: null as null, error: { message: "offline" } }) }) }) }) }) }) } as unknown as DbMinimo;
    await expect(costruisciPagineSchedeTecniche(["a1"], "c1")).rejects.toThrow("verificare gli allegati");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("non confonde un riferimento alle condizioni con la pagina contrattuale vera", () => {
    const html = '<body><div class="page">Leggi le Condizioni generali di contratto</div><div class="page"><div data-fv-section="condizioni">Condizioni vere</div></div></body>';
    const result = inserisciPagineSchede(html, '<div class="page">ALLEGATO</div>');
    expect(result.indexOf("ALLEGATO")).toBeGreaterThan(result.indexOf("Leggi le"));
    expect(result.indexOf("ALLEGATO")).toBeLessThan(result.indexOf('data-fv-section="condizioni"'));
  });
});

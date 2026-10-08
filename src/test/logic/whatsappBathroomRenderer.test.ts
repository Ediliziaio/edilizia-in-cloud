import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { generateBathroomModelPdf } from "../../../supabase/functions/bgn-genera-pdf/generate";
import { validateBathroomRenderInput } from "../../../supabase/functions/_shared/bathroomRenderInput";
import { moduloAttivo } from "../../../supabase/functions/_shared/moduloAttivo";
import { toDataUrl } from "../../../scripts/bgn-render/shims/pdfImageUtils";
const company = "00000000-0000-4000-8000-000000000001";
const project = "00000000-0000-4000-8000-000000000002";
const revision = "2026-10-08T08:00:00Z";
const fixture = () => ({ progetto: { id: project, company_id: company, updated_at: revision, tipo_intervento: "vasca_in_doccia",
  totale: 110, totale_imponibile: 100, iva_pct: 10, detrazione_pct: 0, sconto_pct: 0,
  modello_snapshot: { version: 1, modelId: "vasca-doccia", companyId: company, capturedAt: revision,
    template: { company_id: company, cover_title: "La tua nuova doccia", pdf_blocchi: { modulo_intervento: "vasca-doccia" } } } },
  computo: [{ id: "line", progetto_id: project, company_id: company, descrizione: "Posa box doccia", quantita: 1, prezzo_unitario: 100, sconto_pct: 0 }], media: [] as Record<string, unknown>[] });
const body = () => ({ company_id: company, progetto_id: project, modello: "vasca-doccia", revisione_progetto: revision });
const pdf = () => Uint8Array.from(new TextEncoder().encode("%PDF-1.7\n" + "mock-render-output".repeat(20)));
let db: DbMinimo & { storage: { from: ReturnType<typeof vi.fn> } };
let upload: ReturnType<typeof vi.fn>; let sign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  const env: Record<string, string> = { APP_URL: "https://app.example.test", SUPABASE_URL: "https://db.example.test" };
  vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network call"); }));
  const stored = new Map<string, Uint8Array>();
  upload = vi.fn(async (path: string, bytes: Uint8Array) => { stored.set(path, bytes); return { error: null }; });
  sign = vi.fn(async () => ({ error: null, data: { signedUrl: "https://db.example.test/verified.pdf" } }));
  const download = vi.fn(async (path: string) => ({ data: stored.has(path) ? new Blob([stored.get(path)! as BlobPart]) : null, error: null }));
  db = Object.assign(new DbMinimo(), { storage: { from: vi.fn(() => ({ upload, download, createSignedUrl: sign })) } });
  const f = fixture();
  db.tabelle.bgn_progetti = [f.progetto]; db.tabelle.bgn_computo_voci = f.computo; db.tabelle.bgn_progetti_media = [];
  db.tabelle.companies = [{ id: company, name: "Demo test" }];
  db.tabelle.company_feature_overrides = [{ company_id: company, feature_key: "modulo_bagni_attivo", is_enabled: true, access_level: "enabled", expires_at: null }];
  db.rpcs.silvio_context_actor_roles = () => ["company_admin"];
  db.rpcs.whatsapp_record_bathroom_artifact = a => ({ id: "00000000-0000-4000-8000-000000000003",
    company_id: a.p_company, project_id: a.p_project, module: "bagni", model_id: a.p_model, project_revision: a.p_revision,
    fingerprint: a.p_fingerprint, pdf_sha256: a.p_sha256, storage_path: a.p_path, byte_length: a.p_bytes, renderer_version: "documento-edile-bgn-v1" });
});
afterEach(() => vi.unstubAllGlobals());
describe("Exact bathroom PDF generation boundary", () => {
  it("accepts the frozen exact project, not a company default", () => expect(validateBathroomRenderInput(fixture())).toMatchObject({ modelId: "vasca-doccia", projectId: project }));
  it("rejects missing snapshots, different intervention and foreign lines", () => {
    const missing = fixture(); missing.progetto.modello_snapshot = null as never;
    expect(() => validateBathroomRenderInput(missing)).toThrow(/Modello/);
    const wrong = fixture(); wrong.progetto.tipo_intervento = "rifacimento_completo";
    expect(() => validateBathroomRenderInput(wrong)).toThrow(/Modello/);
    const foreign = fixture(); foreign.computo[0].company_id = "other";
    expect(() => validateBathroomRenderInput(foreign)).toThrow(/Voci/);
  });
  it("does not accept a classic quote or guess its model", async () => {
    const render = vi.fn(async (_input: unknown) => pdf());
    await expect(generateBathroomModelPdf(db, "actor", { quote_id: project, reale: false }, render)).rejects.toThrow(/quote classica/);
    expect(render).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  });
  it("passes real project, IVA and lines to the renderer and stores an immutable artifact", async () => {
    const render = vi.fn(async (_input: unknown) => pdf());
    expect(await generateBathroomModelPdf(db, "actor", body(), render)).toMatchObject({ success: true,
      model_id: "vasca-doccia", renderer: "DocumentoEdilePDF", pdf_generated: true, message_sent: false });
    expect(render.mock.calls[0][0]).toMatchObject({ progetto: { iva_pct: 10, modello_snapshot: { modelId: "vasca-doccia" } }, computo: fixture().computo });
    expect(upload.mock.calls[0][2]).toEqual({ contentType: "application/pdf", upsert: false });
    expect(db.scritture).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it("never falls back or uploads when the real renderer fails", async () => {
    await expect(generateBathroomModelPdf(db, "actor", body(), async () => { throw new Error("image unavailable"); })).rejects.toThrow("image unavailable");
    expect(upload).not.toHaveBeenCalled();
  });
  it("stops when a line changes during render, even without a project timestamp update", async () => {
    await expect(generateBathroomModelPdf(db, "actor", body(), async () => { db.tabelle.bgn_computo_voci[0].quantita = 2; return pdf(); })).rejects.toThrow(/cambiato durante/);
    expect(upload).not.toHaveBeenCalled();
  });
  it("rechecks permissions after rendering", async () => {
    await expect(generateBathroomModelPdf(db, "actor", body(), async () => { db.rpcs.silvio_context_actor_roles = () => []; return pdf(); })).rejects.toThrow(/autorizzare/);
    expect(upload).not.toHaveBeenCalled();
  });
  it("never claims a generated PDF on invalid bytes or failed storage", async () => {
    await expect(generateBathroomModelPdf(db, "actor", body(), async () => new Uint8Array(110))).rejects.toThrow(/PDF valido/);
    upload.mockResolvedValue({ error: { message: "offline" } });
    await expect(generateBathroomModelPdf(db, "actor", body(), async () => pdf())).rejects.toThrow(/Salvataggio/);
  });
  it("does not turn an unreadable feature override into a default-enabled module", async () => {
    const broken = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null as unknown, error: { message: "offline" } }) }) };
    await expect(moduloAttivo(broken, company, "modulo_bagni_attivo")).rejects.toThrow(/non verificabile/);
  });
  it("stops rather than passing unsigned private media to the renderer", async () => {
    db.tabelle.bgn_progetti_media = [{ progetto_id: project, company_id: company, url: "progetti-media/private-photo.jpg" }];
    await expect(generateBathroomModelPdf(db, "actor", body(), async () => pdf())).rejects.toThrow(/Foto private/);
  });
  it("renders a signed copy of authorized project photos and fingerprints the original reference", async () => {
    const path = `${company}/bagni/${project}/00000000-0000-4000-8000-000000000003.jpg`;
    const saved = { progetto_id: project, company_id: company, tipo: "situazione", url: `progetti-media/${path}` };
    db.tabelle.bgn_progetti_media = [saved];
    sign.mockImplementation(async (p: string) => ({ error: null, data: { signedUrl: `https://db.example.test/storage/v1/object/sign/${p.startsWith("bagno/") ? "quote-pdfs" : "progetti-media"}/${p}?token=fixture` } }));
    const render = vi.fn(async (_input: unknown) => pdf());
    const result = await generateBathroomModelPdf(db, "actor", body(), render);
    expect(result).toMatchObject({ pdf_generated: true, message_sent: false });
    expect(render.mock.calls[0][0]).toMatchObject({ media: [{ url: `https://db.example.test/storage/v1/object/sign/progetti-media/${path}?token=fixture` }] });
    expect(saved.url).toBe(`progetti-media/${path}`); expect(db.scritture).toHaveLength(0);
  });
  it("stops if a signed project photo reference changes during render", async () => {
    const path = `${company}/bagni/${project}/00000000-0000-4000-8000-000000000003.jpg`;
    db.tabelle.bgn_progetti_media = [{ progetto_id: project, company_id: company, tipo: "situazione", url: `progetti-media/${path}` }];
    sign.mockImplementation(async (p: string) => ({ error: null, data: { signedUrl: `https://db.example.test/storage/v1/object/sign/progetti-media/${p}?token=fixture` } }));
    await expect(generateBathroomModelPdf(db, "actor", body(), async () => {
      db.tabelle.bgn_progetti_media[0].caption = "changed"; return pdf();
    })).rejects.toThrow(/cambiato/);
    expect(upload).not.toHaveBeenCalled();
  });
});
describe("Server image guard", () => {
  it("blocks untrusted origins and incompatible embedded formats without fetch", async () => {
    await expect(toDataUrl("https://127.0.0.1/private")).rejects.toThrow(/non autorizzata/);
    await expect(toDataUrl("data:image/webp;base64,AAAA")).rejects.toThrow(/non supportata/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects corrupt embedded JPG instead of leaving a blank image in the PDF", async () => {
    await expect(toDataUrl("data:image/jpeg;base64,AAAA")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not silently omit a missing or oversized image", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(toDataUrl("/cover-stock/bagni/1.jpg")).rejects.toThrow(/non disponibile/);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("large", { headers: { "content-length": "99999999" } }));
    await expect(toDataUrl("/cover-stock/bagni/1.jpg")).rejects.toThrow(/troppo grande/);
  });
});

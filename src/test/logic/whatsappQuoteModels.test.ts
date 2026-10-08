import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { modelArchiveKey, publishedModel, MODEL_ARCHIVES, modelWorkflowCapabilities } from "../../../supabase/functions/_shared/whatsappQuoteModels";
import { verificaModelloPreventivo } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/verifica_modello_preventivo";
import { inviaPreventivoBagno, inviaPreventivoBagnoDef } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/invia_preventivo_bagno";
import { generaPdfModelloBagno, generaPdfModelloBagnoDef } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/genera_pdf_modello_bagno";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";
import { SALES_AREAS } from "@/lib/moduli-vendita/areas";
const company = "00000000-0000-4000-8000-000000000001";
const quote = "00000000-0000-4000-8000-000000000002";
const revision = "2026-10-08T08:00:00.000Z";
let db: DbMinimo; let ctx: ToolCtx;
const record = () => ({ version: 1, companyId: company, moduleId: "vasca-doccia", savedAt: revision,
  template: { company_id: company, cover_title: "La tua nuova doccia", pdf_blocchi: { modulo_intervento: "vasca-doccia" } } });
beforeEach(() => {
  db = new DbMinimo(); ctx = { supabase: db, company_id: company, user_id: "actor", kind: "admin" } as unknown as ToolCtx;
  db.rpcs.silvio_context_actor_roles = () => ["company_admin"];
  db.tabelle.company_feature_overrides = [{ company_id: company, feature_key: "modulo_bagni_attivo", is_enabled: true, access_level: "enabled", expires_at: null }];
  db.tabelle.modelli_libreria_azienda = [{ company_id: company, chiave: modelArchiveKey("bagni", company, "vasca-doccia"), contenuto: record() }];
  db.tabelle.quotes = [{ company_id: company, id: quote, status: "bozza", updated_at: revision, client_name: "Cliente test", total: 110 }];
  db.tabelle.quote_items = [{ company_id: company, quote_id: quote, name: "Posa", quantity: 1, unit_price: 100, vat_rate: 10 }];
  vi.stubGlobal("Deno", { env: { get: () => "https://app.example.test" } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external request"); }));
});
afterEach(() => vi.unstubAllGlobals());
describe("Published model binding on WhatsApp", () => {
  it("uses the same company archive keys as the existing app", () => {
    expect(modelArchiveKey("bagni", company, "vasca-doccia")).toBe(`eic:full-bgn-module:v1:${company}:vasca-doccia`);
    expect(modelArchiveKey("tetti", company, "ripasso")).toBe(`eic:local-module-template:v1:${company}:tetti:ripasso`);
    expect(modelArchiveKey("serramenti", company, "combinato")).toBe(`eic:local-module-template:v1:${company}:serramenti:combinato`);
  });
  it.each(Object.keys(MODEL_ARCHIVES))("reports actual workflow capabilities for %s without promising a generic substitute", async module => {
    const modelId = module === "bagni" ? "vasca-doccia" : "complete-fixture";
    db.tabelle.company_feature_overrides = [{ company_id: company, feature_key: MODEL_ARCHIVES[module].feature, is_enabled: true, access_level: "enabled", expires_at: null }];
    db.tabelle.modelli_libreria_azienda = [{ company_id: company, chiave: modelArchiveKey(module, company, modelId),
      contenuto: { ...record(), moduleId: modelId, template: { ...record().template, pdf_blocchi: { modulo_intervento: modelId } } } }];
    const result = await verificaModelloPreventivo(ctx, { modulo: module, modello: modelId });
    expect(result).toMatchObject({ ok: true, data: { capabilities: { workflow: module === "bagni" ? "bathroom_reviewed_document" : "app_required", customer_send_available: false } } });
    if (module !== "bagni") expect(result.user_message).toContain("vanno completati nell’app");
    expect(fetch).not.toHaveBeenCalled(); expect(db.scritture).toHaveLength(0);
  });
  it("does not promise generation of an unknown bathroom intervention", () => {
    expect(modelWorkflowCapabilities("bagni", "inventato")).toMatchObject({ workflow: "app_required", pdf_generation_tool: null });
  });
  it.each(SALES_AREAS)("hands off every $title intervention to the actual app area, not a guessed module route", area => {
    for (const model of area.interventions) {
      const capability = modelWorkflowCapabilities(area.sourceModule, model.id);
      const url = new URL(capability.app_path, "https://local.invalid");
      expect(url.pathname).toBe("/azienda/marketing/preventivi");
      expect(url.searchParams.get("area")).toBe(area.id); expect(url.searchParams.get("modello")).toBe(model.id);
    }
  });
  it.each(["", "../completo", "complete:other"])("rejects invalid model IDs %s", id => expect(() => modelArchiveKey("bagni", company, id)).toThrow());
  it.each(["constructor", "__proto__", "unknown"])("rejects unknown/inherited module %s", module => {
    expect(() => modelArchiveKey(module, company, "completo")).toThrow();
    expect(() => modelWorkflowCapabilities(module, "completo")).toThrow();
  });
  it("does not accept another company or a different intervention", () => {
    expect(() => publishedModel(record(), "other", "vasca-doccia")).toThrow();
    expect(() => publishedModel(record(), company, "completo")).toThrow();
  });
  it("returns exact quote lines and both revisions, not a PDF success", async () => {
    expect(await verificaModelloPreventivo(ctx, { modulo: "bagni", modello: "vasca-doccia", quote_id: quote }))
      .toMatchObject({ ok: true, data: { revisione_modello: revision, revisione_preventivo: revision,
        voci_da_mostrare: [expect.objectContaining({ quantity: 1, unit_price: 100 })], pdf_generato: false, immagini_verificate: false } });
    expect(db.scritture).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it("never falls back to a different published model", async () => {
    expect(await verificaModelloPreventivo(ctx, { modulo: "bagni", modello: "completo" }))
      .toMatchObject({ ok: false, error: "modello_non_pubblicato" });
    expect(db.scritture).toHaveLength(0);
  });
  it("stops when the company has disabled the module", async () => {
    db.tabelle.company_feature_overrides[0].is_enabled = false;
    db.tabelle.company_feature_overrides[0].access_level = "disabled";
    expect(await verificaModelloPreventivo(ctx, { modulo: "bagni", modello: "vasca-doccia" })).toMatchObject({ ok: false, error: "modulo_non_attivo" });
  });
  it("does not reveal another company's quote", async () => {
    db.tabelle.quotes[0].company_id = "other";
    expect((await verificaModelloPreventivo(ctx, { modulo: "bagni", modello: "vasca-doccia", quote_id: quote })).ok).toBe(false);
  });
  it("does not trust a stale admin label or restricted staff access", async () => {
    db.rpcs.silvio_context_actor_roles = () => ["company_staff"];
    db.tabelle.staff_permissions = [{ company_id: company, user_id: "actor", can_view_preventivi: true, only_assigned: true, only_my_warehouse: false }];
    expect((await verificaModelloPreventivo(ctx, { modulo: "bagni", modello: "vasca-doccia", quote_id: quote })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects actor resolution errors before reading the model", async () => {
    db.rpcs.silvio_context_actor_roles = () => null;
    expect((await verificaModelloPreventivo(ctx, { modulo: "bagni", modello: "vasca-doccia" })).ok).toBe(false);
  });
  it("asks for explicit revisions before conversion", async () => {
    expect(inviaPreventivoBagnoDef.requires_confirmation).toBe(true);
    expect((await inviaPreventivoBagno(ctx, { quote_id: quote, modello: "vasca-doccia" })).ok).toBe(false);
    expect(db.rpcChiamate).toHaveLength(0);
  });
  it("uses one atomic conversion, no direct inserts and no separate WhatsApp send", async () => {
    db.rpcs.whatsapp_prepare_bathroom_quote = () => ({ success: true, progetto_id: quote, model_id: "vasca-doccia", pdf_generated: false });
    const result = await inviaPreventivoBagno(ctx, { quote_id: quote, modello: "vasca-doccia", revisione_modello: revision, revisione_preventivo: revision });
    expect(result).toMatchObject({ ok: true, data: { pdf_generated: false, link_inviato: false } });
    expect(db.rpcChiamate).toEqual([{ nome: "whatsapp_prepare_bathroom_quote", args: {
      p_company_id: company, p_user_id: "actor", p_quote_id: quote, p_model_id: "vasca-doccia", p_model_revision: revision, p_quote_revision: revision } }]);
    expect(db.scritture).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not certify a missing conversion receipt", async () => {
    expect((await inviaPreventivoBagno(ctx, { quote_id: quote, modello: "vasca-doccia", revisione_modello: revision, revisione_preventivo: revision })).ok).toBe(false);
  });
  it("requires a separate confirmation and an exact project revision for PDF generation", async () => {
    expect(generaPdfModelloBagnoDef.requires_confirmation).toBe(true);
    expect((await generaPdfModelloBagno(ctx, { progetto_id: quote, modello: "vasca-doccia" })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("validates a real-model receipt and calls only generation, never WhatsApp send", async () => {
    const env: Record<string, string> = { SUPABASE_URL: "https://db.example.test", SUPABASE_SERVICE_ROLE_KEY: "fake-only" };
    vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
    const receipt = { success: true, artifact_id: quote, pdf_sha256: "b".repeat(64), renderer_version: "documento-edile-bgn-v1", company_id: company, progetto_id: quote, model_id: "vasca-doccia",
      project_revision: revision, renderer: "DocumentoEdilePDF", pdf_generated: true, message_sent: false,
      fingerprint: "a".repeat(64), pdf_storage_path: `bagno/${company}/${quote}/${"a".repeat(64)}-${"b".repeat(64)}.pdf`,
      signed_url: `https://db.example.test/storage/v1/object/sign/quote-pdfs/bagno/${company}/${quote}/${"a".repeat(64)}-${"b".repeat(64)}.pdf?token=fixture` };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 200 }));
    expect(await generaPdfModelloBagno(ctx, { progetto_id: quote, modello: "vasca-doccia", revisione_progetto: revision,
      company_id: "malicious-other", per_utente: "malicious-user" })).toMatchObject({ ok: true, data: { pdf_generated: true, message_sent: false } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://db.example.test/functions/v1/bgn-genera-pdf");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({ company_id: company, per_utente: "actor" });
  });
  it("rejects a generic PDF receipt or uncertain generation without a retry", async () => {
    const env: Record<string, string> = { SUPABASE_URL: "https://db.example.test", SUPABASE_SERVICE_ROLE_KEY: "fake-only" };
    vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, signed_url: "https://db.example.test/generic.pdf" }), { status: 200 }));
    const args = { progetto_id: quote, modello: "vasca-doccia", revisione_progetto: revision };
    expect((await generaPdfModelloBagno(ctx, args)).ok).toBe(false);
    vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));
    expect(await generaPdfModelloBagno(ctx, args)).toMatchObject({ ok: false, error: "pdf_outcome_unknown" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

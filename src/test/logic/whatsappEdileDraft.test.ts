import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DbMinimo } from "../helpers/edgeFinto";
import { EDILE_DRAFT_MODULES, edileProjectPath, isEdileDraftModel } from "../../../supabase/functions/_shared/edileQuoteDraft";
import { MODEL_ARCHIVES, modelArchiveKey, modelWorkflowCapabilities } from "../../../supabase/functions/_shared/whatsappQuoteModels";
import { preparaPreventivoModello, preparaPreventivoModelloDef } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/prepara_preventivo_modello";
import { verificaModelloPreventivo } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/verifica_modello_preventivo";
import { confirmationPreview, freezeConfirmation, frozenConfirmationValid } from "../../../supabase/functions/whatsapp-ai-processor/frozenConfirmation";
import { TIPO_INTERVENTO_DEL_MODELLO, TABELLA_PREVENTIVI, leggiModelloPreventivo } from "@/lib/moduli/modelloPreventivo";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";
import * as clm from "@/lib/climatizzazione/calcoli";
import * as ele from "@/lib/elettrico/calcoli";
import * as idr from "@/lib/termoidraulico/calcoli";
import * as pav from "@/lib/pavimenti/calcoli";
import * as pis from "@/lib/piscine/calcoli";
import * as rst from "@/lib/ristrutturazione/calcoli";

const company = "00000000-0000-4000-8000-000000000001";
const quote = "00000000-0000-4000-8000-000000000002";
const project = "00000000-0000-4000-8000-000000000003";
const revision = "2026-10-08T08:00:00.000Z";
const cases = Object.entries(EDILE_DRAFT_MODULES).flatMap(([module, spec]) => Object.entries(spec.models).map(([model, type]) => ({ module, model, type, prefix: spec.prefix })));
let db: DbMinimo; let ctx: ToolCtx;
const args = () => ({ modulo: "climatizzazione", modello: "monosplit", quote_id: quote, revisione_modello: revision,
  revisione_preventivo: revision, impronta_preventivo: "a".repeat(64), impronta_modello: "b".repeat(64) });
const review = () => ({ company_id: company, quote_id: quote, module_id: "climatizzazione", model_id: "monosplit",
  revisione_modello: revision, revisione_preventivo: revision, impronta_preventivo: "a".repeat(64), impronta_modello: "b".repeat(64),
  cliente: "Cliente fittizio", quote_number: "TEST-CLM-1",
  voci_da_mostrare: [{ company_id: company, quote_id: quote, name: "Unità interna", quantity: 1, unit_price: 100, unit_of_measure: "cad", vat_rate: 22 }], totale: 122, pdf_generato: false, dati_tecnici_da_completare: true });
const receipt = () => ({ success: true, company_id: company, quote_id: quote, module_id: "climatizzazione", model_id: "monosplit",
  progetto_id: project, project_revision: revision, reused: false, pdf_generated: false, dati_tecnici_da_completare: true });
const publish = (module: string, model: string) => {
  db.tabelle.company_feature_overrides = [{ company_id: company, feature_key: MODEL_ARCHIVES[module].feature, is_enabled: true, access_level: "enabled", expires_at: null }];
  db.tabelle.modelli_libreria_azienda = [{ company_id: company, chiave: modelArchiveKey(module, company, model),
    contenuto: { version: 1, companyId: company, moduleId: model, savedAt: revision,
      template: { company_id: company, cover_title: model, pdf_blocchi: { modulo_intervento: model } } } }];
};
beforeEach(() => {
  db = new DbMinimo(); ctx = { supabase: db, company_id: company, user_id: "actor", kind: "admin" } as unknown as ToolCtx;
  db.rpcs.silvio_context_actor_roles = () => ["company_admin"];
  db.rpcs.whatsapp_review_edile_quote = review;
  db.rpcs.whatsapp_prepare_edile_quote = receipt;
  publish("climatizzazione", "monosplit");
  vi.stubGlobal("Deno", { env: { get: () => "https://app.example.test" } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No external calls authorized"); }));
});
afterEach(() => vi.unstubAllGlobals());
describe("Exact edile drafts without fake PDF parity", () => {
  it.each(cases)("$module/$model uses the actual app intervention, table and wizard", async ({ module, model, type, prefix }) => {
    expect(isEdileDraftModel(module, model)).toBe(true);
    const key = module as keyof typeof EDILE_DRAFT_MODULES;
    expect(TIPO_INTERVENTO_DEL_MODELLO[key][model]).toBe(type);
    expect(TABELLA_PREVENTIVI[key]).toBe(`${prefix}_progetti`);
    const calc = { climatizzazione: clm, elettrico: ele, termoidraulico: idr, pavimenti: pav, piscine: pis, ristrutturazione: rst }[key];
    const sqlRows = [
      { capitolo_nome: "Forniture", quantita: 2, prezzo_unitario: 10, sconto_pct: 0, costo_materiali: 6, costo_manodopera: 0 },
      { capitolo_nome: "Manodopera", quantita: 4, prezzo_unitario: 25, sconto_pct: 0, costo_materiali: 0, costo_manodopera: 12 },
    ];
    // Same rows as the real SQL fixture: total/costs must agree with each wizard.
    expect(calc.calcTotaliComputo(sqlRows, { sconto_pct: 0, iva_pct: 10 })).toMatchObject({ imponibile: 120, iva: 12, totale: 132, costoTot: 60, margineEur: 60, marginePct: 50 });
    expect(calc.calcTotaliComputo(sqlRows.map(r => ({ ...r, costo_materiali: 0, costo_manodopera: 0 })), { sconto_pct: 0, iva_pct: 10 }))
      .toMatchObject({ costiCompleti: false, margineEur: null, marginePct: null });
    expect(calc.calcTotaliComputo([
      { ...sqlRows[0], quantita: 2.5, prezzo_unitario: 19.995 },
      { ...sqlRows[1], quantita: 1.25, prezzo_unitario: 3.335 },
    ], { sconto_pct: 0, iva_pct: 10 })).toMatchObject({ imponibile: 54.16, iva: 5.42, totale: 59.58 });
    expect(leggiModelloPreventivo(key, { version: 1, companyId: company, modelId: model, capturedAt: revision,
      template: { company_id: company, pdf_blocchi: { modulo_intervento: model } } }, company)).not.toBeNull();
    expect(modelWorkflowCapabilities(module, model)).toMatchObject({ workflow: "edile_reviewed_draft", project_creation_tool: "prepara_preventivo_modello",
      pdf_generation_tool: null, self_send_tool: null, customer_send_available: false });
    const route = edileProjectPath(key, project);
    expect(route).toBe(`/azienda/${module}/${project}/modifica`);
    expect(readFileSync("src/routes/companyRoutes.tsx", "utf8")).toContain(`path="${module}/:id/modifica"`);
    db.rpcs.whatsapp_prepare_edile_quote = () => ({ ...receipt(), module_id: module, model_id: model });
    const result = await preparaPreventivoModello(ctx, { ...args(), modulo: module, modello: model });
    expect(result).toMatchObject({ ok: true, data: { app_path: route, pdf_generated: false, customer_sent: false } });
    expect(result.user_message).toContain("Completa e verifica dati tecnici");
    expect(db.scritture).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it("requires frozen confirmation and a single scoped atomic RPC", async () => {
    expect(preparaPreventivoModelloDef.requires_confirmation).toBe(true);
    expect(await preparaPreventivoModello(ctx, { ...args(), company_id: "foreign", per_utente: "foreign" })).toMatchObject({ ok: true });
    expect(db.rpcChiamate).toEqual([{ nome: "whatsapp_prepare_edile_quote", args: {
      p_company_id: company, p_user_id: "actor", p_quote_id: quote, p_module: "climatizzazione", p_model_id: "monosplit",
      p_model_revision: revision, p_quote_revision: revision, p_quote_fingerprint: "a".repeat(64), p_model_fingerprint: "b".repeat(64),
    } }]);
    expect(confirmationPreview("prepara_preventivo_modello", args())).toContain("non inviare PDF");
  });
  it.each(["impronta_modello", "impronta_preventivo", "revisione_modello", "revisione_preventivo", "quote_id"])("rejects missing %s before any side effect", async field => {
    const input: Record<string, unknown> = args(); delete input[field];
    expect(await preparaPreventivoModello(ctx, input)).toMatchObject({ ok: false, error: "invalid_args" });
    expect(db.rpcChiamate).toHaveLength(0);
  });
  it.each(["constructor", "__proto__", "bagni", "fotovoltaico", "serramenti"])("never invents generic creation for %s", async module => {
    expect(isEdileDraftModel(module, "monosplit")).toBe(false);
    expect(await preparaPreventivoModello(ctx, { ...args(), modulo: module })).toMatchObject({ ok: false });
    expect(db.rpcChiamate).toHaveLength(0);
  });
  it.each(["constructor", "__proto__", "conto-termico", "inventato"])("does not automate unknown/special model %s", async model => {
    expect(await preparaPreventivoModello(ctx, { ...args(), modello: model })).toMatchObject({ ok: false });
    expect(db.rpcChiamate).toHaveLength(0);
  });
  it.each(["operaio", "cliente", "titolare"])("rejects non-office channel %s", async kind => {
    expect(await preparaPreventivoModello({ ...ctx, kind } as ToolCtx, args())).toMatchObject({ ok: false, error: "no_user" });
    expect(db.rpcChiamate).toHaveLength(0);
  });
  it.each([
    { company_id: "foreign" }, { quote_id: project }, { module_id: "piscine" }, { model_id: "multisplit" },
    { progetto_id: "not-uuid" }, { project_revision: "invalid" }, { reused: "true" },
    { pdf_generated: true }, { dati_tecnici_da_completare: false },
  ])("refuses a mismatched or overclaimed receipt %j", async patch => {
    db.rpcs.whatsapp_prepare_edile_quote = () => ({ ...receipt(), ...patch });
    expect(await preparaPreventivoModello(ctx, args())).toMatchObject({ ok: false, error: "progetto_non_confermato" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not retry an uncertain commit or claim PDF generation", async () => {
    db.rpcs.whatsapp_prepare_edile_quote = () => { throw new Error("network after commit"); };
    expect(await preparaPreventivoModello(ctx, args())).toMatchObject({ ok: false, error: "project_outcome_unknown" });
    expect(db.rpcChiamate).toHaveLength(1); expect(fetch).not.toHaveBeenCalled();
  });
  it("inspects DB-confirmed revisions/hashes instead of trusting an earlier template read", async () => {
    db.rpcs.whatsapp_review_edile_quote = () => ({ ...review(), revisione_modello: "2026-10-08T09:00:00.000Z" });
    expect(await verificaModelloPreventivo(ctx, { modulo: "climatizzazione", modello: "monosplit", quote_id: quote }))
      .toMatchObject({ ok: true, data: { revisione_modello: "2026-10-08T09:00:00.000Z", impronta_preventivo: "a".repeat(64), pdf_generato: false,
        capabilities: { workflow: "edile_reviewed_draft", pdf_generation_tool: null } } });
    expect(db.scritture).toHaveLength(0);
  });
  it.each([{ company_id: "foreign" }, { quote_id: project }, { impronta_preventivo: "invalid" }, { voci_da_mostrare: [] },
    { totale: NaN }, { pdf_generato: true }, { dati_tecnici_da_completare: false }])("does not approve an invalid review %j", async patch => {
    db.rpcs.whatsapp_review_edile_quote = () => ({ ...review(), ...patch });
    expect(await verificaModelloPreventivo(ctx, { modulo: "climatizzazione", modello: "monosplit", quote_id: quote }))
      .toMatchObject({ ok: false, error: "computo_non_convertibile" });
    expect(db.scritture).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not read another company's model or disabled feature even before review", async () => {
    db.tabelle.company_feature_overrides[0].is_enabled = false;
    db.tabelle.company_feature_overrides[0].access_level = "disabled";
    expect(await verificaModelloPreventivo(ctx, { modulo: "climatizzazione", modello: "monosplit", quote_id: quote }))
      .toMatchObject({ ok: false, error: "modulo_non_attivo" });
    expect(db.rpcChiamate.some(c => c.nome === "whatsapp_review_edile_quote")).toBe(false);
  });
  it("freezes a human-readable DB preview rather than AI-invented wording/hashes", async () => {
    const frozen = await freezeConfirmation(ctx, "prepara_preventivo_modello", args(), "message-fixture");
    const text = JSON.stringify(frozen.interactive);
    expect(text).toContain("Cliente fittizio"); expect(text).toContain("Unità interna"); expect(text).toContain("122,00");
    expect(text).toContain("Nessun documento inviato"); expect(text).not.toContain("a".repeat(64));
    expect(frozen.pending.parametri).toEqual(args());
    expect(await frozenConfirmationValid(frozen.pending)).toBe(true);
    expect(fetch).not.toHaveBeenCalled(); expect(db.scritture).toHaveLength(0);
  });
  it("rejects confirmation if actual lines/model changed since verification", async () => {
    db.rpcs.whatsapp_review_edile_quote = () => ({ ...review(), impronta_preventivo: "c".repeat(64) });
    await expect(freezeConfirmation(ctx, "prepara_preventivo_modello", args(), "message-fixture")).rejects.toThrow("ripeti la verifica");
    expect(db.scritture).toHaveLength(0);
  });
  it.each([{ company_id: "foreign" }, { quantity: NaN }, { unit_price: Infinity }, { vat_rate: -1 }, { prezzo_acquisto: -1 }])("never presents malformed/foreign review lines as approved: %j", async patch => {
      db.rpcs.whatsapp_review_edile_quote = () => ({ ...review(), voci_da_mostrare: [{ ...review().voci_da_mostrare[0], ...patch }] });
      await expect(freezeConfirmation(ctx, "prepara_preventivo_modello", args(), "message-fixture"))
        .rejects.toMatchObject({ code: "confirmation_review_unavailable" });
      expect(db.rpcChiamate.some(c => c.nome === "whatsapp_prepare_edile_quote")).toBe(false);
    });
  it("never silently truncates a long computo into an incomplete approval", async () => {
    db.rpcs.whatsapp_review_edile_quote = () => ({ ...review(), voci_da_mostrare: Array.from({ length: 200 }, () => review().voci_da_mostrare[0]) });
    await expect(freezeConfirmation(ctx, "prepara_preventivo_modello", args(), "message-fixture")).rejects.toThrow("verifica e salva nell’app");
    expect(db.rpcChiamate.some(c => c.nome === "whatsapp_prepare_edile_quote")).toBe(false);
  });
});

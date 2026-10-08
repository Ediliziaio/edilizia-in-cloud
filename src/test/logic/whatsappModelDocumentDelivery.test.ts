import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { generateBathroomModelPdf } from "../../../supabase/functions/bgn-genera-pdf/generate";
import { BATHROOM_MODELS } from "../../../supabase/functions/_shared/bathroomDocumentState";
import { inviaPdfModelloBagno, inviaPdfModelloBagnoDef } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/invia_pdf_modello_bagno";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";
const company = "00000000-0000-4000-8000-000000000001", project = "00000000-0000-4000-8000-000000000002";
const artifactId = "00000000-0000-4000-8000-000000000003", revision = "2026-10-08T08:00:00Z";
const types: Record<string, string> = { completo: "rifacimento_completo", "vasca-doccia": "vasca_in_doccia", doccia: "rifacimento_parziale",
  sanitari: "sostituzione_sanitari", accessibilita: "abbattimento_barriere", rinnovo: "rifacimento_parziale" };
const bytes = Uint8Array.from(new TextEncoder().encode("%PDF-1.7\n" + "synthetic-pdf".repeat(30)));
const body = () => ({ company_id: company, progetto_id: project, modello: "vasca-doccia", revisione_progetto: revision });
const args = () => ({ artifact_id: artifactId, progetto_id: project, modello: "vasca-doccia", revisione_progetto: revision, documento_verificato: true });
let db: DbMinimo & { storage: { from: ReturnType<typeof vi.fn> } }, ctx: ToolCtx;
let files: Map<string, Uint8Array>, upload: ReturnType<typeof vi.fn>, download: ReturnType<typeof vi.fn>, sign: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto); files = new Map();
  vi.stubGlobal("Deno", { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://db.example.test" : "fake-local-key" } });
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, meta_message_id: "wamid.synthetic" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  upload = vi.fn(async (path: string, content: Uint8Array) => { files.set(path, content); return { error: null }; });
  download = vi.fn(async (path: string) => ({ data: files.has(path) ? new Blob([files.get(path)! as BlobPart]) : null, error: null }));
  sign = vi.fn(async (path: string) => ({ data: { signedUrl: `https://db.example.test/storage/v1/object/sign/quote-pdfs/${path}?token=local` }, error: null }));
  db = Object.assign(new DbMinimo(), { storage: { from: vi.fn(() => ({ upload, download, createSignedUrl: sign })) } });
  db.tabelle.bgn_progetti = [{ id: project, company_id: company, updated_at: revision, tipo_intervento: types["vasca-doccia"],
    totale: 110, totale_imponibile: 100, iva_pct: 10, sconto_pct: 0, detrazione_pct: 0,
    modello_snapshot: { version: 1, modelId: "vasca-doccia", companyId: company, capturedAt: revision,
      template: { company_id: company, cover_title: "Doccia test", pdf_blocchi: { modulo_intervento: "vasca-doccia" } } } }];
  db.tabelle.bgn_computo_voci = [{ id: "line", company_id: company, progetto_id: project, descrizione: "Posa doccia",
    quantita: 1, prezzo_unitario: 100, sconto_pct: 0 }];
  db.tabelle.bgn_progetti_media = []; db.tabelle.companies = [{ id: company, name: "Demo fittizia" }];
  db.tabelle.company_feature_overrides = [{ company_id: company, feature_key: "modulo_bagni_attivo", is_enabled: true, access_level: "enabled", expires_at: null }];
  db.tabelle.whatsapp_messages = [{ id: "inbound", company_id: company, wa_number_id: "number", from_phone: "390000", direction: "inbound" }];
  db.rpcs.silvio_context_actor_roles = () => ["company_admin"];
  db.rpcs.whatsapp_record_bathroom_artifact = a => {
    const artifact = { id: artifactId, company_id: a.p_company, project_id: a.p_project, module: "bagni", model_id: a.p_model,
      project_revision: a.p_revision, fingerprint: a.p_fingerprint, pdf_sha256: a.p_sha256, storage_path: a.p_path,
      byte_length: a.p_bytes, renderer_version: "documento-edile-bgn-v1" };
    db.tabelle.whatsapp_quote_artifacts = [artifact]; return artifact;
  };
  const operations = new Map<string, Record<string, unknown>>();
  db.rpcs.whatsapp_operation_claim = a => {
    const old = operations.get(String(a.p_key));
    if (old) return old.fingerprint === a.p_fingerprint ? { id: old.id, state: old.status, result: old.result } : { state: "conflict" };
    const op = { id: a.p_key, owner: a.p_owner, fingerprint: a.p_fingerprint, status: "running" };
    operations.set(String(a.p_key), op); return { id: op.id, state: "claimed" };
  };
  db.rpcs.whatsapp_operation_finish = a => {
    const old = operations.get(String(a.p_id));
    if (!old || old.owner !== a.p_owner || old.status !== "running") return false;
    Object.assign(old, { status: a.p_status, result: a.p_result }); return true;
  };
  ctx = { supabase: db, company_id: company, user_id: "actor", employee_id: null, phone: "390000", role_grants: ["preventivi.pdf"],
    locale: "it", waNumberId: "number", sessionId: "session", requestId: "inbound", kind: "admin" } as unknown as ToolCtx;
});
afterEach(() => vi.unstubAllGlobals());
const generate = () => generateBathroomModelPdf(db, "actor", body(), async () => bytes);
describe("Stored model document → verified self-send", () => {
  it.each(BATHROOM_MODELS)("completes exact %s generation and acceptance without a classic PDF", async model => {
    Object.assign(db.tabelle.bgn_progetti[0], { tipo_intervento: types[model], modello_snapshot: { version: 1, modelId: model,
      companyId: company, capturedAt: revision, template: { company_id: company, cover_title: model, pdf_blocchi: { modulo_intervento: model } } } });
    const receipt = await generateBathroomModelPdf(db, "actor", { ...body(), modello: model }, async () => bytes);
    expect(receipt).toMatchObject({ artifact_id: artifactId, message_sent: false, reused: false });
    expect(await inviaPdfModelloBagno(ctx, { ...args(), modello: model, to: "client", company_id: "other", link: "https://evil.test" }))
      .toMatchObject({ ok: true, data: { provider_accepted: true, delivered: false, customer_sent: false, model_id: model } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://db.example.test/functions/v1/whatsapp-send");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ company_id: company, wa_number_id: "number", to: "390000", type: "document",
      idempotency_key: `model-pdf:inbound:${artifactId}`, document: { filename: `Preventivo_bagno_${model}.pdf` } });
  });
  it("requires separate confirmation and human document review", async () => {
    expect(inviaPdfModelloBagnoDef.requires_confirmation).toBe(true);
    expect((await inviaPdfModelloBagno(ctx, { ...args(), documento_verificato: false })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled(); expect(db.rpcChiamate).toHaveLength(0);
  });
  it("reuses a stored receipt without rendering or uploading a second PDF", async () => {
    await generate(); const render = vi.fn(async () => bytes);
    expect(await generateBathroomModelPdf(db, "actor", body(), render)).toMatchObject({ reused: true, artifact_id: artifactId });
    expect(render).not.toHaveBeenCalled(); expect(upload).toHaveBeenCalledTimes(1);
  });
  it("replays accepted send despite a changed signed URL, with no second provider call", async () => {
    await generate(); const first = await inviaPdfModelloBagno(ctx, args());
    sign.mockResolvedValue({ data: { signedUrl: "https://db.example.test/changed-token.pdf" }, error: null });
    expect(await inviaPdfModelloBagno(ctx, args())).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("never retries a timed-out send or claims acceptance", async () => {
    await generate(); fetchMock.mockRejectedValueOnce(new Error("timeout after provider submission"));
    expect(await inviaPdfModelloBagno(ctx, args())).toMatchObject({ ok: false, error: "document_send_unknown" });
    expect(await inviaPdfModelloBagno(ctx, args())).toMatchObject({ ok: false, error: "document_send_unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { success: true }, { success: false, meta_message_id: "wamid.fake" }])("rejects unverified provider receipt %j", async receipt => {
    await generate(); fetchMock.mockResolvedValue(new Response(JSON.stringify(receipt), { status: 200 }));
    expect((await inviaPdfModelloBagno(ctx, args())).ok).toBe(false);
  });
  it.each(["company_id", "project_id", "model_id", "project_revision", "fingerprint", "pdf_sha256", "storage_path", "renderer_version", "byte_length"])("blocks a mismatched artifact %s before signing or sending", async field => {
      await generate(); db.tabelle.whatsapp_quote_artifacts[0][field] = "changed"; sign.mockClear();
      expect((await inviaPdfModelloBagno(ctx, args())).ok).toBe(false);
      expect(sign).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
    });
  it.each(["from_phone", "wa_number_id", "company_id", "direction"])("rejects incorrect inbound scope %s", async field => {
    await generate(); db.tabelle.whatsapp_messages[0][field] = "other";
    expect((await inviaPdfModelloBagno(ctx, args())).ok).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("detects a changed line without relying only on project timestamps", async () => {
    await generate(); db.tabelle.bgn_computo_voci[0].prezzo_unitario = 101;
    expect((await inviaPdfModelloBagno(ctx, args())).ok).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects modified bytes, even if the storage path is unchanged", async () => {
    await generate(); const path = String(db.tabelle.whatsapp_quote_artifacts[0].storage_path);
    const changed = bytes.slice(); changed[50] = 99; files.set(path, changed);
    expect((await inviaPdfModelloBagno(ctx, args())).ok).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
    await expect(generate()).rejects.toThrow(/non corrisponde/); expect(upload).toHaveBeenCalledTimes(1);
  });
  it("stops if permissions are revoked while preparing the link", async () => {
    await generate(); sign.mockImplementation(async () => {
      db.rpcs.silvio_context_actor_roles = () => []; return { data: { signedUrl: "https://db.example.test/quote.pdf" }, error: null };
    });
    expect((await inviaPdfModelloBagno(ctx, args())).ok).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("blocks a project change while signing", async () => {
    await generate(); sign.mockImplementation(async () => {
      db.tabelle.companies[0].name = "Changed company"; return { data: { signedUrl: "https://db.example.test/quote.pdf" }, error: null };
    });
    expect((await inviaPdfModelloBagno(ctx, args())).ok).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails closed when receipt storage or document bytes are unavailable", async () => {
    db.rpcs.whatsapp_record_bathroom_artifact = () => null;
    await expect(generate()).rejects.toThrow(/ricevuta non confermata/); expect(sign).not.toHaveBeenCalled();
  });
  it("does not send a signed URL to another origin", async () => {
    await generate(); sign.mockResolvedValue({ data: { signedUrl: "https://evil.test/quote.pdf" }, error: null });
    expect((await inviaPdfModelloBagno(ctx, args())).ok).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
  });
});

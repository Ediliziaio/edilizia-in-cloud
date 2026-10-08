import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { DbMinimo } from "../helpers/edgeFinto";
import { creaPreventivoAi, creaPreventivoAiDef } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/crea_preventivo_ai";
import { salvaPreventivoBozza, salvaPreventivoBozzaDef } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/salva_preventivo_bozza";
import { inviaPdfPreventivo, inviaPdfPreventivoDef } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/invia_pdf_preventivo";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";
let db: DbMinimo; let ctx: ToolCtx; const fetchMock = vi.fn();
const quoteId = "00000000-0000-4000-8000-000000000001";
const request = { descrizione: "Rifacimento bagno 12 mq", cliente_nome: "Cliente fittizio", iva: 10 };
const lines = [{ nome: "Piastrelle", descrizione: "Ceramica verificata", quantita: 12, unita_misura: "mq", unit_price: 20 },
  { nome: "Posa", quantita: 12, unita_misura: "mq", unit_price: 15, item_category: "manodopera" }];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  db = new DbMinimo(); fetchMock.mockReset();
  db.rpcs.silvio_context_actor_roles = () => ["company_admin"];
  db.tabelle.whatsapp_messages = [{ id: "inbound-fixture", company_id: "company", wa_number_id: "number", from_phone: "0000", direction: "inbound" }];
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
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("Deno", { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://backend.example.test" : "fake-local-key" } });
  ctx = { supabase: db, company_id: "company", user_id: "actor", employee_id: null, phone: "0000", waNumberId: "number", sessionId: null,
    requestId: "inbound-fixture", kind: "ufficio", role_grants: ["preventivi.ai", "preventivi.pdf"], locale: "it" } as unknown as ToolCtx;
});
afterEach(() => vi.unstubAllGlobals());
describe("Quote generation → preview → confirmed atomic save", () => {
  it("generates an unsaved preview and preserves exact quantities and separate labor", async () => {
    fetchMock.mockResolvedValue(json({ sezioni: [{ righe: lines }] }));
    const result = await creaPreventivoAi(ctx, request);
    expect(result).toMatchObject({ ok: true, data: { status: "anteprima_non_salvata", created: false, needs_clarification: false,
      items: [expect.objectContaining({ quantity: 12, unit_price: 20, item_type: "material", vat_rate: 10 }),
        expect.objectContaining({ quantity: 12, unit_price: 15, item_type: "labor" })] } });
    expect(db.scritture).toHaveLength(0); expect(db.rpcChiamate).toHaveLength(0);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it.each([undefined, null, -1, Infinity])("asks for verified VAT %j before any paid generation", async iva => {
    expect((await creaPreventivoAi(ctx, { ...request, iva: iva as number })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled(); expect(db.scritture).toHaveLength(0);
  });
  it("does not replace missing quantity or price with 1 or 0", async () => {
    fetchMock.mockResolvedValue(json({ sezioni: [{ righe: [{ nome: "Voce incompleta" }] }] }));
    const result = await creaPreventivoAi(ctx, request);
    expect(result).toMatchObject({ ok: true, data: { created: false, needs_clarification: true } });
    if (result.ok) expect((result.data as { items: unknown[] }).items).toEqual([expect.objectContaining({ quantity: undefined, unit_price: undefined })]);
    expect(db.scritture).toHaveLength(0);
  });
  it.each(["A", "x".repeat(201), 123])("rejects invalid client names before generation: %j", async cliente_nome => {
    expect((await creaPreventivoAi(ctx, { ...request, cliente_nome: cliente_nome as string })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { success: false, sezioni: [{ righe: lines }] },
    { error: "failed", sezioni: [{ righe: lines }] },
    { sezioni: [{ righe: lines }, {}] },
  ])("rejects incomplete or contradictory generation receipts", async body => {
    fetchMock.mockResolvedValue(json(body));
    expect((await creaPreventivoAi(ctx, request)).ok).toBe(false);
    expect(db.scritture).toHaveLength(0);
  });
  it("marks zero-priced AI rows for human verification, not automatically free", async () => {
    fetchMock.mockResolvedValue(json({ sezioni: [{ righe: [{ ...lines[0], unit_price: 0 }] }] }));
    expect(await creaPreventivoAi(ctx, request)).toMatchObject({ ok: true, data: { created: false, needs_clarification: true } });
  });
  it("does not retry generation after a timeout", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect((await creaPreventivoAi(ctx, request)).ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(db.scritture).toHaveLength(0);
  });
  it("requires confirmation and saves the exact approved lines through one transaction", async () => {
    db.rpcs.silvio_create_quote_draft = () => ({ success: true, quote_id: quoteId, quote_number: "BOZZA-TEST", status: "bozza", items_count: 2, subtotal_eur: 420, vat_eur: 42, total_eur: 462 });
    const items = [{ name: "Piastrelle", quantity: 12, unit_price: 20, vat_rate: 10, item_type: "material" },
      { name: "Posa", quantity: 12, unit_price: 15, vat_rate: 10, item_type: "labor" }];
    expect(creaPreventivoAiDef.requires_confirmation).toBe(true);
    expect(salvaPreventivoBozzaDef.requires_confirmation).toBe(true);
    const result = await salvaPreventivoBozza(ctx, { client_name: request.cliente_nome, items });
    expect(result).toMatchObject({ ok: true, data: { quote_id: quoteId, total_eur: 462 } });
    expect(db.rpcChiamate).toEqual([{ nome: "silvio_create_quote_draft", args: expect.objectContaining({ p_company_id: "company", p_user_id: "actor", p_items: items }) }]);
    expect(fetchMock).not.toHaveBeenCalled(); expect(db.scritture).toHaveLength(0);
  });
  it("cannot certify an empty save receipt", async () => {
    expect((await salvaPreventivoBozza(ctx, { client_name: "Cliente", items: [{ name: "Voce", quantity: 1, unit_price: 12, vat_rate: 0 }] })).ok).toBe(false);
    expect(db.rpcChiamate).toHaveLength(1);
  });
});
describe("PDF send uses a verified quote and provider receipt", () => {
  const path = "company/BOZZA-TEST.pdf";
  const pdfReceipt = () => ({ pdf_path: path, signed_url: `https://backend.example.test/storage/v1/object/sign/quote-pdfs/${path}?token=fixture` });
  const setupQuote = () => { db.tabelle.quotes = [{ id: quoteId, company_id: "company", quote_number: "BOZZA-TEST", client_name: "Cliente", deleted_at: null, pdf_storage_path: path }]; };
  it("only says accepted after a real receipt and uses a stable operation key", async () => {
    setupQuote(); fetchMock.mockResolvedValueOnce(json(pdfReceipt()))
      .mockResolvedValueOnce(json({ success: true, meta_message_id: "wamid.fixture" }));
    expect(inviaPdfPreventivoDef.requires_confirmation).toBe(true);
    const result = await inviaPdfPreventivo(ctx, { quote_id: quoteId });
    expect(result).toMatchObject({ ok: true, data: { inviato: true, meta_message_id: "wamid.fixture" } });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ idempotency_key: `pdf:inbound-fixture:${quoteId}`, to: "0000", wa_number_id: "number" });
    expect(result.user_message).toContain("accettato");
  });
  it("does not claim sent on HTTP 200 without a receipt", async () => {
    setupQuote(); fetchMock.mockResolvedValueOnce(json(pdfReceipt()))
      .mockResolvedValueOnce(json({ success: true }));
    expect(await inviaPdfPreventivo(ctx, { quote_id: quoteId })).toMatchObject({ ok: false, error: "invio_non_confermato" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not read or send another company's document", async () => {
    setupQuote(); db.tabelle.quotes[0].company_id = "other-company";
    expect((await inviaPdfPreventivo(ctx, { quote_id: quoteId })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not silently replace a requested model with a generic PDF", async () => {
    setupQuote();
    expect(await inviaPdfPreventivo(ctx, { quote_id: quoteId, modello_richiesto: "bagni:vasca-doccia" }))
      .toMatchObject({ ok: false, error: "modello_da_verificare" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("blocks a module document without its saved PDF", async () => {
    setupQuote(); db.tabelle.quotes[0].source = `modulo:bagni:${quoteId}`; db.tabelle.quotes[0].pdf_storage_path = null;
    expect(await inviaPdfPreventivo(ctx, { quote_id: quoteId })).toMatchObject({ ok: false, error: "pdf_modulo_mancante" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("also blocks a module with a stored link but no verified model receipt", async () => {
    setupQuote(); db.tabelle.quotes[0].source = `modulo:bagni:${quoteId}`;
    expect(await inviaPdfPreventivo(ctx, { quote_id: quoteId })).toMatchObject({ ok: false, error: "pdf_modulo_da_verificare" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["company_id", "wa_number_id", "from_phone", "direction"])("rejects a mismatched inbound %s before generation", async field => {
    setupQuote(); db.tabelle.whatsapp_messages[0][field] = "wrong";
    expect(await inviaPdfPreventivo(ctx, { quote_id: quoteId })).toMatchObject({ ok: false, error: "destinazione_non_verificata" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects revoked actor access before generation", async () => {
    setupQuote(); db.rpcs.silvio_context_actor_roles = () => [];
    expect((await inviaPdfPreventivo(ctx, { quote_id: quoteId })).ok).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    "https://evil.test/storage/v1/object/sign/quote-pdfs/company/BOZZA-TEST.pdf?token=x",
    "https://backend.example.test/functions/v1/anything?token=x",
    "https://backend.example.test/storage/v1/object/sign/quote-pdfs/other/BOZZA-TEST.pdf?token=x",
    "https://backend.example.test/storage/v1/object/sign/quote-pdfs/company/BOZZA-TEST.pdf",
    "http://backend.example.test/storage/v1/object/sign/quote-pdfs/company/BOZZA-TEST.pdf?token=x",
  ])("does not send an untrusted PDF link %s", async signed_url => {
    setupQuote(); fetchMock.mockResolvedValueOnce(json({ ...pdfReceipt(), signed_url }));
    expect((await inviaPdfPreventivo(ctx, { quote_id: quoteId })).ok).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rechecks the quote link after generation", async () => {
    setupQuote(); fetchMock.mockImplementationOnce(async () => {
      db.tabelle.quotes[0].pdf_storage_path = "changed"; return json(pdfReceipt());
    });
    expect(await inviaPdfPreventivo(ctx, { quote_id: quoteId })).toMatchObject({ ok: false, error: "pdf_non_verificato" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("replays acceptance without regenerating or sending twice", async () => {
    setupQuote(); fetchMock.mockResolvedValueOnce(json(pdfReceipt())).mockResolvedValueOnce(json({ success: true, meta_message_id: "wamid.fixture" }));
    const first = await inviaPdfPreventivo(ctx, { quote_id: quoteId });
    expect(await inviaPdfPreventivo(ctx, { quote_id: quoteId })).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not retry a timed-out submission", async () => {
    setupQuote(); fetchMock.mockResolvedValueOnce(json(pdfReceipt())).mockRejectedValueOnce(new Error("submission timeout"));
    const first = await inviaPdfPreventivo(ctx, { quote_id: quoteId });
    expect(first).toMatchObject({ ok: false, error: "invio_esito_sconosciuto" });
    expect(await inviaPdfPreventivo(ctx, { quote_id: quoteId })).toEqual(first); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

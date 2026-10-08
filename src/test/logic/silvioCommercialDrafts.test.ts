import { beforeEach, describe, expect, it, vi } from "vitest";
import { SILVIO_TOOLS, type ToolContext } from "../../../supabase/functions/_shared/silvioTools";
import { buildProposalSummary } from "../../../supabase/functions/_shared/silvioToolExecution";

const rpc = vi.fn();
const ctx = { supabase: { rpc }, companyId: "company", userId: "actor" } as unknown as ToolContext;
const line = { name: "Materiale verificato", quantity: 2, unit_price: 12, vat_rate: 22 };
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: { success: true, quote_id: "test", items_count: 1, status: "bozza", subtotal_eur: 24, vat_eur: 5.28, total_eur: 29.28 }, error: null }); });

describe("structured commercial drafts", () => {
  it("routes the Italian legacy alias through the same atomic writer with no guessed prices", async () => {
    await SILVIO_TOOLS.crea_preventivo_bozza.executor({ cliente_nome: "Cliente", iva: 0,
      righe: [{ descrizione: "Lavoro", quantita: 2.25, prezzo_unitario: 12, unita: "h", tipo: "labor" }] }, ctx);
    expect(SILVIO_TOOLS.crea_preventivo_bozza.riskLevel).toBe("yellow");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("silvio_create_quote_draft", expect.objectContaining({ p_default_vat_rate: 0,
      p_items: [expect.objectContaining({ quantity: 2.25, unit_price: 12, item_type: "labor", unit_of_measure: "h" })] }));
  });
  it.each([{}, { quantita: 1 }, { quantita: 1, prezzo_unitario: null }, { quantita: 0, prezzo_unitario: 12 }])("legacy incomplete line %j does not create a header or guessed free item", async fields => {
    const result = await SILVIO_TOOLS.crea_preventivo_bozza.executor({ cliente_nome: "Cliente", iva: 22, righe: [{ descrizione: "Piastrella", ...fields }] }, ctx);
    expect(result).toHaveProperty("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, {}, { success: true, quote_id: "test", status: "bozza", items_count: 0 },
    { success: true, quote_id: "test", status: "bozza", items_count: 1 }])("does not certify an incomplete save receipt %j", async data => {
    rpc.mockResolvedValue({ data, error: null });
    expect(await SILVIO_TOOLS.create_quote_draft.executor({ client_name: "Cliente", items: [line] }, ctx)).toMatchObject({ verification_required: true });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([{ client_name: " " }, { validity_days: 0 }, { validity_days: 1.5 }, { items: [{ ...line, item_type: "unknown" }] }])("validates header and line categories before writes %j", async patch => {
    expect(await SILVIO_TOOLS.create_quote_draft.executor({ client_name: "Cliente", items: [line], ...patch }, ctx)).toHaveProperty("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sends the complete lines to the atomic RPC with verified actor and company", async () => {
    await SILVIO_TOOLS.create_quote_draft.executor({ client_name: "Cliente", items: [line] }, ctx);
    expect(rpc).toHaveBeenCalledWith("silvio_create_quote_draft", expect.objectContaining({
      p_company_id: "company", p_user_id: "actor", p_items: [line], p_default_vat_rate: null,
    }));
  });
  it.each([null, [], [{}], [{ ...line, quantity: -1 }], [{ ...line, quantity: Infinity }],
    [{ ...line, unit_price: -1 }], [{ ...line, unit_price: NaN }], [{ ...line, vat_rate: null }],
    [{ ...line, vat_rate: 101 }], [null]])("rejects incomplete or invalid lines before writes: %j", async items => {
    expect(await SILVIO_TOOLS.create_quote_draft.executor({ client_name: "Test", items }, ctx)).toHaveProperty("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("accepts explicit zero VAT without replacing it with 22", async () => {
    await SILVIO_TOOLS.create_quote_draft.executor({ client_name: "Test", items: [{ ...line, vat_rate: null }], default_vat_rate: 0 }, ctx);
    expect(rpc).toHaveBeenCalledWith("silvio_create_quote_draft", expect.objectContaining({ p_default_vat_rate: 0 }));
  });
  it("does not hide an atomic RPC failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "migration missing" } });
    expect(await SILVIO_TOOLS.create_quote_draft.executor({ client_name: "Test", items: [line] }, ctx)).toEqual({ error: "migration missing" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("confirmation identifies client, title and number of lines", () => {
    const summary = buildProposalSummary("create_quote_draft", SILVIO_TOOLS.create_quote_draft,
      { client_name: "Cliente test", title: "Bagno", items: [line, line] });
    expect(summary).toContain("Cliente test"); expect(summary).toContain("Bagno"); expect(summary).toContain("2 righe");
  });
  it("invoice action cannot silently insert an installment instead of an invoice", async () => {
    expect(await SILVIO_TOOLS.create_invoice_draft.executor({ order_id: "test", rata_type: "saldo" }, ctx)).toMatchObject({ ok: false, error: expect.stringContaining("Nessuna fattura creata") });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("residual installments do not advertise unavailable fiscal draft creation", async () => {
    rpc.mockResolvedValue({ data: { count: 1, fatture_restanti: [{ order_id: "test", amount_eur: 100, can_create_invoice_draft: true }] }, error: null });
    const result = await SILVIO_TOOLS.lista_fatture_restanti.executor({}, ctx);
    expect(result.fatture_restanti[0]).toMatchObject({ amount_eur: 100, can_create_invoice_draft: false });
    expect(result.nota_operativa).toContain("non uno stato verificato delle fatture");
  });
  it("does not invent an empty residual balance when the RPC is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await SILVIO_TOOLS.lista_fatture_restanti.executor({}, ctx)).toHaveProperty("error");
  });
});

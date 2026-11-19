import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ai: vi.fn(), payment: vi.fn(), rpc: vi.fn(), calls: [] as Array<{ table: string; op: string; column?: string; value?: unknown }>,
  email: { id: "email", company_id: "azienda", from_email: "cliente@example.test", from_name: "Cliente", subject: "Richiesta", raw_text: "Bagno", attachments: [] },
  saveError: null as null | { message: string },
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "utente" } } }) },
  rpc: state.rpc,
  from: (table: string) => {
    let op = "select";
    const result = () => table === "email_inbox" ? { data: state.email, error: null }
      : table === "email_opportunita_bozza" && op === "insert" ? { data: { id: "bozza" }, error: state.saveError }
      : { data: null, error: null };
    const q = {
      select: () => q, delete: () => { op = "delete"; state.calls.push({ table, op }); return q; },
      insert: () => { op = "insert"; return q; },
      eq: (column: string, value: unknown) => { state.calls.push({ table, op, column, value }); return q; },
      in: () => q, ilike: () => q, limit: () => q,
      maybeSingle: async () => result(), single: async () => result(),
      then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    };
    return q;
  },
}) }));
vi.mock("../../../supabase/functions/_shared/withMetricsRapida.ts", () => ({ serveConMetricheRapida: vi.fn() }));
vi.mock("../../../supabase/functions/_shared/headers.ts", () => ({ getCorsHeaders: () => ({}) }));
vi.mock("../../../supabase/functions/_shared/requirePaymentMethod.ts", () => ({
  checkPaymentMethod: state.payment, PAYMENT_METHOD_REQUIRED_MESSAGE: "Carta richiesta",
}));
vi.mock("../../../supabase/functions/_shared/ai-provider/openrouterAddebitato.ts", () => ({
  callOpenRouterAddebitato: state.ai,
  CreditoAiInsufficiente: class extends Error { constructor(public messaggio: string) { super(messaggio); } },
}));
vi.stubGlobal("Deno", { env: { get: (name: string) => name === "PROACTIVE_CRON_SECRET" ? "cron-test" : "test" } });
const { estraiOpportunita } = await import("../../../supabase/functions/email-ai-opportunita/index.ts");
const { CreditoAiInsufficiente } = await import("../../../supabase/functions/_shared/ai-provider/openrouterAddebitato.ts");
function request(cron = true) {
  return new Request("https://example.test", { method: "POST", headers: { "Content-Type": "application/json", ...(cron ? { "x-cron-secret": "cron-test" } : { Authorization: "Bearer test-user" }) }, body: JSON.stringify({ email_id: "email" }) });
}
beforeEach(() => {
  state.calls = []; state.saveError = null;
  state.rpc.mockReset().mockResolvedValue({ error: null });
  state.payment.mockReset().mockResolvedValue({ allowed: true });
  state.ai.mockReset().mockResolvedValue({ content: '{"tipo_lavoro":"Bagno"}', model: "test" });
});
describe("Estrazione opportunità e tentativi", () => {
  it("con credito esaurito registra il rinvio e mantiene il 402", async () => {
    state.ai.mockRejectedValue(new CreditoAiInsufficiente("Crediti finiti"));
    const response = await estraiOpportunita(request());
    expect(response.status).toBe(402);
    expect(state.rpc).toHaveBeenCalledWith("email_opportunita_segna_tentativo", { p_email_id: "email", p_esito: "credito", p_errore: "Crediti finiti" });
    expect(state.calls.some(c => c.table === "email_opportunita_bozza" && c.op === "insert")).toBe(false);
  });
  it("non chiama l'AI se manca il pagamento; lo stesso blocco vale dalla UI", async () => {
    state.payment.mockResolvedValue({ allowed: false, message: "Abbonamento scaduto" });
    expect((await estraiOpportunita(request(false))).status).toBe(402);
    expect(state.ai).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledWith("email_opportunita_segna_tentativo", expect.objectContaining({ p_esito: "credito" }));
  });
  it("un guasto provider resta un 502 e riceve un'attesa progressiva", async () => {
    state.ai.mockRejectedValue(new Error("Provider non disponibile"));
    expect((await estraiOpportunita(request())).status).toBe(502);
    expect(state.rpc).toHaveBeenCalledWith("email_opportunita_segna_tentativo", expect.objectContaining({ p_esito: "errore" }));
  });
  it("dopo il successo cancella il rinvio, senza creare una commessa", async () => {
    expect((await estraiOpportunita(request())).status).toBe(200);
    expect(state.ai).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ company_id: "azienda", idempotency_key: "email_opportunita_email" }));
    expect(state.calls).toContainEqual({ table: "email_opportunita_tentativi", op: "delete", column: "email_id", value: "email" });
    expect(state.calls.some(c => c.table === "orders")).toBe(false);
  });
  it("un salvataggio fallito non viene dichiarato completato", async () => {
    state.saveError = { message: "Scrittura fallita" };
    expect((await estraiOpportunita(request())).status).toBe(500);
    expect(state.rpc).toHaveBeenCalledWith("email_opportunita_segna_tentativo", expect.objectContaining({ p_esito: "errore" }));
  });
  it("non nasconde il guasto se il rinvio non viene salvato", async () => {
    state.payment.mockResolvedValue({ allowed: false }); state.rpc.mockResolvedValue({ error: { message: "DB" } });
    expect((await estraiOpportunita(request())).status).toBe(500);
  });
});

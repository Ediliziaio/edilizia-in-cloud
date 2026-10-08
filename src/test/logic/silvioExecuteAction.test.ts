import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";

const runtime = vi.hoisted(() => ({
  db: null as unknown as DbMinimo,
  handler: null as null | ((request: Request) => Promise<Response>),
  auth: vi.fn(), execute: vi.fn(), sendEmail: vi.fn(),
}));
vi.mock("https://deno.land/x/xhr@0.1.0/mod.ts", () => ({}));
vi.mock("https://deno.land/std@0.190.0/http/server.ts", () => ({ serve: (handler: typeof runtime.handler) => { runtime.handler = handler; } }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.43.4", () => ({ createClient: () => runtime.db }));
vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({ requireAuth: (...args: unknown[]) => runtime.auth(...args) }));
vi.mock("../../../supabase/functions/_shared/headers.ts", () => ({
  getCorsHeaders: () => ({}),
  errorResponse: (error: string, status: number) => Response.json({ error }, { status }),
  jsonResponse: (data: unknown, status: number) => Response.json(data, { status }),
}));
vi.mock("../../../supabase/functions/_shared/silvioTools.ts", () => ({ SILVIO_TOOLS: {
  test_registered_action: { allowedRoles: ["company_admin"], riskLevel: "yellow" },
  create_quote_draft: { allowedRoles: ["company_admin", "company_staff"], riskLevel: "yellow" },
} }));
vi.mock("../../../supabase/functions/_shared/silvioToolExecution.ts", () => ({ executeToolWithRouting: (...args: unknown[]) => runtime.execute(...args) }));
vi.mock("../../../supabase/functions/_shared/sendEmailUnified.ts", () => ({ sendEmailUnified: (...args: unknown[]) => runtime.sendEmail(...args) }));

const policy = (overrides: Record<string, unknown> = {}) => ({
  mode: "auto_execute", risk_level: "yellow", allowed_roles: ["super_admin", "company_admin", "company_staff"],
  requires_company_admin: false, requires_strong_confirmation: false, daily_limit_reached: false,
  daily_executions: 0, max_daily_executions: 20, ...overrides,
});
const proposal = (overrides: Record<string, unknown> = {}) => ({
  id: "proposal", company_id: "company-a", user_id: "actor", status: "pending", action_type: "create_quote_draft",
  payload: { title: "Test locale", client_name: "Cliente fittizio" }, summary: "Bozza fittizia", ...overrides,
});
beforeEach(async () => {
  vi.clearAllMocks();
  const env: Record<string, string> = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "local-service", INTERNAL_AUTO_EXECUTE_SECRET: "local-auto" };
  vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] } });
  runtime.db = new DbMinimo();
  runtime.db.tabelle.ai_action_proposals = [proposal()];
  runtime.db.rpcs.get_ai_action_permission = () => policy();
  runtime.db.rpcs.silvio_context_actor_roles = () => ["company_admin"];
  runtime.auth.mockImplementation(async (req: Request) => {
    if (req.headers.get("Authorization") !== "Bearer local-user") throw Response.json({ error: "Unauthorized" }, { status: 401 });
    return { userId: "actor", supabaseAdmin: runtime.db };
  });
  runtime.execute.mockResolvedValue({ success: true, data: { ok: true } });
  runtime.sendEmail.mockResolvedValue({ ok: true });
  if (!runtime.handler) await import("../../../supabase/functions/silvio-execute-action/index.ts");
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function run(auto = true, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const response = await runtime.handler!(new Request("http://local/action", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auto ? "Bearer local-service" : "Bearer local-user",
      ...(auto ? { "x-internal-auto-execute": "local-auto" } : {}), ...headers },
    body: JSON.stringify({ proposal_id: "proposal", ...body }),
  }));
  return { status: response.status, body: await response.json() };
}
function actorResult(data: unknown, error: unknown = null) {
  const rpc = runtime.db.rpc.bind(runtime.db);
  runtime.db.rpc = ((name: string, args: Record<string, unknown>) => name === "silvio_context_actor_roles"
    ? Promise.resolve({ data, error }) : rpc(name, args)) as typeof runtime.db.rpc;
}
function failOutcomeSave(error: { message: string } | null | "throw") {
  const from = runtime.db.from.bind(runtime.db);
  runtime.db.from = ((table: string) => {
    const query = from(table);
    if (table === "ai_action_proposals") {
      const update = query.update.bind(query);
      query.update = (data: unknown) => {
        if (data && typeof data === "object" && "applied_at" in data) Object.assign(query, {
          then: (resolve: (value: unknown) => unknown, reject: (error: Error) => unknown) => error === "throw"
            ? Promise.reject(new Error("connection lost")).then(resolve, reject)
            : Promise.resolve({ data: null, error }).then(resolve),
        });
        return update(data);
      };
    }
    return query;
  }) as typeof runtime.db.from;
}

describe("real action handler: automatic execution uses current business actor", () => {
  it.each([true, false])("denies a blocked/revoked actor before any write (auto=%s)", async auto => {
    actorResult(null, { message: "Actor unavailable", code: "42501" });
    expect((await run(auto)).status).toBe(403);
    expect(runtime.db.scritture).toHaveLength(0);
  });
  it.each([{ roles: [] }, { roles: null }, { roles: ["company_staff"] }, { roles: [123] }, { roles: "company_admin" }])("denies missing, malformed or insufficient current roles: $roles", async ({ roles }) => {
    runtime.db.rpcs.get_ai_action_permission = () => policy({ allowed_roles: ["company_admin"] });
    actorResult(roles);
    expect((await run()).status).toBe(403);
    expect(runtime.db.scritture).toHaveLength(0);
  });
  it("does not let a global company admin act as admin in a company where they are staff", async () => {
    runtime.db.tabelle.ai_action_proposals = [proposal({ action_type: "generic_email", payload: { to: "test@example.test", subject: "test", body: "test" } })];
    actorResult(["company_staff"]);
    expect((await run()).status).toBe(403);
    expect(runtime.sendEmail).not.toHaveBeenCalled();
  });
  it("an empty action allowlist also denies a platform admin", async () => {
    actorResult(["super_admin"]);
    runtime.db.rpcs.get_ai_action_permission = () => policy({ allowed_roles: [] });
    expect((await run()).status).toBe(403);
    expect(runtime.db.scritture).toHaveLength(0);
  });
  it("does not escalate to a role excluded by the action allowlist", async () => {
    actorResult(["company_admin", "company_staff"]);
    runtime.db.rpcs.get_ai_action_permission = () => policy({ allowed_roles: ["company_staff"] });
    expect((await run()).status).toBe(403); // No staff permission grant; admin role is not allowed here.
    expect(runtime.db.scritture).toHaveLength(0);
  });
  it("service transport never turns a confirmation-only policy into auto-execute", async () => {
    runtime.db.rpcs.get_ai_action_permission = () => policy({ mode: "require_confirmation" });
    expect((await run()).status).toBe(403);
    expect(runtime.db.scritture).toHaveLength(0);
  });
  it("a spoofed internal header still requires a valid user session", async () => {
    expect((await run(true, {}, { Authorization: "Bearer attacker" })).status).toBe(401);
    expect(runtime.db.scritture).toHaveLength(0);
  });
  it("checks roles with the proposal owner and exact company, then creates the draft", async () => {
    expect((await run()).body.ok).toBe(true);
    expect(runtime.db.rpcChiamate).toContainEqual({ nome: "silvio_context_actor_roles", args: { p_company_id: "company-a", p_user_id: "actor" } });
    expect(runtime.db.tabelle.quotes).toHaveLength(1);
    expect(runtime.db.tabelle.quotes[0]).toMatchObject({ created_by: "actor", company_id: "company-a" });
    expect(runtime.auth).not.toHaveBeenCalled();
  });
  it("passes the actual role to registry tools, not an invented system role", async () => {
    runtime.db.tabelle.ai_action_proposals = [proposal({ action_type: "test_registered_action" })];
    expect((await run()).body.ok).toBe(true);
    expect(runtime.execute).toHaveBeenCalledWith("test_registered_action", expect.anything(), expect.objectContaining({ primaryRole: "company_admin", userId: "actor" }), "proposal");
  });
  it("the strong-confirmation mode itself requires explicit confirmation", async () => {
    runtime.db.rpcs.get_ai_action_permission = () => policy({ mode: "require_strong_confirmation" });
    expect((await run(false)).status).toBe(400);
    expect(runtime.db.scritture).toHaveLength(0);
    expect((await run(false, { confirmation_text: "CONFERMO create_quote_draft" })).body.ok).toBe(true);
  });
  it("rejects invalid expiry dates", async () => {
    runtime.db.tabelle.ai_action_proposals[0].expires_at = "invalid";
    expect((await run()).status).toBe(400);
    expect(runtime.db.tabelle.quotes).toBeUndefined();
  });
  it("competing calls claim the proposal once and never create duplicate drafts", async () => {
    const results = await Promise.all([run(), run()]);
    expect(results.filter(result => result.body.ok === true)).toHaveLength(1);
    expect(runtime.db.tabelle.quotes).toHaveLength(1);
  });
  it("an expiry read cannot overwrite a concurrently applied action", async () => {
    runtime.db.tabelle.ai_action_proposals[0].expires_at = "2000-01-01";
    const from = runtime.db.from.bind(runtime.db);
    runtime.db.from = ((table: string) => {
      const query = from(table);
      if (table === "ai_action_proposals") {
        const update = query.update.bind(query);
        query.update = (value: unknown) => {
          if ((value as { status?: string })?.status === "expired") runtime.db.tabelle.ai_action_proposals[0].status = "applied";
          return update(value);
        };
      }
      return query;
    }) as typeof runtime.db.from;
    expect((await run()).status).toBe(400);
    expect(runtime.db.tabelle.ai_action_proposals[0].status).toBe("applied");
  });
});

describe("legacy granular permissions and truthful outcomes", () => {
  it.each([null, { sola_lettura: true }, { sola_lettura: false, can_view_preventivi: true, can_edit_preventivi: false }])("denies missing/read-only/revoked granular permissions: %j", async permissions => {
    actorResult(["company_staff"]);
    runtime.db.tabelle.staff_permissions = permissions ? [{ company_id: "company-a", user_id: "actor", ...permissions }] : [];
    expect((await run()).status).toBe(403);
    expect(runtime.db.scritture).toHaveLength(0);
  });
  it("allows explicitly authorized staff, but does not bypass row restrictions", async () => {
    actorResult(["company_staff"]);
    runtime.db.tabelle.staff_permissions = [{ company_id: "company-a", user_id: "actor", sola_lettura: false,
      can_view_preventivi: true, can_edit_preventivi: true, only_assigned: true, only_my_warehouse: false }];
    expect((await run()).status).toBe(403);
    runtime.db.tabelle.staff_permissions[0].only_assigned = false;
    expect((await run()).body.ok).toBe(true);
  });
  it.each([{ message: "database unavailable" }, null, "throw" as const])("does not report success or release the claim when outcome saving fails: %j", async error => {
    failOutcomeSave(error);
    const result = await run();
    expect(result.body).toMatchObject({ ok: false, needs_review: true, retryable: false, execution_succeeded: true });
    expect(runtime.db.tabelle.ai_action_proposals[0].status).toBe("confirmed");
    expect(runtime.db.tabelle.quotes).toHaveLength(1);
    expect((await run()).body.ok).not.toBe(true);
    expect(runtime.db.tabelle.quotes).toHaveLength(1);
    expect(runtime.db.tabelle.internal_chat_messages).toBeUndefined();
  });
  it("does not turn an audit failure into a failed business action", async () => {
    runtime.db.rpcs.silvio_decision_log_decide_by_action = () => { throw new Error("audit offline"); };
    const { body } = await run();
    expect(body.ok).toBe(true);
    expect(body.warnings).toContain("Registro decisioni non aggiornato");
    expect(body.message).toContain("Non ripetere l’operazione");
    expect(runtime.db.tabelle.ai_action_proposals[0].status).toBe("applied");
  });
  it("never claims an invoice exists when only an instruction was produced", async () => {
    runtime.db.tabelle.ai_action_proposals = [proposal({ action_type: "create_invoice_draft" })];
    expect((await run()).body).toMatchObject({ ok: false, message: expect.stringContaining("Nessuna fattura creata") });
    expect(runtime.db.tabelle.ai_action_proposals[0].status).toBe("failed");
    expect(runtime.db.tabelle.invoices).toBeUndefined();
  });
});

describe("action notifications remain in the right tenant and private DM", () => {
  function setupChannel() {
    runtime.db.rpcs.ensure_user_silvio_channel = () => "channel";
    runtime.db.tabelle.internal_chat_channels = [{ id: "channel", company_id: "company-a", name: "silvio-ai", is_dm: true,
      dm_user_ids: ["actor", "00000000-0000-0000-0000-000000000002"] }];
    runtime.db.tabelle.internal_chat_members = [{ channel_id: "channel", company_id: "company-a", user_id: "actor" }];
  }
  it("delivers the result to a verified personal channel", async () => {
    setupChannel();
    const { body } = await run();
    expect(body).toMatchObject({ ok: true, warnings: [] });
    expect(runtime.db.tabelle.internal_chat_messages).toHaveLength(1);
    expect(runtime.db.tabelle.internal_chat_messages[0]).toMatchObject({ company_id: "company-a", channel_id: "channel" });
  });
  it.each(["other_company", "other_user", "no_membership", "group_chat"])("never leaks an action result through %s", async fault => {
    setupChannel();
    if (fault === "other_company") runtime.db.tabelle.internal_chat_channels[0].company_id = "company-b";
    if (fault === "other_user") runtime.db.tabelle.internal_chat_channels[0].dm_user_ids = ["other", "00000000-0000-0000-0000-000000000002"];
    if (fault === "no_membership") runtime.db.tabelle.internal_chat_members = [];
    if (fault === "group_chat") runtime.db.tabelle.internal_chat_channels[0].is_dm = false;
    const { body } = await run();
    expect(body).toMatchObject({ ok: true, warnings: ["Notifica chat non consegnata"] });
    expect(runtime.db.tabelle.internal_chat_messages).toBeUndefined();
    expect(runtime.db.tabelle.ai_action_proposals[0].status).toBe("applied");
  });
});

describe("plain-language action outcomes", () => {
  it.each([true, false])("preserves quote items from registry and historical payloads (wrapped=%s)", async wrapped => {
    const input = { client_name: "Cliente test", items: [{ name: "Posa", quantity: 2, unit_price: 100, vat_rate: 22 }] };
    runtime.db.tabelle.ai_action_proposals = [proposal({ payload: wrapped ? { tool_name: "create_quote_draft", input } : input })];
    runtime.execute.mockResolvedValue({ success: true, data: { success: true, quote_id: "new", message: "Bozza completa" } });
    expect((await run()).body.ok).toBe(true);
    expect(runtime.execute).toHaveBeenCalledWith("create_quote_draft", input, expect.objectContaining({ companyId: "company-a", userId: "actor" }), "proposal");
    expect(runtime.db.tabelle.quotes).toBeUndefined(); // No parallel header-only draft.
  });
  it("does not replace an atomic draft failure with a misleading empty draft", async () => {
    runtime.db.tabelle.ai_action_proposals = [proposal({ payload: { client_name: "Test", items: [] } })];
    runtime.execute.mockResolvedValue({ success: false, error: { message: "RPC not deployed" } });
    expect((await run()).body).toMatchObject({ ok: false, message: expect.stringContaining("RPC not deployed") });
    expect(runtime.db.tabelle.quotes).toBeUndefined();
  });
  it("malformed structured proposals never silently fall back to a header-only draft", async () => {
    runtime.db.tabelle.ai_action_proposals = [proposal({ payload: { tool_name: "create_quote_draft", input: { client_name: "Test" } } })];
    runtime.execute.mockResolvedValue({ success: false, error: { message: "Voci mancanti" } });
    expect((await run()).body.ok).toBe(false);
    expect(runtime.execute).toHaveBeenCalled();
    expect(runtime.db.tabelle.quotes).toBeUndefined();
  });
  it.each(["__tool_meta", "company_id", "user_id", "tool_name", "channel"])("rejects editor override of execution identity %s", async key => {
    expect((await run(false, { override_payload: { [key]: "other" } })).status).toBe(400);
    expect(runtime.db.scritture).toHaveLength(0);
  });
  it("shows the actual executor outcome and its in-app destination", async () => {
    runtime.db.tabelle.ai_action_proposals = [proposal({ action_type: "test_registered_action" })];
    runtime.execute.mockResolvedValue({ success: true, data: { nota: "Appuntamento creato.", link: "/azienda/attivita" } });
    const { body } = await run();
    expect(body.ok).toBe(true);
    expect(body.message).toContain("Appuntamento creato.");
    expect(body.message).toContain("[Apri il risultato](/azienda/attivita)");
    expect(body.message).not.toContain('Tool "');
  });
  it.each(["https://other.example", "//other.example", "/azienda/a)malicious", "/azienda/a\nextra"])("does not promote unsafe destination %s to an action link", async link => {
    runtime.db.tabelle.ai_action_proposals = [proposal({ action_type: "test_registered_action" })];
    runtime.execute.mockResolvedValue({ success: true, data: { nota: "Operazione completata.", link } });
    expect((await run()).body.message).not.toContain("[Apri il risultato]");
  });
  it("does not show a success link when execution fails", async () => {
    runtime.db.tabelle.ai_action_proposals = [proposal({ action_type: "test_registered_action" })];
    runtime.execute.mockResolvedValue({ success: true, data: { ok: false, message: "Non creato", link: "/azienda/attivita" } });
    const { body } = await run();
    expect(body.ok).toBe(false);
    expect(body.message).not.toContain("[Apri il risultato]");
  });
});

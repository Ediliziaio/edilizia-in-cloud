import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { duplicateAgentConfiguration } from "@/lib/aiAgents";
import { voiceConversationStatus } from "../../../supabase/functions/_shared/voiceConversation";
import { outboundVoiceRequest } from "../../../supabase/functions/_shared/outboundVoice";
import { CAMPAIGN_ACTIONS, CampaignError, campaignPreparation } from "../../../supabase/functions/_shared/campaignPreparation";
import { normalizeVoicePhone, voiceContactExclusion } from "../../../supabase/functions/_shared/contactVoice";
import { CHAT_HISTORY_ACTIONS, agentChatHistory } from "../../../supabase/functions/_shared/agentChatHistory";
import { settleVoiceConversation } from "../../../supabase/functions/_shared/voiceSettlement";

type Query = { table: string; steps: unknown[][] };
function database(resolve: (q: Query) => any = () => ({ data: null, error: null })) {
  const calls: Query[] = [];
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ error: null }));
  const download = vi.fn(async () => ({ data: null as Blob | null, error: new Error("file missing") }));
  return { calls, rpc, storage: { from: () => ({ download, remove: vi.fn(async () => ({ error: null as null })) }) }, download,
    auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null as null }) },
    from(table: string) {
      const q: Query = { table, steps: [] };
      const chain: any = new Proxy({}, { get(_, key) {
        if (key === "then") return (ok: any, bad: any) => {
          calls.push(q); return Promise.resolve(resolve(q)).then(ok, bad);
        };
        return (...args: unknown[]) => { q.steps.push([String(key), ...args]); return chain; };
      } });
      return chain;
    },
  };
}
const company = "11111111-2222-4333-8444-555555555555";
const response = (body: unknown = {}, status = 200) => new Response(JSON.stringify(body), { status });
function runtime(path: string, db: ReturnType<typeof database>, overrides: Record<string, unknown> = {}) {
  const ast = ts.createSourceFile(path, fs.readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  // Execute the actual handler and its helpers, replacing only imports and external services.
  const source = ast.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(ast)).join("\n");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let handler: (req: Request) => Promise<Response> = null!;
  const fetch = vi.fn(async (_url: string, _options?: RequestInit) => response());
  vm.runInNewContext(js, { exports: {}, Request, Response, URL, FormData, Blob, AbortSignal, TextEncoder, Error, crypto: webcrypto,
    console: { error() {}, warn() {}, log() {} }, Deno: { env: { get: () => "test" }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => db, TTS_MODEL_VOCE: "eleven_flash_v2_5", getCorsHeaders: () => ({}),
    getPlatformSetting: async () => "test-key", checkRateLimit: async () => ({ allowed: true }),
    agentCompanyAccess: async () => ({ companyId: company, isSuperAdmin: false }),
    CHAT_HISTORY_ACTIONS, agentChatHistory, settleVoiceConversation, CAMPAIGN_ACTIONS, CampaignError, campaignPreparation, campaignPermission: vi.fn(async () => undefined), normalizeVoicePhone, voiceContactExclusion, segnalaErroreAI: vi.fn(), fetch, ...overrides,
  });
  return { fetch, run: (body: unknown, token = "test") => handler(new Request("https://local.test", {
    method: "POST", headers: { Authorization: "Bearer " + token }, body: JSON.stringify(body),
  })) };
}
const proxyPath = "supabase/functions/elevenlabs-proxy/index.ts";
const kbPath = "supabase/functions/kb-sync/index.ts";

describe("post-call atomic settlement", () => {
  it("requires the atomic transaction rather than a manual balance fallback", async () => {
    const db = database();
    db.rpc.mockResolvedValue({ data: { balance_before: 10, balance_after: 9, already_billed: false }, error: null } as any);
    expect(await settleVoiceConversation(db, company, "conversation", { billed_per_min: 1 }, "completata")).toMatchObject({ balance_after: 9 });
    expect(db.rpc).toHaveBeenCalledWith("settle_voice_conversation", expect.objectContaining({ p_company_id: company, p_conversation_id: "conversation", p_state: "completata" }));
    expect(db.calls).toHaveLength(0);
  });
  it("does not report successful billing when the transaction fails", async () => {
    const db = database();
    db.rpc.mockResolvedValue({ error: { message: "temporary failure" } } as any);
    await expect(settleVoiceConversation(db, company, "conversation", {}, "completata")).rejects.toThrow("ritentato");
    expect(db.calls).toHaveLength(0);
  });
  it("accepts an idempotent replay but rejects malformed balances", async () => {
    const db = database();
    db.rpc.mockResolvedValue({ data: { balance_before: 10, balance_after: 9, already_billed: true }, error: null } as any);
    expect((await settleVoiceConversation(db, company, "conversation", {}, "completata")).already_billed).toBe(true);
    db.rpc.mockResolvedValue({ data: { balance_after: "9" }, error: null } as any);
    await expect(settleVoiceConversation(db, company, "conversation", {}, "completata")).rejects.toThrow();
  });
});

describe("outbound handler rejects false starts", () => {
  function outbound() {
    const db = database(q => ({ data: q.table === "ai_agents_v2"
      ? { id: "agent", nome: "Agent", stato: "attivo", elevenlabs_agent_id: "remote" }
      : q.table === "ai_phone_numbers_v2" ? { elevenlabs_phone_id: "phone", provider: "telnyx" } : null, error: null }));
    const app = runtime("supabase/functions/initiate-outbound-call/index.ts", db, {
      outboundVoiceRequest, saldoVoce: async () => ({ spendibile: 10, bloccato: false }),
      SOGLIA_MINIMA_CHIAMATA_EUR: 0.1,
    });
    return { db, app, body: { company_id: company, agent_id: "agent", phone_number: "+390000000001", skip_subscription_check: true } };
  }
  it("a provider refusal cannot create a call placeholder or success", async () => {
    const { db, app, body } = outbound();
    app.fetch.mockResolvedValue(response({ success: false }));
    expect((await app.run(body)).status).toBe(502);
    expect(db.calls.some(q => q.table === "ai_agent_conversations")).toBe(false);
  });
  it("a confirmed SIP call preserves the provider and company", async () => {
    const { db, app, body } = outbound();
    app.fetch.mockResolvedValue(response({ success: true, conversation_id: "call" }));
    expect((await app.run(body)).status).toBe(200);
    expect(app.fetch).toHaveBeenCalledWith(expect.stringContaining("/sip-trunk/outbound-call"), expect.anything());
    const write = db.calls.find(q => q.table === "ai_agent_conversations");
    expect(write?.steps).toContainEqual(["insert", expect.objectContaining({ company_id: company, metadata: expect.objectContaining({ provider: "telnyx" }) })]);
  });
  it("invalid phone input is rejected before any provider call", async () => {
    const { app, body } = outbound();
    expect((await app.run({ ...body, phone_number: "missing" })).status).toBe(400);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("accepts formatted international phone numbers without guessing a country", async () => {
    const { app, body } = outbound();
    app.fetch.mockResolvedValue(response({ success: true, conversation_id: "call" }));
    expect((await app.run({ ...body, phone_number: "0039 (333) 1234567" })).status).toBe(200);
    expect(JSON.parse(app.fetch.mock.calls[0][1]?.body as string).to_number).toBe("+393331234567");
  });
  it("does not retry after an ambiguous timeout that might already have started a call", async () => {
    const { app, body } = outbound();
    app.fetch.mockRejectedValue(new Error("Timeout"));
    const result = await app.run(body);
    expect(result.status).toBe(502);
    expect(await result.json()).toMatchObject({ outcome_unknown: true });
    expect(app.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([{ opt_out: true }, { deleted_at: "2026-10-11" }, { ricontatta_dopo: "2099-01-01" }])("rejects unavailable CRM contacts: %j", async flags => {
    const db = database(q => ({ data: q.table === "ai_agents_v2" ? { id: "agent", stato: "attivo", elevenlabs_agent_id: "remote" }
      : q.table === "marketing_contacts" ? { id: "contact", phone: "+393331234567", ...flags } : null, error: null }));
    const app = runtime("supabase/functions/initiate-outbound-call/index.ts", db);
    expect((await app.run({ company_id: company, agent_id: "agent", contact_id: "contact" })).status).toBe(403);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("checks the requested company for an authenticated user before proceeding", async () => {
    const db = database();
    const access = vi.fn(async () => { throw new Response("Denied", { status: 403 }); });
    const app = runtime("supabase/functions/initiate-outbound-call/index.ts", db, { agentCompanyAccess: access });
    expect((await app.run({ company_id: company, agent_id: "foreign", phone_number: "+390000000001" }, "user-token")).status).toBe(403);
    expect(access).toHaveBeenCalledWith(db, "user", company, {});
    expect(app.fetch).not.toHaveBeenCalled(); expect(db.calls).toHaveLength(0);
  });
  it("does not call a paused agent even when it has a provider binding", async () => {
    const db = database(() => ({ data: { id: "agent", stato: "pausa", elevenlabs_agent_id: "remote" }, error: null }));
    const app = runtime("supabase/functions/initiate-outbound-call/index.ts", db);
    expect((await app.run({ company_id: company, agent_id: "agent", phone_number: "+390000000001" })).status).toBe(400);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it.each(["draft", "archived"])("also rejects an inactive legacy agent (%s)", async status => {
    const db = database(q => ({ data: q.table === "ai_agents" ? { id: "legacy", status, elevenlabs_agent_id: "remote" } : null, error: null }));
    const app = runtime("supabase/functions/initiate-outbound-call/index.ts", db);
    expect((await app.run({ company_id: company, agent_id: "legacy", phone_number: "+393331234567" })).status).toBe(400);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("legacy lookup errors are not misrepresented as an agent missing", async () => {
    const db = database(q => ({ data: null, error: q.table === "ai_agents" ? { message: "database down" } : null }));
    const app = runtime("supabase/functions/initiate-outbound-call/index.ts", db);
    expect((await app.run({ company_id: company, agent_id: "legacy", phone_number: "+393331234567" })).status).toBe(500);
  });
});
function accessRuntime() {
  const auth = ts.createSourceFile("auth.ts", fs.readFileSync("supabase/functions/_shared/auth.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const functions = auth.statements.filter(n => ts.isFunctionDeclaration(n) && ["aziendaAccessibile", "requireCompanyAccess"].includes(n.name?.text ?? "")).map(n => n.getText(auth)).join("\n");
  const scoped = fs.readFileSync("supabase/functions/_shared/agentCompanyAccess.ts", "utf8").replace(/^import .*;$/gm, "");
  const code = ts.transpileModule(functions + "\n" + scoped, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  const requireRole = vi.fn(async () => "super_admin");
  vm.runInNewContext(code, { exports, Response, Date, PLATFORM_ADMIN_COMPANY_ID: "00000000-0000-0000-0000-000000000001", requireRole });
  return { run: exports.agentCompanyAccess, requireRole };
}
function ownedDatabase() {
  return database(q => {
    if (q.table === "ai_agents_v2") return { data: { id: "local", tools_config: { elevenlabs_tool_ids: ["old"] } }, error: null };
    return { data: null, error: null };
  });
}
describe("AI agent configuration copies", () => {
  it("copies all configuration deeply without sharing provider bindings or counters", () => {
    const original = { id: "old", company_id: company, nome: "Reception", tipo: "vocale", stato: "attivo",
      elevenlabs_agent_id: "remote", tools_config: { system_tools: { end_conversation: true }, elevenlabs_tool_ids: ["old"] },
      business_hours: { monday: ["09:30", "17:00"] }, temperatura: 0.2, registra_chiamate: true, conversazioni_totali: 99 };
    const copy = duplicateAgentConfiguration(original);
    expect(copy).toMatchObject({ nome: "Reception (copia)", stato: "bozza", temperatura: 0.2, registra_chiamate: true });
    expect(copy).not.toHaveProperty("company_id"); expect(copy).not.toHaveProperty("elevenlabs_agent_id");
    expect(copy).not.toHaveProperty("conversazioni_totali"); expect(copy.tools_config).not.toHaveProperty("elevenlabs_tool_ids");
    (copy.tools_config as any).system_tools.end_conversation = false;
    expect(original.tools_config.system_tools.end_conversation).toBe(true);
  });
});
describe("selected tenant is not an authorization grant", () => {
  function membership(profile: string | null = company, role = "company_admin", access?: { expires_at: string | null }) {
    return database(q => ({ data: q.table === "profiles" ? { company_id: profile }
      : q.table === "user_roles" ? [{ role }] : q.table === "multi_company_access" ? access ?? null : null, error: null }));
  }
  it("defaults company users to their own company", async () => {
    expect(await accessRuntime().run(membership(), "user", undefined, {})).toMatchObject({ companyId: company, isSuperAdmin: false });
  });
  it("rejects a requested foreign company", async () => {
    await expect(accessRuntime().run(membership(), "user", "22222222-2222-4222-8222-222222222222", {})).rejects.toMatchObject({ status: 403 });
  });
  it.each([null, "2999-01-01"])("accepts an active secondary membership, expiry %s", async expires_at => {
    expect(await accessRuntime().run(membership(null, "company_admin", { expires_at }), "user", company, {})).toMatchObject({ companyId: company });
  });
  it("rejects expired secondary access", async () => {
    await expect(accessRuntime().run(membership(null, "company_admin", { expires_at: "2000-01-01" }), "user", company, {})).rejects.toMatchObject({ status: 403 });
  });
  it("defaults superadmins to the platform company and verifies the role allowlist", async () => {
    const access = accessRuntime();
    expect(await access.run(membership(null, "super_admin"), "user", undefined, {})).toMatchObject({ companyId: "00000000-0000-0000-0000-000000000001", isSuperAdmin: true });
    expect(access.requireRole).toHaveBeenCalled();
  });
  it("fails closed when roles cannot be read", async () => {
    await expect(accessRuntime().run(database(() => ({ data: null, error: new Error("down") })), "user", company, {})).rejects.toMatchObject({ status: 403 });
  });
  it("a still-valid token cannot bypass an account block", async () => {
    const db = database(q => ({ data: q.table === "profiles" ? { company_id: company, is_blocked: true } : [{ role: "company_admin" }], error: null }));
    await expect(accessRuntime().run(db, "user", company, {})).rejects.toMatchObject({ status: 403 });
  });
});
describe("ElevenLabs proxy actual runtime without real calls", () => {
  it("campaign preparation uses the selected tenant and does not need a provider key", async () => {
    const preparation = vi.fn(async () => ({ campaigns: [] }));
    const app = runtime(proxyPath, database(), { campaignPreparation: preparation, getPlatformSetting: async (): Promise<string | null> => null });
    expect((await app.run({ action: "list_campaigns", company_id: company })).status).toBe(200);
    expect(preparation).toHaveBeenCalledWith(expect.anything(), company, "list_campaigns", undefined);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("campaign preparation cannot bypass company authorization", async () => {
    const preparation = vi.fn();
    const app = runtime(proxyPath, database(), { campaignPreparation: preparation, agentCompanyAccess: async () => { throw new Response("Denied", { status: 403 }); } });
    expect((await app.run({ action: "prepare_campaign", company_id: company })).status).toBe(403);
    expect(preparation).not.toHaveBeenCalled(); expect(app.fetch).not.toHaveBeenCalled();
  });
  it("malformed campaign input is rejected before touching the campaign service", async () => {
    const preparation = vi.fn();
    const app = runtime(proxyPath, database(), { campaignPreparation: preparation });
    expect((await app.run({ action: "create_campaign", payload: null })).status).toBe(400);
    expect(preparation).not.toHaveBeenCalled();
  });
  it.each([{ data: true, error: null }, { data: null, error: new Error("down") }])("campaign mutations cannot bypass read-only permission: %j", async result => {
    const preparation = vi.fn(); const db = database(); db.rpc.mockResolvedValue(result as any);
    const app = runtime(proxyPath, db, { campaignPreparation: preparation });
    expect((await app.run({ action: "prepare_campaign", company_id: company })).status).toBe(403);
    expect(preparation).not.toHaveBeenCalled();
  });
  it("denies a foreign agent before any provider request", async () => {
    const app = runtime(proxyPath, database());
    expect((await app.run({ action: "sync_kb", agent_id: "foreign" })).status).toBe(403);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("preserves provider failures instead of pretending to list an empty knowledge base", async () => {
    const app = runtime(proxyPath, ownedDatabase());
    app.fetch.mockResolvedValue(response({ error: "down" }, 503));
    expect((await app.run({ action: "sync_kb", agent_id: "owned" })).status).toBe(500);
  });
  it("does not save local configuration or delete old tools after failed provider PATCH", async () => {
    const db = ownedDatabase(); const app = runtime(proxyPath, db);
    app.fetch.mockResolvedValue(response({}, 503));
    expect((await app.run({ action: "update_agent", agent_id: "owned", payload: { name: "changed" } })).status).toBe(500);
    expect(db.calls.some(q => q.steps.some(s => s[0] === "update"))).toBe(false);
    expect(app.fetch.mock.calls.some(c => (c[1] as RequestInit)?.method === "DELETE")).toBe(false);
  });
  it("forwards model and temperature and explicitly clears disabled tools", async () => {
    const app = runtime(proxyPath, ownedDatabase());
    const res = await app.run({ action: "update_agent", agent_id: "owned",
      payload: { llm_model: "gemini-2.5-flash", temperature: 0.25, tools_config: { system_tools: {}, edilizia_tools: {} } } });
    expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ elevenlabs_tool_ids: [] });
    const patch = app.fetch.mock.calls.find(c => (c[1] as RequestInit)?.method === "PATCH")!;
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toMatchObject({
      conversation_config: { agent: { prompt: { llm: "gemini-2.5-flash", temperature: 0.25, tool_ids: [], built_in_tools: { end_call: null, transfer_to_number: null } } } },
    });
    expect(app.fetch.mock.calls.at(-1)?.[0]).toContain("/convai/tools/old");
  });
  it.each([-1, 2, "0.5", null])("rejects invalid temperature %s before calling the provider", async temperature => {
    const app = runtime(proxyPath, ownedDatabase());
    expect((await app.run({ action: "update_agent", agent_id: "owned", payload: { temperature } })).status).toBe(500);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("requires a real provider ID on creation", async () => {
    const app = runtime(proxyPath, database(() => ({ data: { id: "draft", tipo: "vocale", stato: "bozza" }, error: null })));
    expect((await app.run({ action: "create_agent", payload: { local_agent_id: "draft" } })).status).toBe(500);
  });
  it("puts enabled system tools in the documented prompt field", async () => {
    const app = runtime(proxyPath, ownedDatabase());
    expect((await app.run({ action: "update_agent", agent_id: "owned", payload: {
      tools_config: { system_tools: { end_conversation: true, detect_language: true } },
    } })).status).toBe(200);
    const patch = app.fetch.mock.calls.find(c => c[1]?.method === "PATCH")!;
    const agent = JSON.parse(patch[1]?.body as string).conversation_config.agent;
    expect(agent).not.toHaveProperty("tools");
    expect(agent.prompt.built_in_tools).toMatchObject({ end_call: {} });
  });
  it("will not silently save a transfer switch with no destination", async () => {
    const app = runtime(proxyPath, ownedDatabase());
    expect((await app.run({ action: "update_agent", agent_id: "owned", payload: {
      tools_config: { system_tools: { transfer_number: true } },
    } })).status).toBe(500);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("can reconnect a paused draft using the actual database state", async () => {
    const db = database(() => ({ data: { id: "draft", tipo: "vocale", stato: "pausa" }, error: null }));
    const app = runtime(proxyPath, db); app.fetch.mockImplementation(async () => response({ agent_id: "new" }));
    expect((await app.run({ action: "create_agent", payload: { local_agent_id: "draft" } })).status).toBe(200);
  });
  it("applies stored duration, recording and voicemail settings to the provider", async () => {
    const db = database(() => ({ data: { id: "draft", tipo: "vocale", stato: "bozza", durata_max_secondi: 120,
      registra_chiamate: false, rileva_segreteria: true }, error: null }));
    const app = runtime(proxyPath, db); app.fetch.mockImplementation(async () => response({ agent_id: "new" }));
    expect((await app.run({ action: "create_agent", payload: { local_agent_id: "draft" } })).status).toBe(200);
    const create = JSON.parse(app.fetch.mock.calls[0][1]?.body as string);
    expect(create).toMatchObject({ conversation_config: { conversation: { max_duration_seconds: 120 } },
      platform_settings: { privacy: { record_voice: false } } });
    const patch = app.fetch.mock.calls.find(c => c[1]?.method === "PATCH")!;
    expect(JSON.parse(patch[1]?.body as string).conversation_config.agent.prompt.built_in_tools.voicemail_detection).toEqual({});
  });
  it("does not provision a remote agent before a local owned draft exists", async () => {
    const app = runtime(proxyPath, database());
    expect((await app.run({ action: "create_agent", payload: { local_agent_id: "foreign" } })).status).toBe(403);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("binds a provisioned agent to the owned draft before returning success", async () => {
    const db = database(() => ({ data: { id: "draft", tipo: "vocale", stato: "bozza", nome: "saved", temperatura: 0.3 }, error: null }));
    const app = runtime(proxyPath, db); app.fetch.mockImplementation(async () => response({ agent_id: "remote" }));
    const res = await app.run({ action: "create_agent", payload: { local_agent_id: "draft", name: "untrusted" } });
    expect(res.status, await res.clone().text()).toBe(200); expect(await res.json()).toMatchObject({ agent_id: "draft", elevenlabs_agent_id: "remote" });
    expect(JSON.parse(app.fetch.mock.calls[0][1]?.body as string).name).toBe("saved");
    const binding = db.calls.find(q => q.steps.some(s => s[0] === "update"))!;
    expect(binding.steps).toContainEqual(["eq", "company_id", company]);
    expect(binding.steps).toContainEqual(["is", "elevenlabs_agent_id", null]);
  });
  it("a repeated connect returns the existing ID without provisioning a duplicate", async () => {
    const db = database(() => ({ data: { id: "draft", elevenlabs_agent_id: "already" }, error: null }));
    const app = runtime(proxyPath, db);
    expect((await app.run({ action: "create_agent", payload: { local_agent_id: "draft" } })).status).toBe(200);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("cleans up the new provider agent when the guarded local binding fails", async () => {
    const db = database(q => q.steps.some(s => s[0] === "update") ? { data: null, error: new Error("binding denied") }
      : { data: q.table === "ai_agents_v2" ? { id: "draft", tipo: "vocale", stato: "bozza" } : null, error: null });
    const app = runtime(proxyPath, db); app.fetch.mockImplementation(async () => response({ agent_id: "new" }));
    expect((await app.run({ action: "create_agent", payload: { local_agent_id: "draft" } })).status).toBe(500);
    expect(app.fetch.mock.calls).toContainEqual([expect.stringContaining("/agents/new"), expect.objectContaining({ method: "DELETE" })]);
  });
  it("does not delete the old live tool when creation of its replacement fails", async () => {
    const app = runtime(proxyPath, ownedDatabase());
    app.fetch.mockResolvedValue(response({}, 503));
    expect((await app.run({ action: "update_agent", agent_id: "owned", payload: {
      tools_config: { edilizia_tools: { info_cliente: { enabled: true, webhook_url: "https://local.test/tool" } } },
    } })).status).toBe(500);
    expect(app.fetch.mock.calls.some(c => c[0].includes("/tools/old"))).toBe(false);
  });
  it("never assigns a foreign local phone number", async () => {
    const app = runtime(proxyPath, database());
    expect((await app.run({ action: "assign_phone_agent", agent_id: null, payload: { local_phone_id: "foreign" } })).status).toBe(403);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("a provider assignment failure leaves the local assignment untouched", async () => {
    const db = database(q => ({ data: q.table === "ai_phone_numbers_v2" ? { id: "number", elevenlabs_phone_id: "phone" }
      : q.table === "ai_agents_v2" ? { id: "local" } : null, error: null }));
    const app = runtime(proxyPath, db); app.fetch.mockResolvedValue(response({}, 503));
    expect((await app.run({ action: "assign_phone_agent", agent_id: "owned", payload: { local_phone_id: "number" } })).status).toBe(500);
    expect(db.calls.some(q => q.steps.some(s => s[0] === "update"))).toBe(false);
  });
  it("explicitly unassigns the provider agent and the company's local number", async () => {
    const db = database(() => ({ data: { id: "number", elevenlabs_phone_id: "phone" }, error: null }));
    const app = runtime(proxyPath, db);
    expect((await app.run({ action: "assign_phone_agent", agent_id: null, payload: { local_phone_id: "number" } })).status).toBe(200);
    expect(JSON.parse(app.fetch.mock.calls[0][1]?.body as string)).toEqual({ agent_id: null });
    expect(db.calls.at(-1)?.steps).toContainEqual(["eq", "company_id", company]);
  });
  it("relinking an already imported number does not create another provider number", async () => {
    const db = database(q => ({ data: q.table === "ai_agents_v2" ? { id: "local" }
      : q.table === "ai_phone_numbers_v2" ? { id: "number", elevenlabs_phone_id: "phone" } : null, error: null }));
    const app = runtime(proxyPath, db);
    const res = await app.run({ action: "link_phone_number", agent_id: "owned", payload: { phone_number: "+390000000000" } });
    expect(await res.json()).toMatchObject({ inbound_assigned: true, elevenlabs_phone_number_id: "phone" });
    expect(app.fetch.mock.calls.filter(c => c[1]?.method === "POST")).toHaveLength(0);
  });
  it("makes a partial phone assignment visible instead of claiming incoming calls work", async () => {
    const db = database(q => ({ data: q.table === "ai_agents_v2" ? { id: "local" }
      : q.table === "ai_phone_numbers_v2" ? { id: "number", elevenlabs_phone_id: "phone" } : null, error: null }));
    const app = runtime(proxyPath, db); app.fetch.mockResolvedValue(response({}, 503));
    const res = await app.run({ action: "link_phone_number", agent_id: "owned", payload: { phone_number: "+390000000000" } });
    expect(await res.json()).toMatchObject({ inbound_assigned: false });
  });
  it("even in the superadmin, number lists are limited to the selected company", async () => {
    const db = database(() => ({ data: [{ numero: "+390000000001", elevenlabs_phone_id: "own" }], error: null }));
    const app = runtime(proxyPath, db, { agentCompanyAccess: async () => ({ companyId: company, isSuperAdmin: true }) });
    app.fetch.mockResolvedValue(response({ phone_numbers: [{ phone_number_id: "own" }, { phone_number_id: "foreign" }] }));
    expect(await (await app.run({ action: "get_phone_numbers" })).json()).toMatchObject({ phone_numbers: [{ phone_number_id: "own" }] });
  });
  it.each([404, 503])("only treats DELETE 404 as already deleted (status %s)", async status => {
    const app = runtime(proxyPath, ownedDatabase());
    app.fetch.mockImplementation(async () => response({}, status));
    const res = await app.run({ action: "delete_agent", agent_id: "owned" });
    expect(res.status).toBe(status === 404 ? 200 : 500);
  });
});
describe("voice protocol and database vocabulary", () => {
  it.each([["completed", "completata"], ["failed", "fallita"], ["no_answer", "no_risposta"], ["busy", "occupato"]])("maps %s to %s", (provider, expected) => {
    expect(voiceConversationStatus(provider)).toBe(expected);
  });
  it("rejects unknown status instead of manufacturing a completed call", () => {
    expect(() => voiceConversationStatus("unknown")).toThrow();
  });
  it.each([["telnyx", "sip-trunk"], ["twilio", "twilio"], ["exotel", "exotel"]])("selects the documented outbound endpoint for %s", (provider, route) => {
    const req = outboundVoiceRequest(provider, "agent", "phone", "+390000000000", { nome_cliente: "Demo" });
    expect(req.url).toContain(`/convai/${route}/outbound-call`);
    expect(req.payload).toMatchObject({ conversation_initiation_client_data: { dynamic_variables: { nome_cliente: "Demo" } } });
    expect(req.payload).not.toHaveProperty("conversation_config");
  });
});
describe("knowledge base tenant isolation and truthful synchronization", () => {
  it("can remove an unsynced owned draft without a provider key", async () => {
    const db = database(() => ({ data: { id: "doc", tipo: "text", elevenlabs_doc_id: null }, error: null }));
    const settings = vi.fn(async () => "");
    const app = runtime(kbPath, db, { getPlatformSetting: settings });
    expect((await app.run({ action: "delete_document", doc_id: "doc" })).status).toBe(200);
    expect(settings).not.toHaveBeenCalled(); expect(app.fetch).not.toHaveBeenCalled();
  });
  it("cannot sync, delete or attach another company's document", async () => {
    for (const action of ["sync_document", "delete_document", "attach_to_agent"]) {
      const db = database(); const app = runtime(kbPath, db);
      expect((await app.run({ action, doc_id: "foreign", agent_id: "foreign", company_id: company })).status).toBe(403);
      expect(db.calls[0].steps).toContainEqual(["eq", "company_id", company]);
      expect(db.rpc).not.toHaveBeenCalled(); expect(app.fetch).not.toHaveBeenCalled();
    }
  });
  it("cannot attach an owned document to another company's agent", async () => {
    const db = database(q => ({ data: q.table === "ai_knowledge_base_v2" ? { elevenlabs_doc_id: "doc", tipo: "text" } : null, error: null }));
    const app = runtime(kbPath, db);
    expect((await app.run({ action: "attach_to_agent", doc_id: "owned", agent_id: "foreign" })).status).toBe(403);
    expect(db.calls.find(q => q.table === "ai_agents_v2")?.steps).toContainEqual(["eq", "company_id", company]);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("a missing upload is never marked synced", async () => {
    const db = database(() => ({ data: { tipo: "file", titolo: "missing.pdf" }, error: null }));
    const app = runtime(kbPath, db);
    expect((await app.run({ action: "sync_document", doc_id: "owned" })).status).toBe(500);
    expect(db.rpc.mock.calls.map(c => (c[1] as any).p_status)).toEqual(["syncing", "error"]);
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it("uploads text through the documented endpoint and requires the returned ID", async () => {
    const db = database(() => ({ data: { tipo: "text", titolo: "Guide", contenuto: "text" }, error: null }));
    const app = runtime(kbPath, db);
    app.fetch.mockResolvedValue(response({ id: "doc" }));
    expect((await app.run({ action: "sync_document", doc_id: "owned" })).status).toBe(200);
    expect(app.fetch.mock.calls[0][0]).toContain("/knowledge-base/text");
    expect(db.rpc).toHaveBeenCalledWith("update_kb_sync_status", expect.objectContaining({ p_status: "synced", p_el_doc_id: "doc" }));
  });
  it("does not claim synchronization when the provider returns no ID", async () => {
    const db = database(() => ({ data: { tipo: "text", titolo: "Guide", contenuto: "text" }, error: null }));
    const app = runtime(kbPath, db);
    expect((await app.run({ action: "sync_document", doc_id: "owned" })).status).toBe(500);
    expect(db.rpc.mock.calls.some(c => (c[1] as any).p_status === "synced")).toBe(false);
  });
});

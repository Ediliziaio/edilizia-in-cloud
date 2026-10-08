import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { TextEncoder, TextDecoder } from "node:util";
import { createRequire } from "node:module";
import { argumentError, canonicalJson, domainError, validOAuthClaims, validRpcMessage } from "../../../supabase/functions/platform-mcp/protocol";
import { assistenteDelClient, statoCollegamentoAi } from "@/lib/aiConnector";

const COMPANY = "10000000-0000-4000-8000-000000000001";
const ACTOR = "20000000-0000-4000-8000-000000000002";
const ENTITY = "30000000-0000-4000-8000-000000000003";
const REQUEST = "40000000-0000-4000-8000-000000000004";
const source = ["protocol.ts", "lib.ts", "silvioTools.ts", "index.ts"].map(file =>
  readFileSync(resolve("supabase/functions/platform-mcp", file), "utf8")
    .replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "")
    .replace(/\bexport\s+/g, "")
).join("\n");
const ts = createRequire(import.meta.url)("typescript");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function server(options: { authorized?: boolean; scopes?: string[]; rpcFailure?: boolean; recipient?: string; documentEmail?: string; completeFailure?: boolean; reserveFailure?: boolean } = {}) {
  const calls: { name: string; args: Record<string, any> }[] = [];
  const queries: { table: string; filters: Record<string, unknown> }[] = [];
  const logs: any[] = [];
  const receipts = new Map<string, any>();
  const rows: Record<string, any[]> = {
    api_keys: [{ id: ENTITY, company_id: COMPANY, name: "Claude", scopes: options.scopes ?? ["*"],
      is_active: true, created_by: ACTOR, expires_at: null }],
    companies: [{ id: COMPANY, name: "Demo fittizia" }],
    quotes: [{ id: ENTITY, company_id: COMPANY, ai_close_probability_pct: 60, client_email: options.documentEmail ?? "cliente@example.test", status: "sent" }],
    employees: [], orders: [],
    silvio_outbound_messages: [{ id: ENTITY, company_id: COMPANY, status: "queued", canale: "email" }],
  };
  const admin = {
    auth: { getUser: async (): Promise<{ data: { user: { id: string } }; error: null }> => ({ data: { user: { id: ACTOR } }, error: null }) },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      queries.push({ table, filters });
      let inserted: any = null;
      const query: any = {
        eq(k: string, v: unknown) { filters[k] = v; return query; },
        is() { return query; }, ilike() { return query; }, gte() { return query; }, lt() { return query; },
        in() { return query; }, order() { return query; }, limit() { return query; },
        select() { return query; }, update() { return query; },
        insert(v: any) { inserted = v; if (table === "api_usage_log") logs.push(v); return query; },
        async maybeSingle() { return result(true); }, async single() { return result(true); },
        then(res: any, rej: any) { return Promise.resolve(result(false)).then(res, rej); },
      };
      function result(single: boolean): { data: any; error: null; count: number } {
        const selected = (rows[table] ?? []).filter(row => Object.entries(filters).every(([k, v]) => k === "key_hash" || row[k] === v));
        return { data: inserted ?? (single ? selected[0] ?? null : selected), error: null, count: selected.length };
      }
      return query;
    },
    async rpc(name: string, args: Record<string, any>): Promise<{ data: any; error: { message: string } | null }> {
      calls.push({ name, args });
      if (name === "mcp_authorize_principal") return { data: options.authorized !== false, error: null };
      if (name === "mcp_reserve_tool_call") {
        if (options.reserveFailure) return { data: null, error: { message: "missing function" } };
        const prev = receipts.get(args.p_request_id);
        if (prev) return { data: prev.fingerprint !== args.p_fingerprint ? { ok: false, error: "request_id già usato" }
          : prev.response ? { ok: true, cached: true, response: prev.response } : { ok: false, error: "Richiesta in corso" }, error: null };
        const receipt = webcrypto.randomUUID();
        receipts.set(args.p_request_id, { fingerprint: args.p_fingerprint, receipt });
        return { data: { ok: true, cached: false, receipt }, error: null };
      }
      if (name === "mcp_complete_tool_call") {
        if (options.completeFailure) return { data: null, error: { message: "connection lost" } };
        const row = [...receipts.values()].find(r => r.receipt === args.p_receipt);
        if (row) row.response = args.p_response;
        return { data: !!row, error: null };
      }
      if (name === "silvio_outbound_resolve_recipient") return { data: options.recipient === "missing" ? null : { email: options.recipient ?? "cliente@example.test" }, error: null };
      if (options.rpcFailure) return { data: { ok: false, error: "Errore di dominio simulato" }, error: null };
      return { data: { ok: true, outbound_id: ENTITY, status: "queued" }, error: null };
    },
  };
  let handler: (request: Request) => Promise<Response>;
  runInNewContext(compiled, {
    Deno: { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://example.test" : "offline-only" }, serve: (h: typeof handler) => { handler = h; } },
    createClient: () => admin, getCorsHeaders: () => ({}),
    sendEmailUnified: () => { throw new Error("Real sending is forbidden in this test"); },
    crypto: webcrypto, TextEncoder, TextDecoder, Request, Response, Headers, URL, atob,
    console: { error() {} },
  });
  const post = async (body: unknown, authenticated = true) => {
    const response = await handler!(new Request("https://example.test/functions/v1/platform-mcp", {
      method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { "x-api-key": "eic_live_offline" } : {}) }, body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  };
  const call = (name: string, args: unknown = {}) => post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  return { post, call, calls, queries, logs };
}

describe("MCP protocol and schemas", () => {
  it.each([null, [], 4, "ping", {}, { jsonrpc: "9.9", id: 1, method: "ping" },
    { jsonrpc: "2.0", method: "ping" }, { jsonrpc: "2.0", id: {}, method: "ping" },
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: [] }])("rejects malformed requests: %j", async value => {
    expect(validRpcMessage(value)).toBe(false);
    expect((await server().post(value)).status).toBe(400);
  });
  it("rejects invalid calendar dates, UUIDs, unexpected properties and array arguments", () => {
    expect(argumentError("2026-02-30", { type: "string", format: "date" })).toBeTruthy();
    expect(argumentError("2026-02-28", { type: "string", format: "date" })).toBeNull();
    expect(argumentError("not-an-id", { type: "string", format: "uuid" })).toBeTruthy();
    expect(argumentError({ injected: true }, { type: "object", additionalProperties: false })).toBeTruthy();
    expect(argumentError([], { type: "object" })).toBeTruthy();
  });
  it("fingerprints are stable across argument order, but sensitive to data changes", () => {
    expect(canonicalJson({ b: [2], a: 1 })).toBe(canonicalJson({ a: 1, b: [2] }));
    expect(canonicalJson({ a: 2 })).not.toBe(canonicalJson({ a: 1 }));
  });
  it("detects business errors without confusing valid false scalar results", () => {
    for (const value of [{ ok: false }, { success: false }, { error: "failure" }, { error: { message: "failure" } }]) expect(domainError(value)).toBeTruthy();
    expect(domainError(false)).toBeNull(); expect(domainError({ ok: true })).toBeNull();
  });
  it("validates issuer, subject, expiry and configured resource audience", () => {
    const claims = { sub: ACTOR, iss: "https://example.test/auth/v1", client_id: "ChatGPT", aud: "authenticated", exp: Date.now() / 1000 + 60 };
    const valid = (c: any, aud = "authenticated") => validOAuthClaims(c, ACTOR, claims.iss, aud);
    expect(valid(claims)).toBe(true);
    for (const change of [{ sub: ENTITY }, { iss: "https://evil.test" }, { exp: 0 }, { client_id: "" }, { aud: "other-service" }]) expect(valid({ ...claims, ...change })).toBe(false);
    expect(valid(claims, "https://example.test/mcp")).toBe(false);
    expect(valid({ ...claims, aud: ["https://example.test/mcp"] }, "https://example.test/mcp")).toBe(true);
  });
});

describe("MCP handler offline integration", () => {
  it("allows public discovery with OAuth metadata, but not unauthenticated invocation", async () => {
    const s = server();
    expect((await s.post({ jsonrpc: "2.0", id: 1, method: "initialize" }, false)).status).toBe(200);
    const listing = await s.post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, false);
    expect(listing.body.result.tools).toHaveLength(55);
    for (const tool of listing.body.result.tools) expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: [] }]);
    const unauth = await s.post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "kpi_azienda" } }, false);
    expect(unauth.status).toBe(401);
    expect(unauth.body.result._meta["mcp/www_authenticate"]).toHaveLength(1);
    expect(s.calls).toHaveLength(0);
  });
  it("rechecks current actor permissions before any execution", async () => {
    const s = server({ authorized: false });
    expect((await s.call("kpi_azienda")).status).toBe(401);
    expect(s.calls.map(c => c.name)).toEqual(["mcp_authorize_principal"]);
  });
  it("does not execute scopes denied by the grant", async () => {
    const s = server({ scopes: ["quotes:read"] });
    expect((await s.call("crea_lead", { canale: "website_form", request_id: REQUEST })).body.result.isError).toBe(true);
    expect(s.calls.some(c => c.name === "silvio_tool_crea_lead_first_touch")).toBe(false);
  });
  it("maps RPC business failures to MCP isError and logs 422, not 200", async () => {
    const s = server({ rpcFailure: true });
    const result = await s.call("performance_mensile", { anno: 2026, mese: 10 });
    expect(result.body.result.isError).toBe(true);
    expect(result.body.result.content[0].text).toContain("Errore di dominio");
    expect(s.logs.map(l => l.status_code)).toEqual([422]);
  });
  it("rejects invalid arguments before reserving or calling SQL", async () => {
    const s = server();
    for (const args of [{ anno: 2026, mese: 99 }, { anno: 2026, mese: "10" }, [] as unknown[]]) expect((await s.call("performance_mensile", args)).body.result.isError).toBe(true);
    expect(s.calls.filter(c => c.name !== "mcp_authorize_principal")).toHaveLength(0);
  });
  it("reads stored quote probabilities without ever calling the mutating prediction RPC", async () => {
    const s = server();
    const result = await s.call("probabilita_chiusura", { preventivo_id: ENTITY });
    expect(result.body.result.isError).not.toBe(true);
    expect(s.calls.some(c => c.name === "silvio_tool_stima_probabilita_close_quote")).toBe(false);
    expect(s.queries.find(q => q.table === "quotes")?.filters).toEqual({ company_id: COMPANY, id: ENTITY });
  });
  it("blocks unconfirmed sends and unsupported channels", async () => {
    const s = server();
    const args = { destinatario_tipo: "cliente", destinatario_id: ENTITY, canale: "email", corpo: "Testo", request_id: REQUEST };
    for (const input of [args, { ...args, confirmed: false }, { ...args, confirmed: true, canale: "whatsapp" }]) expect((await s.call("invia_messaggio", input)).body.result.isError).toBe(true);
    expect(s.calls.filter(c => c.name !== "mcp_authorize_principal")).toHaveLength(0);
  });
  it("requires durable IDs for writes and fails closed when reservation is unavailable", async () => {
    expect((await server().call("crea_lead", { canale: "website_form" })).body.result.isError).toBe(true);
    const s = server({ reserveFailure: true });
    expect((await s.call("crea_lead", { canale: "website_form", request_id: REQUEST })).body.result.isError).toBe(true);
    expect(s.calls.some(c => c.name === "silvio_tool_crea_lead_first_touch")).toBe(false);
  });
  it("replays writes once, and rejects reusing the ID with different data", async () => {
    const s = server(); const args = { canale: "website_form", nome: "Test", request_id: REQUEST };
    const first = await s.call("crea_lead", args);
    expect((await s.call("crea_lead", args)).body.result).toEqual(first.body.result);
    expect(s.calls.filter(c => c.name === "silvio_tool_crea_lead_first_touch")).toHaveLength(1);
    expect((await s.call("crea_lead", { ...args, nome: "Different" })).body.result.isError).toBe(true);
  });
  it("does not retry a write after losing its completion receipt", async () => {
    const s = server({ completeFailure: true }); const args = { canale: "website_form", request_id: REQUEST };
    expect((await s.call("crea_lead", args)).body.result.isError).toBe(true);
    expect((await s.call("crea_lead", args)).body.result.isError).toBe(true);
    expect(s.calls.filter(c => c.name === "silvio_tool_crea_lead_first_touch")).toHaveLength(1);
  });
  it("follow-ups enqueue only the reviewed body, not legacy placeholder text", async () => {
    const s = server();
    const result = await s.call("invia_followup_preventivo", { cliente_id: ENTITY, preventivo_id: ENTITY,
      oggetto: "La sua proposta", corpo: "Gentile cliente, possiamo chiarire la proposta?", confirmed: true, request_id: REQUEST });
    expect(result.body.result.isError).not.toBe(true);
    expect(s.calls.some(c => c.name === "silvio_tool_invia_followup_preventivo")).toBe(false);
    expect(s.calls.find(c => c.name === "silvio_tool_componi_e_invia_messaggio")?.args.p_corpo).toBe("Gentile cliente, possiamo chiarire la proposta?");
  });
  it("blocks mismatched recipients, missing employees and foreign outbound IDs", async () => {
    const s = server({ documentEmail: "different@example.test" });
    expect((await s.call("invia_followup_preventivo", { cliente_id: ENTITY, preventivo_id: ENTITY,
      oggetto: "Oggetto", corpo: "Corpo", confirmed: true, request_id: REQUEST })).body.result.isError).toBe(true);
    expect(s.calls.some(c => c.name === "silvio_tool_componi_e_invia_messaggio")).toBe(false);
    const absent = server();
    expect((await absent.call("registra_assenza", { dipendente_id: ENTITY, data_inizio: "2026-10-08", data_fine: "2026-10-09", tipo: "ferie", request_id: REQUEST })).body.result.content[0].text).toContain("Dipendente non trovato");
    expect((await server().call("stato_invio", { outbound_id: REQUEST })).body.result.isError).toBe(true);
  });
});

describe("connector connection labels", () => {
  it("does not assign unknown clients or arbitrary API keys to Claude", () => {
    expect(assistenteDelClient("Unknown MCP")).toBeNull();
    expect(assistenteDelClient("Anthropic Claude")).toBe("claude");
    expect(assistenteDelClient("ChatGPT")).toBe("chatgpt");
    expect(statoCollegamentoAi("claude", [], [{ name: "ERP export", is_active: true, expires_at: null }]).status).toBe("disconnected");
  });
  it("shows configuration as unverified until a successful OAuth tool call", () => {
    const grant: { client_name: string; last_used_at: string | null } = { client_name: "ChatGPT", last_used_at: null };
    expect(statoCollegamentoAi("chatgpt", [grant], []).status).toBe("warning");
    expect(statoCollegamentoAi("chatgpt", [{ ...grant, last_used_at: new Date().toISOString() }], []).status).toBe("connected");
    expect(statoCollegamentoAi("chatgpt", [{ ...grant, last_used_at: "2000-01-01" }], []).status).toBe("warning");
  });
  it("records the application grant after OAuth success and before browser redirect", () => {
    const page = readFileSync(resolve("src/pages/oauth/OAuthConsent.tsx"), "utf8");
    const approve = page.slice(page.indexOf("const approva ="), page.indexOf("const rifiuta ="));
    expect(approve).toContain("skipBrowserRedirect: true");
    expect(approve.indexOf("approveAuthorization")).toBeLessThan(approve.indexOf("mcp_oauth_upsert_grant"));
    expect(approve.indexOf("mcp_oauth_upsert_grant")).toBeLessThan(approve.indexOf("window.location.href"));
  });
});

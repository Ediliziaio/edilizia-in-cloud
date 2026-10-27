import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as salt from "../../../supabase/functions/_shared/saltedge";
import * as store from "../../../supabase/functions/_shared/saltedgeStore";
import { SaltTestDatabase } from "../helpers/saltedgeDatabase";

const company = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", user = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const db = new SaltTestDatabase();
let vars: Record<string, string>, denied = false;
let handler: (req: Request) => Promise<Response>, webhook: typeof handler;
const fetcher = vi.fn<typeof fetch>();
async function load(file: string) {
  const source = ts.transpileModule(await readFile(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let handle: typeof handler;
  vm.runInNewContext(source, { exports: {}, Response, Request, URL, Date, Error, crypto, console,
    Deno: { serve: (h: typeof handler) => { handle = h; }, env: { get: (key: string) => vars[key] } },
    require: (path: string) => {
      if (path.includes("supabase-js")) return { createClient: (_url: string, key: string) => key === "anon" ? { auth: { getUser: async () => ({ data: { user: { id: user, email: "test@example.test" } }, error: null as null }) } } : db };
      if (path.endsWith("/headers.ts")) return { getCorsHeaders: () => ({}) };
      if (path.endsWith("/permessoAzienda.ts")) return { verificaPermessoAzienda: async (_db: unknown, _user: string, id: string) => { if (denied || id !== company) throw new Error("Non autorizzato"); } };
      if (path.endsWith("/auth.ts")) return { isSuperAdminEmailAllowed: () => false };
      if (path.endsWith("/saltedge.ts")) return salt;
      if (path.endsWith("/saltedgeStore.ts")) return store;
      throw new Error(`Unexpected import ${path}`);
    },
  });
  return handle!;
}
beforeAll(async () => {
  await db.setup();
  await db.pg.exec(`create table profiles(id uuid primary key,is_blocked boolean default false,deleted_at timestamptz);
    create table user_roles(user_id uuid,role text); insert into profiles(id) values('${user}'); insert into user_roles values('${user}','company_admin');`);
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  vars = { SUPABASE_URL: "https://local.invalid", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service-synthetic",
    SALTEDGE_BETA_COMPANY_IDS: company, SALTEDGE_ACCESS_TYPE: "client", SALTEDGE_APP_ID: "app-synthetic", SALTEDGE_SECRET: "synthetic-only",
    SALTEDGE_APP_ORIGIN: "http://127.0.0.1:8080", SALTEDGE_WEBHOOK_BASE_URL: "https://local.invalid/functions/v1/bank-saltedge-webhook",
    SALTEDGE_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----` };
  handler = await load("supabase/functions/bank-saltedge/index.ts");
  webhook = await load("supabase/functions/bank-saltedge-webhook/index.ts");
});
beforeEach(async () => {
  denied = false; fetcher.mockReset(); vi.stubGlobal("fetch", fetcher);
  await db.pg.exec("truncate bank_saltedge_customers, bank_saltedge_sessions, bank_saltedge_locks cascade");
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => db.pg.close());
const request = (body: Record<string, unknown>, auth = true) => handler(new Request("https://local.invalid/functions/v1/bank-saltedge", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer synthetic-user" } : {}) }, body: JSON.stringify({ company_id: company, ...body }) }));

describe("Gestori veri Salt Edge, identita/API simulate e Postgres locale", () => {
  it("nega anonimi, azienda diversa, utenti bloccati e permessi mancanti prima di contattare Salt Edge", async () => {
    expect((await request({ action: "status" }, false)).status).toBe(401);
    expect((await request({ action: "start-auth", company_id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" })).status).toBe(403);
    denied = true; expect((await request({ action: "sync" })).status).toBe(403); denied = false;
    await db.pg.exec("update profiles set is_blocked=true");
    try { expect((await request({ action: "status" })).status).toBe(403); }
    finally { await db.pg.exec("update profiles set is_blocked=false"); }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("in Pending crea un cliente riutilizzabile e un widget fake, solo lettura e stato hashato", async () => {
    fetcher.mockImplementation(async (url, init) => {
      const body = JSON.parse(String(init?.body)).data;
      if (String(url).endsWith("/customers")) return new Response('{"data":{"customer_id":"20"}}');
      expect(body.automatic_refresh).toBe(false); expect(body.categorization).toBe("none");
      expect(body.consent.scopes).toEqual(["accounts", "transactions"]);
      expect(body.provider).toEqual({ code: "fakebank_oauth_xf", include_sandboxes: true });
      expect(body.widget.allowed_countries).toEqual(["XF"]);
      expect(body.attempt.return_to).toContain("/azienda/tesoreria?");
      const state = new URL(body.attempt.return_to).searchParams.get("se_state")!;
      const session = (await db.pg.query<{ state_hash: string }>("select state_hash from bank_saltedge_sessions where id=$1", [body.attempt.custom_fields.eic_session_id])).rows[0];
      expect(session.state_hash).toBe(await salt.sha256(state)); expect(session.state_hash).not.toBe(state);
      return new Response('{"data":{"customer_id":"20","connect_url":"https://www.saltedge.com/connect?token=synthetic"}}');
    });
    for (let i = 0; i < 2; i++) {
      const response = await request({ action: "start-auth", confirm_company_accounts: true, redirect_path: "/azienda/tesoreria" });
      expect(response.status).toBe(200); expect((await response.json()).url).toContain("https://www.saltedge.com/");
    }
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/customers"))).toHaveLength(1);
  });
  it("richiede la dichiarazione sull'azienda e blocca ritorni senza sessione valida", async () => {
    expect((await request({ action: "start-auth" })).status).toBe(400);
    expect((await request({ action: "finalize", state: "forged", provider_connection_id: "10" })).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("non considera riuscita una sincronizzazione senza connessioni", async () => {
    expect((await request({ action: "sync" })).status).toBe(404);
  });
  it("rifiuta notifiche senza firma e non usa mai il service role prima della verifica", async () => {
    const response = await webhook(new Request(vars.SALTEDGE_WEBHOOK_BASE_URL + "/success", { method: "POST", body: JSON.stringify({ data: { connection_id: "10", customer_id: "20" } }) }));
    expect(response.status).toBe(401); expect(fetcher).not.toHaveBeenCalled();
  });
});

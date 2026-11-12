import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as distyra from "../../../supabase/functions/_shared/distyra";
import { SaltTestDatabase } from "../helpers/saltedgeDatabase";

const company = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", user = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const conn = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
const db = new SaltTestDatabase();
let handler: (req: Request) => Promise<Response>;
let denied = false;
const fetcher = vi.fn<typeof fetch>();
beforeAll(async () => {
  await db.setup();
  await db.pg.exec("alter table bank_connections add column auth_state text;");
  const source = ts.transpileModule(await readFile("supabase/functions/bank-distyra/index.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports: {}, Response, Request, URL, URLSearchParams, Date, Error, crypto, console, fetch: (...args: Parameters<typeof fetch>) => fetcher(...args),
    Deno: { serve: (h: typeof handler) => { handler = h; }, env: { get: () => "synthetic-only" } },
    require: (p: string) => {
      if (p.includes("supabase-js")) return { createClient: () => db };
      if (p.endsWith("/distyra.ts")) return distyra;
      if (p.endsWith("/headers.ts")) return { getCorsHeaders: () => ({}), jsonResponse: (v: unknown, s: number) => Response.json(v, { status: s }), errorResponse: (e: string, s: number) => Response.json({ error: e }, { status: s }) };
      if (p.endsWith("/auth.ts")) return { requireAuth: async () => ({ userId: user, supabaseAdmin: db }), requireCompanyAccess: async (_db: unknown, _user: string, id: string) => { if (id !== company) throw new Response(null, { status: 403 }); } };
      if (p.endsWith("/permessoAzienda.ts")) return { verificaPermessoAzienda: async () => { if (denied) throw new Error("Non autorizzato"); } };
      throw new Error(`Unexpected import ${p}`);
    },
  });
}, 30000);
beforeEach(async () => {
  db.failTable = ""; denied = false; fetcher.mockReset();
  await db.pg.exec(`delete from bank_accounts; delete from bank_connections;
    insert into bank_connections(id,company_id,provider_slug,institution_id,institution_name,status,auth_state,created_by)
      values('${conn}','${company}','distyra','ignoto','Banca da scegliere','pending','rif','${user}');`);
});
afterAll(() => db.pg.close());
const request = (body: Record<string, unknown> = {}) => handler(new Request("https://local.invalid", { method: "POST", body: JSON.stringify({ company_id: company, action: "finalize", connection_id: conn, ...body }) }));
function provider(accounts: Record<string, unknown>[], status = "active") {
  fetcher.mockImplementation(async url => String(url).endsWith("/v1/connect/connections")
    ? Response.json({ connections: [{ id: "remote", external_ref: "rif", aspsp_name: "Banca esempio", status }] })
    : Response.json({ accounts }));
}

describe("Distyra: gestore reale, banca simulata e Postgres locale", () => {
  it("collega tre conti e salva saldi strutturati come numeri", async () => {
    provider([1,2,3].map(i => ({ account_id: `a${i}`, name: `Conto ${i}`, currency: "EUR", balance_booked: { amount: i * 100, currency: "EUR" }, balance_available: { amount: i * 90, currency: "EUR" }, balance_known: true })));
    const r = await request();
    expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ conti: 3 });
    const rows = (await db.pg.query<{current_balance:string;available_balance:string}>("select current_balance,available_balance from bank_accounts order by external_account_id")).rows;
    expect(rows.map(r=>Number(r.current_balance))).toEqual([100,200,300]);
    expect(rows.map(r=>Number(r.available_balance))).toEqual([90,180,270]);
    expect(String(fetcher.mock.calls[1][0])).toContain("balances=false&allow_stored=true");
    expect((await db.pg.query<{status:string;accounts_count:number}>("select status,accounts_count from bank_connections")).rows[0]).toEqual({status:"linked",accounts_count:3});
  });
  it("riprendere il collegamento è idempotente e non azzera saldi già conosciuti", async () => {
    provider([{account_id:"a",balance:{amount:42,currency:"EUR"},balance_known:true}]);
    expect((await request()).status).toBe(200);
    provider([{account_id:"a",balance_known:false,balance:null}]);
    expect((await request()).status).toBe(200);
    const rows = (await db.pg.query<{current_balance:string}>("select current_balance from bank_accounts")).rows;
    expect(rows).toHaveLength(1); expect(Number(rows[0].current_balance)).toBe(42);
  });
  it("un errore di salvataggio non viene mascherato da banca senza conti", async () => {
    db.failTable = "bank_accounts"; provider([{account_id:"a",balance_booked:{amount:42}}]);
    const r = await request(); expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/salvare i conti/);
    expect((await db.pg.query<{status:string}>("select status from bank_connections")).rows[0].status).toBe("pending");
  });
  it("non dichiara successo con zero conti e non consuma una lettura mentre il consenso è pending", async () => {
    provider([], "pending");
    expect((await request()).status).toBe(409); expect(fetcher).toHaveBeenCalledTimes(1);
    provider([]); expect((await request()).status).toBe(409);
  });
  it("mantiene il 429, il codice e l'attesa del provider senza esporre messaggi interni", async () => {
    fetcher.mockResolvedValue(Response.json({error:"bank_fetch_limit_reached",detail:"private provider detail",retry_after_seconds:120,resets_at:"2026-11-13T00:00:00Z"}, {status:429}));
    const r = await request(); expect(r.status).toBe(429);
    const b = await r.json(); expect(b).toMatchObject({code:"bank_fetch_limit_reached",retry_after_seconds:120,resets_at:"2026-11-13T00:00:00Z"});
    expect(b.error).toMatch(/Non serve ricollegare/); expect(b.error).not.toContain("private provider detail");
  });
  it("blocca azienda diversa e permessi mancanti prima del provider", async () => {
    expect((await request({company_id:"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"})).status).toBe(403);
    denied = true; expect((await request()).status).toBe(403); expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Contesto di una richiesta bancaria visibile", () => {
  const req = new Request("https://local.invalid",{headers:{"cf-connecting-ip":"203.0.113.42","user-agent":"Browser sintetico"}});
  it("usa l'IP reale del gateway soltanto per il titolare che aspetta sullo schermo", () => expect(distyra.intestazioniPsu(req,true,user,user)).toEqual({"Psu-Ip-Address":"203.0.113.42","Psu-User-Agent":"Browser sintetico"}));
  it("cron, altro utente, flag assente e IP invalido non dichiarano presenza", () => {
    expect(distyra.intestazioniPsu(req,false,user,user)).toEqual({});
    expect(distyra.intestazioniPsu(req,true,"altro",user)).toEqual({});
    expect(distyra.intestazioniPsu(new Request("https://local.invalid",{headers:{"cf-connecting-ip":"invalid","user-agent":"Browser"}}),true,user,user)).toEqual({});
  });
  it("non scambia dati sconosciuti per saldo zero", () => {
    expect(distyra.importoDistyra({amount:0})).toBe(0); expect(distyra.importoDistyra({amount:-123.45})).toBe(-123.45);
    expect(distyra.importoDistyra(null)).toBeNull(); expect(distyra.importoDistyra(" ")).toBeNull();
    expect(()=>distyra.importoDistyra({amount:"errato"})).toThrow();
  });
});

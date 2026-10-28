import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SaltTestDatabase } from "../helpers/saltedgeDatabase";
import { SaltEdgeClient, type SaltConnection, type SaltConfig } from "../../../supabase/functions/_shared/saltedge";
import { saltAttach, saltLock, saltOwnedConnection, saltSync } from "../../../supabase/functions/_shared/saltedgeStore";

const db = new SaltTestDatabase();
const company = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", other = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", user = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
let api: SaltEdgeClient, row: any, remote: SaltConnection, expired = false, failedPage = false;
beforeAll(async () => {
  await db.setup();
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const config: SaltConfig = { appId: "test", secret: "synthetic", accessType: "client", mode: "pending", origin: "http://127.0.0.1:8080", webhookBase: "https://callback.invalid/",
    privateKey: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----` };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const u = new URL(String(url)); const path = u.pathname.replace("/api/v6", "");
    const json = (data: unknown, meta = {}) => new Response(JSON.stringify({ data, meta }));
    if (path === "/connections/10") return json(remote);
    if (path === "/consents/30") {
      expect(u.searchParams.get("connection_id")).toBe("10");
      return json({ connection_id: "10", customer_id: "20", status: expired ? "revoked" : "active", expires_at: "2027-01-10T00:00:00Z" });
    }
    if (path === "/accounts") return json(["31", "32"].map(id => ({ id, connection_id: "10", balance: id === "31" ? 0 : 100, currency_code: "EUR", name: `Conto ${id}`, extra: { iban: `IT-TEST-${id}` } })));
    if (path === "/transactions") {
      if (u.searchParams.get("from_id")) {
        if (failedPage) return new Response('{"error":{"class":"ProviderUnavailable"}}', { status: 502 });
        return json([{ id: "51", account_id: u.searchParams.get("account_id"), amount: -10, currency_code: "EUR", made_on: "2026-10-27", status: "posted" }]);
      }
      return json([{ id: "50", account_id: u.searchParams.get("account_id"), amount: -10, currency_code: "EUR", made_on: "2026-10-27", status: "posted" }], { next_id: "51" });
    }
    throw new Error(`Unexpected API path: ${path}`);
  });
  api = new SaltEdgeClient(config, fetcher);
});
afterAll(async () => db.pg.close());
beforeEach(async () => {
  db.failTable = ""; expired = false; failedPage = false;
  await db.pg.exec("truncate bank_transactions, bank_accounts, bank_connections, bank_saltedge_locks, bank_saltedge_sessions, bank_saltedge_customers cascade");
  remote = { id: "10", customer_id: "20", provider_code: "fakebank_oauth_xf", provider_name: "Fake Bank", country_code: "XF", status: "active", last_consent_id: "30", last_attempt: { finished: true, custom_fields: { eic_session_id: "session" } } };
  const inserted = await db.from("bank_connections").insert({ company_id: company, institution_id: "fake", provider_slug: "saltedge", provider_connection_id: "10", saltedge_customer_id: "20", status: "created", created_by: user }).select("*").single();
  if (inserted.error) throw inserted.error;
  row = inserted.data;
});

describe("Salt Edge beta: database Postgres locale, API esterna simulata", () => {
  it("importa tutte le pagine, preserva bonifici uguali distinti, saldo zero e riconciliazioni", async () => {
    expect(await saltSync(db, api, row)).toMatchObject({ ok: true, imported: 4, accounts: 2 });
    expect((await db.pg.query("select id from bank_transactions")).rows).toHaveLength(4);
    expect((await db.pg.query<{ current_balance: string }>("select current_balance from bank_accounts where external_account_id='se:31'")).rows[0].current_balance).toBe("0.00");
    await db.pg.exec("update bank_transactions set note='Nota manuale', category='Categoria scelta', linked_invoice_id='dddddddd-dddd-4ddd-dddd-dddddddddddd'");
    await saltSync(db, api, row);
    const tx = (await db.pg.query<{ note: string; category: string; linked_invoice_id: string }>("select note,category,linked_invoice_id from bank_transactions")).rows;
    expect(tx).toHaveLength(4);
    expect(tx.every(t => t.note === "Nota manuale" && t.category === "Categoria scelta" && t.linked_invoice_id === "dddddddd-dddd-4ddd-dddd-dddddddddddd")).toBe(true);
    expect((await db.pg.query<{ status: string }>("select status from bank_connections")).rows[0].status).toBe("linked");
  });
  it("non trova o importa connessioni di un'altra azienda/customer", async () => {
    await expect(saltOwnedConnection(db, other, row.id)).rejects.toThrow("ConnectionNotFound");
    remote.customer_id = "999";
    await expect(saltSync(db, api, row)).rejects.toThrow("ConnectionNotFound");
    expect((await db.pg.query("select id from bank_accounts")).rows).toHaveLength(0);
  });
  it("non riporta riuscito un import parziale o un errore di salvataggio", async () => {
    failedPage = true;
    await expect(saltSync(db, api, row)).rejects.toThrow("ProviderUnavailable");
    expect((await db.pg.query<{ last_sync_at: string | null }>("select last_sync_at from bank_connections")).rows[0].last_sync_at).toBeNull();
    failedPage = false; db.failTable = "bank_transactions";
    await expect(saltSync(db, api, row)).rejects.toThrow("DatabaseError");
    expect((await db.pg.query<{ last_sync_at: string | null }>("select last_sync_at from bank_connections")).rows[0].last_sync_at).toBeNull();
  });
  it("blocca dati reali in Pending e consensi revocati PRIMA delle scritture finanziarie", async () => {
    remote.country_code = "IT";
    await expect(saltSync(db, api, row)).rejects.toThrow("BetaModeRequired");
    remote.country_code = "XF"; expired = true;
    await expect(saltSync(db, api, row)).rejects.toThrow("AispConsentRevoked");
    expect((await db.pg.query("select id from bank_accounts")).rows).toHaveLength(0);
    expect((await db.pg.query<{ status: string }>("select status from bank_connections")).rows[0].status).toBe("expired");
  });
  it("non dichiara collegata una banca che sta ancora preparando i dati", async () => {
    remote.last_attempt!.finished = false;
    expect(await saltSync(db, api, row)).toMatchObject({ processing: true, imported: 0 });
    expect((await db.pg.query<{ last_sync_at: string | null }>("select last_sync_at from bank_connections")).rows[0].last_sync_at).toBeNull();
  });
  it("non duplica i saldi di un IBAN gia' attivo su un altro collegamento", async () => {
    const legacy = await db.from("bank_connections").insert({ company_id: company, institution_id: "other", provider_slug: "saltedge", status: "linked" }).select("id").single();
    await db.from("bank_accounts").insert({ company_id: company, connection_id: (legacy.data as any).id, external_account_id: "old-account", iban: "IT-TEST-31", currency: "EUR", current_balance: 987 });
    await expect(saltSync(db, api, row)).rejects.toThrow("MigrationRequired");
    expect((await db.pg.query<{ current_balance: string }>("select current_balance from bank_accounts")).rows.map(r => r.current_balance)).toEqual(["987.00"]);
  });
  it("collega solo la sessione attesa e non sposta una connessione fra aziende", async () => {
    const session = { id: "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee", company_id: company, user_id: user, customer_id: "20", connection_id: null as string | null, state_hash: "hash" };
    await db.from("bank_saltedge_sessions").insert(session);
    await expect(saltAttach(db, remote, session)).rejects.toThrow("InvalidSession");
    remote.last_attempt!.custom_fields!.eic_session_id = session.id;
    expect(await saltAttach(db, remote, session)).toMatchObject({ id: row.id, company_id: company });
    await expect(saltAttach(db, remote, { ...session, company_id: other })).rejects.toThrow("ConnectionNotFound");
  });
  it("impedisce due sincronizzazioni contemporanee e libera la lease anche su errore", async () => {
    await saltLock(db, "same", async () => {
      await expect(saltLock(db, "same", async () => true)).rejects.toThrow("Busy");
    });
    await expect(saltLock(db, "same", async () => { throw new Error("fail"); })).rejects.toThrow("fail");
    expect(await saltLock(db, "same", async () => "released")).toBe("released");
  });
  it("non espone sessioni/customer/lease ai ruoli del browser", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.pg.exec(`set role ${role}`);
      try {
        for (const table of ["bank_saltedge_customers", "bank_saltedge_sessions", "bank_saltedge_locks"])
          await expect(db.pg.query(`select * from ${table}`)).rejects.toThrow("permission denied");
        await expect(db.pg.query("select claim_saltedge_lock('illegal')")).rejects.toThrow("permission denied");
      } finally { await db.pg.exec("reset role"); }
    }
  });
});

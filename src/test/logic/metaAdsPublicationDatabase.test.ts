/// <reference types="node" />
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261109115652_meta_ads_publication_safety.sql"), "utf8");
const company = "00000000-0000-4000-8000-000000000001";
let db: PGlite;
let sequence = 0;
async function campaign() {
  const id = `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
  await db.query(`insert into public.meta_campaigns(id,company_id,name,objective,builder_state,daily_budget_cents,budget_mode,status,approved_at,approved_by)
    values ($1,$2,'Campagna','leads','{"dailyBudget":50}',5000,'campaign','review',now(),'00000000-0000-4000-8000-000000000099')`, [id,company]);
  return id;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
    create table public.companies(id uuid primary key);
    create table public.meta_campaigns(id uuid primary key,company_id uuid references companies(id),name text,objective text,builder_state jsonb,daily_budget_cents int,budget_mode text,ad_account_id uuid,meta_campaign_id text,status text,approved_at timestamptz,approved_by uuid,raw jsonb);
    insert into public.companies values ('${company}');
    grant select,update,delete on public.meta_campaigns to authenticated;
    set request.jwt.claim.role='authenticated';`);
  await db.exec(`begin; ${migration} commit;`);
}, 30000);
afterAll(async () => { await db?.close(); });
describe("protezioni reali Postgres della pubblicazione Ads", () => {
  it("una modifica al budget o al contenuto annulla l'ok precedente e rimette la bozza in lavorazione", async () => {
    const first = await campaign();
    await db.query("update public.meta_campaigns set daily_budget_cents=8000 where id=$1",[first]);
    expect((await db.query("select approved_at,approved_by,status from public.meta_campaigns where id=$1",[first])).rows[0]).toEqual({approved_at:null,approved_by:null,status:"draft"});
    const second = await campaign();
    await db.query(`update public.meta_campaigns set builder_state='{"dailyBudget":50,"pageMetaId":"changed"}' where id=$1`,[second]);
    expect((await db.query<{approved_at:unknown}>("select approved_at from public.meta_campaigns where id=$1",[second])).rows[0].approved_at).toBeNull();
  });
  it("un aggiornamento del solo esito non invalida l'approvazione", async () => {
    const id=await campaign();
    await db.query(`update public.meta_campaigns set raw='{"ok":true}' where id=$1`,[id]);
    expect((await db.query<{approved_at:unknown}>("select approved_at from public.meta_campaigns where id=$1",[id])).rows[0].approved_at).not.toBeNull();
  });
  it("il database accetta un solo claim per bozza e impedisce modifiche e cancellazioni durante l'invio", async () => {
    const id=await campaign();
    await db.query(`insert into public.meta_campaign_publication_locks(campaign_id,company_id,request_id) values ($1,$2,'00000000-0000-4000-8000-000000000088')`,[id,company]);
    await expect(db.query(`insert into public.meta_campaign_publication_locks(campaign_id,company_id,request_id) values ($1,$2,'00000000-0000-4000-8000-000000000087')`,[id,company])).rejects.toMatchObject({code:"23505"});
    await expect(db.query("update public.meta_campaigns set name='Modificata' where id=$1",[id])).rejects.toMatchObject({code:"55000"});
    await expect(db.query("delete from public.meta_campaigns where id=$1",[id])).rejects.toMatchObject({code:"55000"});
    await db.exec("set request.jwt.claim.role='service_role'");
    await db.query("update public.meta_campaigns set status='published' where id=$1",[id]);
    await db.query("delete from public.meta_campaign_publication_locks where campaign_id=$1",[id]);
    await db.exec("set request.jwt.claim.role='authenticated'");
  });
  it("il browser non può creare o eliminare i claim, né invocare direttamente il trigger", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(db.query("select * from public.meta_campaign_publication_locks")).rejects.toMatchObject({code:"42501"});
      await expect(db.query("delete from public.meta_campaign_publication_locks")).rejects.toMatchObject({code:"42501"});
      await expect(db.query("select public.guard_meta_campaign_publication()")).rejects.toMatchObject({code:"42501"});
    } finally { await db.exec("reset role"); }
  });
});

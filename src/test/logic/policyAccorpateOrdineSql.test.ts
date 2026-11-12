import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("ricostruisce la stessa policy anche se il catalogo viene letto con piani diversi", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table zz_policy_backup(tabella text,polname text,polcmd char,polpermissive boolean,ruoli text,qual text,wcheck text);
      create table prima(tenant integer); create table seconda(tenant integer);
      create policy z_prima on prima for select using(tenant=1);
      create policy a_seconda on prima for select using(tenant=2);
      create policy m_terza on prima for select using(tenant=3);
      create policy z_prima on seconda for select using(tenant=1);
      create policy a_seconda on seconda for select using(tenant=2);
      create policy m_terza on seconda for select using(tenant=3);
      create policy scrittura on prima for all to authenticated using(false) with check(false);
      create policy restrittiva on prima as restrictive for select using(tenant<>3);
    `);
    const source = readFileSync("supabase/migrations/20280906000000_policy_di_lettura_accorpate.sql", "utf8");
    const fine = source.indexOf("-- ── L'applicazione");
    expect(fine).toBeGreaterThan(0);
    await db.exec(source.slice(0, fine));
    await db.exec(`set enable_indexscan=off;set enable_bitmapscan=off;set enable_seqscan=on;
      select * from policy_accorpa_lettura('prima');
      set enable_indexscan=on;set enable_bitmapscan=on;set enable_seqscan=off;
      select * from policy_accorpa_lettura('seconda');`);
    const esiti = await db.query<{ espressione: string; impronta: string }>(`
      select pg_get_expr(polqual,polrelid) espressione,md5(pg_get_expr(polqual,polrelid)) impronta
      from pg_policy where polname in('prima_lettura_public','seconda_lettura_public') order by polname;
    `);
    expect(esiti.rows).toHaveLength(2);
    expect(esiti.rows[0]).toEqual(esiti.rows[1]);
    expect((await db.query("select polname from pg_policy where polrelid='prima'::regclass and polname in('scrittura','restrittiva')")).rows).toHaveLength(2);
    expect((await db.query("select * from zz_policy_backup")).rows).toHaveLength(6);
  } finally {
    await db.close();
  }
}, 60000);

import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('le quote arrivano dalla vista protetta rispettando importi, pagamenti e visibilità della commessa', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private;
      create table orders(id uuid primary key, company_id uuid);
      create table order_installments(id uuid primary key, order_id uuid, amount numeric, documento_quota_lorda numeric, documento_quota_offset numeric);
      create function private.office_diritti_commessa_visibile(uuid) returns jsonb language sql stable as $$select current_setting('test.rights')::jsonb$$;
      create function private.office_visible_order(uuid) returns boolean language sql stable as $$select current_setting('test.visible')::boolean$$;
      create view order_installments_visibili with(security_barrier=true) as
      select order_installments.id,order_installments.order_id,case when coalesce((r.rights->>'amounts')::boolean,false) then order_installments.amount end amount
      from order_installments order_installments
      cross join lateral (select private.office_diritti_commessa_visibile((select oo.company_id from orders oo where oo.id=order_installments.order_id)) rights offset 0) r
      where private.office_visible_order(order_installments.order_id) and coalesce((r.rights->>'payments')::boolean,false);
      create role authenticated; grant usage on schema public to authenticated; grant select on order_installments_visibili to authenticated;
      insert into orders values('10000000-0000-4000-a000-000000000001','20000000-0000-4000-a000-000000000001');
      insert into order_installments values('30000000-0000-4000-a000-000000000001','10000000-0000-4000-a000-000000000001',300,300,700);
      set test.rights='{"amounts":true,"payments":true}';set test.visible='true';`);
    const sql=readFileSync('supabase/migrations/20290418170003_quote_fattura_rate_vista_protetta.sql','utf8');
    await db.exec(sql);
    await db.exec(sql); // Applicazione ripetuta: stessi campi e stessi grant.
    await db.exec('set role authenticated');
    expect((await db.query('select documento_quota_lorda,documento_quota_offset from order_installments_visibili')).rows).toEqual([{documento_quota_lorda:'300',documento_quota_offset:'700'}]);
    await db.exec(`set test.rights='{"amounts":false,"payments":true}'`);
    expect((await db.query('select amount,documento_quota_lorda,documento_quota_offset from order_installments_visibili')).rows).toEqual([{amount:null,documento_quota_lorda:null,documento_quota_offset:null}]);
    await db.exec(`set test.rights='{"amounts":true,"payments":false}'`);
    expect((await db.query('select * from order_installments_visibili')).rows).toEqual([]);
    await db.exec(`set test.rights='{"amounts":true,"payments":true}';set test.visible='false'`);
    expect((await db.query('select * from order_installments_visibili')).rows).toEqual([]);
  } finally { await db.close(); }
});

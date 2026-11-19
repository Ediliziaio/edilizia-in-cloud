import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

const nome = "20290420110000_scadenzario_fonti_commesse_costi.sql";
const sql = readFileSync(existsSync(`supabase/migrations/${nome}`) ? `supabase/migrations/${nome}` : `docs/migrazioni-pronte/${nome}`, "utf8");
const a = "a0000000-0000-4000-a000-000000000001";
const b = "b0000000-0000-4000-a000-000000000001";
const costo = "c0000000-0000-4000-a000-000000000001";
const ordine = "d0000000-0000-4000-a000-000000000001";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${a}'::uuid$$;
    create function assert_company_access(uuid) returns void language plpgsql as $$begin
      if $1<>'${a}' then raise exception 'Altra azienda' using errcode='42501'; end if;
    end$$;
    create function ai_is_service_role() returns boolean language sql as $$select false$$;
    create function puo_vedere_scadenze(uuid) returns boolean language sql as $$select coalesce(current_setting('test.permesso',true),'si')='si'$$;
    create function user_can_read_accountant_company(uuid) returns boolean language sql as $$select false$$;
    create function has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select true$$;
    create table scadenze(id uuid primary key,company_id uuid,tipo text,direction text,description text,amount numeric,
      due_date date,status text,paid_amount numeric,paid_date date,payment_method text,cost_id uuid,order_id uuid,
      supplier_id uuid,invoice_id uuid,notes text,is_auto_generated boolean,auto_source text,created_at timestamptz,updated_at timestamptz);
    create table company_costs(id uuid primary key,company_id uuid,name text,amount numeric,vat_rate numeric,
      due_date date,is_paid boolean,paid_date date,payment_method text,order_id uuid,supplier_id uuid,annullato_il timestamptz,
      created_at timestamptz default now(),updated_at timestamptz default now());
    create table fatture_ricevute(company_cost_id uuid,company_id uuid,tipo_documento text,totale_documento numeric,stato text);
    create table prima_nota_entries(cost_id uuid,company_id uuid,direction text,amount numeric);
    create table rate_fornitori(id uuid,company_cost_id uuid,company_id uuid,numero int,importo numeric,scadenza date,metodo text,stato text);
    create table orders(id uuid primary key,company_id uuid,order_code text,client_company text,client_name text,
      deleted_at timestamptz,payment_type text,created_at timestamptz default now(),updated_at timestamptz default now());
    create table order_installments(id uuid primary key,order_id uuid,label text,invoice_id uuid,documento_fiscale_id uuid);
    create table test_residui(id text,order_id uuid,amount numeric,expected_date date);
    create function cruscotto_rate_da_incassare(uuid) returns setof test_residui language sql as $$select * from test_residui$$;
    create function costo_stornato_da_note(uuid) returns numeric language sql as $$select 0::numeric$$;
    insert into orders(id,company_id,order_code,client_name) values('${ordine}','${a}','O-DEMO','Cliente demo');
    insert into test_residui values('non-pianificato-${ordine}','${ordine}',500,null);
    insert into company_costs(id,company_id,name,amount,vat_rate,due_date,is_paid)
      values('${costo}','${a}','Spesa demo',100,22,'9999-12-31',false),
      ('c0000000-0000-4000-a000-000000000002','${b}','Altra azienda',999,22,current_date,false);
    insert into prima_nota_entries values('${costo}','${a}','uscita',50),('${costo}','${a}','entrata',10);
  `);
  await db.exec(sql);
}, 20000);
afterAll(async () => { await db?.close(); });
const righe = () => db.query<{ id: string; cost_id: string; amount: number; paid_amount: number; due_date: string | null; status: string; auto_source: string }>(`select * from scadenzario_fonti('${a}') order by auto_source,id`);

it("include commesse senza piano e costi senza data, senza scrivere scadenze", async () => {
  const r = await righe();
  expect(r.rows).toHaveLength(2);
  expect(r.rows.find(x => x.cost_id === costo)).toMatchObject({ amount: '122.00', paid_amount: '40', status: 'parziale', due_date: null });
  expect(r.rows.find(x => x.auto_source === 'fonte_commessa')).toMatchObject({ amount: '500', paid_amount: '0', due_date: null });
  expect((await db.query('select * from scadenze')).rows).toHaveLength(0);
});
it("riepilogo e elenco contano le stesse fonti, senza considerarle scadute", async () => {
  const r = await db.query<{ r: Record<string, number> }>(`select scadenzario_riepilogo_fonti('${a}',current_date,current_date,true) r`);
  expect(r.rows[0].r).toMatchObject({ tutte_count: 2, senza_data_count: 2, scadute_count: 0, entrate_previste: 500, uscite_previste: 82 });
  const dated = await db.query<{ r: Record<string, number> }>(`select scadenzario_riepilogo_fonti('${a}',current_date,current_date,false) r`);
  expect(dated.rows[0].r.tutte_count).toBe(0);
});
it("segue pagamenti e date della fonte alla lettura successiva, con identità stabile", async () => {
  const before = (await righe()).rows.find(x => x.cost_id === costo)!;
  await db.exec(`begin; update company_costs set due_date=current_date where id='${costo}'; insert into prima_nota_entries values('${costo}','${a}','uscita',82);`);
  const after = (await righe()).rows.find(x => x.cost_id === costo)!;
  expect(after.id).toBe(before.id); expect(after.status).toBe('pagata'); expect(Number(after.paid_amount)).toBe(122); expect(after.due_date).not.toBeNull();
  await db.exec('rollback');
});
it("usa il lordo della fattura e le rate fornitore, allocando il pagato una sola volta", async () => {
  await db.exec(`begin;
    insert into fatture_ricevute values('${costo}','${a}','TD01',120,'registrata');
    insert into rate_fornitori values('e0000000-0000-4000-a000-000000000001','${costo}','${a}',1,30,current_date,'MP12','pagata'),
      ('e0000000-0000-4000-a000-000000000002','${costo}','${a}',2,90,current_date+30,'MP12','da_pagare');`);
  const c = (await righe()).rows.filter(x => x.cost_id === costo);
  expect(c).toHaveLength(2); expect(c.reduce((n,x) => n+Number(x.amount),0)).toBe(120);
  expect(c.reduce((n,x) => n+Number(x.paid_amount),0)).toBe(40);
  expect(c.map(x => x.status).sort()).toEqual(['pagata','parziale']);
  await db.exec('rollback');
});
it("non duplica costi e commesse con scadenze esplicite né resuscita costi annullati", async () => {
  await db.exec(`begin; insert into scadenze(id,company_id,direction,cost_id,order_id,status,amount,paid_amount,due_date)
    values('f0000000-0000-4000-a000-000000000001','${a}','entrata','${costo}','${ordine}','da_pagare',120,0,current_date);`);
  expect((await righe()).rows).toHaveLength(1);
  await db.exec(`rollback; begin; update company_costs set annullato_il=now() where id='${costo}';`);
  expect((await righe()).rows).toHaveLength(1);
  await db.exec('rollback');
});
it("nega altre aziende e utenti senza il permesso scadenzario", async () => {
  await expect(db.query(`select * from scadenzario_fonti('${b}')`)).rejects.toMatchObject({ code: '42501' });
  await db.exec("set test.permesso='no'");
  await expect(righe()).rejects.toMatchObject({ code: '42501' });
  await db.exec("set test.permesso='si'");
});
it("è idempotente, invoker e non eseguibile da anon", async () => {
  await db.exec(sql);
  const r = await db.query<{ ok: boolean }>(`select not prosecdef and not has_function_privilege('anon',oid,'EXECUTE') ok from pg_proc where proname='scadenzario_fonti'`);
  expect(r.rows[0].ok).toBe(true); expect((await righe()).rows).toHaveLength(2);
});
it("rispetta le policy delle fonti anche quando il permesso scadenzario è presente", async () => {
  await db.exec(`alter table company_costs enable row level security;
    create policy lettura on company_costs for select to authenticated using(company_id='${a}' and coalesce(current_setting('test.nascondi_costi',true),'no')<>'si');
    grant usage on schema public,auth to authenticated;
    grant select on all tables in schema public to authenticated;
    set role authenticated;`);
  expect((await righe()).rows).toHaveLength(2);
  await db.exec("set test.nascondi_costi='si'");
  const r = await righe();
  expect(r.rows).toHaveLength(1); expect(r.rows[0].auto_source).toBe('fonte_commessa');
  await db.exec("reset role; set test.nascondi_costi='no'");
});

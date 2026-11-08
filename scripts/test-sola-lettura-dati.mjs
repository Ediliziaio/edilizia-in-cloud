import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const c='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select '${c}'::uuid$$;
create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select $1='${c}'::uuid and current_setting('test.access',true)='readonly'$$;
create table prima_nota_entries(id uuid primary key,company_id uuid,description text);
create table invoices(id uuid primary key,company_id uuid);
create table invoice_items(id uuid primary key,invoice_id uuid references invoices(id),amount numeric);
create table active_company_selection(user_id uuid,company_id uuid);
create table bank_sync_logs(id uuid,company_id uuid);
insert into prima_nota_entries values('${c}','${c}','Originale');
insert into invoices values('${c}','${c}');
insert into invoice_items values('${c}','${c}',10);
create function scrivi_nota() returns void language sql security definer as $$insert into prima_nota_entries values('${other}','${c}','RPC')$$;
grant usage on schema auth to authenticated; grant all on all tables in schema public to authenticated;
`);
const migration=readFileSync('supabase/migrations/20290108133010_sola_lettura_dati_aziendali.sql','utf8');
await db.exec(migration); await db.exec(migration);
await db.exec(`set role authenticated; select set_config('test.access','readonly',false)`);
for(const sql of [
 `insert into prima_nota_entries values('${other}','${c}','Nuova')`,
 `update prima_nota_entries set description='Modificata'`,
 `update prima_nota_entries set company_id='${other}'`,
 `delete from prima_nota_entries`,
 `select scrivi_nota()`,
 `insert into invoice_items values('${other}','${c}',20)`,
 `update invoice_items set amount=20`,
 `delete from invoice_items`,
]) await assert.rejects(db.exec(sql),e=>e.code==='42501',sql);
assert.equal((await db.query('select description from prima_nota_entries')).rows[0].description,'Originale');
await db.exec(`insert into active_company_selection values('${c}','${other}'); insert into bank_sync_logs values('${c}','${c}');`);
await db.exec(`select set_config('test.access','writer',false); select scrivi_nota(); update invoice_items set amount=20;`);
assert.equal((await db.query('select count(*)::int n from prima_nota_entries')).rows[0].n,2);
await db.close();
console.log('Sola lettura: dati finanziari, righe fattura, RPC e spostamento azienda bloccati; consultazione, cambio azienda, log e utenti operativi preservati.');

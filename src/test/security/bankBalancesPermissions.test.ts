import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const pg = new PGlite();
const company = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const user = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const account = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
async function actor(balances: boolean, reconcile=true, readOnly=false) {
 await pg.exec(`reset role; update staff_permissions set can_view_bank_balances=${balances},can_reconcile_bank_transactions=${reconcile},sola_lettura=${readOnly};
 select set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',false); set role authenticated;`);
}
beforeAll(async()=>{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'$$;
 create table staff_permissions(user_id uuid,company_id uuid,can_view_tesoreria boolean,can_view_forecast boolean default false,can_view_controllo_gestione boolean default false,can_view_cruscotto boolean default false,can_view_financial_reports boolean default false,sola_lettura boolean default false);
 insert into staff_permissions(user_id,company_id,can_view_tesoreria) values('${user}','${company}',true);
 create function public.utente_bloccato() returns boolean language sql as $$select coalesce(current_setting('test.blocked',true),'')='true'$$;
 create function public.has_permission_for_company(u uuid,p text,c uuid) returns boolean language plpgsql security definer as $$declare result boolean;begin if p='__solo_amministratori__' then return false;end if;execute format('select %I from staff_permissions where user_id=$1 and company_id=$2',p) into result using u,c;return coalesce(result,false);end$$;
 create function public.user_can_read_accountant_company(uuid) returns boolean language sql as $$select false$$;
 create function public.user_can_write_accountant_company(uuid) returns boolean language sql as $$select false$$;
 create table bank_accounts(id uuid primary key,company_id uuid,connection_id uuid,external_account_id text,iban text,bban text,account_name text,account_owner_name text,account_type text,currency text,current_balance numeric,available_balance numeric,opening_balance numeric,balance_updated_at timestamptz,is_active boolean,display_name text,created_at timestamptz,updated_at timestamptz,is_manual boolean);
 insert into bank_accounts(id,company_id,account_name,current_balance,available_balance,opening_balance,is_manual) values('${account}','${company}','Banca prova',987654.32,987600,12345,false),(gen_random_uuid(),'${other}','Altra azienda',876543.21,876500,23456,false);
 create table bank_transactions(id uuid primary key,company_id uuid,account_id uuid references bank_accounts,amount numeric,category text,note text,metadata jsonb default '{}');
 create table bank_reconciliations(id uuid primary key,company_id uuid,transaction_id uuid,invoice_id uuid);
 create table lifecycle_notifications(company_id uuid,notification_type text);
 create table cashflow_forecast_snapshots(id uuid,company_id uuid,starting_balance_eur numeric);
 insert into bank_transactions values(gen_random_uuid(),'${company}','${account}',100,null,null,'{"provider":"saltedge","amount":100,"currency_code":"EUR","extra":{"balance":765432.1}}');
 insert into cashflow_forecast_snapshots values(gen_random_uuid(),'${company}',987654.32);
 alter table bank_accounts enable row level security;alter table bank_transactions enable row level security;alter table bank_reconciliations enable row level security;alter table cashflow_forecast_snapshots enable row level security;
 create policy accounts on bank_accounts for all to authenticated using(company_id='${company}') with check(company_id='${company}');
 create policy transactions_read on bank_transactions for select to authenticated using(company_id='${company}');
 create policy reconciliations_read on bank_reconciliations for select to authenticated using(company_id='${company}');
 create policy snapshot_read on cashflow_forecast_snapshots for select to authenticated using(company_id='${company}');
 grant usage on schema public,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;
 create function public.bank_account_recompute_manual_balance(uuid) returns numeric language sql security definer as $$select 0::numeric$$;
 create function public.get_treasury_summary(p_company_id uuid,p_account_id uuid default null) returns numeric language plpgsql security definer as $$begin return(select sum(current_balance) from bank_accounts where company_id=p_company_id);end$$;
 create function public.get_metric(p_metric_id text,p_filters jsonb,p_aggregation text,p_breakdown text) returns jsonb language plpgsql security definer as $$declare v_company_id uuid:='${company}';begin if p_metric_id='unused' then return null; ELSIF p_metric_id = 'cash_balance' THEN return (select to_jsonb(sum(current_balance)) from bank_accounts where company_id=v_company_id);end if;return null;end$$;`);
 await pg.exec(await readFile("work/tesoreria-saldi/schema.sql","utf8"));
},30_000);
afterAll(()=>pg.close());
describe("saldi riservati: autorizzazione PostgreSQL",()=>{
 it("movimenti e conto restano leggibili, tutti i saldi sono NULL",async()=>{
  await actor(false);
  const rows=(await pg.query<{account_name:string;current_balance:null;available_balance:null;opening_balance:null}>("select * from bank_accounts_operativi")).rows;
  expect(rows).toHaveLength(1);expect(rows[0].account_name).toBe("Banca prova");
  for(const key of ['current_balance','available_balance','opening_balance'] as const)expect(rows[0][key]).toBeNull();
  expect((await pg.query("select * from bank_transactions_operativi")).rows).toHaveLength(1);
  expect((await pg.query("select metadata from bank_transactions_operativi")).rows[0]).toEqual({metadata:{provider:"saltedge",amount:100,currency_code:"EUR"}});
  await expect(pg.query("select metadata from bank_transactions")).rejects.toThrow(/permission denied/);
  await expect(pg.query("select current_balance from bank_accounts")).rejects.toThrow(/permission denied/);
  await expect(pg.query(`select get_treasury_summary('${company}')`)).rejects.toThrow(/permesso/);
  await expect(pg.query("select get_metric('cash_balance','{}',null,null)")).rejects.toThrow(/permesso/);
  expect((await pg.query("select * from cashflow_forecast_snapshots")).rows).toHaveLength(0);
 });
 it("riconcilia senza saldi, senza riscrivere gli importi bancari",async()=>{
  await actor(false);
  await pg.exec("update bank_transactions set category='Materiali'");
  expect((await pg.query("select category from bank_transactions")).rows[0]).toEqual({category:"Materiali"});
  await expect(pg.exec("update bank_transactions set amount=999")).rejects.toThrow(/non si possono riscrivere/);
 });
 it("revoca riconciliazione e sola lettura impediscono le modifiche",async()=>{
  for(const [reconcile,readOnly] of [[false,false],[true,true]]){
   await actor(false,reconcile,readOnly);
   const result=await pg.query("update bank_transactions set category='VIETATO' returning id");
   expect(result.rows).toHaveLength(0);
  }
 });
 it("autorizzare e poi revocare i saldi cambia anche API e riepilogo",async()=>{
  await actor(true);
  expect((await pg.query<{current_balance:string}>("select current_balance from bank_accounts_operativi")).rows[0].current_balance).toBe("987654.32");
  expect((await pg.query(`select get_treasury_summary('${company}') as balance`)).rows[0]).toEqual({balance:"987654.32"});
  await actor(false);
  expect((await pg.query("select current_balance from bank_accounts_operativi")).rows[0]).toEqual({current_balance:null});
 });
 it("utente bloccato e altra azienda non ricevono conti",async()=>{
  await actor(true);await pg.exec("select set_config('test.blocked','true',false)");
  expect((await pg.query("select * from bank_accounts_operativi")).rows).toHaveLength(0);
  await pg.exec("select set_config('test.blocked','false',false)");
 });
});

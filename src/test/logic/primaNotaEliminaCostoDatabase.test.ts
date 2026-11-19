import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
const a="a0000000-0000-4000-a000-000000000001", b="b0000000-0000-4000-a000-000000000001";
const id=(n:number)=>`c0000000-0000-4000-a000-${String(n).padStart(12,"0")}`;
const cost=id(1),p1=id(10),p2=id(11),storno=id(12),version="2026-11-19T10:00:00Z";
const nome="20290421121000_prima_nota_elimina_registrazione.sql";
const sql=readFileSync(existsSync(`supabase/migrations/${nome}`)?`supabase/migrations/${nome}`:`docs/migrazioni-pronte/${nome}`,"utf8");
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create schema auth;create schema private;create role authenticated;create role anon;create role service_role;
 create type app_role as enum('super_admin');
 create function auth.uid() returns uuid language sql as $$select '${id(999)}'::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select '{"role":"authenticated"}'::jsonb$$;
 create function user_can_access_company(uuid) returns boolean language sql as $$select $1='${a}'$$;
 create function e_amministratore_di(uuid) returns boolean language sql as $$select $1='${a}' and coalesce(current_setting('test.admin',true),'yes')='yes'$$;
 create function has_role(uuid,app_role) returns boolean language sql as $$select false$$;
 create function utente_bloccato() returns boolean language sql as $$select current_setting('test.blocked',true)='yes'$$;
 create function utente_sola_lettura(uuid) returns boolean language sql as $$select coalesce(current_setting('test.readonly',true),'no')='yes'$$;
 create function puo_vedere_costi(uuid,uuid) returns boolean language sql as $$select $2='${a}'$$;
 create function user_can_write_accountant_company(uuid) returns boolean language sql as $$select false$$;
 create function costo_stornato_da_note(uuid) returns numeric language sql as $$select 0::numeric$$;
 create table companies(id uuid primary key);insert into companies values('${a}'),('${b}');
 create table company_costs(id uuid primary key,company_id uuid,name text,amount numeric,vat_rate numeric,is_paid boolean default false,paid_date date,annullato_il timestamptz,due_date date,updated_at timestamptz);
 create table prima_nota_entries(id uuid primary key,company_id uuid,cost_id uuid,invoice_id uuid,is_auto boolean default false,auto_source text,direction text,amount numeric,
 entry_date date,updated_at timestamptz default '${version}',bank_transaction_id uuid,documento_fiscale_id uuid,movimento_id uuid,unita_movimento_id uuid,sal_sub_id uuid,
 payment_request_id uuid,description text,scadenza_id uuid,reversal_of uuid references prima_nota_entries(id));
 create table scadenze(id uuid primary key,company_id uuid,cost_id uuid,direction text,amount numeric,paid_amount numeric,status text,due_date date,paid_date date,
 prima_nota_entry_id uuid references prima_nota_entries(id) on delete set null);
 create table fatture_ricevute(company_id uuid,company_cost_id uuid,tipo_documento text,totale_documento numeric,stato text,pagata_il date,pagamento_segnato_da uuid,pagamento_segnato_at timestamptz);
 create table invoice_payments(company_id uuid,reference text);
 create table sal_sub_pagamenti(prima_nota_id uuid references prima_nota_entries(id));
 create table bank_reconciliations(prima_nota_id uuid,unmatched_at timestamptz);
 create table unita_movimenti(prima_nota_id uuid,storno_prima_nota_id uuid);
 create table rate_fornitori(id uuid primary key,company_id uuid,company_cost_id uuid,stato text,importo numeric,pagata_il date,scadenza date);
 grant usage on schema auth,public,private to authenticated;
 grant select,insert,update,delete on all tables in schema public to authenticated;
 alter table prima_nota_entries enable row level security;
 create policy lettura on prima_nota_entries for select to authenticated using(company_id='${a}');
 create policy aggiornamento on prima_nota_entries for update to authenticated using(company_id='${a}');
 create policy scrittura on prima_nota_entries for delete to authenticated using(company_id='${a}' and coalesce(current_setting('test.deny_delete',true),'no')<>'yes');
 `);
 await db.exec(readFileSync("src/test/fixtures/finance-deletion-helpers.sql","utf8"));
 await db.exec(`create trigger costo_rate after update of is_paid on company_costs for each row execute function costo_allinea_rate_fornitori();
 create trigger rate_costo after update on rate_fornitori for each row execute function rate_fornitori_allinea_costo();`);
 await db.exec(sql);
},20000);
afterAll(async()=>{await db.close()});
beforeEach(async()=>{await db.exec(`begin;set local test.blocked='no';set local test.admin='yes';set local test.readonly='no';set local test.deny_delete='no';insert into company_costs(id,company_id,name,amount,vat_rate,due_date) values('${cost}','${a}','Costo demo',100,22,current_date);`)});
afterEach(async()=>{await db.exec("rollback")});
async function payment(pid:string,amount:number,extra=""){
 await db.exec(`insert into prima_nota_entries(id,company_id,cost_id,is_auto,auto_source,direction,amount,entry_date,description,payment_request_id${extra?",reversal_of":""})
 values('${pid}','${a}','${cost}',true,'${extra?"storno_pagamento":"company_cost_payment"}','${extra?"entrata":"uscita"}',${amount},current_date,'Pagamento demo','${pid}'${extra?",'"+extra+"'":""});`);
}
async function remove(pid=p1,v=version){
 await db.exec("savepoint operazione");
 try{const r=await db.query<{r:Record<string,unknown>}>("select prima_nota_elimina_registrazione($1,$2) r",[pid,v]);await db.exec("release savepoint operazione");return r.rows[0].r}
 catch(e){await db.exec("rollback to savepoint operazione;release savepoint operazione");throw e}
}
const count=async(table:string)=>(await db.query<{n:number}>(`select count(*)::int n from ${table}`)).rows[0].n;
it("elimina l'ultimo pagamento e riapre costo, scadenza, rata e fattura nella stessa operazione",async()=>{
 await payment(p1,122);
 await db.exec(`insert into rate_fornitori values('${id(20)}','${a}','${cost}','da_pagare',122,null,current_date);
 insert into fatture_ricevute(company_id,company_cost_id,totale_documento) values('${a}','${cost}',122);
 insert into scadenze values('${id(21)}','${a}','${cost}','uscita',122,122,'pagata',current_date,current_date,'${p1}');
 update company_costs set is_paid=true,paid_date=current_date where id='${cost}';set local role authenticated;`);
 expect((await remove()).eliminata).toBe(true);
 expect(await count('prima_nota_entries')).toBe(0);
 expect((await db.query<{is_paid:boolean}>("select is_paid from company_costs")).rows[0].is_paid).toBe(false);
 expect((await db.query<{status:string;paid_amount:number}>("select status,paid_amount from scadenze")).rows[0]).toMatchObject({status:'da_pagare',paid_amount:'0'});
 expect((await db.query<{stato:string}>("select stato from rate_fornitori")).rows[0].stato).toBe('da_pagare');
 expect((await db.query<{pagata_il:string|null}>("select pagata_il from fatture_ricevute")).rows[0].pagata_il).toBeNull();
 expect(await count('prima_nota_cancellazioni')).toBe(1);
});
it("elimina solo l'acconto sbagliato conservando gli altri pagamenti e il residuo",async()=>{
 await payment(p1,100);await payment(p2,22);
 await db.exec(`update company_costs set is_paid=true where id='${cost}';set local role authenticated;`);
 await remove();
 expect(await count('prima_nota_entries')).toBe(1);
 expect((await db.query<{amount:string}>("select amount from prima_nota_entries")).rows[0].amount).toBe('22');
 expect((await db.query<{is_paid:boolean}>("select is_paid from company_costs")).rows[0].is_paid).toBe(false);
});
it("rimuove originale e storno collegato senza toccare altri pagamenti",async()=>{
 await payment(p1,100);await payment(storno,100,p1);await payment(p2,22);
 await db.exec('set local role authenticated');
 expect((await remove()).eliminati_ids).toEqual([p1,storno]);
 expect(await count('prima_nota_entries')).toBe(1);expect(await count('prima_nota_cancellazioni')).toBe(2);
 expect((await remove(storno)).gia_eliminata).toBe(true);
});
it("eliminando solo lo storno ripristina l'effetto del pagamento originale",async()=>{
 await payment(p1,122);await payment(storno,122,p1);await db.exec('set local role authenticated');
 await remove(storno);expect(await count('prima_nota_entries')).toBe(1);
 expect((await db.query<{is_paid:boolean}>("select is_paid from company_costs")).rows[0].is_paid).toBe(true);
});
it("elimina la coppia già stornata anche su un costo annullato senza riattivarlo",async()=>{
 await payment(p1,122);await payment(storno,122,p1);
 await db.exec(`update company_costs set annullato_il=now() where id='${cost}';set local role authenticated;`);
 await remove();expect(await count('prima_nota_entries')).toBe(0);
 expect((await db.query("select is_paid,annullato_il is not null annullato from company_costs")).rows[0]).toMatchObject({is_paid:false,annullato:true});
});
it("mantiene la cancellazione manuale e toglie solo il proprio incasso dalla fattura importata",async()=>{
 await db.exec(`insert into prima_nota_entries(id,company_id,direction,amount,invoice_id) values('${p1}','${a}','entrata',50,'${id(80)}');
 insert into invoice_payments values('${a}','prima_nota:${p1}'),('${a}','altro-incasso');set local role authenticated;`);
 await remove();expect(await count('prima_nota_entries')).toBe(0);expect(await count('invoice_payments')).toBe(1);
 expect(await count('prima_nota_cancellazioni')).toBe(1);
});
it("protegge anche un collegamento bancario esterno non riportato sulla riga manuale",async()=>{
 await db.exec(`insert into prima_nota_entries(id,company_id,direction,amount) values('${p1}','${a}','entrata',50);
 insert into bank_reconciliations values('${p1}',null);set local role authenticated;`);
 await expect(remove()).rejects.toMatchObject({code:'P0001'});expect(await count('prima_nota_entries')).toBe(1);
});
it("blocca una vecchia richiesta di pagamento ritentata dopo l'eliminazione",async()=>{
 await payment(p1,100);await db.exec('set local role authenticated');await remove();
 await db.exec('reset role');
 await expect(payment(p1,100)).rejects.toMatchObject({code:'P0001'});
});
it("può correggere un pagamento errato che aveva superato il totale",async()=>{
 await payment(p1,200);await payment(p2,22);await db.exec('set local role authenticated');
 await remove();expect((await db.query<{amount:string}>("select amount from prima_nota_entries")).rows[0].amount).toBe('22');
});
it("rifiuta una versione superata prima di eliminare dati",async()=>{
 await payment(p1,100);await db.exec('set local role authenticated');
 await expect(remove(p1,'2020-01-01')).rejects.toMatchObject({code:'PT409'});
 expect(await count('prima_nota_entries')).toBe(1);expect(await count('prima_nota_cancellazioni')).toBe(0);
});
it.each(['blocked','readonly','admin','deny_delete'])("permessi %s: nessun delete o archivio parziale",async key=>{
 await payment(p1,100);await db.exec(`set local test.${key}='${key==='admin'?'no':'yes'}';set local role authenticated;`);
 await expect(remove()).rejects.toMatchObject({code:'42501'});
 expect(await count('prima_nota_entries')).toBe(1);expect(await count('prima_nota_cancellazioni')).toBe(0);
});
it.each(['bank_transaction_id','documento_fiscale_id','sal_sub_id','unita_movimento_id'])("non scollega di nascosto l'origine protetta %s",async campo=>{
 await payment(p1,100);await db.exec(`update prima_nota_entries set ${campo}='${id(90)}' where id='${p1}';set local role authenticated;`);
 await expect(remove()).rejects.toMatchObject({code:'P0001'});expect(await count('prima_nota_entries')).toBe(1);
});
it("non modifica pagati storici privi di una prima nota coerente",async()=>{
 await payment(p1,22);await db.exec(`update company_costs set is_paid=true where id='${cost}';set local role authenticated;`);
 await expect(remove()).rejects.toMatchObject({code:'P0001'});expect(await count('prima_nota_entries')).toBe(1);
});
it("con più rate già chiuse richiede l'individuazione della rata corretta",async()=>{
 await payment(p1,100);await payment(p2,22);await db.exec(`insert into rate_fornitori values
 ('${id(30)}','${a}','${cost}','pagata',100,current_date,current_date),('${id(31)}','${a}','${cost}','pagata',22,current_date,current_date);
 update company_costs set is_paid=true where id='${cost}';set local role authenticated;`);
 await expect(remove()).rejects.toMatchObject({code:'P0001'});expect(await count('prima_nota_entries')).toBe(2);
});
it("isola le aziende anche in caso di UUID conosciuto",async()=>{
 await db.exec(`insert into prima_nota_entries(id,company_id,direction,amount) values('${p1}','${b}','uscita',100);set local role authenticated;`);
 await expect(remove()).rejects.toMatchObject({code:'P0002'});
});
it("la migrazione è idempotente e le RPC non sono aperte ad anon",async()=>{
 await db.exec(sql);
 const r=await db.query<{ok:boolean}>("select not has_function_privilege('anon',oid,'EXECUTE') ok from pg_proc where proname='prima_nota_elimina_registrazione'");
 expect(r.rows[0].ok).toBe(true);
});

// Esegue solo contro un Postgres isolato; nessuna connessione ai dati aziendali.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const container = process.env.EIC_TEST_PG_CONTAINER;
if (container !== "eic-fatture-ai-pg")
  throw new Error("Usa il container isolato eic-fatture-ai-pg");
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20290218162000_riconciliazione_fatture_ai.sql",
    import.meta.url,
  ),
  "utf8",
);
const revisioni = readFileSync(
  new URL(
    "../supabase/migrations/20290218163000_riconciliazione_fatture_revisioni_concorrenti.sql",
    import.meta.url,
  ),
  "utf8",
);
const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-a000-000000000001`;
const a = id(1),
  b = id(2),
  u = id(3),
  f = id(4),
  f2 = id(5),
  d = id(6),
  d2 = id(7),
  o = id(8),
  r = id(9),
  s = id(10),
  altra = id(11),
  analisi = id(12), f3 = id(13), analisi2 = id(14);
const docs = JSON.stringify({ ddt: [d], oda: [o] });
const sql = `begin;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
insert into auth.users(id) values('${u}');
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('qa.user_id',true),'')::uuid $$;
create table public.companies(id uuid primary key);
insert into companies values('${a}'),('${b}');
create table public.qa_permessi(user_id uuid,company_id uuid,can_view_costs boolean,can_manage_purchasing boolean,sola_lettura boolean);
insert into qa_permessi values('${u}','${a}',false,true,false);
create or replace function public.aziende_con_permesso(p text) returns uuid[] language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(company_id),'{}') from qa_permessi where user_id=auth.uid() and case p when 'can_view_costs' then can_view_costs when 'can_manage_purchasing' then can_manage_purchasing else false end $$;
create or replace function public.utente_sola_lettura(p uuid) returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select sola_lettura from qa_permessi where company_id=p and user_id=auth.uid()),false) $$;
create or replace function public.utente_bloccato() returns boolean language sql stable as $$ select coalesce(current_setting('qa.bloccato',true),'false')='true' $$;
create or replace function public.utente_e_cliente_esterno() returns boolean language sql stable as $$ select coalesce(current_setting('qa.esterno',true),'false')='true' $$;
create or replace function public.e_super_admin_dentro(p uuid) returns boolean language sql stable as $$ select false $$;
create table public.fatture_ricevute(id uuid primary key,company_id uuid,fornitore_id uuid,tipo_documento text,righe jsonb);
create table public.ddt_ricezione(id uuid primary key,company_id uuid,supplier_id uuid,numero_ddt text,stato text);
create table public.purchase_orders(id uuid primary key,company_id uuid,supplier_id uuid,oda_number text,status text);
create table public.ddt_righe(id uuid primary key,company_id uuid,ddt_ricezione_id uuid,posizione int,codice_articolo text,descrizione text,unita_misura text,quantita numeric,prezzo_unitario numeric,importo numeric);
create table public.purchase_order_items(id uuid primary key,company_id uuid,purchase_order_id uuid,sort_order int,sku text,description text,unit_of_measure text,quantity numeric,unit_price numeric,price_pending boolean,discount_percent numeric,line_total numeric);
create table public.ddt_valorizzazioni(id uuid primary key,company_id uuid,ddt_id uuid,riga_id uuid,fattura_id uuid,quantita numeric);
create table public.fattura_ddt(id uuid primary key,company_id uuid,ddt_ricezione_id uuid,fattura_ricevuta_id uuid);
create table public.ai_router_config(task_key text unique,task_label text,task_description text,primary_model text,fallback_models jsonb,default_params jsonb,category text,enabled boolean,tier_key text);
insert into ai_router_config(task_key,primary_model) values('ddt_ocr','modello-configurato');
insert into fatture_ricevute values('${f}','${a}','${s}','TD01','[{"numero_linea":1,"descrizione":"Materiale","quantita":10}]'),('${f2}','${b}','${s}','TD01','[]'),('${f3}','${a}','${s}','TD01','[{"numero_linea":1,"descrizione":"Materiale","quantita":10}]');
insert into ddt_ricezione values('${d}','${a}','${s}','TEST-1','ricevuto'),('${d2}','${b}','${s}','TEST-2','ricevuto');
insert into ddt_righe(id,company_id,ddt_ricezione_id,posizione,descrizione,quantita) values('${r}','${a}','${d}',1,'Materiale',10);
insert into purchase_orders values('${o}','${a}','${s}','TEST-ODA','ordered');
grant usage on schema public,auth to authenticated;
${migration}
${migration}
${revisioni}
${revisioni}
set local qa.user_id='${u}';
insert into fattura_riconciliazioni_ai(id,company_id,fattura_id,impronta,documenti,proposta,esiti,modello,created_by)
 values('${analisi}','${a}','${f}',public.fattura_riconciliazione_contesto('${f}','${docs}')->>'impronta','${docs}', '{"righe":[{"fattura":"1","ddt":["${r}"],"oda":[]}]}','[]','test','${u}');
insert into fattura_riconciliazioni_ai(id,company_id,fattura_id,impronta,documenti,proposta,esiti,modello,created_by)
 values('${analisi2}','${a}','${f3}',public.fattura_riconciliazione_contesto('${f3}','${docs}')->>'impronta','${docs}','{"righe":[{"fattura":"1","ddt":["${r}"],"oda":[]}]}','[]','test','${u}');
create function public.qa_nega(q text,c text default '42501') returns void language plpgsql as $$begin
 begin execute q; exception when others then if sqlstate=c then return; end if; raise; end;
 raise exception 'Azione non negata: %',q;
end $$;
set local role authenticated;
do $$declare c jsonb;r jsonb; begin
 c:=public.fattura_riconciliazione_contesto('${f}','${docs}');
 assert c->'contesto'->'ddt'->0->'righe'->0->>'id'='${r}';
 assert (select count(*)=2 from fattura_riconciliazioni_ai);
 r:=public.fattura_riconciliazione_salva('${analisi}',0,'{"1":"accettata"}');
 assert (r->>'revisione')::int=1 and r->'decisioni'->>'1'='accettata';
end $$;
select public.qa_nega($q$select public.fattura_riconciliazione_salva('${analisi2}',0,'{"1":"accettata"}')$q$,'PT409');
do $$begin assert public.fattura_riconciliazione_contesto('${f3}','${docs}')->'contesto'->'revisioni_precedenti'->0->>'riga_id'='${r}';end $$;
select public.qa_nega($q$select public.fattura_riconciliazione_salva('${analisi}',0,'{"1":"rifiutata"}')$q$,'PT409');
select public.qa_nega($q$select public.fattura_riconciliazione_salva('${analisi}',1,'{"estranea":"accettata"}')$q$,'22023');
select public.qa_nega($q$select public.fattura_riconciliazione_salva('${analisi}',1,'{"1":"inventata"}')$q$,'22023');
select public.qa_nega($q$select public.fattura_riconciliazione_contesto('${f2}','${docs}')$q$);
select public.qa_nega($q$select public.fattura_riconciliazione_contesto('${f}','{"ddt":["${d2}"],"oda":[]}')$q$);
select public.qa_nega($q$update fattura_riconciliazioni_ai set proposta='{}'$q$);
reset role; update qa_permessi set sola_lettura=true; set local role authenticated;
do $$begin assert (select count(*)=2 from fattura_riconciliazioni_ai); end $$;
select public.qa_nega($q$select public.fattura_riconciliazione_salva('${analisi}',1,'{"1":"accettata"}')$q$);
reset role; update qa_permessi set sola_lettura=false; set local role authenticated;
set local qa.esterno='true';
select public.qa_nega($q$select public.fattura_riconciliazione_contesto('${f}','${docs}')$q$);
do $$begin assert (select count(*)=0 from fattura_riconciliazioni_ai); end $$;
set local qa.esterno='false'; set local qa.bloccato='true';
select public.qa_nega($q$select public.fattura_riconciliazione_contesto('${f}','${docs}')$q$);
set local qa.bloccato='false';
reset role; update ddt_righe set quantita=9 where id='${r}'; set local role authenticated;
select public.qa_nega($q$select public.fattura_riconciliazione_salva('${analisi}',1,'{"1":"accettata"}')$q$,'PT409');
reset role; update ddt_ricezione set supplier_id='${altra}' where id='${d}'; set local role authenticated;
select public.qa_nega($q$select public.fattura_riconciliazione_contesto('${f}','${docs}')$q$);
do $$begin assert not has_function_privilege('anon','public.fattura_riconciliazione_contesto(uuid,jsonb)','execute'); end $$;
reset role;
rollback;`;
const output = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
if (!output.includes("ROLLBACK"))
  throw new Error("Transazione di prova non annullata");
console.log(
  "PASS: isolamento aziendale, permessi acquisti, sola lettura, esterni, blocco, revisione concorrente, modifiche ai documenti e nessuna scrittura diretta. Tutti i dati annullati.",
);

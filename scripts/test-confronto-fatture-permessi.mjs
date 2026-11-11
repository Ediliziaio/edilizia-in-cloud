// Collaudo isolato. Richiede un container PostgreSQL DI TEST, senza dati aziendali.
// EIC_TEST_PG_CONTAINER=eic-fatture-confronto-pg node scripts/test-confronto-fatture-permessi.mjs
// Tutto è in una transazione che viene annullata; non si connette a Supabase.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const container = process.env.EIC_TEST_PG_CONTAINER;
if (!container || !/^eic-fatture-confronto-pg$/.test(container)) throw new Error("Usa il container isolato eic-fatture-confronto-pg");
const migrazione = readFileSync(new URL("../supabase/migrations/20290218161000_confronto_fatture_permessi_acquisti.sql", import.meta.url), "utf8");
const originale = readFileSync(new URL("../supabase/migrations/20281123100000_fattura_mezzi_e_ddt.sql", import.meta.url), "utf8");
const guardia = originale.slice(originale.indexOf("create or replace function public.fattura_legame_stessa_azienda"), originale.indexOf("-- RLS"));
// Solo funzione/trigger di isolamento, esclusi gli oggetti creati più avanti nel file.
const funzioneGuardia = guardia.slice(0, guardia.indexOf("drop policy"));
const a = "11111111-1111-4111-a111-111111111111", b = "22222222-2222-4222-a222-222222222222";
const u = "33333333-3333-4333-a333-333333333333", f = "44444444-4444-4444-a444-444444444444", f2 = "55555555-5555-4555-a555-555555555555";
const m = "66666666-6666-4666-a666-666666666666", m2 = "77777777-7777-4777-a777-777777777777";
const sql = `begin;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('qa.user_id',true),'')::uuid $$;
create table public.qa_permessi(user_id uuid,company_id uuid,can_view_costs boolean,can_manage_purchasing boolean,sola_lettura boolean);
insert into qa_permessi values('${u}','${a}',false,true,false);
create or replace function public.aziende_con_permesso(p text) returns uuid[] language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(company_id),'{}') from qa_permessi where user_id=auth.uid() and case p when 'can_view_costs' then can_view_costs when 'can_manage_purchasing' then can_manage_purchasing else false end $$;
create or replace function public.utente_sola_lettura(p uuid) returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select sola_lettura from qa_permessi where company_id=p and user_id=auth.uid()),false) $$;
create or replace function public.utente_bloccato() returns boolean language sql stable as $$ select coalesce(current_setting('qa.bloccato',true),'false')='true' $$;
create or replace function public.utente_e_cliente_esterno() returns boolean language sql stable as $$ select coalesce(current_setting('qa.esterno',true),'false')='true' $$;
create or replace function public.e_super_admin_dentro(p uuid) returns boolean language sql stable as $$ select false $$;
create table public.fatture_ricevute(id uuid primary key,company_id uuid,verifica_manuale text,rettifica_motivo text,verifica_da uuid,verifica_at timestamptz);
create table public.mezzi(id uuid primary key,company_id uuid);
create table public.ddt_ricezione(id uuid primary key,company_id uuid);
create table public.fattura_ddt(id uuid primary key default gen_random_uuid(),company_id uuid,fattura_ricevuta_id uuid,numero_ddt text,data_ddt date,ddt_ricezione_id uuid);
create table public.fattura_ricevuta_mezzi(id uuid primary key default gen_random_uuid(),company_id uuid,fattura_ricevuta_id uuid,mezzo_id uuid,confermata boolean default false);
create table public.rate_fornitori(fattura_ricevuta_id uuid,metodo text,stato text);
insert into public.fatture_ricevute(id,company_id) values('${f}','${a}'),('${f2}','${b}');
insert into public.mezzi values('${m}','${a}'),('${m2}','${b}');
insert into public.ddt_ricezione values('${m}','${a}'),('${m2}','${b}');
alter table public.fattura_ddt enable row level security;
alter table public.fattura_ricevuta_mezzi enable row level security;
create policy blocco_utente_bloccato on public.fattura_ddt as restrictive for all to authenticated using(not public.utente_bloccato()) with check(not public.utente_bloccato());
create policy blocco_utente_bloccato on public.fattura_ricevuta_mezzi as restrictive for all to authenticated using(not public.utente_bloccato()) with check(not public.utente_bloccato());
grant usage on schema public,auth to authenticated;
grant select,insert,update,delete on public.fattura_ddt,public.fattura_ricevuta_mezzi to authenticated;
grant select on public.fatture_ricevute,public.mezzi,public.ddt_ricezione to authenticated;
${funzioneGuardia}
${migrazione}
revoke all on function public.fattura_segna_verifica(uuid,boolean),public.fattura_segna_rettifica(uuid,text) from public,anon;
grant execute on function public.fattura_segna_verifica(uuid,boolean),public.fattura_segna_rettifica(uuid,text) to authenticated;
${migrazione}
create function public.qa_deve_negare(q text) returns void language plpgsql as $$begin
 begin execute q; exception when insufficient_privilege then return; end;
 raise exception 'AZIONE NON NEGATA: %',q;
end $$;
set local qa.user_id='${u}'; set local role authenticated;
do $$declare r jsonb; begin
 r:=public.fattura_segna_verifica('${f}',true);
 assert r->>'fattura_id'='${f}' and (r->>'verificata')::boolean;
 assert (select verifica_manuale='verificata' and verifica_da='${u}'::uuid from fatture_ricevute where id='${f}');
 perform public.fattura_segna_verifica('${f}',false);
 assert (select verifica_manuale='da_verificare' from fatture_ricevute where id='${f}');
 perform public.fattura_segna_rettifica('${f}','Quantità errata');
 assert (select verifica_manuale='da_rettificare' and rettifica_motivo='Quantità errata' from fatture_ricevute where id='${f}');
end $$;
insert into public.fattura_ddt(company_id,fattura_ricevuta_id,numero_ddt,ddt_ricezione_id) values('${a}','${f}','DDT-QA','${m}');
insert into public.fattura_ricevuta_mezzi(company_id,fattura_ricevuta_id,mezzo_id) values('${a}','${f}','${m}');
update public.fattura_ricevuta_mezzi set confermata=true where mezzo_id='${m}';
do $$begin assert (select count(*)=1 from fattura_ddt); assert (select confermata from fattura_ricevuta_mezzi);end $$;
select public.qa_deve_negare($q$select public.fattura_segna_verifica('${f2}',true)$q$);
select public.qa_deve_negare($q$insert into public.fattura_ddt(company_id,fattura_ricevuta_id,numero_ddt,ddt_ricezione_id) values('${b}','${f2}','ALTRA','${m2}')$q$);
select public.qa_deve_negare($q$insert into public.fattura_ricevuta_mezzi(company_id,fattura_ricevuta_id,mezzo_id) values('${a}','${f}','${m2}')$q$);
select public.qa_deve_negare($q$insert into public.fattura_ddt(company_id,fattura_ricevuta_id,numero_ddt,ddt_ricezione_id) values('${a}','${f}','ALTRA','${m2}')$q$);
reset role; update qa_permessi set sola_lettura=true; set local role authenticated;
select public.qa_deve_negare($q$select public.fattura_segna_verifica('${f}',true)$q$);
select public.qa_deve_negare($q$select public.fattura_segna_rettifica('${f}','No')$q$);
select public.qa_deve_negare($q$insert into public.fattura_ddt(company_id,fattura_ricevuta_id,numero_ddt) values('${a}','${f}','NON-SALVARE')$q$);
reset role; update qa_permessi set sola_lettura=false; set local role authenticated; set local qa.bloccato='true';
select public.qa_deve_negare($q$select public.fattura_segna_verifica('${f}',true)$q$);
select public.qa_deve_negare($q$insert into public.fattura_ricevuta_mezzi(company_id,fattura_ricevuta_id,mezzo_id) values('${a}','${f}','${m}')$q$);
set local qa.bloccato='false'; set local qa.esterno='true';
select public.qa_deve_negare($q$select public.fattura_segna_verifica('${f}',true)$q$);
set local qa.esterno='false'; set local qa.user_id='';
select public.qa_deve_negare($q$select public.fattura_segna_verifica('${f}',true)$q$);
reset role; update qa_permessi set can_manage_purchasing=false; set local qa.user_id='${u}'; set local role authenticated;
select public.qa_deve_negare($q$select public.fattura_segna_verifica('${f}',true)$q$);
do $$begin assert (select count(*)=0 from fattura_ddt); assert not has_function_privilege('anon','public.fattura_segna_verifica(uuid,boolean)','execute');end $$;
reset role; update qa_permessi set can_view_costs=true; set local role authenticated;
do $$begin perform public.fattura_segna_verifica('${f}',true); assert (select count(*)=1 from fattura_ddt);end $$;
delete from public.fattura_ddt where fattura_ricevuta_id='${f}';
delete from public.fattura_ricevuta_mezzi where fattura_ricevuta_id='${f}';
do $$begin assert (select count(*)=0 from fattura_ddt); assert (select count(*)=0 from fattura_ricevuta_mezzi);end $$;
rollback;
`;
try {
  execFileSync("docker", ["exec", "-i", container, "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  console.log("PASS: permesso Acquisti senza Costi; verifica/rettifica persistenti; link DDT/mezzi; isolamento aziendale; guardie mezzi/DDT; sola lettura; bloccato; esterno; anonimo; nessun permesso; permesso Costi; rimozione; migrazione idempotente. Tutto annullato.");
} catch (e) { console.error(String(e.stderr ?? e.message)); process.exitCode = 1; }

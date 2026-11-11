import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
if (process.env.EIC_TEST_PG_CONTAINER !== "eic-fatture-ai-pg")
  throw new Error("Usa il database isolato eic-fatture-ai-pg");
execFileSync(
  process.execPath,
  ["scripts/test-riconciliazione-fatture-ai.mjs"],
  { env: { ...process.env, EIC_TEST_PG_EMIT_SQL: "/tmp/eic-base-rico.sql" } },
);
let sql = readFileSync("/tmp/eic-base-rico.sql", "utf8");
const a = "00000001-0000-4000-a000-000000000001",
  f = "00000004-0000-4000-a000-000000000001",
  d = "00000006-0000-4000-a000-000000000001",
  r = "00000009-0000-4000-a000-000000000001",
  supplier = "00000010-0000-4000-a000-000000000001",
  analisi = "00000012-0000-4000-a000-000000000001";
const migrazione = readFileSync(
  "supabase/migrations/20290312120000_riconciliazione_fatture_completamento.sql",
  "utf8",
);
const ordineStabile = readFileSync(
  "supabase/migrations/20290312121000_riconciliazione_impronta_stabile.sql",
  "utf8",
);
const anchor = "set local qa.user_id='00000003-0000-4000-a000-000000000001';";
sql = sql.replace(
  anchor,
  () => `create table suppliers(id uuid primary key,company_id uuid);insert into suppliers values('${supplier}','${a}');
alter table ddt_ricezione add column data_ricezione date default '2026-11-11';
alter table fattura_ddt alter column id set default gen_random_uuid();
alter table fattura_ddt add column numero_ddt text,add column data_ddt date,add column origine text,add column created_by uuid;
alter table suppliers add column vat_number text;
alter table fatture_ricevute add column cedente_piva text,add column numero_fattura text;
alter table ddt_valorizzazioni add column prezzo_unitario numeric,add column created_by uuid;
alter table ddt_valorizzazioni alter column id set default gen_random_uuid();
create table orders(id uuid primary key,company_id uuid);
create table order_items(id uuid primary key,order_id uuid,ddt_riga_origine_id uuid,purchase_price numeric,prezzo_da_definire boolean,updated_at timestamptz);
create function user_can_access_company(p uuid) returns boolean language sql stable as $$select p=any(aziende_con_permesso('can_manage_purchasing')||aziende_con_permesso('can_view_costs'))$$;
create function has_permission_for_company(u uuid,p text,c uuid) returns boolean language sql stable as $$select c=any(aziende_con_permesso(p))$$;
${migrazione}\n${ordineStabile}\n${ordineStabile}\n${anchor}`,
);
const extra = `
update ddt_ricezione set supplier_id='${supplier}' where id='${d}';
update ddt_righe set quantita=10,unita_misura='kg' where id='${r}';
update fatture_ricevute set righe='[{"numero_linea":1,"descrizione":"Adesivo bianco A81","quantita":2,"unita_misura":"sacco"}]' where id='${f}';
update fattura_riconciliazioni_ai set decisioni='{"1":"accettata"}',impronta=fattura_riconciliazione_contesto('${f}',documenti)->>'impronta' where id='${analisi}';
set local role authenticated;
select fattura_riconciliazione_ricorda('${analisi}',1,'{"1":"accettata"}',true);
select qa_nega($q$select fattura_riconciliazione_imputa('${analisi}',fattura_riconciliazione_contesto('${f}',documenti)->>'impronta','[{"fattura_riga":"1","ddt_riga":"${r}","quantita_fattura":2,"fattore":5}]',revisione,true) from fattura_riconciliazioni_ai where id='${analisi}'$q$,'22023');
select fattura_riconciliazione_imputa('${analisi}',fattura_riconciliazione_contesto('${f}',documenti)->>'impronta','[{"fattura_riga":"1","ddt_riga":"${r}","quantita_fattura":2,"fattore":5,"conferma_conversione":true,"ricorda_conversione":true}]',revisione,true) from fattura_riconciliazioni_ai where id='${analisi}';
do $$begin assert(select sum(quantita_ddt)=10 from fattura_ddt_quantita where fattura_id='${f}');assert(select count(*)=1 from fattura_conversioni_fornitore);assert(select count(*)=1 from fattura_equivalenze_fornitore);end $$;
select qa_nega($q$select fattura_riconciliazione_imputa('${analisi}',fattura_riconciliazione_contesto('${f}',documenti)->>'impronta','[{"fattura_riga":"1","ddt_riga":"${r}","quantita_fattura":3,"fattore":5,"conferma_conversione":true}]',revisione,true) from fattura_riconciliazioni_ai where id='${analisi}'$q$,'23514');
reset role;
update fatture_ricevute set righe='[{"numero_linea":1,"descrizione":"Adesivo bianco A81","quantita":1,"unita_misura":"kg"}]' where id='00000013-0000-4000-a000-000000000001';
insert into fatture_ricevute(id,company_id,fornitore_id,tipo_documento,righe) values('00000015-0000-4000-a000-000000000001','${a}','${supplier}','TD04','[{"numero_linea":1,"descrizione":"Adesivo bianco A81","quantita":1,"unita_misura":"kg"}]');
insert into fattura_riconciliazioni_ai(id,company_id,fattura_id,impronta,documenti,proposta,esiti,modello,created_by,decisioni)
select '00000016-0000-4000-a000-000000000001',company_id,'00000015-0000-4000-a000-000000000001',fattura_riconciliazione_contesto('00000015-0000-4000-a000-000000000001',documenti)->>'impronta',documenti,proposta,esiti,modello,created_by,'{"1":"accettata"}' from fattura_riconciliazioni_ai where id='${analisi}';
set local role authenticated;
select fattura_riconciliazione_imputa('00000016-0000-4000-a000-000000000001',fattura_riconciliazione_contesto('00000015-0000-4000-a000-000000000001',documenti)->>'impronta',jsonb_build_array(jsonb_build_object('fattura_riga','1','ddt_riga','${r}','quantita_fattura',1,'fattore',1,'rettifica_di',(select id from fattura_ddt_quantita where fattura_id='${f}'))),revisione,true) from fattura_riconciliazioni_ai where id='00000016-0000-4000-a000-000000000001';
reset role;
do $$begin assert(select sum(quantita)=9 from fattura_ddt_consumi('${a}',array['${d}'::uuid],null));end $$;
update fattura_riconciliazioni_ai set decisioni='{"1":"accettata"}',impronta=fattura_riconciliazione_contesto(fattura_id,documenti)->>'impronta' where id='00000014-0000-4000-a000-000000000001';
set local role authenticated;
select fattura_riconciliazione_imputa('00000014-0000-4000-a000-000000000001',fattura_riconciliazione_contesto('00000013-0000-4000-a000-000000000001',documenti)->>'impronta','[{"fattura_riga":"1","ddt_riga":"${r}","quantita_fattura":1,"fattore":1}]',revisione,true) from fattura_riconciliazioni_ai where id='00000014-0000-4000-a000-000000000001';
reset role;
do $$begin assert(select sum(quantita)=10 from fattura_ddt_consumi('${a}',array['${d}'::uuid],null));end $$;
set local role authenticated;
select ddt_valorizza_da_fattura('${d}','${f}','[{"riga_id":"${r}","quantita":10,"prezzo_unitario":5}]');
select ddt_valorizza_da_fattura('${d}','00000013-0000-4000-a000-000000000001','[{"riga_id":"${r}","quantita":1,"prezzo_unitario":6}]');
reset role;
do $$begin assert(select sum(quantita)=10 from fattura_ddt_consumi('${a}',array['${d}'::uuid],null));assert(select prezzo_unitario=5.1 from ddt_righe where id='${r}');end $$;
rollback;`;
sql = sql.replace(/reset role;\s*rollback;\s*$/, () => "reset role;\n" + extra);
writeFileSync("/tmp/eic-test-completa.sql", sql);
try {
  const out = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "eic-fatture-ai-pg",
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-X",
      "-q",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  console.log(
    "PASS: schema completo, permessi, equivalenze, conversioni, ripartizione quantità e limiti. Tutto annullato.",
  );
} catch (e) {
  console.error(e.stderr?.toString() ?? e.message);
  process.exitCode = 1;
}

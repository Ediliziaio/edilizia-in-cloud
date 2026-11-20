import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

if (process.env.EIC_TEST_PG_CONTAINER !== "eic-fatture-ai-pg") {
  throw new Error("Usa il database isolato eic-fatture-ai-pg");
}

function migrazione(nome) {
  return readFileSync(new URL(`../supabase/migrations/${nome}.sql`, import.meta.url), "utf8");
}
function estratto(nome, inizio, fine) {
  const testo = migrazione(nome);
  const da = testo.indexOf(inizio);
  const a = testo.indexOf(fine, da + 1);
  if (da === -1 || a === -1) throw new Error(`Funzione di prova non trovata in ${nome}`);
  return testo.slice(da, a);
}
const id = n => `pg_temp.id(${n})`;
const data = "2026-11-20";
const xml = (ddt, righe, { sconto = "" } = {}) => `$xml$<p:FatturaElettronica xmlns:p="urn:test">
  <FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><Divisa>EUR</Divisa>${sconto}</DatiGeneraliDocumento>
    ${ddt.map(([numero, n]) => `<DatiDDT><NumeroDDT>${numero}</NumeroDDT><DataDDT>${data}</DataDDT>${n ? `<RiferimentoNumeroLinea>${n}</RiferimentoNumeroLinea>` : ""}</DatiDDT>`).join("")}
  </DatiGenerali><DatiBeniServizi>
    ${righe.map(([n, codice, quantita, prezzo]) => `<DettaglioLinee><NumeroLinea>${n}</NumeroLinea><CodiceArticolo><CodiceTipo>SKU</CodiceTipo><CodiceValore>${codice}</CodiceValore></CodiceArticolo><Descrizione>Adesivo A81</Descrizione><Quantita>${quantita}</Quantita><UnitaMisura>KG</UnitaMisura><PrezzoTotale>${prezzo}</PrezzoTotale></DettaglioLinee>`).join("")}
  </DatiBeniServizi></FatturaElettronicaBody>
</p:FatturaElettronica>$xml$`;
const f = (n, documento, fornitore = 2) => `(${id(n)},${id(1)},${id(fornitore)},'IT01234567890',null,'TD24','non_letta',${documento},0)`;
const bolla = (...numeri) => numeri.map(n => `(${id(n)},${id(1)},${id(2)},'${n}/A','${data}')`).join(",");
const link = (fattura, ddt, numero = ddt) => `(${id(1)},${id(fattura)},${ddt == null ? "null" : id(ddt)},'${numero}/A','${data}','xml')`;
const riga = (n, ddt, q, prezzo = "null", codice = "A81") => `(${id(n)},${id(1)},${id(ddt)},'${codice}','Adesivo A81','kg',${q},${prezzo},null)`;
const arrivo = (n, ddt, r, q, m = 11, o = 10) => `(${id(n)},${id(1)},${id(ddt)},${id(r)},'ingresso',null,${q},'kg','cantiere',${id(o)},${id(m)})`;

const sql = `
begin;
create schema if not exists auth;
create schema private;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$select ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid$$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.prezzi_uid',true),'')::uuid $$;
grant usage on schema auth,private to authenticated;
create table public.companies(id uuid primary key);
create table public.profiles(id uuid primary key);
create table public.company_governance_settings(company_id uuid primary key,collegamento_automatico boolean);
create table public.suppliers(id uuid primary key,company_id uuid,vat_number text,fiscal_code text);
create table public.fatture_ricevute(id uuid primary key,company_id uuid,fornitore_id uuid,cedente_piva text,cedente_cf text,
  tipo_documento text,stato text,xml_raw text,indice_corpo integer,company_cost_id uuid,aggancio_oda_manuale boolean,purchase_order_id uuid);
create table public.ddt_ricezione(id uuid primary key,company_id uuid,supplier_id uuid,numero_ddt text,data_ricezione date);
create table public.ddt_righe(id uuid primary key,company_id uuid,ddt_ricezione_id uuid,codice_articolo text,descrizione text,unita_misura text,
  quantita numeric(18,4),prezzo_unitario numeric(14,4),importo numeric(14,2));
create table public.fattura_ddt(company_id uuid,fattura_ricevuta_id uuid,ddt_ricezione_id uuid,numero_ddt text,data_ddt date,origine text,created_by uuid);
create table public.orders(id uuid primary key,company_id uuid,deleted_at timestamptz);
create table public.order_items(id uuid primary key,order_id uuid,natura_riga text,ddt_riga_origine_id uuid,purchase_price numeric,
  costo_stimato_iniziale numeric,prezzo_da_definire boolean,prezzo_fonte text,prezzo_aggiornato_il timestamptz,updated_at timestamptz);
create table public.ddt_consegne(id uuid primary key,company_id uuid,ddt_id uuid,riga_id uuid,tipo text,consegna_origine_id uuid,
  quantita numeric,unita_misura text,destinazione text,order_id uuid,order_item_id uuid);
create table public.fattura_ddt_quantita(company_id uuid,fattura_id uuid,ddt_riga uuid,quantita_ddt numeric,rettifica_di uuid,id uuid primary key);
create table public.company_costs(id uuid primary key,company_id uuid,order_id uuid,allocations jsonb,quota_magazzino numeric,
  quota_magazzino_righe jsonb,purchase_order_id uuid,order_external_team_id uuid,amount numeric);
create table public.fattura_ricevuta_ordini(fattura_id uuid);
create table private.fattura_ddt_ripartizioni(fattura_id uuid,bloccata boolean,cost_id uuid,applicata jsonb);
create function public.utente_bloccato() returns boolean language sql as $$select false$$;
create function public.utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
create function public.utente_sola_lettura(uuid) returns boolean language sql as $$select false$$;
create function public.user_can_access_company(uuid) returns boolean language sql as $$select auth.uid() is not null$$;
create function public.has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select auth.uid() is not null$$;
create function public.e_super_admin_dentro(uuid) returns boolean language sql as $$select false$$;
create function public.get_my_company_id() returns uuid language sql as $$select '00000000-0000-4000-a000-000000000001'::uuid$$;
create function public.puo_vedere_documenti_fornitore() returns boolean language sql as $$select auth.uid() is not null$$;
create function public.user_can_read_accountant_company(uuid) returns boolean language sql as $$select false$$;
create function public.azienda_collegamento_automatico(p_company uuid) returns boolean language sql stable as $$
  select coalesce((select collegamento_automatico from public.company_governance_settings where company_id=p_company),false)$$;
create function private.fattura_ddt_piano(uuid) returns jsonb language sql stable as $$select '{"ddt":[]}'::jsonb$$;

${estratto("20281105400000_fattura_ricevuta_pagamento_e_ritenute", "create or replace function public.e_nota_credito_ricevuta", "revoke all on function public.e_nota_credito_ricevuta")}
${estratto("20290214120000_ddt_prezzi_da_fattura", "create table public.ddt_valorizzazioni", "create or replace function public.ddt_valorizza_da_fattura")}
${estratto("20290312120000_riconciliazione_fatture_completamento", "create or replace function public.fattura_unita", "-- Lettura consentita agli stessi ruoli del confronto")}
${estratto("20290312120000_riconciliazione_fatture_completamento", "create or replace function public.fattura_numero", "create or replace function public.fattura_riconciliazione_imputa")}
${estratto("20290313200000_ddt_carico_e_costi_provvisori", "CREATE OR REPLACE FUNCTION public.ddt_valorizza_da_fattura", "-- ── Medio dell'articolo")}
${estratto("20290404210000_acquisti_collegamenti_traccia", "create or replace function public.acquisti_numero_documento", "-- Aggancia le righe fattura_ddt")}
${estratto("20290404290000_acquisti_ddt_nelle_descrizioni", "create or replace function public.acquisti_data_italiana", "-- I DDT citati nelle descrizioni")}
${migrazione("20290421100000_documenti_prezzi_materiali_preparati")}
${migrazione("20290423110000_fatture_ddt_permessi_documenti")}
${migrazione("20290430148000_prezzi_certi_fatture_ddt_commessa")}

insert into companies values(${id(1)});
insert into profiles values(${id(3)});
insert into company_governance_settings values(${id(1)},true);
insert into suppliers values(${id(2)},${id(1)},'01234567890',null),(${id(4)},${id(1)},'98765432109',null);
insert into orders values(${id(10)},${id(1)},null),(${id(12)},${id(1)},null);
insert into order_items(id,order_id,natura_riga,purchase_price,prezzo_da_definire,prezzo_fonte)
  values(${id(11)},${id(10)},'materiale',9,true,'listino'),(${id(13)},${id(12)},'materiale',12,true,'ordine'),
    (${id(14)},${id(12)},'materiale',15,true,'ordine'),(${id(15)},${id(10)},'materiale',20,true,'ordine');
insert into ddt_ricezione values ${bolla(101,102,103,104,105,106,109,110,111,112,113,114)};
insert into ddt_righe values ${[
  riga(201,101,2),riga(202,102,3),riga(203,103,1),riga(204,104,1),riga(205,105,1),riga(206,106,1),
  riga(207,106,1),riga(209,109,1),riga(210,110,1),riga(211,111,2),riga(212,112,2),riga(213,113,1),riga(214,114,1),
].join(",")};
insert into fatture_ricevute(id,company_id,fornitore_id,cedente_piva,cedente_cf,tipo_documento,stato,xml_raw,indice_corpo) values
  ${f(21,xml([["101/A",5],["102/A",2]],[[5,"A81",2,64],[2,"A81",3,150]]))},
  ${f(22,xml([["103/A",null]],[[1,"A81",1,66]]))},
  ${f(23,xml([["109/A",1],["999/A",2]],[[1,"A81",1,33],[2,"A81",1,33]]))},
  ${f(24,xml([["104/A",null]],[[1,"A81",1,66]]),4)},
  ${f(25,xml([["106/A",null]],[[1,"A81",1,66]]))},
  ${f(26,xml([["110/A",null]],[[1,"A81",1,66]],{sconto:"<ScontoMaggiorazione><Importo>10</Importo></ScontoMaggiorazione>"}))},
  ${f(27,xml([["111/A",null]],[[1,"A81",2,100]]))},
  ${f(28,xml([["112/A",null]],[[1,"A81",2,200]]))},
  ${f(29,xml([["105/A",null]],[[1,"A81",1,72]]))},
  ${f(30,xml([["113/A",null],["114/A",null]],[[1,"A81",1,22],[2,"A81",1,23]]))};
insert into fattura_ddt(company_id,fattura_ricevuta_id,ddt_ricezione_id,numero_ddt,data_ddt,origine) values
  ${[link(21,101),link(21,102),link(22,103),link(23,109),link(23,null,999),link(24,104),link(25,106),
    link(26,110),link(27,111),link(28,112),link(29,105),link(30,113),link(30,114)].join(",")};
insert into ddt_consegne values
  ${[arrivo(301,101,201,2),arrivo(302,102,202,2),arrivo(303,102,202,1,13,12),
    arrivo(311,111,211,2,15),arrivo(312,112,212,2,15)].join(",")};

create function pg_temp.svuota_coda() returns void language plpgsql as $$
begin
  update private.fattura_prezzi_verifiche set prossima_verifica=now() where prossima_verifica is not null;
  perform private.ddt_prezzi_esegui_coda();
end
$$;
do $$declare esito jsonb; begin
  esito:=private.ddt_piano_prezzi(${id(21)});
  assert esito->>'stato'='pronta', coalesce(esito::text,'nessun piano');
  assert jsonb_array_length(esito->'righe')=2;
  assert (select count(*)=0 from ddt_valorizzazioni), 'L’anteprima non può scrivere';
  assert private.ddt_piano_prezzi(${id(22)})->>'motivo'='consegna';
  assert private.ddt_piano_prezzi(${id(23)})->>'motivo'='ddt_mancante';
  assert private.ddt_piano_prezzi(${id(24)})->>'motivo'='fornitore';
  assert private.ddt_piano_prezzi(${id(25)})->>'motivo'='articolo';
  assert private.ddt_piano_prezzi(${id(26)})->>'motivo'='sconto_documento';
  assert private.ddt_piano_prezzi(${id(30)})->>'motivo'='riferimento_riga';
end $$;

-- Un addetto conferma un prezzo diverso prima che arrivi la consegna.
select set_config('test.prezzi_uid',${id(3)}::text,true);
set local role authenticated;
select ddt_valorizza_da_fattura(${id(105)},${id(29)},jsonb_build_array(jsonb_build_object('riga_id',${id(205)},'quantita',1,'prezzo_unitario',71)));
do $$begin
  assert not has_function_privilege(current_user,'private.ddt_prezzi_verifica(uuid)','execute');
  assert not has_function_privilege(current_user,'private.ddt_valorizza_applica(uuid,uuid,jsonb,boolean)','execute');
  assert not has_table_privilege(current_user,'private.fattura_prezzi_verifiche','select');
end $$;
reset role;
select set_config('test.prezzi_uid','',true);
insert into ddt_consegne values ${arrivo(305,105,205,1,14,12)};
select pg_temp.svuota_coda();

do $$begin
  assert private.ddt_prezzi_stato(${id(21)})->>'stato'='aggiornata', private.ddt_prezzi_stato(${id(21)})::text;
  assert (select count(*)=2 and bool_and(origine='automatico' and created_by is null)
    from ddt_valorizzazioni where fattura_id=${id(21)});
  assert (select prezzo_unitario=32 and numero_linea_fattura=5 from ddt_valorizzazioni where ddt_id=${id(101)});
  assert (select prezzo_unitario=50 and numero_linea_fattura=2 from ddt_valorizzazioni where ddt_id=${id(102)});
  assert (select purchase_price=41 and costo_stimato_iniziale=9 and prezzo_fonte='fattura' from order_items where id=${id(11)});
  assert (select purchase_price=50 and prezzo_fonte='fattura' from order_items where id=${id(13)});
  assert (select purchase_price=75 and prezzo_fonte='fattura' from order_items where id=${id(15)});
  assert private.ddt_prezzi_stato(${id(27)})->>'stato'='aggiornata', 'L’altra fattura sblocca il prezzo medio';
  assert (select stato='non_letta' and company_cost_id is null from fatture_ricevute where id=${id(21)});
  assert (select prezzo_unitario=71 and origine='manuale' and created_by=${id(3)} from ddt_valorizzazioni where ddt_id=${id(105)});
  assert (select count(*)=5 from ddt_valorizzazioni);
  assert private.ddt_prezzi_stato(${id(29)})->>'motivo'='valorizzazione_precedente';
end $$;

-- La consegna arriva dopo la fattura, e l’azienda può richiedere una conferma.
update company_governance_settings set collegamento_automatico=false;
insert into ddt_consegne values ${arrivo(306,103,203,1,14,12)};
select pg_temp.svuota_coda();
do $$begin assert private.ddt_prezzi_stato(${id(22)})->>'motivo'='automatico_disattivato'; end $$;
update company_governance_settings set collegamento_automatico=true;
delete from ddt_consegne where id=${id(306)};
insert into ddt_consegne values ${arrivo(306,103,203,1,14,12)};
select pg_temp.svuota_coda();
select private.ddt_prezzi_accoda(${id(21)});
select pg_temp.svuota_coda();
do $$begin
  assert (select count(*)=6 from ddt_valorizzazioni), 'Il retry non duplica le valorizzazioni';
  assert (select count(*)=7 from ddt_consegne);
  assert (select purchase_price=68.5 and prezzo_fonte='fattura' from order_items where id=${id(14)});
end $$;
select set_config('test.prezzi_uid',${id(3)}::text,true);
set local role authenticated;
do $$begin assert fattura_ddt_riepilogo(${id(21)})->'prezzi'->>'stato'='aggiornata'; end $$;
reset role;
rollback;
`;

if (process.env.EIC_TEST_PG_EMIT_SQL) {
  writeFileSync(process.env.EIC_TEST_PG_EMIT_SQL, sql);
} else {
  execFileSync("docker", ["exec", "-i", "eic-fatture-ai-pg", "psql", "-X", "-q", "-U", "supabase_admin",
    "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "inherit", "inherit"] });
  console.log("Prezzi automatici DDT e commesse: OK");
}

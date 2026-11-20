import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const leggi = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const uid = (n) => `00000000-0000-4000-a000-${String(n).padStart(12,"0")}`;
const [azienda, altraAzienda, ufficio, operaio, altroOperaio, ordine, altroOrdine, estero, furgone, furgoneEstero, fase, fornitore, computo, voce] =
  Array.from({ length: 14 }, (_, i) => uid(i + 1));
const json = (data) => `'${JSON.stringify(data).replaceAll("'", "''")}'::jsonb`;
const esegui = async (sql) => db.exec(sql);
const riga = async (sql) => (await db.query(sql)).rows[0];
const ante = (testo, da, a) => {
  const inizio = testo.indexOf(da);
  const fine = testo.indexOf(a, inizio);
  assert.ok(inizio >= 0 && fine > inizio);
  return testo.slice(inizio, fine);
};
const operatore = (utente, comp = azienda) => esegui(`set app.actor='${utente}'; set app.company='${comp}';`);
const giorno = "2026-11-20";
const arrivo = (mezzo, km = null, partenza = null) => ({ chiave: "__arrivo_cantiere_v1", tipo: "arrivo_cantiere", mezzo_id: mezzo, km, partenza });
const scriviRapporto = (id, utente, dati, opzioni = {}) => esegui(`
  insert into campo_rapportini(id,company_id,order_id,user_id,data_lavoro,campi_extra,lavoro_completato,stato)
  values('${id}','${opzioni.azienda ?? azienda}','${opzioni.ordine ?? ordine}','${utente}',date '${giorno}',
    ${json(dati)},${!!opzioni.collaudo},'${opzioni.stato ?? "inviato"}');`);
const registro = async (commessa = ordine) => (await riga(`
  select mezzi_arrivi_da_rapportini('${commessa}','${giorno}','${giorno}',0) as registro`)).registro.items;
const piano = (dati) => riga(`select salva_piano_mezzo_operativo(${json(dati)}) as id`);

try {
  await esegui(`
  create schema auth; create schema private;
  create role anon; create role authenticated; create role service_role;
  grant usage on schema public,auth to anon,authenticated;
  create function auth.uid() returns uuid language sql stable as $$select current_setting('app.actor',true)::uuid$$;
  create function utente_bloccato() returns boolean language sql stable as $$select false$$;
  create function chiamante_anonimo() returns boolean language sql stable as $$select false$$;
  create function utente_sola_lettura(c uuid) returns boolean language sql stable as $$select false$$;
  create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
  create function campo_e_ufficio(c uuid) returns boolean language sql stable as $$select true$$;
  create function e_amministratore_di(c uuid) returns boolean language sql stable as $$select true$$;
  create function check_staff_visibility(u uuid,a uuid) returns boolean language sql stable as $$select true$$;
  create function assert_company_access(c uuid) returns void language sql as $$select$$;
  create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
  create function has_permission_for_company(u uuid,p text,c uuid) returns boolean language sql stable as $$
    select u='${ufficio}' and c::text=current_setting('app.company',true)
      and case p when 'can_view_costs' then current_setting('app.costs',true)='true'
                 when 'can_manage_purchasing' then current_setting('app.purchasing',true)='true' else true end$$;
  create function puo_vedere_costi(u uuid,c uuid) returns boolean language sql stable as $$
    select public.has_permission_for_company(u,'can_view_costs',c) is true
        or public.has_permission_for_company(u,'can_manage_purchasing',c) is true$$;
  create table companies(id uuid primary key,operational_lat numeric,operational_lng numeric);
  create table profiles(id uuid primary key);
  create table orders(id uuid primary key,company_id uuid,assigned_to uuid,order_code text, work_address text,indirizzo_lavori text,
    work_lat numeric,work_lng numeric,created_at timestamptz default now(),deleted_at timestamptz);
  create function campo_lavoro_su_commessa(o uuid) returns boolean language sql stable as $$
    select exists(select 1 from public.orders where id=o and company_id::text=current_setting('app.company',true))$$;
  create function _order_visible_under_rls(o uuid, include_staff boolean) returns boolean language sql stable as $$
    select exists(select 1 from public.orders where id=o and company_id::text=current_setting('app.company',true))$$;
  create table hr_profili(id uuid primary key,company_id uuid,user_id uuid,nome text,cognome text,attivo boolean default true);
  create function miei_hr_profili() returns setof uuid language sql stable as $$select id from public.hr_profili where user_id=auth.uid()$$;
  create table suppliers(id uuid primary key,company_id uuid,name text,is_active boolean);
  create table order_work_phases(id uuid primary key,company_id uuid,order_id uuid);
  create table computo_uploads(id uuid primary key,company_id uuid,order_id uuid,stato text);
  create table computo_voci_estratte(id uuid primary key,computo_id uuid);
  create table campo_rapportini(
    id uuid primary key,company_id uuid,order_id uuid,user_id uuid,data_lavoro date,stato text,annullato_at timestamptz,
    campi_extra jsonb default '[]' not null check(jsonb_typeof(campi_extra)='array'),
    lavoro_completato boolean, firma_cliente_url text, ufficio_employee_id uuid, updated_at timestamptz default now(),
    approvato boolean,approvato_da uuid,approvato_at timestamptz,descrizione_lavori text,note text,ore_lavorate numeric,
    ore_straordinario numeric,presenze jsonb,fasi_lavorate jsonb,materiali_usati jsonb,mezzi_usati jsonb,motivo_rifiuto text,pdf_url text);
  create table appalto_rendiconto_righe(stato text,rapportino_id uuid,voce_libera_id uuid);
  create table rapportino_voci_libere(id uuid,rapportino_id uuid);
  create table giornale_lavori(order_id uuid,stato text,source_rapportini_ids uuid[]);
  create table avanzamento_dal_rapportino(rapportino_id uuid);
  grant select,insert,update on campo_rapportini to authenticated;
  grant select on orders to authenticated;
  insert into companies(id) values('${azienda}'),('${altraAzienda}');
  insert into profiles values('${ufficio}'),('${operaio}'),('${altroOperaio}');
  insert into orders(id,company_id,order_code) values('${ordine}','${azienda}','A'),('${altroOrdine}','${azienda}','B'),('${estero}','${altraAzienda}','C');
  insert into order_work_phases values('${fase}','${azienda}','${ordine}');
  insert into suppliers values('${fornitore}','${azienda}','Noli Demo',true);
  insert into computo_uploads values('${computo}','${azienda}','${ordine}','bozza');
  insert into computo_voci_estratte values('${voce}','${computo}');
  insert into hr_profili(id,company_id,user_id) values('${uid(30)}','${azienda}','${operaio}'),('${uid(31)}','${azienda}','${altroOperaio}');
  set app.costs='true';
  `);

  const parco = await leggi("supabase/migrations/20280924150000_mezzi_attrezzature.sql");
  await esegui(ante(parco,"create table if not exists public.mezzi (","-- ── Documenti"));
  await esegui("alter table public.mezzi add column su_mezzo_id uuid references public.mezzi(id);");
  const storico = await leggi("supabase/migrations/20280924170000_mezzi_seconda_tornata.sql");
  await esegui(ante(storico,"create table if not exists public.mezzi_assegnazioni","alter table public.mezzi_assegnazioni enable row level security"));
  const quantita = await leggi("supabase/migrations/20281005140000_mezzi_categorie_quantita.sql");
  await esegui(ante(quantita,"alter table public.mezzi drop constraint if exists mezzi_gestione_chk","-- Disponibilità di ogni attrezzatura").replace(
    /^alter table/, "alter table public.mezzi add column gestione text default 'singola', add column unita_misura text, add column quantita_totale numeric(12,2); alter table",
  ));
  const piani = await leggi("supabase/migrations/20281028023000_mezzi_piano_cantiere.sql");
  await esegui(ante(piani,"create table if not exists public.mezzi_piani_cantiere","create or replace function public.salva_piano_mezzo"));
  await esegui(`
    alter table mezzi_piani_cantiere add column responsabile_hr_id uuid,add column rientrato_il timestamptz;
    alter table mezzi_piani_costi add column supplier_id uuid;
    insert into mezzi(id,company_id,nome,tipo,targa,contatore,assegnato_hr_profilo_id,assegnato_order_id)
      values('${furgone}','${azienda}','Furgone di prova','furgone','DEMO',999,'${uid(30)}','${ordine}'),
        ('${furgoneEstero}','${altraAzienda}','Furgone dell’altra azienda','furgone',null,500,null,'${estero}');`);
  const ammessi = await leggi("supabase/migrations/20280927203000_mezzi_fine_giornata.sql");
  await esegui(ante(ammessi,"create or replace function public.campo_mezzi_ammessi","revoke all on function public.campo_mezzi_ammessi"));
  await esegui(await leggi("supabase/migrations/20281027180500_mezzi_viaggi_multitratta.sql"));
  await esegui(await leggi("supabase/migrations/20290423120000_arrivi_cantiere_da_rapportini.sql"));
  await esegui(await leggi("supabase/migrations/20290423120100_noleggi_operativi_cantiere.sql"));

  await operatore(operaio);
  await esegui("set role authenticated");
  await scriviRapporto(uid(40), operaio, [arrivo(furgone, 18.5, "Deposito"), { chiave: "note_sito", valore: "Conserva" }]);
  await assert.rejects(scriviRapporto(uid(41), operaio, [arrivo(furgoneEstero)]), /non è disponibile/);
  await assert.rejects(scriviRapporto(uid(42), operaio, [arrivo(furgone), arrivo(furgone)]), /un solo mezzo/);
  await assert.rejects(scriviRapporto(uid(43), operaio, [arrivo(furgone, -9)]), /chilometri/);
  await assert.rejects(scriviRapporto(uid(44), operaio, [arrivo(furgone)], { collaudo: true }), /giornaliero/);
  await assert.rejects(registro(), /non accessibile/);
  await operatore(altroOperaio);
  await scriviRapporto(uid(41), altroOperaio, [arrivo(furgone, 18.5, "deposito")]);

  await operatore(ufficio);
  await scriviRapporto(uid(45), altroOperaio, [arrivo(furgone, 49)], { stato: "rifiutato" });
  let [a] = await registro();
  assert.equal((await registro()).length, 1);
  assert.equal(a.rapportini, 2);
  assert.equal(a.km, 18.5);
  assert.equal(a.viaggioId, null);
  assert.equal((await registro(altroOrdine)).length, 0);
  await assert.rejects(registro(estero), /non accessibile/);
  await esegui("reset role");
  assert.equal((await riga("select count(*)::int as n from mezzi_viaggi")).n, 0);
  assert.equal(Number((await riga(`select contatore from mezzi where id='${furgone}'`)).contatore), 999);

  await esegui("set role authenticated");
  await esegui(`select rapportino_correggi('${uid(40)}',(select updated_at from campo_rapportini where id='${uid(40)}'),
    ${json({ arrivo_cantiere: arrivo(furgone, 21, "Sede") })},'Correzione dal rapportino');`);
  const [discordante] = await registro();
  assert.equal(discordante.id, a.id);
  assert.equal(discordante.datiDiscordanti, true);
  assert.equal(discordante.km, null);
  assert.equal(discordante.partenza, null);
  await esegui(`select rapportino_correggi('${uid(40)}',(select updated_at from campo_rapportini where id='${uid(40)}'),
    ${json({ arrivo_cantiere: null })},'Rimuovi dichiarazione');`);
  const [rimasto] = await registro();
  assert.equal(rimasto.rapportini, 1);
  assert.equal(rimasto.id, a.id);
  assert.deepEqual((await riga(`select campi_extra from campo_rapportini where id='${uid(40)}'`)).campi_extra, [{ chiave: "note_sito", valore: "Conserva" }]);

  const tratta = { id: uid(57), da: "Deposito", a: "Cantiere A", km: 18.5, fonte: "dichiarati", destinazione: "commessa", order_id: ordine };
  await riga(`select mezzi_viaggi_salva('${furgone}','${uid(50)}',0,'${uid(51)}','invia',
    ${json({ partenza: "2026-11-20T06:30:00Z", arrivo: "2026-11-20T07:00:00Z", tratte: [tratta] })},'')`);
  [a] = await registro();
  assert.equal(a.viaggiCompatibili[0].id, uid(50));
  await assert.rejects(esegui(`select mezzi_collega_arrivo_rapportino('${ordine}','2026-11-19','${a.id}','${uid(50)}')`), /non corrisponde/);
  await esegui(`select mezzi_collega_arrivo_rapportino('${ordine}','${giorno}','${a.id}','${uid(50)}')`);
  assert.equal((await registro())[0].viaggioId, uid(50));

  const oggi = (await riga("select to_char((now() at time zone 'Europe/Rome')::date,'YYYY-MM-DD') as oggi")).oggi;
  const prenotazione = {
    id: uid(60), order_id: ordine, fase_ids: [fase], dal: oggi, al: oggi, quantita: 300, arrivato_oggi: true,
    nuovo_noleggio: { nome: "Ponteggio a telai", tipo: "attrezzatura", unita: "mq" },
    fornitore_id: fornitore, riferimento_noleggio: "Offerta demo",
    costo: { tariffa: 5, base: "mese", per_unita: true, montaggio: 100, smontaggio: 60, trasporto: 140, extra: 0 },
  };
  assert.equal((await piano(prenotazione)).id, uid(60));
  assert.equal((await piano(prenotazione)).id, uid(60));
  const costoRiservato = await riga(`select per_unita,trasporto,montaggio,smontaggio from mezzi_piani_costi where piano_id='${uid(60)}'`);
  assert.equal(costoRiservato.per_unita, true);
  assert.equal(Number(costoRiservato.trasporto)+Number(costoRiservato.montaggio)+Number(costoRiservato.smontaggio),300);
  const daComputo = { ...prenotazione, id: uid(61), costo: null, arrivato_oggi: false,
    origine_computo_id: computo, origine_noleggio_id: "nolo:" + voce };
  assert.equal((await piano(daComputo)).id, uid(61));
  await assert.rejects(piano({ ...daComputo, id: uid(62) }), /già una prenotazione/);
  await assert.rejects(piano({ ...daComputo, id: uid(63), order_id: altroOrdine, fase_ids: [] }), /non disponibile per questa commessa/);
  await assert.rejects(piano({ ...prenotazione, id: uid(64), fase_ids: [uid(65)] }), /fasi devono appartenere/);
  await esegui("set app.costs='false'");
  await assert.rejects(piano({ ...prenotazione, id: uid(66) }), /Non puoi modificare i costi/);
  await esegui("set app.purchasing='true'");
  assert.equal((await piano(prenotazione)).id, uid(60));
  await esegui("set app.purchasing='false'");
  await esegui("reset role");
  assert.equal((await riga("select count(*)::int as n from mezzi where noleggio_dedicato")).n, 2);
  const montaggio = await riga(`select id,mezzo_id from mezzi_allocazioni where piano_id='${uid(60)}'`);
  assert.ok(montaggio.id);
  assert.equal((await riga(`select count(*)::int as n from mezzi_allocazioni where piano_id='${uid(60)}'`)).n, 1);
  await esegui(`update mezzi_piani_cantiere set dal=date '${oggi}'-3,al=date '${oggi}'-1 where id='${uid(60)}';
    update mezzi_allocazioni set dal=date '${oggi}'-3 where id='${montaggio.id}'; set role authenticated;`);
  await esegui(`select registra_rientro_piano_mezzo('${uid(60)}','${montaggio.id}',70,300)`);
  await assert.rejects(esegui(`select registra_rientro_piano_mezzo('${uid(60)}','${montaggio.id}',70,300)`), /quantità rimasta/);
  await esegui("reset role");
  assert.equal(Number((await riga(`select quantita from mezzi_allocazioni where id='${montaggio.id}'`)).quantita),230);
  assert.equal((await riga(`select rientrato_il from mezzi_piani_cantiere where id='${uid(60)}'`)).rientrato_il,null);
  await esegui(`set role authenticated; select registra_rientro_piano_mezzo('${uid(60)}','${montaggio.id}',230,230); reset role;`);
  const chiuso = await riga(`select rientrato_il,al_concordato,al from mezzi_piani_cantiere where id='${uid(60)}'`);
  assert.ok(chiuso.rientrato_il);
  assert.ok(chiuso.al_concordato < chiuso.al);
  assert.equal((await riga(`select stato from mezzi where id='${montaggio.mezzo_id}'`)).stato,"fuori_servizio");
  console.log("Verificati su PostgreSQL isolato: arrivi, correzioni, permessi, viaggi collegati, noleggi e rientri.");
} finally {
  await db.close();
}

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
let db: PGlite;
const c = "00000000-0000-4000-a000-000000000001", o = "00000000-0000-4000-a000-000000000002", m = "00000000-0000-4000-a000-000000000003", p = "00000000-0000-4000-a000-000000000004", a = "00000000-0000-4000-a000-000000000005";
const root = "src/test/fixtures/";
beforeAll(async () => {
  db = new PGlite(); await db.waitReady;
  await db.exec(`set check_function_bodies=false;
    create role authenticated; create role service_role; create role anon; create schema auth;
    alter default privileges grant execute on functions to anon;
    create function auth.uid() returns uuid language sql as $$select '${c}'::uuid$$;
    create function utente_bloccato() returns boolean language sql as $$select false$$;
    create function utente_sola_lettura(uuid) returns boolean language sql as $$select false$$;
    create function has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select case when current_setting('test.permesso',true)='' then null else $3='${c}'::uuid and current_setting('test.permesso',true)='si' end$$;
    create function _order_visible_under_rls(uuid,boolean) returns boolean language sql as $$select $1='${o}'::uuid$$;
    create table mezzi(id uuid primary key, company_id uuid, deleted_at timestamptz, gestione text, assegnato_order_id uuid);
    create table mezzi_piani_cantiere(id uuid primary key,company_id uuid,order_id uuid,mezzo_id uuid,dal date,al date,quantita numeric,annullato boolean default false,updated_at timestamptz);
    create table mezzi_allocazioni(id uuid primary key default gen_random_uuid(),company_id uuid,mezzo_id uuid,order_id uuid,luogo text,quantita numeric,dal date,al date,note text);
  `);
  await db.exec(readFileSync(root + "bug70_prima_salva_piano_mezzo.sql", "utf8"));
  await db.exec(readFileSync(root + "bug70_prima_mezzi_rientro.sql", "utf8"));
  await db.exec(readFileSync("supabase/patches/bug70_rientro_piano_mezzo.sql", "utf8"));
},60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`set test.permesso='si'; truncate mezzi,mezzi_piani_cantiere,mezzi_allocazioni;
    insert into mezzi values('${m}','${c}',null,'singola','${o}');
    insert into mezzi_piani_cantiere(id,company_id,order_id,mezzo_id,dal,al,quantita,annullato) values('${p}','${c}','${o}','${m}',(now() at time zone 'Europe/Rome')::date,null,1,false);`);
});
const close = (allocation: string | null = null) => db.query("select rientra_piano_mezzo($1,$2)",[p,allocation]);
it("chiude prenotazione e presenza insieme senza annullare il periodo", async () => {
  await close();
  expect((await db.query("select assegnato_order_id from mezzi")).rows[0]).toEqual({ assegnato_order_id: null });
  expect((await db.query("select annullato,al=dal stesso_giorno,rientrato_il is not null chiuso from mezzi_piani_cantiere")).rows[0]).toEqual({ annullato:false,stesso_giorno:true,chiuso:true });
  await close(); // doppio clic idempotente
});
it("rifiuta permessi mancanti senza spostare il mezzo", async () => {
  await db.exec("set test.permesso='no'"); await expect(close()).rejects.toThrow("Non puoi");
  expect((await db.query("select assegnato_order_id from mezzi")).rows[0]).toEqual({ assegnato_order_id:o });
});
it("non chiude un mezzo spostato nel frattempo su un'altra commessa", async () => {
  await db.query("update mezzi set assegnato_order_id=$1",[c]); await expect(close()).rejects.toThrow("non risulta");
  expect((await db.query("select rientrato_il from mezzi_piani_cantiere")).rows[0]).toEqual({ rientrato_il:null });
});
it("un errore sulla prenotazione annulla anche lo spostamento del mezzo", async () => {
  await db.exec("alter table mezzi_piani_cantiere add constraint test_no_close check (rientrato_il is null)");
  await expect(close()).rejects.toThrow();
  expect((await db.query("select assegnato_order_id from mezzi")).rows[0]).toEqual({ assegnato_order_id:o });
  await db.exec("alter table mezzi_piani_cantiere drop constraint test_no_close");
});
it("rientro a quantità: chiude il montaggio preciso e la prenotazione", async () => {
  await db.exec(`update mezzi set gestione='quantita'; update mezzi_piani_cantiere set quantita=12;
    insert into mezzi_allocazioni(id,company_id,mezzo_id,order_id,quantita,dal) values('${a}','${c}','${m}','${o}',12,(now() at time zone 'Europe/Rome')::date)`);
  await close(a);
  expect((await db.query("select al=dal chiuso,quantita from mezzi_allocazioni")).rows[0]).toEqual({ chiuso:true,quantita:"12" });
});
it("non chiude un montaggio di quantità diversa", async () => {
  await db.exec(`update mezzi set gestione='quantita'; update mezzi_piani_cantiere set quantita=12;
    insert into mezzi_allocazioni(id,company_id,mezzo_id,order_id,quantita,dal) values('${a}','${c}','${m}','${o}',5,(now() at time zone 'Europe/Rome')::date)`);
  await expect(close(a)).rejects.toThrow("non corrisponde");
  expect((await db.query("select al from mezzi_allocazioni")).rows[0]).toEqual({ al:null });
});
it("rifiuta anche un permesso non determinabile", async () => {
  await db.exec("set test.permesso=''");
  await expect(close()).rejects.toThrow("Non puoi");
});
it("non chiude una prenotazione futura", async () => {
  await db.exec("update mezzi_piani_cantiere set dal=(now() at time zone 'Europe/Rome')::date+1");
  await expect(close()).rejects.toThrow("non è iniziata");
});

it("revoca anche il grant anon esplicito ereditato dai default Supabase", async () => {
  const { rows } = await db.query("select has_function_privilege('anon','public.rientra_piano_mezzo(uuid,uuid)','EXECUTE') as anon, has_function_privilege('authenticated','public.rientra_piano_mezzo(uuid,uuid)','EXECUTE') as authenticated");
  expect(rows[0]).toEqual({ anon:false, authenticated:true });
});

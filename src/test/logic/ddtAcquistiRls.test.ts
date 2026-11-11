import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

const azienda = "00000000-0000-4000-a000-000000000001";
const altra = "00000000-0000-4000-a000-000000000002";
const ddt = "00000000-0000-4000-a000-000000000003";
const altroDdt = "00000000-0000-4000-a000-000000000004";
let db: PGlite;
let prima: { righe: number; testateModificate: number };

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create type app_role as enum ('super_admin');
    create function auth.uid() returns uuid language sql stable as $$select '${azienda}'::uuid$$;
    create function get_my_company_id() returns uuid language sql stable as $$select '${azienda}'::uuid$$;
    create function get_my_warehouse_ids() returns uuid[] language sql stable as $$select '{}'::uuid[]$$;
    create function e_amministratore_di(uuid) returns boolean language sql stable as $$select false$$;
    create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
    create function utente_bloccato() returns boolean language sql stable as $$select coalesce(current_setting('test.blocked',true),'false')='true'$$;
    create function utente_e_cliente_esterno() returns boolean language sql stable as $$select coalesce(current_setting('test.external',true),'false')='true'$$;
    create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'false')='true'$$;
    create function aziende_con_permesso(text) returns uuid[] language sql stable as $$select case when $1='can_manage_purchasing' and coalesce(current_setting('test.purchasing',true),'true')='true' then array['${azienda}'::uuid] else '{}'::uuid[] end$$;
    create table ddt_ricezione(id uuid primary key,company_id uuid not null,warehouse_id uuid,stato text);
    create table ddt_righe(id uuid primary key,company_id uuid not null,ddt_ricezione_id uuid not null references ddt_ricezione,descrizione text);
    alter table ddt_ricezione enable row level security;
    grant usage on schema public,auth to authenticated;
    grant select,insert,update,delete on ddt_ricezione to authenticated;
    create policy ddt_ricezione_scoped_access on ddt_ricezione for all to authenticated
      using(company_id=get_my_company_id() and (e_amministratore_di(get_my_company_id()) or has_role(auth.uid(),'super_admin'::app_role) or warehouse_id=any(get_my_warehouse_ids())))
      with check(company_id=get_my_company_id() and (e_amministratore_di(get_my_company_id()) or has_role(auth.uid(),'super_admin'::app_role) or warehouse_id=any(get_my_warehouse_ids())));
    insert into ddt_ricezione values('${ddt}','${azienda}',null,'ricevuto'),('${altroDdt}','${altra}',null,'ricevuto');
    insert into ddt_righe values('${ddt}','${azienda}','${ddt}','Condizionatore'),('${altroDdt}','${altra}','${altroDdt}','Altra azienda');
  `);
  const storico = readFileSync("supabase/migrations/20281029180000_ddt_righe_lettura_ai.sql", "utf8");
  await db.exec(storico.slice(storico.indexOf("create or replace function public.puo_vedere_ddt")));
  await db.exec(readFileSync("supabase/migrations/20290312122500_ddt_lettura_acquisti.sql", "utf8"));
  await db.exec("set role authenticated");
  prima = {
    righe: (await db.query("select id from ddt_righe")).rows.length,
    testateModificate: (await db.query("update ddt_ricezione set stato='verificato' returning id")).rows.length,
  };
  await db.exec("reset role");
  await db.exec(readFileSync("supabase/migrations/20290312124000_ddt_righe_e_verifica_acquisti.sql", "utf8"));
}, 60000);

beforeEach(async () => {
  await db.exec(`reset role;
    select set_config('test.blocked','false',false),set_config('test.external','false',false),set_config('test.readonly','false',false),set_config('test.purchasing','true',false);
    update ddt_ricezione set stato='ricevuto';
    set role authenticated;`);
});
afterAll(async () => { await db?.close(); });

it("riproduce la testata visibile con righe nascoste e corregge anche il salvataggio della verifica", async () => {
  expect(prima).toEqual({ righe: 0, testateModificate: 0 });
  expect((await db.query("select id from ddt_righe")).rows).toEqual([{ id: ddt }]);
  expect((await db.query("update ddt_ricezione set stato='verificato' returning id,stato")).rows).toEqual([{ id: ddt, stato: "verificato" }]);
  expect((await db.query("update ddt_righe set descrizione='Controllato' returning id")).rows).toEqual([{ id: ddt }]);
});
it("consente di creare una bolla aziendale con le sue righe senza magazzino", async () => {
  const nuovo = "00000000-0000-4000-a000-000000000005";
  await db.query("insert into ddt_ricezione(id,company_id,stato) values($1,$2,'ricevuto')", [nuovo, azienda]);
  await db.query("insert into ddt_righe values($1,$2,$1,'Nuovo articolo')", [nuovo, azienda]);
  expect((await db.query("select id from ddt_righe where id=$1", [nuovo])).rows).toHaveLength(1);
});
it("non legge o modifica documenti di un’altra azienda e non può trasferirvi una bolla", async () => {
  expect((await db.query("select id from ddt_righe where company_id=$1", [altra])).rows).toHaveLength(0);
  expect((await db.query("update ddt_ricezione set stato='verificato' where id=$1 returning id", [altroDdt])).rows).toHaveLength(0);
  await expect(db.query("update ddt_ricezione set company_id=$1 where id=$2", [altra, ddt])).rejects.toThrow(/row-level security/);
});
it("mantiene la lettura ma blocca le scritture dell’utente in sola lettura", async () => {
  await db.exec("select set_config('test.readonly','true',false)");
  expect((await db.query("select id from ddt_righe where id=$1", [ddt])).rows).toHaveLength(1);
  expect((await db.query("update ddt_ricezione set stato='verificato' returning id")).rows).toHaveLength(0);
  expect((await db.query("update ddt_righe set descrizione='Vietato' returning id")).rows).toHaveLength(0);
});
it.each(["blocked", "external"])("non apre l’accesso Acquisti all’utente %s", async (flag) => {
  await db.query("select set_config($1,'true',false)", [`test.${flag}`]);
  expect((await db.query("select id from ddt_ricezione")).rows).toHaveLength(0);
  expect((await db.query("select id from ddt_righe")).rows).toHaveLength(0);
});
it("richiede il permesso Acquisti per l’azienda specifica", async () => {
  await db.exec("select set_config('test.purchasing','false',false)");
  expect((await db.query("select id from ddt_ricezione")).rows).toHaveLength(0);
  expect((await db.query("select id from ddt_righe")).rows).toHaveLength(0);
});

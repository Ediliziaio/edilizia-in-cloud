import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const migration = readFileSync("supabase/migrations/20261026200115_hr_affidabilita_atomica.sql", "utf8");
const company = "10000000-0000-4000-8000-000000000001";
const person = "10000000-0000-4000-8000-000000000002";
const candidate = "10000000-0000-4000-8000-000000000003";
async function setup() {
  const db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated;
    create type app_role as enum ('super_admin','company_admin');
    create function auth.uid() returns uuid language sql stable as $$select '${person}'::uuid$$;
    create function e_amministratore_di(uuid) returns boolean language sql stable as $$select $1='${company}'::uuid$$;
    create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
    create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select false$$;
    create table profiles(id uuid primary key,company_id uuid);
    create table company_uffici(id uuid primary key default gen_random_uuid(),company_id uuid,nome text,descrizione text,responsabile_id uuid,colore text,attivo boolean,updated_at timestamptz);
    create table ufficio_membri(ufficio_id uuid,profile_id uuid,company_id uuid,primary key(ufficio_id,profile_id));
    create table hr_festivita(id uuid default gen_random_uuid(),company_id uuid,data date,descrizione text,ricorrente boolean);
    create table gps_positions(id uuid default gen_random_uuid(),company_id uuid,user_id uuid,lat float,lng float,accuracy float,speed float,battery_level float,recorded_at timestamptz);
    create table hr_profili(id uuid primary key default gen_random_uuid(),company_id uuid,nome text,cognome text,email text,telefono text,mansione text,attivo boolean,
      tipo_contratto text,ccnl text,nazionalita text,ore_settimanali numeric,ore_giornaliere numeric,orario_tipo text,giorni_lavorativi text[],
      ferie_anno_giorni numeric,ferie_residue numeric,permessi_anno_ore numeric,permessi_residui_ore numeric,rol_anno_ore numeric,rol_residuo_ore numeric,note_interne text);
    create table hr_candidati(id uuid primary key,company_id uuid,nome text,cognome text,email text,telefono text,ruolo text,note text,hr_profilo_id uuid,stato text,updated_at timestamptz);
    insert into profiles values('${person}','${company}');
    insert into hr_candidati(id,company_id,nome,cognome,ruolo) values('${candidate}','${company}','Test','Persona','Tecnico');`);
  await db.exec(migration);
  return db;
}
describe("operazioni HR atomiche", () => {
  it("saves an office and deduplicated members including its manager", async () => {
    const db=await setup(); try {
      const {rows}=await db.query<{id:string}>(`select hr_salva_ufficio('${company}',null,'{"nome":"Tecnico","responsabile_id":"${person}"}',array['${person}'::uuid,'${person}'::uuid]) id`);
      expect(rows[0].id).toBeTruthy();
      expect((await db.query("select * from ufficio_membri")).rows).toHaveLength(1);
      await db.exec(`create function fail_members() returns trigger language plpgsql as $$begin raise exception 'test failure'; end$$;
        create trigger fail before insert on ufficio_membri for each row execute function fail_members();`);
      await expect(db.query(`select hr_salva_ufficio('${company}','${rows[0].id}','{"nome":"Changed"}',array['${person}'::uuid])`)).rejects.toThrow("test failure");
      expect((await db.query("select nome from company_uffici")).rows).toEqual([{nome:"Tecnico"}]);
      expect((await db.query("select * from ufficio_membri")).rows).toHaveLength(1);
    } finally {await db.close();}
  },30000);
  it("rejects an unknown/cross-company member before making any office", async () => {
    const db=await setup(); try {
      await expect(db.query(`select hr_salva_ufficio('${company}',null,'{"nome":"Test"}',array['${candidate}'::uuid])`)).rejects.toThrow("stessa azienda");
      expect((await db.query("select * from company_uffici")).rows).toHaveLength(0);
    } finally {await db.close();}
  },30000);
  it("links a candidate once, without fabricating a contract or nationality", async () => {
    const db=await setup(); try {
      const a=await db.query(`select hr_collega_candidato('${company}','${candidate}') id`);
      const b=await db.query(`select hr_collega_candidato('${company}','${candidate}') id`);
      expect(a.rows).toEqual(b.rows);
      expect((await db.query("select tipo_contratto,nazionalita,ccnl,ore_giornaliere,ferie_residue from hr_profili")).rows).toEqual([{tipo_contratto:null,nazionalita:null,ccnl:null,ore_giornaliere:null,ferie_residue:null}]);
    } finally {await db.close();}
  },30000);
  it("rolls back the profile if the candidate link cannot be written", async () => {
    const db=await setup(); try {
      await db.exec(`create function fail_link() returns trigger language plpgsql as $$begin raise exception 'link failure'; end$$;
        create trigger fail before update on hr_candidati for each row execute function fail_link();`);
      await expect(db.query(`select hr_collega_candidato('${company}','${candidate}')`)).rejects.toThrow("link failure");
      expect((await db.query("select * from hr_profili")).rows).toHaveLength(0);
    } finally {await db.close();}
  },30000);
  it("imports holidays once, honoring recurrence and ignoring one-off dates from other years", async () => {
    const db=await setup(); try {
      await db.exec(`insert into hr_festivita(company_id,data,descrizione,ricorrente) values('${company}','2025-01-01','Old one-off',false),('${company}','2025-12-25','Recurring',true);`);
      const payload=JSON.stringify([{data:"2026-01-01",descrizione:"Capodanno",ricorrente:true},{data:"2026-12-25",descrizione:"Natale",ricorrente:true}]);
      const first=await db.query<{n:number}>(`select hr_importa_festivita($1,2026,$2) n`,[company,payload]);
      const retry=await db.query<{n:number}>(`select hr_importa_festivita($1,2026,$2) n`,[company,payload]);
      expect(first.rows[0].n).toBe(1); expect(retry.rows[0].n).toBe(0);
      await expect(db.query(`select hr_importa_festivita($1,2026,$2)`,[company,JSON.stringify([{data:"2026-05-01",descrizione:"Valid"},{data:"2025-12-24",descrizione:"Invalid year"}])])).rejects.toThrow("non valida");
      expect((await db.query("select * from hr_festivita where data='2026-05-01'")).rows).toHaveLength(0);
    } finally {await db.close();}
  },30000);
  it("exposes no new public/anonymous or security-definer entrypoint", async () => {
    const db=await setup(); try {
      const {rows}=await db.query<{proname:string;prosecdef:boolean;anon:boolean}>(`select proname,prosecdef,has_function_privilege('anon',oid,'execute') anon from pg_proc where proname in ('hr_collega_candidato','hr_salva_ufficio','hr_importa_festivita')`);
      expect(rows).toHaveLength(3); rows.forEach(r=>{expect(r.prosecdef).toBe(false);expect(r.anon).toBe(false);});
    } finally {await db.close();}
  },30000);
  it("does not lose technicians because another user uploaded more than 200 samples", async () => {
    const db=await setup(); try {
      await db.exec(`insert into gps_positions(company_id,user_id,lat,lng,recorded_at) select '${company}','${person}',45,9,now()-n*interval '1 second' from generate_series(1,250) n;
        insert into gps_positions(company_id,user_id,lat,lng,recorded_at) values('${company}','${candidate}',45,9,now()-interval '1 hour');`);
      const {rows}=await db.query<{positions:unknown[]}>(`select hr_gps_ultime_posizioni('${company}') positions`);
      expect(rows[0].positions).toHaveLength(2);
    }finally {await db.close();}
  },30000);
});

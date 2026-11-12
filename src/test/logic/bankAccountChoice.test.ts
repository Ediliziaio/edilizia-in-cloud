import {beforeAll,afterAll,beforeEach,expect,it} from "vitest";
import {readFile} from "node:fs/promises";
import {SaltTestDatabase} from "../helpers/saltedgeDatabase";
const db=new SaltTestDatabase();const c="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",other="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",conn="dddddddd-dddd-4ddd-dddd-dddddddddddd";
const ids=[1,2,3,4].map(n=>`eeeeeeee-eeee-4eee-aeee-eeeeeeeeeee${n}`);
beforeAll(async()=>{await db.setup();await db.pg.exec(`
 CREATE SCHEMA vault;CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);INSERT INTO vault.decrypted_secrets VALUES('cron_secret','synthetic');
 CREATE SCHEMA net;CREATE TABLE net.requests(body jsonb);
 CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$BEGIN INSERT INTO net.requests VALUES(body);RETURN 1;END$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT 'cccccccc-cccc-4ccc-cccc-cccccccccccc'::uuid$$;
 CREATE FUNCTION public.utente_bloccato() RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.blocked',true)='true'$$;
 CREATE FUNCTION public.has_permission_for_company(uuid,text,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $3='${c}' AND coalesce(current_setting('test.denied',true),'false')<>'true'$$;
 CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT current_setting('test.admin',true)='true'$$;
 `);await db.pg.exec(await readFile("supabase/migrations/20290316130000_bank_account_choice_and_schedule.sql","utf8"));},30000);
afterAll(()=>db.pg.close());
beforeEach(async()=>{await db.pg.exec(`reset role;set test.blocked='false';set test.denied='false';set test.admin='false';TRUNCATE bank_sync_runs,bank_account_choices,bank_sync_settings,bank_accounts,bank_connections,net.requests CASCADE;
 INSERT INTO bank_sync_settings(company_id,account_limit,automatic_sync) VALUES('${c}',3,true);
 INSERT INTO bank_connections(id,company_id,provider_slug,institution_id,institution_name,status,provider_connection_id) VALUES('${conn}','${c}','distyra','test','Test','linked','remote');
 ${ids.map((id,i)=>`INSERT INTO bank_accounts(id,company_id,connection_id,external_account_id,is_active) VALUES('${id}','${c}','${conn}','a${i}',true);`).join('\n')}`);});
it("non preseleziona conti; conferma tre conti e la quarta scelta non cambia nulla",async()=>{
 expect((await db.pg.query<{n:number}>("select count(*)::int n from bank_accounts where is_active")).rows[0].n).toBe(0);
 await db.pg.query("select bank_select_accounts($1,$2::uuid[])",[c,ids.slice(0,3)]);
 expect((await db.pg.query<{n:number}>("select count(*)::int n from bank_accounts where is_active")).rows[0].n).toBe(3);
 await expect(db.pg.query("select bank_select_accounts($1,$2::uuid[])",[c,ids])).rejects.toThrow(/massimo 3/);
 expect((await db.pg.query<{n:number}>("select count(*)::int n from bank_account_choices")).rows[0].n).toBe(3);
});
it("finalize e saldi non riattivano il quarto conto",async()=>{
 await db.pg.query("select bank_select_accounts($1,$2::uuid[])",[c,[ids[0]]]);await db.pg.exec("update bank_accounts set is_active=true");
 await db.pg.exec(`insert into bank_accounts(company_id,connection_id,external_account_id,is_active) values('${c}','${conn}','a0',true) on conflict(company_id,external_account_id) do update set is_active=excluded.is_active;`);
 expect((await db.pg.query<{n:number}>("select count(*)::int n from bank_accounts where is_active")).rows[0].n).toBe(1);
});
it("scelta revocabile, duplicati e conti di altra azienda rifiutati",async()=>{
 await expect(db.pg.query("select bank_select_accounts($1,$2::uuid[])",[c,[ids[0],ids[0]]])).rejects.toThrow(/massimo/);
 await expect(db.pg.query("select bank_select_accounts($1,$2::uuid[])",[other,ids.slice(0,1)])).rejects.toThrow(/Accesso negato/);
 await expect(db.pg.query("select bank_select_accounts($1,$2::uuid[])",[c,["ffffffff-ffff-4fff-afff-ffffffffffff"]])).rejects.toThrow(/non disponibile/);
 await db.pg.query("select bank_select_accounts($1,$2::uuid[])",[c,[]]);
});
it("solo superadmin aumenta il limite e abilita il quarto senza sceglierlo",async()=>{
 await expect(db.pg.query("select bank_set_account_limit($1,4)",[c])).rejects.toThrow(/Solo il superadmin/);
 await db.pg.exec("set test.admin='true'");await db.pg.query("select bank_set_account_limit($1,4)",[c]);
 expect((await db.pg.query<{n:number}>("select count(*)::int n from bank_account_choices")).rows[0].n).toBe(0);
 await db.pg.query("select bank_select_accounts($1,$2::uuid[])",[c,ids]);
 await expect(db.pg.query("select bank_set_account_limit($1,3)",[c])).rejects.toThrow(/Riduci prima/);
});
it("schedula alle 7 e 18 italiane, estate e inverno, senza duplicati né conti non scelti",async()=>{
 const run=async(t:string)=>(await db.pg.query<{n:number}>("select bank_sync_enqueue($1::timestamptz) n",[t])).rows[0].n;
 expect(await run("2026-11-13T06:00:00Z")).toBe(0);
 await db.pg.query("select bank_select_accounts($1,$2::uuid[])",[c,[ids[0]]]);
 expect(await run("2026-11-13T05:00:00Z")).toBe(0);
 expect(await run("2026-11-13T06:00:00Z")).toBe(1);expect(await run("2026-11-13T06:00:00Z")).toBe(0);
 expect(await run("2026-11-13T17:00:00Z")).toBe(1);
 expect(await run("2027-07-13T05:00:00Z")).toBe(1);expect(await run("2027-07-13T16:00:00Z")).toBe(1);
 expect((await db.pg.query<{n:number}>("select count(*)::int n from net.requests")).rows[0].n).toBe(4);
});
it("ruoli pubblici non modificano limiti o scelte direttamente né lanciano il job",async()=>{
 await db.pg.exec("set role authenticated");
 await expect(db.pg.exec("update bank_sync_settings set account_limit=99")).rejects.toThrow(/permission denied/);
 await expect(db.pg.exec("delete from bank_account_choices")).rejects.toThrow(/permission denied/);
 await expect(db.pg.exec("select bank_sync_enqueue(now())")).rejects.toThrow(/permission denied/);
});

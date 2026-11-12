import { PGlite } from "@electric-sql/pglite";
import { afterAll,beforeAll,expect,it } from "vitest";
import { readFile } from "node:fs/promises";
const pg=new PGlite();
const company='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', other='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', user='cccccccc-cccc-4ccc-cccc-cccccccccccc', employee='dddddddd-dddd-4ddd-dddd-dddddddddddd';
beforeAll(async()=>{
 await pg.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.role() returns text language sql stable as $$select current_setting('test.role',true)$$;
 select set_config('test.role','service_role',false);
 create table profiles(id uuid,company_id uuid,deleted_at timestamptz,is_blocked boolean);
 insert into profiles values('${user}','${company}',null,false);
 create table employees(id uuid primary key default gen_random_uuid(),company_id uuid,user_id uuid,portal_user_id uuid,first_name text,last_name text,email text,phone text,role_type text,is_active boolean,updated_at timestamptz);
 create table assignments(employee_id uuid references employees(id),site text);
 insert into employees(id,company_id,first_name,last_name,is_active) values('${employee}','${company}','Sauro','Stacchetti',true);
 insert into assignments values('${employee}','Cantiere originale');`);
 await pg.exec(await readFile('work/personale-accessi/schema.sql','utf8'));
},30_000);
afterAll(()=>pg.close());
it('riconosce il nome senza email, con maiuscole e spazi diversi, senza creare duplicati',async()=>{
 await expect(pg.query(`select dipendente_accesso_prepara('${company}',' SAURO ',' STACCHETTI ','nuova@example.test',null)`)).rejects.toThrow(/già presente/);
 expect((await pg.query('select count(*)::int as n from employees')).rows[0]).toEqual({n:1});
});
it('rifiuta selezioni appartenenti a un’altra azienda',async()=>{
 await expect(pg.query(`select dipendente_accesso_prepara('${other}','Sauro','Stacchetti','test@example.test','${employee}')`)).rejects.toThrow(/questa azienda/);
});
it('collega la scheda selezionata e mantiene il cantiere originale',async()=>{
 await pg.query(`select collega_dipendente_accesso('${company}','${user}','${employee}','SAURO','STACCHETTI','login@example.test')`);
 expect((await pg.query(`select e.id,a.site from employees e join assignments a on a.employee_id=e.id where e.user_id='${user}'`)).rows).toEqual([{id:employee,site:'Cantiere originale'}]);
 expect((await pg.query('select count(*)::int as n from employees')).rows[0]).toEqual({n:1});
 await expect(pg.query(`select collega_dipendente_accesso('${company}','${user}','${employee}','Sauro','Stacchetti','login@example.test')`)).rejects.toThrow(/già un accesso/);
});
it('non espone la procedura di collegamento agli utenti del browser',async()=>{
 const {rows}=await pg.query("select has_function_privilege('authenticated','public.collega_dipendente_accesso(uuid,uuid,uuid,text,text,text,text,text)','execute') as allowed");
 expect(rows[0]).toEqual({allowed:false});
});

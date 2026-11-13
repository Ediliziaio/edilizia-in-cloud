import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const pg=new PGlite();
const company='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',mezzo='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
beforeAll(async()=>{
 await pg.exec(`create table mezzi(id uuid,company_id uuid,rata_mensile numeric,deleted_at timestamptz,possesso text);
 create table fattura_ricevuta_mezzi(mezzo_id uuid,company_id uuid,fattura_ricevuta_id text,importo numeric,confermata boolean);
 create table fatture_ricevute(id text,company_cost_id text,cedente_ragione_sociale text,righe jsonb,data_fattura date,stato text);
 create table company_costs(id text,order_id uuid);
 create table mezzi_documenti(mezzo_id uuid,company_id uuid,categoria text,titolo text,importo numeric,data_scadenza date,created_at timestamptz);
 create table mezzi_manutenzioni(mezzo_id uuid,company_id uuid,costo numeric,data date);
 create table rapportino_mezzi_costi(mezzo_id uuid,company_id uuid,ore numeric,data_lavoro date);
 create function mezzo_spesa_tipo(text) returns text language sql immutable as $$select 'carburante'::text$$;
 insert into mezzi values('${mezzo}','${company}',null,null,'proprieta');
 insert into fatture_ricevute values('f',null,'Fornitore','[]',current_date,'letta'),('n',null,'Fornitore','[]',current_date,'letta');
 insert into fattura_ricevuta_mezzi values('${mezzo}','${company}','f',100,true),('${mezzo}','${company}','n',500,false);`);
 const original=await readFile('supabase/migrations/20290116240000_mezzi_costo_orario_e_quota_commessa.sql','utf8');
 const start=original.indexOf('create or replace function public.mezzi_spese_12_mesi');
 await pg.exec(original.slice(start,original.indexOf('revoke all on function public.mezzi_spese_12_mesi',start)));
 const fix=await readFile('supabase/migrations/20290317111500_mezzi_costi_solo_associazioni_confermate.sql','utf8');await pg.exec(fix);await pg.exec(fix);
 const coperture=await readFile('supabase/migrations/20290317114500_mezzi_costi_coperture_distinte.sql','utf8');await pg.exec(coperture);await pg.exec(coperture);
});
afterAll(()=>pg.close());
async function total(){return Number((await pg.query<{totale:string}>('select totale from mezzi_spese_12_mesi($1,$2)',[company,mezzo])).rows[0].totale);}
it('le proposte non confermate non entrano nei costi del mezzo',async()=>{expect(await total()).toBe(100);});
it('conferma e rimozione aggiornano il costo senza duplicare la fattura',async()=>{
 await pg.exec("update fattura_ricevuta_mezzi set confermata=true where fattura_ricevuta_id='n'");expect(await total()).toBe(600);
 await pg.exec("update fattura_ricevuta_mezzi set confermata=false where fattura_ricevuta_id='n'");expect(await total()).toBe(100);
});
it('le note di credito confermate riducono il costo e i documenti rifiutati restano esclusi',async()=>{
 await pg.exec("update fattura_ricevuta_mezzi set confermata=true,importo=-20 where fattura_ricevuta_id='n'");expect(await total()).toBe(80);
 await pg.exec("update fatture_ricevute set stato='rifiutata' where id='n'");expect(await total()).toBe(100);
});

it('somma RCA e CVT distinti senza raddoppiare il rinnovo RCA',async()=>{
 await pg.exec(`insert into mezzi_documenti values('${mezzo}','${company}','assicurazione','RCA',100,'2027-01-01',now()),('${mezzo}','${company}','assicurazione','RCA',120,'2028-01-01',now()),('${mezzo}','${company}','assicurazione','CVT',50,'2027-06-30',now());`);
 expect(await total()).toBe(270);
});

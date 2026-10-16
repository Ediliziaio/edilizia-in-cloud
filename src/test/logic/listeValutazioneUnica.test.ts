import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll,afterEach,beforeAll,describe,expect,it } from 'vitest';
const db=new PGlite();
const original=readFileSync('supabase/migrations/20280905300000_liste_automatiche.sql','utf8');
const section=(s:string,start:string,end:string)=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)));
const before=section(original,'create or replace function public.sincronizza_lista','revoke all on function public.sincronizza_lista');
const matcher=readFileSync('supabase/migrations/20280917121000_liste_regola_email_pec.sql','utf8');
const matcherSql=matcher;
const migration=readFileSync('supabase/migrations/20261016113616_liste_valutazione_unica.sql','utf8');
const company='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',list='cccccccc-cccc-4ccc-cccc-cccccccccccc';
beforeAll(async()=>{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
    CREATE TABLE marketing_contacts(id uuid PRIMARY KEY,company_id uuid,deleted_at timestamptz,tags text[],source text,fatturato numeric,email text,phone text,website text,vat_number text,unsubscribed boolean,optout_email boolean,region text,province text,city text,ateco_code text,company_name text);
    CREATE TABLE marketing_contact_lists(id uuid PRIMARY KEY,company_id uuid,regola jsonb,regola_aggiornata_il timestamptz,updated_at timestamptz);
    CREATE TABLE marketing_contact_list_members(list_id uuid,contact_id uuid,PRIMARY KEY(list_id,contact_id));
    CREATE TABLE marketing_custom_fields(id uuid,company_id uuid,name text,deleted_at timestamptz);
    CREATE TABLE marketing_contact_field_values(contact_id uuid,field_id uuid,value text);`);
  if(!matcherSql.includes('CREATE')&&!matcherSql.includes('create'))throw Error('Fixture matcher missing');
  await db.exec(matcherSql+before+'REVOKE ALL ON FUNCTION sincronizza_lista(uuid) FROM PUBLIC,anon,authenticated;');
},60000);
afterEach(()=>db.exec('ROLLBACK'));afterAll(()=>db.close());
const rules=[{tipo:'tag',tag:'edile'},{tipo:'fonte',valori:['meta']},{tipo:'email_contattabile'},{tipo:'solo_telefono'},{tipo:'senza_contatti'},
  {tipo:'tutte',regole:[{tipo:'email_contattabile'},{tipo:'tag',tag:'edile'}]}, {tipo:'qualsiasi',regole:[{tipo:'tag',tag:'edile'},{tipo:'fonte',valori:['meta']}]},
  {tipo:'non',regola:{tipo:'tag',tag:'edile'}},{tipo:'fatturato_minimo',euro:100},{tipo:'regione',valori:['Piemonte']}];
describe('liste: stessi iscritti e conteggi senza rivalutazione per rimozione',()=>{
  it.each(rules)('regola $tipo',async rule=>{
    await db.exec('BEGIN');await db.query('INSERT INTO marketing_contact_lists(id,company_id,regola) VALUES($1,$2,$3)',[list,company,rule]);
    for(let n=1;n<=12;n++){
      const id=`dddddddd-dddd-4ddd-dddd-${String(n).padStart(12,'0')}`;
      await db.query('INSERT INTO marketing_contacts(id,company_id,deleted_at,tags,source,email,phone,fatturato,region) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id,n===12?other:company,n===11?'2026-10-01':null,n%3===0?null:n%2===0?['edile']:[],n%3===0?null:'meta',n%2===0?'sintetico@example.test':null,'123',n*40,'Piemonte']);
      if(n%2===1||n===12)await db.query('INSERT INTO marketing_contact_list_members VALUES($1,$2)',[list,id]);
    }
    await db.query('INSERT INTO marketing_contact_list_members VALUES($1,$2)',[list,other]);
    await db.exec('SAVEPOINT scenario');
    const counts=(await db.query('SELECT * FROM sincronizza_lista($1)',[list])).rows;
    const members=(await db.query('SELECT * FROM marketing_contact_list_members ORDER BY contact_id')).rows;
    await db.exec('ROLLBACK TO scenario;'+migration);
    expect((await db.query('SELECT * FROM sincronizza_lista($1)',[list])).rows).toEqual(counts);
    expect((await db.query('SELECT * FROM marketing_contact_list_members ORDER BY contact_id')).rows).toEqual(members);
    expect((await db.query('SELECT * FROM sincronizza_lista($1)',[list])).rows).toEqual([{aggiunti:0,rimossi:0}]);
  });
  it('lista senza regola resta no-op e ACL non si allargano',async()=>{
    await db.exec('BEGIN;'+migration);
    expect((await db.query('SELECT * FROM sincronizza_lista($1)',[list])).rows).toEqual([{aggiunti:0,rimossi:0}]);
    expect((await db.query("SELECT has_function_privilege('anon','sincronizza_lista(uuid)','execute') AS allowed")).rows).toEqual([{allowed:false}]);
  });
});

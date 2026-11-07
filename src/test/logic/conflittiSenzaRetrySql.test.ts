import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {beforeAll,afterAll,it,expect} from 'vitest';
const migration=readFileSync('supabase/migrations/20281216150000_conflitti_http_senza_retry.sql','utf8');
let db:PGlite;
let original:Record<string,unknown>[];
beforeAll(async()=>{
 db=new PGlite();await db.waitReady;
 await db.exec(`
 create role authenticated;
 create table graphs(id integer primary key,version integer not null,payload text);
 insert into graphs values(1,2,'Dati del collega');
 create function public.save_automation_graph(expected integer, next_data text) returns integer language plpgsql security invoker set search_path='' as $fn$
 declare actual integer;begin
 select version into actual from public.graphs where id=1 for update;
 if expected<>actual then raise exception 'Versione modificata altrove' using errcode='40001';end if;
 update public.graphs set payload=next_data where id=1 returning version into actual;
 return actual;
 end;$fn$;
 revoke all on function public.save_automation_graph(integer,text) from public;
 grant execute on function public.save_automation_graph(integer,text) to authenticated;
 create function public.versione_riga() returns trigger language plpgsql security definer set search_path=public as $fn$
 begin if new.version<>old.version then raise exception 'Ricarica prima di salvare' using errcode = '40001';end if;
 new.version:=old.version+1;return new;end;$fn$;
 create trigger check_version before update on graphs for each row execute function versione_riga();
 create function public.real_serialization_failure() returns void language plpgsql as $fn$ begin raise exception 'Transazione serializzabile' using errcode='40001';end;$fn$;
 create function public.literal_error_code() returns text language sql as $fn$ select '40001'::text $fn$;
 `);
 original=(await db.query<Record<string,unknown>>(`select oid,proname,prosecdef,proconfig,proacl::text from pg_proc where proname in ('save_automation_graph','versione_riga') order by oid`)).rows;
 await db.exec(migration);
},30000);
afterAll(async()=>{await db?.close();});
it('un conflitto applicativo restituisce PT409 e non il codice che induce il retry di PostgREST',async()=>{
 await expect(db.query(`select save_automation_graph(1,'Versione obsoleta')`)).rejects.toMatchObject({code:'PT409',message:'Versione modificata altrove'});
 expect((await db.query(`select version,payload from graphs`)).rows).toEqual([{version:2,payload:'Dati del collega'}]);
});
it('anche i conflitti dei trigger restituiscono PT409 senza sovrascrivere i dati',async()=>{
 await expect(db.query(`update graphs set version=1,payload='Obsoleto' where id=1`)).rejects.toMatchObject({code:'PT409'});
 expect((await db.query(`select payload from graphs`)).rows).toEqual([{payload:'Dati del collega'}]);
});
it('identità, permessi, modalità di sicurezza e search_path restano invariati',async()=>{
 expect((await db.query(`select oid,proname,prosecdef,proconfig,proacl::text from pg_proc where proname in ('save_automation_graph','versione_riga') order by oid`)).rows).toEqual(original);
});
it('non trasforma veri errori serializzabili esterni al manifest né stringhe applicative',async()=>{
 await expect(db.query('select real_serialization_failure()')).rejects.toMatchObject({code:'40001'});
 expect((await db.query('select literal_error_code() as code')).rows).toEqual([{code:'40001'}]);
});
it('la migrazione è idempotente',async()=>{
 await db.exec(migration);
 await expect(db.query(`select save_automation_graph(1,'Obsoleto')`)).rejects.toMatchObject({code:'PT409'});
});

it('un salvataggio valido continua ad aggiornare i dati una sola volta',async()=>{
 expect((await db.query(`select save_automation_graph(2,'Dati nuovi') as version`)).rows).toEqual([{version:3}]);
 expect((await db.query(`select version,payload from graphs`)).rows).toEqual([{version:3,payload:'Dati nuovi'}]);
});

it('le nuove migrazioni non reintroducono conflitti applicativi ritentati dal gateway',()=>{
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f.slice(0,14)>'20281216150000')){
  expect(readFileSync(`supabase/migrations/${file}`,'utf8'),file).not.toMatch(/\berrcode\s*=\s*'40001'/i);
 }
});

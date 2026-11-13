import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { documentiConStato } from '@/types/mezzi';
const pg = new PGlite();
beforeAll(async () => {
  await pg.exec(`create table mezzi_documenti (id text,mezzo_id text,categoria text,titolo text,data_scadenza date,created_at timestamptz);
    alter table mezzi_documenti enable row level security;
    create role authenticated; grant usage on schema public to authenticated;
    grant select on mezzi_documenti to authenticated;
    create policy tenant on mezzi_documenti to authenticated using(mezzo_id=current_setting('test.mezzo',true));
    create view mezzi_scadenze with(security_invoker=true) as with documenti as (
      select d.*,row_number() over(partition by d.mezzo_id,case when d.categoria='altro' then d.id::text else d.categoria end order by d.data_scadenza desc,d.created_at desc) rn from mezzi_documenti d where d.data_scadenza is not null
    ) select id,mezzo_id,categoria,titolo,data_scadenza from documenti where rn=1;
    grant select on mezzi_scadenze to authenticated;`);
  const sql = await readFile('supabase/migrations/20290317110000_mezzi_scadenze_obblighi_distinti.sql','utf8');
  await pg.exec(sql); await pg.exec(sql);
  await pg.exec(`insert into mezzi_documenti values
    ('t','neofin','verifica_periodica','Controllo trimestrale','2026-10-08',now()),
    ('a','neofin','verifica_periodica','Controllo annuale','2027-02-04',now()),
    ('v','neofin','verifica_periodica','Controllo ventennale','2044-12-23',now()),
    ('other','altro-mezzo','verifica_periodica','Controllo trimestrale','2027-10-08',now());`);
});
afterAll(()=>pg.close());
it('NEOFIN: tutti e tre gli obblighi restano nello scadenzario',async()=>{
  const r=await pg.query('select id from mezzi_scadenze where mezzo_id=\'neofin\' order by id');
  expect(r.rows.map(x=>x.id)).toEqual(['a','t','v']);
});
it('stessa descrizione: il rinnovo esclude solo il precedente; UI e database concordano',async()=>{
  await pg.exec(`insert into mezzi_documenti values ('t2','neofin','verifica_periodica','  CONTROLLO   trimestrale  ','2027-01-08',now());`);
  const r=await pg.query('select id from mezzi_scadenze where mezzo_id=\'neofin\' order by id');
  expect(r.rows.map(x=>x.id)).toEqual(['a','t2','v']);
  const docs=await pg.query<{id:string;categoria:'verifica_periodica';titolo:string;data_scadenza:string}>('select id,categoria,titolo,data_scadenza::text from mezzi_documenti where mezzo_id=\'neofin\'');
  expect(documentiConStato(docs.rows.map(x=>({...x,alert_giorni_prima:60})),'2026-11-13').filter(x=>x.stato!=='sostituito').map(x=>x.id).sort()).toEqual(['a','t2','v']);
});
it('la vista continua a rispettare RLS',async()=>{
 await pg.exec(`select set_config('test.mezzo','neofin',false);set role authenticated;`);
 const r=await pg.query('select distinct mezzo_id from mezzi_scadenze');
 expect(r.rows).toEqual([{mezzo_id:'neofin'}]);
 await pg.exec('reset role');
});

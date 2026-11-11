import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';import {it,expect} from 'vitest';
it('accepts the known tenant-hardened predecessor but still aborts unknown policy changes',async()=>{
 const source=readFileSync('supabase/migrations/20280914200001_ruoli_e_azienda_una_volta_per_query_lotto_01.sql','utf8');const start=source.indexOf('-- These exact reconstructed predecessors');const end=source.indexOf('v_using :=',start);expect(start).toBeGreaterThan(0);const guard=source.slice(start,end);
 const db=new PGlite();try{
  const run=(using:string)=>db.exec(`DO $test$ DECLARE r record;BEGIN SELECT 'listino_griglia'::text AS tabella,'lg_company'::text AS nome,'cb0c7cfff96bb4d1960aba33d3584b72'::text AS impronta,${"'"+using.replaceAll("'","''")+"'"}::text AS u,NULL::text AS c INTO r;${guard}END $test$;`);
  await run('((company_id = public.get_my_company_id()) AND (NOT public.utente_e_cliente_esterno()))');
  await expect(run('true')).rejects.toThrow(/cambiata dopo il censimento/);
 }finally{await db.close()}
},60000);

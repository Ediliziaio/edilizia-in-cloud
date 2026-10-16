import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { normalizeMarginalitaCommesse, type MarginalitaCommesseResult } from '../../../supabase/functions/_shared/marginalitaCommesse';
let db:PGlite;
const company='00000000-0000-0000-0000-000000000001';
async function rpc(name:string,args:string) {const r=await db.query<{data:Record<string,any>}>(`select public.${name}(${args}) as data`);return r.rows[0].data;}
function value(ce:Record<string,any>,code:string):number {return Number(ce.voci.find((v:{codice:string})=>v.codice===code).valore);}
beforeAll(async()=>{db=new PGlite();await db.exec(readFileSync('src/test/fixtures/cgReconciliation.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20281016184304_cg_scadenze_commesse_riconciliazione.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20281016184304_cg_scadenze_commesse_riconciliazione.sql','utf8'));},30000);
afterAll(async()=>{await db.close();});
describe('CG: scadenze e riconciliazione reale SQL',()=>{
 it('normalizza in/out, esclude pagate/annullate e usa il residuo',async()=>{
  await db.exec(`insert into scadenze(company_id,direction,status,amount,paid_amount,due_date) values ('${company}','uscita','da_pagare',100,20,current_date-1),('${company}','uscita','pagata',700,0,current_date),('${company}','uscita','annullata',500,0,current_date),('${company}','entrata','parziale',200,50,current_date+5),('00000000-0000-0000-0000-000000000002','uscita','da_pagare',999,0,current_date)`);
  const out=await rpc('cg_get_aging',`'${company}','out'`);expect(out).toMatchObject({totale:80,n_aperte:1,n_scadute:1});
  expect(await rpc('cg_get_aging',`'${company}','uscita'`)).toMatchObject({totale:80,n_aperte:1,n_scadute:1});
  expect(await rpc('cg_get_aging',`'${company}','in'`)).toMatchObject({totale:150,n_aperte:1,n_scadute:0});
  await expect(rpc('cg_get_aging',`'${company}','invalid'`)).rejects.toThrow();
 });
 it('non permette di leggere un’altra azienda',async()=>{await expect(rpc('cg_get_aging',"'00000000-0000-0000-0000-000000000002','out'")).rejects.toThrow('Accesso negato');});
 it('mantiene gli stati workflow anche con avanzamento incoerente e non include archiviate',async()=>{
  await db.exec(`insert into order_statuses values ('10000000-0000-0000-0000-000000000001','${company}',1,false),('10000000-0000-0000-0000-000000000002','${company}',2,false),('10000000-0000-0000-0000-000000000003','${company}',3,true)`);
  for(const [id,phase,progress,year,archived] of [[1,1,100,2026,false],[2,2,0,2026,false],[3,3,100,2025,false],[4,1,50,2026,true],[5,2,100,2025,false],[6,1,0,2025,false]] as const){
   const oid=`20000000-0000-0000-0000-${String(id).padStart(12,'0')}`;
   await db.exec(`insert into orders values ('${oid}','${company}','10000000-0000-0000-0000-00000000000${phase}','in_corso','completed',${archived?'now()':'null'},'${year}-01-01',${progress});insert into v_ordine_marginalita(id,company_id,order_code,description,preventivo_contratto,preventivo_totale,consuntivo,margine) values ('${oid}','${company}','N${id}','test',1000,1000,300,700)`);
  }
  const result=await rpc('cg_get_marginalita_commesse',`'${company}',2026,null`);
  expect(result.kpi).toMatchObject({n_commesse:4,n_in_corso:2,n_completate:1,n_assistenza:1,n_anno:2,n_pregresso:2});
  const normalized=normalizeMarginalitaCommesse(result as unknown as MarginalitaCommesseResult);
  expect(normalized.kpi).toMatchObject({n_commesse:4,n_in_corso:2,n_completate:1,n_assistenza:1});
  expect((await rpc('cg_get_marginalita_commesse',`'${company}',2026,'completato'`)).righe).toHaveLength(1);
  expect((await rpc('cg_get_marginalita_commesse',`'${company}',2026,'assistenza'`)).righe).toHaveLength(1);
  await db.exec(`insert into order_installments values ('20000000-0000-0000-0000-000000000005',false,10)`);
  expect((await rpc('cg_get_marginalita_commesse',`'${company}',2026,null`)).kpi.n_commesse).toBe(5);
 });
 it('CE mensile e annuale coincidono per tutte le voci, anche con perdite e rettifiche annuali',async()=>{
  await db.exec(`insert into v_cg_ricavi_classificati values ('${company}',2026,1,10000),('${company}',2026,2,1000);insert into v_cg_costi_classificati values ('${company}',2026,1,'costi_produttivi',1000),('${company}',2026,2,'costi_produttivi',7000);insert into cg_classificazione_voci values ('${company}','rettifica','costi_amministrativi',true);insert into ce_riclassificato_overrides values ('${company}',2026,null,'rettifica',1200);insert into cg_aliquote_imposte values ('${company}',24,3.9,0,true)`);
  const annual=await rpc('cg_get_conto_economico_riclassificato',`'${company}',2026,1,12`);
  const monthly=await rpc('cg_get_ce_mensile_dettaglio',`'${company}',2026`);
  for(const row of annual.voci){const sum=monthly.mesi.reduce((s:number,m:Record<string,any>)=>s+value(m,row.codice),0);expect(sum, row.codice).toBeCloseTo(Number(row.valore),2);}
  expect(value(monthly.mesi[1],'15')).toBeLessThan(0);
  const feb=await rpc('cg_get_conto_economico_riclassificato',`'${company}',2026,2,2`);expect(value(feb,'L')).toBe(value(monthly.mesi[1],'L'));
  const taxes=await rpc('cg_get_imposte_dettaglio',`'${company}',2026`);
  expect(taxes.totali.imposte_totali).toBe(value(annual,'15'));expect(taxes.totali.utile_post).toBe(value(annual,'L'));
  expect(value(annual,'15')).toBe(502.2); // 1800 managerial profit × (24%+3.9%).
 });
 it('DSCR usa le stesse imposte del CE e conserva le componenti esatte',async()=>{
  await db.exec(`insert into cg_loans values ('${company}',true,100,10000,4)`);
  const ce=await rpc('cg_get_conto_economico_riclassificato',`'${company}',2026,1,12`);const indices=await rpc('cg_get_indici_avanzati',`'${company}',2026`);
  expect(indices.dscr.imposte_ce).toBe(value(ce,'15'));expect(indices.dscr.flusso_disponibile).toBe(value(ce,'E')-value(ce,'15'));
 });
 it('Health-check conta solo scadenze residue e non valida uno stato patrimoniale sbilanciato',async()=>{
  const h=await rpc('cg_get_health_check',`'${company}',2026`);
  expect(h.checks.find((c:{codice:string})=>c.codice==='scadenze_open').valore).toBe(2);
  expect(h.checks.find((c:{codice:string})=>c.codice==='quadratura_sp').status).toBe('critical');expect(h.report_ready).toBe(false);expect(h.percentuale).toBeLessThan(100);
  const score=h.checks.reduce((s:number,c:{status:string})=>s+(c.status==='ok'?1:c.status==='warn'?.5:0),0);expect(h.score).toBe(score);
 });
 it('il rating numerico non è validato finché il patrimonio non quadra',async()=>{
  const r=await rpc('cg_get_rating',`'${company}',2026`);expect(r.attendibile).toBe(false);expect(r.motivi).toHaveLength(1);
  await db.exec(`update test_sp set data=jsonb_set(data,'{quadratura}', '{"differenza":0,"quadrato":true}')`);
  expect((await rpc('cg_get_rating',`'${company}',2026`)).attendibile).toBe(true);
 });
});

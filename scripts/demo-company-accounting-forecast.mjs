/** Future payroll cash from saved draft payslips, NOT actual payments or new costs. */
import {createHash} from 'node:crypto';
import {C,A,AS_OF,MARK,q,sql,guard,context,insert,read,save,has} from './demo-company-accounting-audit.mjs';
import {uid} from './demo-company-accounting-repair.mjs';
import {grouped,sum} from './demo-company-accounting-verify.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function build(){
 const d=read('latest'),rows=[],statements=[];
 const old=d.cg_cash_flow_manuali.find(x=>x.id==='90da4b61-18a4-fb5a-0286-4756d494239e');
 if(!old||old.anno!==2026||old.mese!==12||old.tipo!=='uscita'||old.descrizione!=='Tredicesima'||old.importo!==22000)throw Error('Preserve changed future payroll assumption');
 const buckets=[...grouped(d.hr_cedolini.filter(h=>h.anno===2026&&h.stato==='bozza'),'mese')];
 if(buckets.length!==3||buckets.some(([m,v])=>m<10||v.length!==28))throw Error('Missing complete draft payroll months');
 for(const [month,slips]of buckets){
  if(d.company_costs.some(c=>/stipendi|INPS/i.test(c.category||'')&&!c.is_paid&&c.due_date?.startsWith(`2026-${String(month).padStart(2,'0')}`)))throw Error('Pay forecast would duplicate an existing commitment');
  for(const [kind,key]of [['Netto dipendenti','netto'],['Trattenute simulate','withholding'],['Contributi datore','contributi_datore']]){
   const amount=sum(slips,p=>key==='withholding'?p.contributi_dipendente+p.ritenute_irpef:p[key]);
   const row={id:month===12&&key==='netto'?old.id:uid(`payroll-forecast:2026:${month}:${key}`),company_id:C,anno:2026,mese:Number(month),tipo:'uscita',categoria:'Personale - '+kind,descrizione:`DEMO - ${kind} 2026-${String(month).padStart(2,'0')} da cedolini in bozza`,importo:amount,ricorrente:false,note:MARK+' PREVISIONE NON PAGATA. Somma dei cedolini in bozza; trattenute e contributi ipotizzati, nessun F24 o bonifico reale. Dicembre comprende la mensilità aggiuntiva già nei cedolini.'};
   if(row.id===old.id)statements.push(`update cg_cash_flow_manuali set categoria=${q(row.categoria)},descrizione=${q(row.descrizione)},importo=${amount},note=${q(row.note)} where company_id=${q(C)} and id=${q(old.id)} and importo=22000 and descrizione='Tredicesima';`);else statements.push(insert('cg_cash_flow_manuali',row));
   rows.push({...row,payslipIds:slips.map(p=>p.id)});
  }
 }
 return {manifest:{company:C,asOf:AS_OF,previous:old,rows,total:sum(rows,'importo'),replaces:22000,newCashPayments:0,newCosts:0},statements};
}
if(process.argv[1]?.endsWith('demo-company-accounting-forecast.mjs')){
 guard();const mode=process.argv[2]||'plan';
 if(mode==='plan'){if(has('forecast-applied'))throw Error('Already applied');const p=build();save('forecast-plan',p);console.log(JSON.stringify({rows:p.manifest.rows.length,payrollForecast:p.manifest.total,previousGeneric:22000,additionalCoverage:p.manifest.total-22000}));}
 else{const p=read('forecast-plan'),hash=digest(p);if(!['dry','apply'].includes(mode))throw Error('Unknown mode');if(mode==='apply'&&(!has('forecast-dry')||read('forecast-dry').hash!==hash))throw Error('Rollback rehearsal required');if(mode==='apply'&&has('forecast-applied')){console.log('Already applied');process.exit(0);}
  sql(`begin;${context}${p.statements.join('\n')}${mode==='dry'?'rollback':'commit'};`);save('forecast-'+(mode==='dry'?'dry':'applied'),{hash,at:new Date().toISOString()});console.log(mode+' OK');
 }
}

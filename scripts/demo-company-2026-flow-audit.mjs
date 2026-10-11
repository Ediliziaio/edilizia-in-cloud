/** Domain dates, not insertion timestamps, drive the 2026 operating audit. Read only. */
import { C,YEAR,AS_OF,read,save,has } from './demo-company-2026.mjs';
const d=read('audit-latest'),round=n=>Math.round(n*100)/100;
const domains=[
  ['venduto_commesse','orders','created_at','total_amount',r=>!r.deleted_at],
  ['fatture_emesse','documenti_fiscali','data_emissione','imponibile_totale',r=>r.tipo==='fattura'&&!r.deleted_at&&!['bozza','annullata','rifiutata'].includes(r.stato)],
  ['preventivi_nativi','documenti_fiscali','data_emissione','imponibile_totale',r=>r.tipo==='preventivo'&&!r.deleted_at],
  ['preventivi_crm','quotes','created_at','subtotal',r=>!r.deleted_at],
  ['incassi_prima_nota','prima_nota_entries','entry_date','amount',r=>r.direction==='entrata'],
  ['uscite_prima_nota','prima_nota_entries','entry_date','amount',r=>r.direction==='uscita'],
  ['costi_fissi','company_costs','due_date','amount',r=>r.cost_type==='fixed'],
  ['costi_diretti','company_costs','due_date','amount',r=>r.cost_type==='variable'],
  ['stipendi_lordi','hr_cedolini','data_emissione','lordo',()=>true],
  ['timbrature','hr_timbrature','data_evento',null,()=>true],
  ['giornate','hr_giornate','data',null,()=>true],
  ['rapportini','campo_rapportini','data_lavoro','ore_lavorate',()=>true],
  ['oda','purchase_orders','issue_date','subtotal',()=>true],
  ['ddt','ddt_ricezione','data_ricezione',null,()=>true],
  ['fatture_ricevute','fatture_ricevute','data_fattura','imponibile_totale',()=>true],
  ['magazzino','warehouse_movements','created_at',null,()=>true],
  ['sal','sal_subappaltatori','data_emissione','importo_lordo',()=>true],
  ['agenda','appointments','appointment_date',null,()=>true],
  ['task','tasks','due_date',null,()=>true],
  ['manutenzioni','mezzi_manutenzioni','data','costo',()=>true],
  ['giornate_mezzi','mezzi_giornate','giorno',null,()=>true],
];
const monthly={};
for(const [name,table,date,amount,predicate] of domains) {
  monthly[name]=Object.fromEntries(Array.from({length:12},(_,i)=>[`${YEAR}-${String(i+1).padStart(2,'0')}`,{records:0,value:0}]));
  for(const row of (d[table]??[]).filter(predicate)) {
    const month=String(row[date]??'').slice(0,7),target=monthly[name][month];
    if(target) {target.records++;if(amount)target.value=round(target.value+Number(row[amount]??0));}
  }
}
const futureActualChecks=[
  ['timbrature','hr_timbrature','data_evento',()=>true],
  ['rapportini','campo_rapportini','data_lavoro',r=>r.approvato||r.stato==='approvato'],
  ['incassi_uscite','prima_nota_entries','entry_date',()=>true],
  ['pagamenti_costi','company_costs','paid_date',r=>r.is_paid],
  ['stipendi_pagati','hr_cedolini','data_pagamento',r=>r.stato==='pagato'],
  ['sal_pagati','sal_subappaltatori','data_pagamento',r=>r.stato==='pagato'],
  ['ddt_ricevuti','ddt_ricezione','data_ricezione',()=>true],
  ['manutenzioni_eseguite','mezzi_manutenzioni','data',()=>true],
  ['appuntamenti_eseguiti','appointments','appointment_date',r=>r.is_completed],
  ['task_completate','tasks','completed_at',r=>r.status==='completata'],
];
const futureActual={};
for(const [name,table,date,predicate] of futureActualChecks)
  futureActual[name]=(d[table]??[]).filter(r=>predicate(r)&&String(r[date]??'').slice(0,10)>AS_OF).map(r=>({id:r.id,date:r[date]}));
const active=d.orders.filter(r=>!r.deleted_at),yearOrders=active.filter(r=>String(r.created_at).startsWith('2026-'));
const linked2026=new Set(yearOrders.map(r=>r.id));
const wrongYearScenario=active.filter(r=>r.order_code?.startsWith('DEMO-2025-'));
const gaps=domains.map(([name])=>({flow:name,missingElapsedMonths:Object.entries(monthly[name]).filter(([m,r])=>m<'2026-10'&&r.records===0).map(([m])=>m)})).filter(r=>r.missingElapsedMonths.length);
const netSold=round(yearOrders.reduce((s,r)=>s+Number(r.total_amount??0),0));
const result={company:C,year:YEAR,asOf:AS_OF,targetNetContracted:5500000,netContracted2026:netSold,remainingNetContracted:round(5500000-netSold),
  created2026:yearOrders.length,wrongYearAnnualScenario:wrongYearScenario.length,
  monthly,futureActual,gaps,
  links2026:{phases:d.order_work_phases.filter(r=>linked2026.has(r.order_id)).length,reporting:d.campo_rapportini.filter(r=>linked2026.has(r.order_id)).length,
    purchaseOrders:d.purchase_orders.filter(r=>linked2026.has(r.order_id)).length,acceptance:d.order_acceptance_reports.filter(r=>linked2026.has(r.order_id)).length},
  principle:'2026 is the operating reference. Older issued history is not rewritten; future work/payroll/payments are planned, not recorded as executed.',
};
save('flow-audit',result);
save('operating-plan',{
  company:C,year:YEAR,asOf:AS_OF,complete:false,
  target:{metric:'contratti netti IVA esclusa nel 2026',annual:5500000,current:netSold,remaining:result.remainingNetContracted},
  rules:['Preservare lo storico emesso e non spostare fatture protette dal 2025 al 2026.',
    'Nuovi ID, date e documenti esplicitamente DEMO 2026, con corrispondenza fra database e PDF.',
    'Nessun rapportino, timbratura, pagamento o collaudo eseguito dopo la data di riferimento.',
    'Novembre e dicembre: lavorazioni, consegne, stipendi, SAL e incassi pianificati, non eseguiti.',
    'Riutilizzare il personale già presente, evitando duplicazioni di cedolini, ore e pagamenti.',
    'Una sola imputazione economica per ODA/fattura/costo, SAL/squadra e salario/ore di commessa.'],
  stages:[
    {name:'Scadenze mezzi e manutenzioni 2026',state:has('fleet-verified')?'verified':'pending'},
    {name:'Attività future senza completamenti inventati',state:Object.values(futureActual).every(rows=>!rows.length)?'verified':'pending'},
    {name:'Simulazione commerciale annuale 2026 fino al target',state:'pending',netToAdd:result.remainingNetContracted},
    {name:'Cantieri, fasi, squadra, ore e mezzi: calendario gennaio-dicembre',state:'pending',coverage:result.links2026},
    {name:'Materiali, consumo/residui, ODA, DDT, SAL e fatture collegate',state:'pending'},
    {name:'Costi struttura e paghe: consuntivo fino a oggi, previsioni future',state:'pending'},
    {name:'Documenti e foto DEMO 2026 coerenti con ogni singola commessa',state:'pending'},
    {name:'Riconciliazione venduto/fatturato/incassato/cassa e margini',state:'pending'},
  ],
});
console.log(JSON.stringify({company:C,year:YEAR,netContracted2026:netSold,remainingNetContracted:result.remainingNetContracted,wrongYearAnnualScenario:wrongYearScenario.length,
  futureActualCounts:Object.fromEntries(Object.entries(futureActual).map(([k,v])=>[k,v.length])),gaps,links2026:result.links2026},null,2));

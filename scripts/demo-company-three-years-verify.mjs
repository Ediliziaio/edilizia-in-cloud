/** Read-only, current-record proof for 2024/25/26. Never declare plans as saved. */
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {C,A,q,sql,guard,context,read,save,AS_OF} from './demo-company-accounting-audit.mjs';
import {verify,cents,sum} from './demo-company-accounting-verify.mjs';
import {read as closure} from './demo-company-closure.mjs';
const artifact=path=>JSON.parse(gunzipSync(readFileSync(path)));
const target={2024:3600000,2025:4700000,2026:5500000};
// Ignore timestamps/PDF metadata, but never ignore financial fields or a new record.
const protectedFields={
 documenti_fiscali:['id','stato','data_emissione','imponibile_totale','iva_totale','totale_documento','importo_pagato','ordine_id','deleted_at'],
 invoices:['id','status','issue_date','subtotal','tax_amount','total','paid_amount','order_id','deleted_at'],
 company_costs:['id','amount','vat_rate','is_paid','paid_date','due_date','order_id'],
 prima_nota_entries:['id','amount','direction','entry_date','bank_transaction_id','cost_id','scadenza_id','invoice_id','order_id','documento_fiscale_id','movimento_id','installment_id'],
 bank_transactions:['id','amount','amount_eur','booking_date','value_date','account_id','linked_cost_id','linked_scadenza_id','linked_invoice_id','linked_installment_id'],
 fatture_ricevute:['id','stato','data_fattura','imponibile_totale','iva_totale','totale_documento','company_cost_id','purchase_order_id','prima_nota_id','righe','riepilogo_iva'],
};
export function salBackfillProof(before,current,plan,pdfLog,attachments){
 const fingerprints=d=>Object.fromEntries(Object.entries(protectedFields).map(([table,keys])=>[table,createHash('sha256').update(JSON.stringify(d[table].map(row=>keys.map(k=>row[k]??null)).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex')]));
 const saved=plan.manifest.documents.every(x=>{
  const s=current.sal_records.find(s=>s.id===x.id),row=current.sal_voci.find(v=>v.sal_id===x.id);
  return s?.company_id===C&&s.order_id===x.order_id&&s.installment_id===x.installment_id&&s.data_emissione===x.data_emissione&&cents(s.importo_totale)===cents(x.importo_totale)&&row&&cents(row.importo_contrattuale)===cents(x.net)&&Number(row.percentuale_avanzamento)===x.percentage;
 });
 const privatePDFs=plan.manifest.documents.every(x=>{
  const pdf=pdfLog.completed.find(p=>p.id===x.id);
  return pdf?.bytes>0&&/^[0-9a-f]{64}$/.test(pdf.sha)&&attachments.some(a=>a.company_id===C&&a.order_id===x.order_id&&a.file_url===pdf.path&&a.file_size===pdf.bytes&&a.visible_to_customer===false&&a.file_type==='application/pdf');
 });
 const a=fingerprints(before),b=fingerprints(current);
 return {saved,privatePDFs,financialUnchanged:Object.keys(a).every(k=>a[k]===b[k]),documents:plan.manifest.documents.length};
}
export function financialYears(d){
 const active=d.documenti_fiscali.filter(f=>!f.deleted_at&&['fattura','nota_credito'].includes(f.tipo)&&!['bozza','annullata','stornata'].includes(f.stato));
 return Object.fromEntries(Object.entries(target).map(([year,wanted])=>{
  const issued=active.filter(f=>f.data_emissione?.startsWith(year+'-')),
   future=d.documenti_fiscali.filter(f=>Number(year)===2026&&!f.deleted_at&&f.tipo==='fattura'&&f.stato==='bozza'&&f.data_emissione>AS_OF&&f.data_emissione.startsWith(year+'-'));
  const net=sum(issued,f=>f.tipo==='nota_credito'?-Number(f.imponibile_totale):Number(f.imponibile_totale)),forecast=sum(future,'imponibile_totale');
  return [year,{targetNet:wanted,issuedNet:net,forecastNet:forecast,scenarioNet:(cents(net)+cents(forecast))/100,issuedCount:issued.length,forecastCount:future.length,paidGross:sum(issued,'importo_pagato'),monthly:Object.fromEntries(Array.from({length:12},(_,i)=>{const month=year+'-'+String(i+1).padStart(2,'0');return [month,{issuedNet:sum(issued.filter(f=>f.data_emissione.startsWith(month)),f=>f.tipo==='nota_credito'?-Number(f.imponibile_totale):Number(f.imponibile_totale)),forecastNet:sum(future.filter(f=>f.data_emissione.startsWith(month)),'imponibile_totale')}];}))}];
 }));
}
if(process.argv[1]?.endsWith('demo-company-three-years-verify.mjs')){
 guard();const d=read('latest'),audit=verify(d),years=financialYears(d),cohorts={
  2024:artifact('tmp/demo-integrated/history-2024/business-manifest.json.gz').orders,
  2025:artifact('tmp/demo-integrated/closure-2026-10-11/sales-2025-plan.json.gz').manifest.orders,
  2026:artifact('tmp/demo-integrated/history-2026/business-manifest.json.gz').orders,
 },checks=[],deferred=[];
 const check=(name,pass,evidence)=>checks.push({name,pass,evidence});
 const salPlan=closure('sal-gap-2025-plan'),salPDFs=closure('sal-gap-2025-pdf-apply');
 const salAttachments=sql(`select o.company_id,a.order_id,a.file_url,a.file_size,a.file_type,a.visible_to_customer from order_attachments a join orders o on o.id=a.order_id where o.company_id=${q(C)} and a.file_url in(${salPDFs.completed.map(x=>q(x.path))})`);
 const salProof=salBackfillProof(closure('sal-gap-2025-before'),d,salPlan,salPDFs,salAttachments);
 for(const k of ['saved','privatePDFs','financialUnchanged'])check('2025-SAL-backfill-'+k,salProof[k],{documents:salProof.documents});
 for(const [year,f]of Object.entries(years))check('annual-net-'+year,cents(f.scenarioNet)===cents(f.targetNet),f);
 for(const key of ['nativeLegacyMismatch','nativePaidMismatch','legacyPaidMismatch','receiptCostMismatch','receiptMissingCost','receiptMissingPdf','issuedMissingPdf','issuedPositiveMissingOrder','issuedPositiveMissingCustomer','paidCostCashMismatch','paidScadMismatch','scadBadCost','scadBadOrder','scadBadInvoice','scadDuplicateCost','multipleReceiptsSameCost','unlinkedExternalBank','primaNotaNoBank','bankNoPrimaNota','primaNotaBadBankAmount','bankAccountBalanceMismatch','futureBank','futureActualPrimaNota','futureNativeInvoice','futureReceivedInvoice','futurePayment','futurePaidCost','actualVatCostMissingReceipt','issuedLineTotalMismatch','receivedLineTotalMismatch'])check(key,audit.counts[key]===0,audit.counts[key]);
 for(const [year,cohort]of Object.entries(cohorts)){
  const ids=cohort.map(o=>q(o.id)).join(','),scope=`company_id=${q(C)}`;
  const jobs=sql(`select o.id,o.order_code,o.total_amount,o.work_start_date,o.work_end_date,q.subtotal quote_net,
   (select count(*) from order_work_phases p where p.company_id=o.company_id and p.order_id=o.id) phases,
   (select count(*) from order_work_subphases s join order_work_phases p on p.id=s.phase_id where p.company_id=o.company_id and p.order_id=o.id) subphases,
   (select count(*) from campo_rapportini r where r.company_id=o.company_id and r.order_id=o.id and r.approvato) reports,
   (select count(*) from order_acceptance_reports a where a.company_id=o.company_id and a.order_id=o.id and a.status='draft') acceptance,
   (select count(*) from tasks t where t.company_id=o.company_id and t.order_id=o.id) tasks,
   (select count(*) from appointments a where a.company_id=o.company_id and a.order_id=o.id) appointments,
   (select count(*) from sal_records s where s.company_id=o.company_id and s.order_id=o.id) sals,
   (select count(*) from purchase_orders p where p.company_id=o.company_id and p.order_id=o.id) purchases,
   (select count(*) from ddt_ricezione x join purchase_orders p on p.id=x.purchase_order_id and p.company_id=x.company_id where x.company_id=o.company_id and p.order_id=o.id) ddts,
   (select sum(f.imponibile_totale) from documenti_fiscali f where f.company_id=o.company_id and f.ordine_id=o.id and f.tipo='fattura' and not f.stato in('annullata','stornata') and f.deleted_at is null) invoice_net,
   (select count(*) from order_attachments a where a.order_id=o.id and not a.visible_to_customer) private_attachments
   from orders o left join quotes q on q.id=o.quote_id and q.company_id=o.company_id where o.${scope} and o.id in(${ids})`);
  for(const job of jobs){const started=job.work_start_date<=AS_OF,completed=job.work_end_date<=AS_OF;check(`job-${year}-${job.order_code}`,job.phases===6&&job.subphases===12&&job.purchases>=1&&(!started||job.ddts>=1&&job.reports>0&&job.sals>0)&&(!completed||job.acceptance>=1)&&job.tasks>0&&job.appointments>0&&job.private_attachments>0&&cents(job.quote_net)===cents(job.total_amount)&&cents(job.invoice_net)===cents(job.total_amount),job);}
  const stats=sql(`with reports as(select * from campo_rapportini where ${scope} and order_id in(${ids})),presences as(select r.order_id,r.data_lavoro,r.costo_manodopera,(p->>'employee_id')::uuid employee_id,(p->>'ore')::numeric hours from reports r cross join lateral jsonb_array_elements(r.presenze)p)
   select jsonb_build_object('jobs',${cohort.length},'reports',(select count(*) from reports),'participations',(select count(*) from presences),
   'workerDaysOver8',(select count(*) from(select employee_id,data_lavoro from presences group by 1,2 having sum(hours)>8)x),
   'outsideEmployment',(select count(*) from presences p join employees e on e.id=p.employee_id and e.company_id=${q(C)} left join hr_profili h on h.employee_id=e.id and h.company_id=e.company_id where p.data_lavoro<coalesce(e.data_assunzione,h.data_assunzione) or p.data_lavoro>h.data_cessazione),
   'missingPunches',(select count(*) from presences p where not exists(select 1 from hr_timbrature t join hr_profili h on h.id=t.profilo_id and h.company_id=t.company_id where t.company_id=${q(C)} and h.employee_id=p.employee_id and t.data_evento=p.data_lavoro and t.order_id=p.order_id)),
   'futureReports',(select count(*) from reports where data_lavoro>${q(AS_OF)}::date),
   'paidPayroll',(select count(*) from hr_cedolini where ${scope} and anno=${year} and stato='pagato'),
   'draftPayroll',(select count(*) from hr_cedolini where ${scope} and anno=${year} and stato='bozza'),
   'calendarEvents',(select count(*) from appointments where ${scope} and order_id in(${ids})),
   'completedTasks',(select count(*) from tasks where ${scope} and order_id in(${ids}) and status='completata'),
   'stockCarichi',(select count(*) from warehouse_movements w join order_items i on i.id=w.order_item_id where w.${scope} and i.order_id in(${ids}) and w.movement_type='carico'),
   'stockScarichi',(select count(*) from warehouse_movements where ${scope} and order_id in(${ids}) and movement_type='scarico')
   ) data`)[0].data;
  Object.assign(years[year],{operations:stats});for(const k of ['workerDaysOver8','outsideEmployment','missingPunches','futureReports'])check(`${year}-${k}`,stats[k]===0,stats[k]);
 }
 const giro=d.v_cg_costi_classificati.filter(r=>r.source_table==='bank_transactions'&&/giroconto/i.test(r.source_value||''));
 if(giro.length)deferred.push({issue:'verified-internal-transfers-still-counted-as-expenses',records:giro.length,amount:sum(giro,'importo'),requires:'shared control-management cost source, not invented demo costs or cash'});
 const paid=audit.findings.paidCostNoPrimaNota;
 deferred.push({issue:'older-unproven-paid-costs',recurringTemplates:paid.filter(x=>!x.date).length,datedEntries:paid.filter(x=>!!x.date).map(x=>({id:x.id,name:x.name,net:x.amount,date:x.date})),requires:'verify whether tax withholding/loan interest is already represented before adding cash'});
 if(audit.counts.nativeLegacyMissing)deferred.push({issue:'pre-existing-legacy-invoice-without-native-mirror',documents:audit.findings.nativeLegacyMissing,requires:'preserve another terminal’s invoice and identify its origin/workflow'});
 if(audit.counts.zeroIssuedNativeDocuments)deferred.push({issue:'older-unmarked-zero-issued-invoice',documents:audit.findings.zeroIssuedNativeDocuments,requires:'do not mutate an issued document without knowing its origin'});
 for(const year of [2024,2025,2026]){
  const ce=sql(`begin;${context}select cg_get_ce_safe(${q(C)},${year},1,12,'consuntivo') data;rollback;`)[0].data;
  years[year].management=ce.voci.filter(v=>v.codice==='01'||/MOL|EBIT|UTILE ANTE|IMPOSTE/i.test(v.label));
  const contractYear=d.orders.filter(o=>!o.deleted_at&&new Date(o.created_at).getUTCFullYear()===year);
  years[year].contractDateDashboard={orders:contractYear.length,net:sum(contractYear,'total_amount'),gross:sum(contractYear,o=>Number(o.total_amount)*(1+Number(o.vat_rate??22)/100)),definition:'Contracts by creation year; UI sold total includes VAT, not invoice turnover.'};
  const managementRevenue=Number(ce.voci.find(v=>v.codice==='01')?.valore||0),delta=(cents(managementRevenue)-cents(years[year].issuedNet))/100;
  if(delta)deferred.push({issue:'management-revenue-vs-native-issued-revenue',year,managementRevenue,nativeIssuedNet:years[year].issuedNet,difference:delta,requires:'resolve the legacy-only document before recalibrating or certifying the company dashboard'});
 }
 deferred.push({issue:'annual-scenario-bank-accounts-not-continuous-carry-forward',requires:'one agreed continuous demo cash model; do not raise opening balances to conceal a negative year'});
 deferred.push({issue:'purchase-expense-year-follows-settlement-not-accrual',requires:'shared economic competence and prepaid/accrued cost handling, distinct from bank booking dates'});
 deferred.push({issue:'orders-dashboard-money-grouped-by-contract-creation-month',requires:'distinguish gross sold contracts from net issued turnover; cash-by-month must use actual payment dates, not job creation dates'});
 const report={company:C,asOf:AS_OF,capturedAt:d.capturedAt,verifiedAt:new Date().toISOString(),years,checks,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass),deferred,complete:false,browserEndToEndVerified:false,scope:'Current saved data of the requested demo cohorts; no financial/fiscal writes; known general-engine gaps stay visible.'};
 save('three-years-verification',report);
 console.log(JSON.stringify({company:C,asOf:AS_OF,years,passed:report.passed,failed:report.failed,deferred,complete:false},null,2));
 if(report.failed.length)throw Error('Current three-year graph does not satisfy all checks');
}

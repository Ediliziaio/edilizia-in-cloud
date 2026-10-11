/** Read back saved relationships and monetary/time invariants. Never count a plan as saved. */
import {C,YEAR,AS_OF,MARK,q,j,sql,guard,read,save,round} from './demo-company-history.mjs';
guard();const m=read('business-manifest'),before=read('before'),ids=m.orders.map(o=>q(o.id)).join(','),oldFiscal=before.documenti_fiscali.map(f=>q(f.id)).join(',');
const [x]=sql(`select jsonb_build_object(
 'orders',(select count(*) from orders where company_id=${q(C)} and id in(${ids})),
 'quoteLinks',(select count(*) from orders o join quotes q on q.id=o.quote_id and q.company_id=o.company_id where o.id in(${ids}) and o.company_id=${q(C)}),
 'phases',(select count(*) from order_work_phases where company_id=${q(C)} and order_id in(${ids})),
 'reports',(select count(*) from campo_rapportini where company_id=${q(C)} and order_id in(${ids}) and approvato),
 'po',(select count(*) from purchase_orders where company_id=${q(C)} and order_id in(${ids})),
 'ddt',(select count(*) from ddt_ricezione d join purchase_orders p on p.id=d.purchase_order_id and p.company_id=d.company_id where p.order_id in(${ids}) and d.company_id=${q(C)}),
 'acceptance',(select count(*) from order_acceptance_reports where company_id=${q(C)} and order_id in(${ids})),
 'fakeSignatures',(select count(*) from order_acceptance_reports where company_id=${q(C)} and order_id in(${ids}) and status<>'draft'),
 'futureReports',(select count(*) from campo_rapportini where company_id=${q(C)} and order_id in(${ids}) and data_lavoro>${q(AS_OF)}::date),
 'futureIssued',(select count(*) from documenti_fiscali where company_id=${q(C)} and ordine_id in(${ids}) and stato not in('bozza','annullata') and data_emissione>${q(AS_OF)}::date),
 'futureCash',(select count(*) from prima_nota_entries where company_id=${q(C)} and notes like ${q(MARK+'%')} and entry_date>${q(AS_OF)}::date),
 'futureCompletedTasks',(select count(*) from tasks where company_id=${q(C)} and order_id in(${ids}) and status='completata' and completed_at::date>${q(AS_OF)}::date),
 'money',(select jsonb_agg(jsonb_build_object('id',o.id,'sold',o.total_amount,'cost',v.consuntivo,'billed',(select sum(imponibile_totale) from documenti_fiscali f where f.company_id=o.company_id and f.ordine_id=o.id and f.deleted_at is null),'cash',(select coalesce(sum(amount),0) from prima_nota_entries p where p.company_id=o.company_id and p.order_id=o.id and p.direction='entrata'))) from orders o join v_ordine_marginalita v on v.id=o.id where o.company_id=${q(C)} and o.id in(${ids})),
 'fiscalSnapshot',(select jsonb_agg(to_jsonb(f)) from documenti_fiscali f where f.company_id=${q(C)} and f.id in(${oldFiscal})),
 'outboundFlows',(select count(*) from internal_automation_flows where company_id=${q(C)} and status='published'),
 'activeAutomations',(select count(*) from automations where company_id=${q(C)} and is_active)
 ) audit`);
const a=x.audit,fail=[];
if(a.orders!==m.orders.length||a.quoteLinks!==m.orders.length||a.phases!==m.orders.length*6||a.reports!==m.orders.reduce((s,o)=>s+o.reports.length,0)||a.po!==m.orders.length||a.ddt!==m.orders.filter(o=>o.start<=AS_OF).length||a.acceptance!==m.orders.filter(o=>o.completed).length)fail.push('missing graph rows');
for(const key of ['fakeSignatures','futureReports','futureIssued','futureCash','futureCompletedTasks','outboundFlows','activeAutomations'])if(a[key])fail.push(key);
for(const o of m.orders){const saved=a.money.find(s=>s.id===o.id);if(!saved||round(Number(saved.sold))!==o.amount||round(Number(saved.billed))!==o.amount||Math.abs(Number(saved.cost)-o.consuntivo)>.025||Math.abs(Number(saved.cash)-o.invoices.filter(i=>i.paid).reduce((s,i)=>s+i.total,0))>.01)fail.push('money '+o.code);}
const normalize=f=>{const n={...f};delete n.updated_at;delete n.pdf_url;return JSON.stringify(Object.fromEntries(Object.entries(n).sort(([a],[b])=>a.localeCompare(b))));};
for(const old of before.documenti_fiscali){if(normalize(old)!==normalize(a.fiscalSnapshot.find(f=>f.id===old.id)||{}))fail.push('existing fiscal document changed '+old.id);}
delete a.fiscalSnapshot;delete a.money;
const net=sql(`select coalesce(sum(case when tipo='nota_credito' then -imponibile_totale else imponibile_totale end),0) issued_net from documenti_fiscali where company_id=${q(C)} and data_emissione between '${YEAR}-01-01' and '${YEAR}-12-31' and tipo in('fattura','nota_credito') and deleted_at is null and stato not in('bozza','annullata','stornata')`)[0];
save('business-verified',{company:C,year:YEAR,...a,issuedNet:Number(net.issued_net),annualScenarioNet:round(m.baseline+m.newRevenue),fail,complete:false});
console.log(JSON.stringify({year:YEAR,...a,issuedNet:Number(net.issued_net),annualScenarioNet:round(m.baseline+m.newRevenue),fail},null,2));
if(fail.length)throw Error('Saved data verification failed');

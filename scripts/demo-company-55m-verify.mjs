/** Read-only assertions against saved tenant data, not seeded expectations alone. */
import {C,A,MARK,uid,q,read,save,sql,context,guard} from './demo-company-55m.mjs';
guard();const jobs=read('business-manifest').orders,scope=`order_id in(select id from orders where company_id=${q(C)} and order_code like 'DEMO-2025-%')`,checks=[];
const test=(name,actual,expected)=>{const pass=typeof expected==='number'?Math.abs(Number(actual)-expected)<.025:actual===expected;checks.push({name,actual,expected,pass});if(!pass)console.error('FAIL',name,actual,expected);};
const rows=sql(`select jsonb_build_object(
 'native_net',(select sum(imponibile_totale) from documenti_fiscali where company_id=${q(C)} and tipo='fattura' and data_emissione between '2025-01-01' and '2025-12-31' and deleted_at is null and stato not in('bozza','annullata','stornata')),
 'legacy_net',(select sum(total-tax_amount) from invoices where company_id=${q(C)} and issue_date between '2025-01-01' and '2025-12-31' and deleted_at is null and status not in('draft','cancelled')),
 'jobs',(select count(*) from orders where company_id=${q(C)} and order_code like 'DEMO-2025-%'),
 'phases',(select count(*) from order_work_phases where company_id=${q(C)} and ${scope}),
 'report_pdfs',(select count(*) from campo_rapportini where company_id=${q(C)} and ${scope} and pdf_url is not null),
 'reports',(select count(*) from campo_rapportini where company_id=${q(C)} and ${scope}),
 'acceptance_pdfs',(select count(*) from order_acceptance_reports where company_id=${q(C)} and ${scope} and pdf_path is not null and status='draft'),
 'purchase_orders',(select count(*) from purchase_orders where company_id=${q(C)} and ${scope}),
 'ddt',(select count(*) from ddt_ricezione where company_id=${q(C)} and note like ${q(MARK+'%')}),
 'contracts',(select count(*) from contratti_subappalto where company_id=${q(C)} and ${scope}),
 'payroll',(select count(*) from hr_cedolini where company_id=${q(C)} and note like ${q(MARK+'%')}),
 'invoice_mismatch',(select count(*) from invoices i join documenti_fiscali f on f.id=i.id where i.company_id=${q(C)} and i.notes like ${q(MARK+'%')} and (abs(i.paid_amount-f.importo_pagato)>.01 or abs(i.total-f.totale_documento)>.01)),
 'duplicate_cash',(select count(*) from (select p.documento_fiscale_id from prima_nota_entries p join documenti_fiscali f on f.id=p.documento_fiscale_id where p.company_id=${q(C)} and f.note_interne like ${q(MARK+'%')} and p.direction='entrata' group by p.documento_fiscale_id having count(*)>1)x),
 'missing_hr_days',(select count(*) from (select distinct t.profilo_id,t.data_evento from hr_timbrature t left join hr_giornate g on g.profilo_id=t.profilo_id and g.data=t.data_evento where t.company_id=${q(C)} and t.data_evento between '2025-01-01' and '2026-09-30' and g.id is null)x),
 'inconsistent_payroll',(select count(*) from hr_cedolini where company_id=${q(C)} and note like ${q(MARK+'%')} and (abs(lordo-contributi_dipendente-ritenute_irpef-netto)>.01 or abs(ore_lavorate-ore_ordinarie-ore_straordinario)>.01)),
 'fleet_overlap',(select count(*) from mezzi_assegnazioni a join mezzi_assegnazioni b on a.mezzo_id=b.mezzo_id and a.id<b.id and a.dal<coalesce(b.al,'infinity') and b.dal<coalesce(a.al,'infinity') where a.company_id=${q(C)} and b.company_id=${q(C)} and a.note like ${q(MARK+'%')} and b.note like ${q(MARK+'%')}),
 'missing_links',(select count(*) from orders o where o.company_id=${q(C)} and o.order_code like 'DEMO-2025-%' and (o.customer_id is null or o.current_status_id is null or o.work_start_date is null or o.work_end_date<o.work_start_date or o.destination_warehouse_id is null)),
 'missing_planned_material_costs',(select count(*) from order_items where ${scope} and coalesce(purchase_price,0)<=0),
 'missing_fleet_costs',(select count(*) from v_ordine_costi_mezzi_stimati v join orders o on o.id=v.order_id where o.company_id=${q(C)} and o.order_code like 'DEMO-2025-%' and v.mezzi_senza_costo>0),
 'planned_line_mismatches',(select count(*) from orders o where o.company_id=${q(C)} and o.order_code like 'DEMO-2025-%' and abs(o.total_amount-(select sum(i.unit_price*i.quantity) from order_items i where i.order_id=o.id))>.001),
 'planned_phase_mismatches',(select count(*) from orders o where o.company_id=${q(C)} and o.order_code like 'DEMO-2025-%' and abs(o.total_amount-(select sum(p.importo_venduto) from order_work_phases p where p.order_id=o.id))>.001),
 'bad_appointments',(select count(*) from appointments where company_id=${q(C)} and ${scope} and (appointment_date is null or calendar_id is null or not is_completed or booking_email is distinct from 'nessun-invio@demo-55m.invalid'))
) data`)[0].data;
for(const [name,expected]of Object.entries({native_net:5500000,legacy_net:5500000,jobs:48,phases:288,reports:1408,report_pdfs:1408,acceptance_pdfs:48,purchase_orders:48,ddt:48,contracts:32,payroll:568,invoice_mismatch:0,duplicate_cash:0,missing_hr_days:0,inconsistent_payroll:0,fleet_overlap:0,missing_links:0,missing_planned_material_costs:0,missing_fleet_costs:0,planned_line_mismatches:0,planned_phase_mismatches:0,bad_appointments:0}))test(name,rows[name],expected);
const margins=sql(`select * from v_ordine_marginalita where company_id=${q(C)} and order_code like 'DEMO-2025-%'`);
for(const job of jobs){const actual=margins.find(m=>m.id===job.id);test('margin '+job.code,actual?.margine??(Number(actual?.preventivo)-Number(actual?.consuntivo)),job.expectedMargin);}
const revenue=sql(`begin;${context}select cg_get_conto_economico_riclassificato(${q(C)},2025,1,12,'consuntivo') data;rollback;`).find(r=>r.data)?.data;
save('company-economic-2025',revenue);
const lines=revenue?.righe||revenue?.voci||[];const revenueLine=lines.find(l=>l.label==='Ricavi'||l.codice==='01');if(revenueLine)test('CFO revenue',revenueLine.valore,5500000);else checks.push({name:'CFO response visible',actual:!!revenue,expected:true,pass:!!revenue});
const stock=sql(`select * from warehouse_stock where company_id=${q(C)}`),before=read('before');test('preserved warehouse quantities',before.warehouse_stock.every(s=>stock.some(x=>x.id===s.id&&Number(x.quantity)===Number(s.quantity))),true);
const existingOrders=sql(`select id,total_amount,customer_id,current_status_id,percentuale_avanzamento from orders where company_id=${q(C)}`);
test('preserved existing job contracts and workflow',before.orders.every(o=>existingOrders.some(x=>x.id===o.id&&Number(x.total_amount)===Number(o.total_amount)&&x.customer_id===o.customer_id&&x.current_status_id===o.current_status_id&&Number(x.percentuale_avanzamento)===Number(o.percentuale_avanzamento))),true);
const limitations=[
  'The completed 5.5m turnover exercise is 2025. Existing 2026 activity has not been rebuilt to the same annual turnover.',
  'The shared CFO cash-flow RPC excludes settled historical receipts but counts settled payroll. It must not be interpreted as historical cash. No global database function was changed under tenant-only authorization.',
  'Opening/closing balance-sheet values and bank balances still require a separate reconciliation; no invented bank balance was used to hide this gap.',
  'Six issued native DEMO documents retain their initial one-cent VAT rounding difference. Protected fiscal fields were not bypassed; legacy net accounting is reconciled to canonical net.',
  'The annual material simulation now has 24 physical SKUs, 2736 delivery/return movements and matching report consumption. Costs remain in the existing purchase orders: physical movements must not be posted as duplicate expenses.',
  'The local supplier-payment read model now follows actual purchase orders, received invoices, allocations and recorded cash. Deployment and full browser verification are separate from the tenant data checks.',
  'The local prospective cash model reconciles native invoice markers and independent unbilled installments. The shared legacy database RPC is unchanged; historical cash must still use actual ledger entries.',
  'Report photographs are three clearly labelled synthetic illustrations shared across demo jobs, not actual site photographs or proof of executed work.',
  'Acceptance reports and insurance cost shares are expressly synthetic and unsigned. They are not real certificates, insurance policies, fiscal submissions or transfers.',
];
const result={company:C,at:new Date().toISOString(),checks,pass:checks.every(c=>c.pass),complete:false,limitations,counts:rows,healthyMargins:margins.filter(m=>Number(m.margine??Number(m.preventivo)-Number(m.consuntivo))>0).length};save('verification',result);console.log(JSON.stringify({pass:result.pass,complete:result.complete,checks:checks.length,counts:rows,limitations}));if(!result.pass)process.exitCode=1;

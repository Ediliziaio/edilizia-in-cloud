/** Read-only evidence. Never repairs accounting data by plugging a balance. */
import { C, q, sql, save, read } from './demo-company-55m.mjs';
import { supplierPaymentSummary, supplierCostNeedsAllocationReview } from '../src/lib/orders/supplierPaymentSummary.ts';
import { recordedCashFlow } from '../src/lib/controlloGestione/recordedCashFlow.ts';
import { cashExposureTimeline } from '../src/lib/orders/cashExposureTimeline.ts';
const [evidence] = sql(`select jsonb_build_object(
  'company',${q(C)},
  'invoices',(select coalesce(jsonb_agg(r),'[]') from (select id,purchase_order_id,company_cost_id,prima_nota_id,cedente_ragione_sociale,cedente_piva,numero_fattura,totale_documento,tipo_documento,stato from fatture_ricevute where company_id=${q(C)})r),
  'orders',(select coalesce(jsonb_agg(r),'[]') from (select id,order_id,supplier_id,oda_number,status,total from purchase_orders where company_id=${q(C)})r),
  'costs',(select coalesce(jsonb_agg(r),'[]') from (select id,order_id,allocations from company_costs where company_id=${q(C)})r),
  'entries',(select coalesce(jsonb_agg(r),'[]') from (select id,order_id,cost_id,supplier_id,scadenza_id,amount,direction,entry_date,category,description from prima_nota_entries where company_id=${q(C)})r),
  'dues',(select coalesce(jsonb_agg(r),'[]') from (select id,cost_id,supplier_id,amount,paid_amount,due_date,status,direction from scadenze where company_id=${q(C)})r),
  'names',(select coalesce(jsonb_object_agg(id,name),'{}') from suppliers where company_id=${q(C)}),
  'bank',(select coalesce(jsonb_agg(r),'[]') from (select id,display_name,current_balance,opening_balance,is_active,currency,balance_updated_at from bank_accounts where company_id=${q(C)})r),
  'cashFunction',(select pg_get_functiondef(oid) from pg_proc where proname='cg_get_cash_flow_prospettico' limit 1)
) data`);
save('cash-audit-source',evidence.data);
const d = evidence.data, errors = [], perJob = [];
for (const job of read('business-manifest').orders) {
  const orders = d.orders.filter(o => o.order_id === job.id), poIds = new Set(orders.map(o=>o.id));
  const costs = new Set(d.costs.filter(c=>c.order_id===job.id || c.allocations?.some?.(a=>a.order_id===job.id)).map(c=>c.id));
  const invoices = d.invoices.filter(i => poIds.has(i.purchase_order_id) || costs.has(i.company_cost_id));
  const ambiguousCostIds = d.costs.filter(c=>costs.has(c.id) && supplierCostNeedsAllocationReview(c.allocations,job.id)).map(c=>c.id);
  const groups = supplierPaymentSummary({ ...d, orders, invoices, items: [], ambiguousCostIds, dues: d.dues.filter(s=>s.direction==='uscita') });
  const entryIds = new Set(d.entries.filter(e=>e.order_id===job.id).map(e=>e.id));
  const timeline = cashExposureTimeline(d.entries.filter(e=>entryIds.has(e.id)).map(e=>({date:e.entry_date,
    in:e.direction==='entrata'?e.amount:0, out:e.direction==='uscita'?e.amount:0})), '2026-10-10');
  const row = { code: job.code, model: job.model, invoices: groups.reduce((s,g)=>s+g.invoiceCount,0),
    paid: Math.round(groups.reduce((s,g)=>s+g.paid,0)*100)/100, unpaid: Math.round(groups.reduce((s,g)=>s+g.unpaid,0)*100)/100,
    review: groups.reduce((s,g)=>s+g.reviewCount,0), recordedIncome: timeline.incassato,
    recordedExpense: timeline.uscite, net: timeline.saldoOggi, peak: timeline.picco };
  if (row.invoices !== (job.subCost > 0 ? 2 : 1) || row.unpaid !== 0 || row.review) errors.push(job.code+': supplier cash/invoices need review');
  perJob.push(row);
}
const recorded = recordedCashFlow(d.entries,2025);
const result = { company:C, readOnly:true, errors, checkedJobs:perJob.length, recorded2025:recorded,
  actualSupplierInvoices:perJob.reduce((s,j)=>s+j.invoices,0), perJob,
  limitations:['Previsionale legacy non ancora corretto lato RPC','Saldo storico bancario non ricostruito: mostro il flusso registrato, non un saldo inventato','Costi allocati operai non rappresentano automaticamente pagamenti di stipendio'] };
save('cash-audit-verified',result);
console.log(JSON.stringify({company:C,readOnly:true,errors,checkedJobs:result.checkedJobs,
  supplierInvoices:result.actualSupplierInvoices,recordedNet2025:recorded.net, firstJob:perJob[0],
  legacyForecastUsesTodaysBalance:d.cashFunction.includes('current_balance'), legacyForecastReadsActualCash:d.cashFunction.includes('prima_nota_entries')}));
if(errors.length)process.exitCode=1;

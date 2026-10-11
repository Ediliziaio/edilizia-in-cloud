/** Read-only check of the actual UI supplier-payment model, before/after detail. */
import assert from 'node:assert/strict';
import { supplierPaymentSummary, supplierCostNeedsAllocationReview } from '../src/lib/orders/supplierPaymentSummary.ts';
import { read as accountingRead } from './demo-company-accounting-audit.mjs';
import { C, guard, read, save, cents } from './demo-company-procurement.mjs';

guard();
const before = read('before'), after = accountingRead('latest'), errors = [];
function summary(d, jobId) {
  const orders = d.purchase_orders.filter(o => o.order_id === jobId);
  const poIds = new Set(orders.map(o => o.id));
  const costs = d.company_costs.filter(c => jobId
    ? c.order_id === jobId || c.allocations?.some?.(a => a.order_id === jobId)
    : !c.order_id && !(c.allocations?.length));
  const costIds = new Set(costs.map(c => c.id));
  const invoices = d.fatture_ricevute.filter(i => poIds.has(i.purchase_order_id) || costIds.has(i.company_cost_id));
  const ambiguousCostIds = costs.filter(c => jobId && supplierCostNeedsAllocationReview(c.allocations, jobId)).map(c => c.id);
  const groups = supplierPaymentSummary({
    orders, invoices, entries: d.prima_nota_entries,
    dues: d.scadenze.filter(s => s.direction === 'uscita'), items: [],
    names: Object.fromEntries(d.suppliers.map(s => [s.id, s.name])), ambiguousCostIds,
  });
  return Object.fromEntries(['ordered', 'invoiced', 'paid', 'unpaid', 'review'].map(key => [key,
    groups.reduce((sum, g) => sum + cents(g[key]), 0)]));
}
for (const job of [...after.orders, {id: null, order_code: 'Struttura aziendale'}]) {
  try { assert.deepEqual(summary(after, job.id), summary(before, job.id)); }
  catch (e) { errors.push({job: job.order_code, error: e.message}); }
}
const result = {company: C, readOnly: true, checkedJobs: after.orders.length,
  checkedStructure: true, unchangedSupplierCashAndLiabilities: !errors.length, errors};
save('cash-verification', result);
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;

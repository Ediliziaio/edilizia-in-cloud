import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseChapterCents} from './demo-company-history-money.mjs';
process.argv[2]='2026';
const {read,has,AS_OF,working,add,round}=await import('./demo-company-history.mjs');
// Saved-data audits are local integration tests: private snapshots never belong in Git.
const available=has('business-manifest'),p=available?read('business-manifest'):null;
const savedTest=(name,fn)=>test(name,{skip:available?false:'Private 2026 demo snapshot not present'},fn);
savedTest('2026 annual invoice scenario reconciles to existing net invoices',()=>assert.equal(round(p.baseline+p.newRevenue),5500000));
savedTest('all three operating models represented',()=>assert.deepEqual([...new Set(p.orders.map(o=>o.model))].sort(),['interni','misto','subappalto']));
savedTest('every job has forty working days and six exact invoice splits',()=>{
  for(const o of p.orders){assert.equal(o.dates.length,40);assert.ok(o.dates.every(working));assert.equal(round(o.invoices.reduce((s,i)=>s+i.net,0)),o.amount);for(const i of o.invoices)assert.equal(i.total,round(i.net+Math.round(Math.round(i.net*100)*o.vat/100)/100));}
});
savedTest('no future report, issued invoice or payment',()=>{
  for(const o of p.orders){assert.ok(o.reports.every(r=>r.date<=AS_OF));assert.ok(o.invoices.every(i=>(!i.issued||i.date<=AS_OF)&&(!i.paid||i.due<=AS_OF)));assert.equal(o.completed,o.end<=AS_OF);}
});
savedTest('crew cannot be in two reports on the same day',()=>{const keys=new Set();for(const o of p.orders)for(const r of o.reports)for(const e of r.presences){const key=e.employee_id+'|'+r.date;assert.ok(!keys.has(key));keys.add(key);assert.equal(e.ore,8);}});
test('calendar date arithmetic is independent of DST',()=>{assert.equal(add('2026-03-28',2),'2026-03-30');assert.equal(add('2026-10-24',2),'2026-10-26');assert.equal(working('2026-04-06'),false);});
savedTest('purchase chapter net and generated row VAT reconcile without overrides',()=>{
 for(const o of p.orders){const cents=Math.round(o.materialCost*100),rows=purchaseChapterCents(cents);assert.equal(rows.reduce((s,n)=>s+n,0),cents);assert.equal(rows.reduce((s,n)=>s+Math.round(n*22/100),0),Math.round(cents*22/100));}
});

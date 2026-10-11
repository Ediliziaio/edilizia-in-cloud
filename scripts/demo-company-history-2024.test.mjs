import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseChapterCents} from './demo-company-history-money.mjs';
import {fiscalLines,serviceRows} from './demo-company-procurement.mjs';
process.argv[2]='2024';
const {read,has,working,add,stamp,round,TARGETS}=await import('./demo-company-history.mjs');
// No archived company data is published with these local integration checks.
const savedTest=(name,required,fn)=>test(name,{skip:required.every(has)?false:'Private 2024 demo snapshots not present'},fn);
const p=has('business-manifest')?read('business-manifest'):null,r=has('resources-manifest')?read('resources-manifest'):null;
savedTest('2024 scenario is explicit and uses native fiscal baseline, not fallback contracts',['business-manifest'],()=>{
 assert.equal(TARGETS[2024],3600000);assert.equal(p.baseline,0);
 assert.equal(round(p.orders.reduce((n,o)=>n+o.amount,0)),3600000);
 assert.ok(p.baselineContracts>0);
});
test('leap year, Easter Monday and Italian daylight saving are correct',()=>{
 assert.equal(add('2024-02-28',1),'2024-02-29');
 assert.equal(working('2024-04-01'),false);assert.equal(working('2024-04-02'),true);
 assert.ok(stamp('2024-03-30').endsWith('+01:00'));assert.ok(stamp('2024-04-02').endsWith('+02:00'));
});
savedTest('all 24 jobs have complete nonconflicting historical crews and phases',['business-manifest','resources-manifest'],()=>{
 const used=new Set(),crew=new Set(r.staff.filter(e=>e.area==='cantiere').map(e=>e.id));
 assert.equal(p.orders.length,24);
 assert.deepEqual([...new Set(p.orders.map(o=>o.model))].sort(),['interni','misto','subappalto']);
 for(const o of p.orders){
  assert.equal(o.dates.length,40);assert.ok(o.dates.every(working));
  assert.ok(o.dates.every(d=>d.startsWith('2024-')));assert.equal(o.completed,true);
  assert.equal(round(o.invoices.reduce((n,f)=>n+f.net,0)),o.amount);
  for(const f of o.invoices){assert.equal(f.issued,true);assert.ok(f.date.startsWith('2024-'));assert.equal(f.total,round(f.net+round(f.net*o.vat/100)));}
  for(const report of o.reports)for(const e of report.presences){assert.ok(crew.has(e.employee_id));const k=e.employee_id+'|'+report.date;assert.ok(!used.has(k));used.add(k);assert.equal(e.ore,8);}
 }
});
savedTest('costs and chapter VAT reconcile exactly without generated-column overrides',['business-manifest'],()=>{
 for(const o of p.orders){const rows=purchaseChapterCents(Math.round(o.materialCost*100));assert.equal(rows.reduce((n,x)=>n+x,0),Math.round(o.materialCost*100));assert.equal(rows.reduce((n,x)=>n+Math.round(x*.22),0),Math.round(o.materialCost*22));assert.equal(o.consuntivo,round(o.materialCost+o.subCost+o.labor+o.direct));}
});
savedTest('historical employee termination is 2024, not the previous scenario year',['resources-plan'],()=>{
 const text=read('resources-plan').batches.flat().join('\n');assert.ok(text.includes("data_cessazione='2024-12-31'"));assert.ok(!text.includes("data_cessazione='2023-12-31'"));
});
savedTest('invoice and purchase split IDs are unique across jobs',['business-manifest'],()=>{
 const ids=p.orders.flatMap(o=>[o.id,o.quote,o.contact,o.native,...o.invoices.map(f=>f.id)]);assert.equal(new Set(ids).size,ids.length);
});
savedTest('2024 packing lists reconcile physical lots to every supplier invoice',['products-manifest','products-before'],()=>{
 const m=read('products-manifest'),d=read('products-before');
 assert.equal(m.packing.length,24);assert.equal(m.goods.length,144);
 for(const packing of m.packing){
  assert.equal(packing.physical.length,24);
  assert.equal(new Set(packing.physical.map(r=>r.movimento_carico_id)).size,24);
  const f=d.fatture_ricevute.find(f=>f.purchase_order_id===packing.po);
  const rows=fiscalLines(packing.physical,f.imponibile_totale,f.iva_totale);
  assert.equal(round(rows.reduce((n,r)=>n+r.totale_riga,0)),Number(f.totale_documento));
  assert.ok(packing.physical.every(r=>r.quantita>0&&r.lotto&&r.stock_item_id&&r.order_item_id));
 }
});
savedTest('2024 documentary receipts cannot create additional stock, costs or cash',['products-manifest','products-plan'],()=>{
 const m=read('products-manifest'),text=read('products-plan').batches.flat().join('\n');
 assert.equal(m.newCosts,0);assert.equal(m.newCash,0);assert.equal(m.newStockMovements,0);
 assert.ok(!/insert into (?:"?public"?\.)?"?(warehouse_stock|warehouse_movements|company_costs|prima_nota_entries)"?\s/i.test(text));
 assert.ok(text.includes("'pending'"));assert.ok(text.includes("quality_check_status='ok'"));
 assert.ok(m.goods.every(g=>g.company_id===m.company&&g.receipt_date.startsWith('2024-')&&g.quantity_received===1));
});
savedTest('2024 phone and utility details preserve aggregate net, VAT and gross',['products-before'],()=>{
 const d=read('products-before');
 for(const c of d.company_costs.filter(c=>c.notes?.startsWith('[DEMO HISTORY 2024 v1]')&&['telefonia','utenze'].includes(c.category))){
  const f=d.fatture_ricevute.find(f=>f.company_cost_id===c.id),rows=fiscalLines(serviceRows(c),f.imponibile_totale,f.iva_totale,Number(c.vat_rate));
  assert.equal(rows.length,3);assert.equal(round(rows.reduce((n,r)=>n+r.imponibile,0)),Number(c.amount));assert.equal(round(rows.reduce((n,r)=>n+r.totale_riga,0)),Number(f.totale_documento));
 }
});
savedTest('2024 payroll cash links reconcile net plus withholding to gross exactly',['payroll-links-manifest','payroll-links-before'],()=>{
 const m=read('payroll-links-manifest'),d=read('payroll-links-before');
 assert.equal(m.links.length,36);assert.equal(new Set(m.links.map(x=>x.cost)).size,24);
 for(const c of d.costs){const links=m.links.filter(l=>l.cost===c.id);assert.equal(round(links.reduce((n,l)=>n+l.amount,0)),Number(c.amount));assert.equal(links.length,c.category==='stipendi'?2:1);}
 assert.equal(round(m.links.reduce((n,l)=>n+l.amount,0)),683904);
});
savedTest('2024 payroll linking adds neither another expense nor another bank payment',['payroll-links-manifest','payroll-links-plan'],()=>{
 const m=read('payroll-links-manifest'),text=read('payroll-links-plan').batches.flat().join('\n');
 assert.equal(m.newCosts,0);assert.equal(m.newCash,0);assert.ok(!/insert into/i.test(text));
 assert.equal(new Set(m.links.map(x=>x.bank)).size,36);
 assert.ok(m.links.every(l=>l.month.startsWith('2024-')&&l.pn&&l.bank&&l.due));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {build,read,has,cents,fiscalLines,financialSignature,vendors,AS_OF} from './demo-company-procurement.mjs';
import {verify} from './demo-company-accounting-verify.mjs';
import {unitFor,buildUnits} from './demo-company-procurement-units.mjs';
// Snapshot-dependent audits must not require committing the private database archive.
const available=has('before')&&has('physical-before');
const d=available?read('before'):null,physical=available?read('physical-before'):null,plan=available?build(d,physical):null,m=plan?.manifest;
const savedTest=(name,fn)=>test(name,{skip:available?false:'Private procurement snapshots not present'},fn);
savedTest('balanced partial invoices preserve net, VAT and gross of every parent cost',()=>{
 const after={...d,fatture_ricevute:[...d.fatture_ricevute.filter(f=>!m.receipts.some(x=>x.id===f.id)),...m.receipts]};
 for(const key of ['imponibile_totale','iva_totale','totale_documento'])assert.equal(after.fatture_ricevute.reduce((n,f)=>n+cents(f[key]),0),d.fatture_ricevute.reduce((n,f)=>n+cents(f[key]),0));
 const a=verify(after);assert.deepEqual(a.findings.receiptCostMismatch,[]);assert.deepEqual(a.findings.multipleReceiptsSameCost,[]);assert.equal(a.counts.supplierInvoicesGroupedCost,51);
});
savedTest('all revised and new invoices have concrete balanced lines and no future actuals',()=>{for(const f of m.receipts){assert.ok(f.data_fattura<=AS_OF);assert.equal(f.righe.reduce((n,r)=>n+cents(r.imponibile),0),cents(f.imponibile_totale));assert.equal(f.righe.reduce((n,r)=>n+cents(r.imposta),0),cents(f.iva_totale));assert.equal(f.righe.reduce((n,r)=>n+cents(r.totale_riga),0),cents(f.totale_documento));}});
savedTest('annual small purchase examples exist in all three requested years',()=>{for(const y of [2023,2025,2026]){const fs=m.receipts.filter(f=>m.newReceipts.includes(f.id)&&f.data_fattura.startsWith(String(y)));assert.ok(fs.length>=24);assert.equal(fs.filter(f=>f.imponibile_totale===239).length,6);}});
savedTest('return to warehouse is never counted as a second supplier delivery',()=>{assert.equal(m.ddts.length,116);assert.equal(m.physical.length,116*24);for(const x of m.physical){assert.ok(x.utilizzata>=0);assert.equal(x.quantita,x.utilizzata+x.rimanenza);}assert.ok(m.physical.some(x=>x.rimanenza>0));});
savedTest('historical receipts link real tenant PO item/DDT/warehouse and stay past dated',()=>{for(const g of m.goods){const dt=d.ddt_ricezione.find(x=>x.id===g.ddt_ricezione_id);assert.ok(dt);assert.ok(d.purchase_order_items.some(i=>i.purchase_order_id===dt.purchase_order_id&&i.order_item_id===g.order_item_id));assert.ok(g.receipt_date.slice(0,10)<=AS_OF);assert.ok(physical.warehouses.some(w=>w.id===g.warehouse_id));assert.equal(g.quality_check_status,'ok');}});
test('new contacts and suppliers cannot cause real outreach',()=>{for(const {row}of vendors()){assert.ok(row.email.endsWith('.invalid'));assert.ok(/DEMO/.test(row.name));assert.equal(row.phone,undefined);assert.equal(row.vat_number,undefined);}});
savedTest('backfill cannot execute automatic stock loader on insertion',()=>{const body=plan.batches.flat().join('\n');assert.equal((body.match(/insert into public.goods_receipts/g)||[]).length,696);assert.equal((body.match(/quality_check_status='ok'/g)||[]).length,696);assert.ok(!body.includes('insert into public.company_costs'));assert.ok(!body.includes('insert into public.warehouse_movements'));});
savedTest('PDF-only metadata cannot change financial signature',()=>{const copy=structuredClone(d);copy.fatture_ricevute[0].pdf_url='private/path';copy.company_costs[0].supplier_id='demo';assert.deepEqual(financialSignature(copy),financialSignature(d));});
test('reject unsupported amount changes in physical line reconciliation',()=>assert.throws(()=>fiscalLines([{descrizione:'Cemento',quantita:20,prezzo_unitario:7.5}],151,33.22),/Physical quantities/));
test('packaging units distinguish bags, rolls, paint buckets and plasterboard sheets',()=>{assert.equal(unitFor('Cemento 32.5 25 kg'),'sacchi');assert.equal(unitFor('Tubo multistrato 20 mm 50 m'),'rotoli');assert.equal(unitFor('Idropittura 14 l'),'secchi');assert.equal(unitFor('Lastra cartongesso'),'lastre');assert.equal(unitFor('Battiscopa gres 1 m'),'barre');});
savedTest('packaging unit updates preserve saved invoice totals',()=>{const u=buildUnits(plan);for(const f of u.plan.manifest.receipts)assert.equal(f.righe.reduce((n,r)=>n+cents(r.totale_riga),0),cents(f.totale_documento));});

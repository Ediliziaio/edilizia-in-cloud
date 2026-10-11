import test from 'node:test';
import assert from 'node:assert/strict';
import {allocate,build as sales} from './demo-company-closure-2025.mjs';
import {build as cash} from './demo-company-closure-cash.mjs';
import {build as settlements} from './demo-company-closure-paid-costs.mjs';
import {has,read,cents} from './demo-company-closure.mjs';
test('cent allocation exactly preserves target with stable ties',()=>{
 assert.deepEqual(allocate([1,1,1],100),[34,33,33]);
 assert.deepEqual(allocate([0,1,9],101),[0,10,91]);
 for(let size=1;size<=100;size++){const weights=Array.from({length:size},(_,i)=>(i+1)*137),target=466945000;
  const out=allocate(weights,target);assert.equal(out.reduce((n,x)=>n+x,0),target);assert.ok(out.every(x=>Number.isSafeInteger(x)&&x>=0));assert.deepEqual(out,allocate(weights,target));
 }
});
test('reject invalid weights/targets',()=>{
 for(const [w,t]of [[[],1],[[0],1],[[-1,2],100],[[1],-1],[[1],.5],[[1.5],3]])assert.throws(()=>allocate(w,t));
});
const fixture=has('finance-before')&&has('company-before');
test('cash plan preserves payroll and does not add any cost or invoice',{skip:!fixture},()=>{
 const s=read('finance-before'),before=JSON.stringify(s),p=cash(s);
 assert.equal(JSON.stringify(s),before);assert.equal(p.manifest.archivePN.length,8);assert.equal(p.manifest.payrollLinks.length,31);assert.equal(new Set(p.manifest.payrollLinks.map(p=>p.cost)).size,18);
 assert.equal(p.manifest.mirrors.length,57);assert.equal(p.manifest.transfers.length,18);
 assert.ok(p.manifest.archivePN.every(p=>p.category!=='stipendi'));
 assert.ok(p.batches.flat().every(q=>!/insert into public\.(company_costs|invoices|invoice_payments|movimenti_cassa_native|documenti_fiscali)\b/.test(q)));
});
test('cash archive rejects real/protected bank identifiers',{skip:!fixture},()=>{
 const s=read('finance-before'),target=cash(s).manifest.archiveBank[0];s.bank_transactions.find(b=>b.id===target.id).external_transaction_id='real-bank-123';assert.throws(()=>cash(s),/synthetic transaction/);
});
function salesFixture(){const s=read('company-before'),c=read('cash-after');for(const t of ['bank_transactions','bank_reconciliations','prima_nota_entries','scadenze'])s[t]=c[t];return s;}
test('2025 reconstruction reaches 4.7M without touching costs/stock/squads',{skip:!fixture},()=>{
 const s=salesFixture(),before=JSON.stringify(s),p=sales(s);assert.equal(JSON.stringify(s),before);
 assert.equal(p.manifest.otherNet,30550);assert.equal(cents(p.manifest.orders.reduce((n,o)=>n+o.net,0)+p.manifest.otherNet),470000000);
 assert.equal(p.manifest.documents.length,144);assert.equal(p.manifest.orders.length,48);assert.equal(p.manifest.quotes.length,48);assert.equal(p.manifest.sals.length,108);
 for(const o of p.manifest.orders){const ds=p.manifest.documents.filter(d=>d.order===o.id);assert.equal(ds.reduce((n,d)=>n+cents(d.net),0),cents(o.net));assert.equal(ds.reduce((n,d)=>n+cents(d.gross),0),cents(o.gross));}
 const queries=p.batches.flat().join('\n');assert.doesNotMatch(queries,/session_replication_role|DISABLE TRIGGER|fatturazione\.emissione|registra_incasso_atomico/);
 assert.doesNotMatch(queries,/(insert into|delete from) (public\.)?(invoice_payments|movimenti_cassa_native|warehouse_stock|warehouse_movements|company_costs|order_employees)\b/);
 assert.doesNotMatch(queries,/delete from (public\.)?(documenti_fiscali|invoices)\b/);
});
test('signed quote and externally transmitted invoice cannot be reconstructed',{skip:!fixture},()=>{
 let s=salesFixture(),o=s.orders.find(o=>/^DEMO-2025-/.test(o.order_code));s.quotes.find(q=>q.id===o.quote_id).signed_at='2025-01-01';assert.throws(()=>sales(s),/signed original/);
 s=salesFixture();s.documenti_fiscali.find(d=>/^DEMO55-/.test(d.numero)).sdi_id_trasmissione='REAL';assert.throws(()=>sales(s),/Protected\/non-synthetic/);
});
const paidFixture=has('paid-costs-before');
test('dated settlements are cash links, not new expenses or customer collections',{skip:!paidFixture},()=>{
 const s=read('paid-costs-before'),before=JSON.stringify(s),p=settlements(s);
 assert.equal(JSON.stringify(s),before);assert.equal(p.manifest.settlements.length,19);assert.equal(p.manifest.remaining.length,19);assert.equal(p.manifest.dues.length,3);
 assert.ok(p.manifest.settlements.every(x=>x.date>='2025-01-01'&&x.date<='2026-10-10'));
 assert.ok(p.manifest.remaining.some(x=>!x.date));assert.ok(p.manifest.remaining.some(x=>x.category==='f24'));
 const queries=p.batches.flat().join('\n');
 assert.doesNotMatch(queries,/(insert into|update|delete from) (public\.)?(company_costs|documenti_fiscali|invoice_payments|movimenti_cassa_native|warehouse_stock|warehouse_movements)\b/);
 assert.doesNotMatch(queries,/registra_incasso|DISABLE TRIGGER|session_replication_role/);
 for(const x of p.manifest.settlements){const c=s.company_costs.find(c=>c.id===x.cost);assert.equal(cents(x.amount),cents(c.amount)+Math.round(cents(c.amount)*c.vat_rate/100));}
 for(const due of p.manifest.dues){assert.ok(!s.company_costs.find(c=>c.id===due.cost).is_paid);assert.ok(queries.includes('Saldo NON pagato'));}
});
test('cannot reconstruct a supplier payment with external fiscal evidence',{skip:!paidFixture},()=>{
 for(const key of ['xml_raw','sdi_id_trasmissione','data_ricezione_sdi','firma_stato']){
  const s=read('paid-costs-before'),p=settlements(s);s.fatture_ricevute.find(f=>f.id===p.manifest.settlements[0].receipt)[key]='REAL';assert.throws(()=>settlements(s),/Protected or ambiguous/);
 }
});
test('a net/gross mismatch or unproven supplier installment refuses writes',{skip:!paidFixture},()=>{
 const s=read('paid-costs-before'),p=settlements(s),x=p.manifest.settlements.find(x=>!x.split);s.fatture_ricevute.find(f=>f.id===x.receipt).totale_documento+=1;assert.throws(()=>settlements(s),/net\/gross mismatch/);
 const t=read('paid-costs-before'),split=p.manifest.settlements.find(x=>x.split);t.company_costs.find(c=>c.id===split.cost).vat_rate=10;assert.throws(()=>settlements(t),/Unproved installment split/);
});
test('an existing cash/dues link or internal allocation cannot become a new debit',{skip:!paidFixture},()=>{
 for(const table of ['scadenze','bank_transactions']){
  const s=read('paid-costs-before'),x=settlements(s).manifest.settlements[0];s[table].push({id:'existing',company_id:s.company,[table==='scadenze'?'cost_id':'linked_cost_id']:x.cost});assert.throws(()=>settlements(s),/another cash link/);
 }
 const s=read('paid-costs-before'),x=settlements(s).manifest.settlements[0];s.company_costs.find(c=>c.id===x.cost).payment_method='internal_allocation';assert.throws(()=>settlements(s),/Uncertain demo settlement/);
});

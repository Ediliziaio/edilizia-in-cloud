import test from 'node:test';
import assert from 'node:assert/strict';
import {verify,cents,sum} from './demo-company-accounting-verify.mjs';
function base(){
 const s=Object.fromEntries(['orders','company_costs','invoices','documenti_fiscali','purchase_orders','prima_nota_entries','scadenze','bank_transactions','movimenti_cassa_native','invoice_payments','fatture_ricevute','fattura_ordine','bank_reconciliations','anagrafiche_native','bank_accounts','v_cg_costi_classificati'].map(k=>[k,[]]));
 s.orders=[{id:'job'}];s.anagrafiche_native=[{id:'customer'}];
 s.documenti_fiscali=[{id:'invoice',numero:'DEMO-1',tipo:'fattura',stato:'pagata',ordine_id:'job',anagrafica_id:'customer',imponibile_totale:100,iva_totale:22,totale_documento:122,importo_pagato:122,data_emissione:'2026-09-01',pdf_url:'private.pdf',righe:[{totale_riga:122}]}];
 s.invoices=[{id:'invoice',document_type:'invoice',status:'paid',order_id:'job',total:122,tax_amount:22,paid_amount:122,issue_date:'2026-09-01',pdf_url:'private.pdf'}];
 s.movimenti_cassa_native=[{id:'cash',documento_id:'invoice',importo:122,tipo:'incasso'}];
 s.invoice_payments=[{id:'payment',invoice_id:'invoice',amount:122,payment_date:'2026-09-02'}];
 return s;
}
test('native and legacy are one invoice, not two revenues or payments',()=>{
 const r=verify(base());assert.equal(r.counts.nativeLegacyMismatch,0);assert.equal(r.counts.nativePaidMismatch,0);assert.equal(r.counts.legacyPaidMismatch,0);assert.equal(r.totals.nativeInvoiceByYear['2026'].net,100);
});
test('split supplier deposit and balance cover the full invoice without a second cost',()=>{
 const s=base();s.company_costs=[{id:'deposit',amount:60,purchase_order_id:'po',vat_rate:22},{id:'balance',amount:40,purchase_order_id:'po',vat_rate:22}];s.purchase_orders=[{id:'po'}];s.fatture_ricevute=[{id:'received',company_cost_id:'deposit',purchase_order_id:'po',imponibile_totale:100,iva_totale:22,totale_documento:122,data_fattura:'2026-09-01',pdf_url:'private.pdf'}];
 const r=verify(s);assert.equal(r.counts.receiptCostMismatch,0);assert.equal(r.counts.supplierInvoicesWithSplitPayments,1);assert.equal(r.counts.actualVatCostMissingReceipt,0);
});
test('a supplier arithmetic mismatch is not hidden by the split-payment exception',()=>{
 const s=base();s.company_costs=[{id:'cost',amount:100,purchase_order_id:'po'}];s.purchase_orders=[{id:'po'}];s.fatture_ricevute=[{id:'received',company_cost_id:'cost',purchase_order_id:'po',imponibile_totale:100,iva_totale:21.99,totale_documento:122,data_fattura:'2026-09-01'}];assert.equal(verify(s).counts.receiptCostMismatch,1);
});
test('zero residual and paid status do not hide a missing cash event',()=>{
 const s=base();s.movimenti_cassa_native=[];s.invoice_payments=[];const r=verify(s);assert.equal(r.counts.nativePaidMismatch,1);assert.equal(r.counts.legacyPaidMismatch,1);
});
test('future costs stay forecast commitments, not invented issued supplier invoices',()=>{
 const s=base();s.company_costs=[{id:'future',amount:100,vat_rate:22,due_date:'2026-11-01',is_paid:false}];const r=verify(s);assert.equal(r.counts.actualVatCostMissingReceipt,0);assert.equal(r.counts.forecastCostsNotYetInvoiced,1);
});
test('paired internal transfers are not unmatched external supplier payments',()=>{
 const s=base();s.bank_accounts=[{id:'one',opening_balance:100,current_balance:50},{id:'two',opening_balance:0,current_balance:50}];s.bank_transactions=[{id:'a',account_id:'one',booking_date:'2026-09-01',amount:-50,category:'Giroconto',description:'Giroconto IVA'},{id:'b',account_id:'two',booking_date:'2026-09-01',amount:50,category:'Giroconto',description:'Giroconto IVA'}];const r=verify(s);assert.equal(r.counts.pairedInternalTransfers,2);assert.equal(r.counts.unlinkedExternalBank,0);assert.equal(r.counts.bankAccountBalanceMismatch,0);
});
test('a one-sided transfer remains unresolved; do not fabricate its counterparty',()=>{
 const s=base();s.bank_transactions=[{id:'a',account_id:'one',booking_date:'2026-09-01',amount:-50,category:'Giroconto',description:'Giroconto IVA'}];assert.equal(verify(s).counts.unlinkedExternalBank,1);
});
test('booked future payments and invoices are detected separately from drafts',()=>{
 const s=base();s.invoice_payments[0].payment_date='2026-12-01';s.documenti_fiscali[0].data_emissione='2026-12-01';s.documenti_fiscali.push({...s.documenti_fiscali[0],id:'draft',stato:'bozza'});const r=verify(s);assert.equal(r.counts.futurePayment,1);assert.equal(r.counts.futureNativeInvoice,1);
});
test('cents are used when validating aggregate settlements',()=>{
 assert.equal(cents(sum([{amount:0.1},{amount:0.2}],'amount')),30);
});

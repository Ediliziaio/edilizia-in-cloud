/** Proves which repairs changed references only; keeps unresolved items visible. */
import {createHash} from 'node:crypto';
import {C,AS_OF,read,save} from './demo-company-accounting-audit.mjs';
import {sum,cents,verify} from './demo-company-accounting-verify.mjs';
import {projectedCashFlow} from '../src/lib/controlloGestione/projectedCashFlow.ts';
const before=read('before'),after=read('latest'),digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const same=(a,b,f)=>digest(a.map(f).sort((x,y)=>x.id.localeCompare(y.id)))===digest(b.map(f).sort((x,y)=>x.id.localeCompare(y.id)));
const beforeNative=new Map(before.documenti_fiscali.map(x=>[x.id,x]));
const pdfIds=new Set(read('pdf-apply').completed.filter(x=>x.kind==='invoice').map(x=>x.id));
const versions=after.documenti_fiscali.filter(x=>x.version!==beforeNative.get(x.id)?.version);
const preserved={
 nativeFiscalContent:same(before.documenti_fiscali,after.documenti_fiscali,({pdf_url,updated_at,version,...x})=>x),
 nativeVersionOnlyPDFMetadata:versions.every(x=>pdfIds.has(x.id)&&x.version===beforeNative.get(x.id).version+1&&!beforeNative.get(x.id).pdf_url&&!!x.pdf_url),
 legacyFiscalContent:same(before.invoices,after.invoices,({pdf_url,pdf_generated_at,updated_at,...x})=>x),
 bankLedgerAmountsDatesAccounts:same(before.bank_transactions,after.bank_transactions,x=>({id:x.id,amount:x.amount,account:x.account_id,date:x.booking_date})),
 bankBalances:same(before.bank_accounts,after.bank_accounts,x=>({id:x.id,opening:x.opening_balance,current:x.current_balance,available:x.available_balance})),
 costAmountsPaymentDates:same(before.company_costs,after.company_costs,x=>({id:x.id,amount:x.amount,paid:x.is_paid,date:x.paid_date,due:x.due_date})),
 primaNotaAmounts:same(before.prima_nota_entries,after.prima_nota_entries,x=>({id:x.id,amount:x.amount,date:x.entry_date,direction:x.direction})),
 invoicesPaidTotal:cents(sum(before.documenti_fiscali,'importo_pagato'))===cents(sum(after.documenti_fiscali,'importo_pagato')),
 newExpenses:after.company_costs.length-before.company_costs.length,
 newCashEvents:after.prima_nota_entries.length-before.prima_nota_entries.length,
 newBankEvents:after.bank_transactions.length-before.bank_transactions.length,
};
const flow=projectedCashFlow({companyId:C,year:2026,today:AS_OF,opening:sum(after.bank_accounts.filter(a=>a.is_active),'current_balance'),dues:after.scadenze,payments:after.prima_nota_entries,costs:after.company_costs.filter(c=>!c.is_paid),rates:after.order_installments.filter(r=>after.orders.some(o=>o.id===r.order_id&&!o.deleted_at)),manuals:after.cg_cash_flow_manuali.filter(m=>m.anno>=2026)});
save('cash-flow-after',flow);const report=verify(after);
const result={company:C,asOf:AS_OF,preserved,nativeMetadataVersionAdvances:versions.length,
 repaired:{bankAssociations:69,costCategories:15,categoryAliases:9,vatCorrections:19,receiptRounding:1,primaNotaCostLinks:96,receiptPaymentLinks:507,addedSupplierDocuments:195,newPdfs:read('pdf-apply').completed.length,linkedLegacyPdfs:read('pdf-mirrors').completed.length,payrollForecast:read('forecast-plan').manifest.total,loanForecast:read('loans-plan').total},
 remaining:{externalUnlinkedBank:report.counts.unlinkedExternalBank,journalWithoutBank:report.counts.primaNotaNoBank,paidCostsWithoutDirectJournal:report.counts.paidCostNoPrimaNota,internalTransfersMiscountedAsCosts:report.counts.pairedInternalTransfers/2,healthOpenWrong:{reported:read('rpc-after').health.checks.find(c=>c.codice==='scadenze_open').valore,actual:after.scadenze.filter(x=>['da_pagare','parziale'].includes(x.status)).length},bankJournalNetMismatch:Math.round((sum(after.bank_transactions,'amount')-sum(after.prima_nota_entries,p=>p.direction==='uscita'?-p.amount:p.amount))*100)/100,oldZeroIssuedInvoice:report.counts.zeroIssuedNativeDocuments,manualIncomeNotLinked:after.cg_cash_flow_manuali.filter(m=>m.anno===2026&&m.tipo==='entrata'&&m.mese>=10).map(m=>({id:m.id,name:m.descrizione,amount:m.importo})),ceStockAndWorkInProgressNotIntegrated:true,year2025TargetMismatch:{requested:4700000,existing:report.totals.nativeInvoiceByYear['2025'].net},uiEndToEndNotVerified:true},
 verified:report.counts,forecast:{meta:flow.meta,months:flow.mesi.map(m=>({month:m.mese,opening:m.saldo_inizio,income:m.entrate_totali,expenses:m.uscite_totali,closing:m.saldo_fine}))}};
save('closure-report',result);
console.log(JSON.stringify({preserved,nativeMetadataVersionAdvances:versions.length,repaired:result.repaired,remaining:result.remaining,zeroMismatchChecks:['nativeLegacyMismatch','nativePaidMismatch','legacyPaidMismatch','receiptCostMismatch','issuedMissingPdf','legacyIssuedMissingPdf','receiptMissingPdf','bankAccountBalanceMismatch'].every(k=>report.counts[k]===0),forecastClosing:flow.meta.saldo_chiusura},null,2));
if(Object.entries(preserved).some(([k,v])=>typeof v==='boolean'&&!v||typeof v==='number'&&v!==0))process.exitCode=1;

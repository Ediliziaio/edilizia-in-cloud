/** Reconstruct only saved, dated demo settlements; never pay or create an expense. */
import {C,A,q,insert,read,save,has,guard,uid,cents,sha,MARK} from './demo-company-closure.mjs';
import {read as auditRead} from './demo-company-accounting-audit.mjs';
import {verify} from './demo-company-accounting-verify.mjs';

const gross=c=>(cents(c.amount)+Math.round(cents(c.amount)*Number(c.vat_rate||0)/100))/100;
const ids=xs=>xs.map(x=>q(x.id)).join(',');
export function build(s){
 const missing=new Set(verify(s).findings.paidCostNoPrimaNota.map(c=>c.id));
 const selected=s.company_costs.filter(c=>missing.has(c.id)&&c.paid_date>='2025-01-01'&&c.paid_date<='2026-10-10'&&s.fatture_ricevute.some(f=>f.company_cost_id===c.id));
 const batches=[],settlements=[],dues=[];
 for(const c of selected){
  if(c.company_id!==C||c.payment_method==='internal_allocation'||!c.supplier_id||cents(c.amount)<=0||!c.due_date)throw Error('Uncertain demo settlement '+c.id);
  const fs=s.fatture_ricevute.filter(f=>f.company_cost_id===c.id);
  if(fs.length!==1)throw Error('Review grouped receipts separately');
  const f=fs[0];
  if(f.company_id!==C||!(/^(DEMO-AUDIT-|ACQ-DEMO-)/.test(f.numero_fattura))||f.prima_nota_id||f.xml_raw||f.xml_bytes||f.xml_url||f.sdi_id_trasmissione||f.data_ricezione_sdi||f.openapi_id||f.firma_stato||f.tipo_documento==='TD04')throw Error('Protected or ambiguous supplier document');
  if(s.scadenze.some(d=>d.cost_id===c.id)||s.bank_transactions.some(b=>b.linked_cost_id===c.id)||s.prima_nota_entries.some(p=>p.cost_id===c.id))throw Error('Settlement acquired another cash link');
  const amount=gross(c),split=c.purchase_order_id&&s.company_costs.filter(x=>x.purchase_order_id===c.purchase_order_id);
  if(split){
   if(split.length!==2||s.fatture_ricevute.filter(x=>x.purchase_order_id===c.purchase_order_id).length!==1||split.filter(x=>x.is_paid).length!==1||split.some(x=>x.supplier_id!==c.supplier_id||x.order_id!==c.order_id||x.vat_rate!==c.vat_rate)||split.reduce((n,x)=>n+cents(gross(x)),0)!==cents(f.totale_documento))throw Error('Unproved installment split');
  }else if(cents(amount)!==cents(f.totale_documento)||cents(c.amount)!==cents(f.imponibile_totale))throw Error('Supplier net/gross mismatch');
  const account=s.bank_accounts.filter(a=>a.company_id===C&&a.is_manual&&a.external_account_id?.includes(c.paid_date.slice(0,4))&&!a.external_account_id.startsWith('DEMO2'));
  if(account.length!==1)throw Error('Uncertain historical demo account');
  const stamp=c.paid_date+'T12:00:00Z',bank=uid('saved-paid-cost-bank:'+c.id),pn=uid('saved-paid-cost-pn:'+c.id),due=uid('saved-paid-cost-due:'+c.id);
  const batch=[`do $$begin if not exists(select 1 from company_costs where company_id=${q(C)} and id=${q(c.id)} and is_paid and paid_date=${q(c.paid_date)} and amount=${c.amount} and vat_rate=${c.vat_rate} and updated_at=${q(c.updated_at)}) or exists(select 1 from prima_nota_entries where company_id=${q(C)} and cost_id=${q(c.id)}) or exists(select 1 from scadenze where company_id=${q(C)} and cost_id=${q(c.id)}) or exists(select 1 from bank_transactions where company_id=${q(C)} and linked_cost_id=${q(c.id)}) or not exists(select 1 from fatture_ricevute where company_id=${q(C)} and id=${q(f.id)} and prima_nota_id is null and updated_at=${q(f.updated_at)}) then raise exception 'Settlement changed since reviewed archive';end if;end $$;`];
  const note=MARK+' Ricostruzione della simulazione: pagamento già segnato nel costo, stessa data e fattura. Nessun bonifico reale, nessun nuovo costo.';
  batch.push(insert('scadenze',{id:due,company_id:C,tipo:'costo_aziendale',direction:'uscita',description:c.name,amount,due_date:c.due_date,status:'pagata',paid_amount:amount,paid_date:c.paid_date,cost_id:c.id,order_id:c.order_id,supplier_id:c.supplier_id,payment_method:c.payment_method||'bonifico',is_auto_generated:false,created_by:A,notes:note+' Fattura ricevuta '+f.numero_fattura+(split?' · quota acconto; saldo separato ancora da pagare.':''),created_at:stamp}));
  batch.push(insert('bank_transactions',{id:bank,company_id:C,account_id:account[0].id,external_transaction_id:'manual:demo-closure:paid-cost:'+c.id,booking_date:c.paid_date,value_date:c.paid_date,amount:-amount,amount_eur:-amount,currency:'EUR',description:'DEMO · '+c.name,transaction_type:'debit',status:'booked',source:'manuale',category:c.category,linked_cost_id:c.id,linked_scadenza_id:due,reconciliation_status:'reconciled',reconciled_at:stamp,note,metadata:{demo:true,cost_id:c.id,received_invoice_id:f.id,order_id:c.order_id},created_at:stamp}));
  batch.push(insert('prima_nota_entries',{id:pn,company_id:C,direction:'uscita',category:c.category,description:'DEMO · '+c.name,amount,entry_date:c.paid_date,payment_method:c.payment_method||'bonifico',cost_id:c.id,order_id:c.order_id,supplier_id:c.supplier_id,scadenza_id:due,bank_transaction_id:bank,account_label:account[0].display_name,is_auto:false,created_by:A,reference_number:f.numero_fattura,notes:note,created_at:stamp}));
  batch.push(insert('bank_reconciliations',{id:uid('saved-paid-cost-recon:'+c.id),company_id:C,transaction_id:bank,scadenza_id:due,matched_amount:amount,match_type:'manual',matched_by:A,matched_at:stamp,created_at:stamp,notes:note}));
  batch.push(`update scadenze set prima_nota_entry_id=${q(pn)} where company_id=${q(C)} and id=${q(due)};update fatture_ricevute set prima_nota_id=${q(pn)} where company_id=${q(C)} and id=${q(f.id)} and prima_nota_id is null;`);
  if(split){
   const remaining=split.find(x=>!x.is_paid),id=uid('saved-unpaid-cost-due:'+remaining.id),balance=gross(remaining);
   if(s.scadenze.some(d=>d.cost_id===remaining.id)||!remaining.due_date||remaining.paid_date||!remaining.notes?.startsWith('[DEMO CFO 2026-09 v1]'))throw Error('Uncertain outstanding supplier balance');
   batch.push(`do $$begin if exists(select 1 from scadenze where company_id=${q(C)} and cost_id=${q(remaining.id)}) or not exists(select 1 from company_costs where company_id=${q(C)} and id=${q(remaining.id)} and not is_paid and paid_date is null and amount=${remaining.amount} and updated_at=${q(remaining.updated_at)}) then raise exception 'Supplier balance changed';end if;end $$;`);
   batch.push(insert('scadenze',{id,company_id:C,tipo:'costo_aziendale',direction:'uscita',description:remaining.name,amount:balance,due_date:remaining.due_date,status:'da_pagare',paid_amount:0,cost_id:remaining.id,order_id:remaining.order_id,supplier_id:remaining.supplier_id,is_auto_generated:false,created_by:A,notes:MARK+' Saldo NON pagato della fattura '+f.numero_fattura+'; ODA '+c.purchase_order_id+'. Nessun movimento di cassa inventato.'}));
   dues.push({id,cost:remaining.id,receipt:f.id,amount:balance,date:remaining.due_date});
  }
  batch.push(`do $$begin if(select amount from prima_nota_entries where company_id=${q(C)} and id=${q(pn)}) is distinct from ${amount}::numeric or (select prima_nota_id from fatture_ricevute where company_id=${q(C)} and id=${q(f.id)}) is distinct from ${q(pn)}::uuid or (select amount from bank_transactions where company_id=${q(C)} and id=${q(bank)}) is distinct from ${-amount}::numeric then raise exception 'Reconstructed demo cash mismatch';end if;if(select count(*) from company_costs where company_id=${q(C)})<>${s.company_costs.length} or exists(select 1 from bank_accounts a where company_id=${q(C)} and abs(a.current_balance-a.opening_balance-(select coalesce(sum(amount),0) from bank_transactions b where b.account_id=a.id))>.01) then raise exception 'Expense duplicated or bank balance mismatch';end if;end $$;`);
  settlements.push({cost:c.id,receipt:f.id,pn,bank,due,amount,date:c.paid_date,split:!!split,receiptBefore:f});batches.push(batch);
 }
 return {company:C,batches,manifest:{settlements,dues,beforeCostSHA:sha(s.company_costs),beforeInvoiceSHA:sha(s.documenti_fiscali),remaining:verify(s).findings.paidCostNoPrimaNota.filter(x=>!selected.some(c=>c.id===x.id)).map(({id,name,date,category})=>({id,name,date,category,reason:date?.startsWith('2024-')?'Legacy 2024 scenario needs its own payroll/finance model':!date?'No saved payment date':'Payroll/tax/loan needs a separate reconciliation, never duplicate a withheld payment'}))}};
}
if(process.argv[1]?.endsWith('demo-company-closure-paid-costs.mjs')){
 guard();if(!has('archive'))throw Error('Verified recoverable tenant archive required');
 if(has('paid-costs-apply'))throw Error('Preserve completed settlement plan');
 const s=auditRead('latest');save('paid-costs-before',s,true);const p=build(s);save('paid-costs-plan',p);console.log({settlements:p.manifest.settlements.length,unpaidBalances:p.manifest.dues.length,remaining:p.manifest.remaining.length,existingCosts:'unchanged',actualPayments:'simulation only, historical saved dates'});
}

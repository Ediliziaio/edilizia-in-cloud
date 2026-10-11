/** Replace orphan legacy demo cash with explicit links to saved events. */
import {C,A,q,j,sql,guard,context,insert,read,save,has,uid,cents,sha,financialSignature} from './demo-company-closure.mjs';
import {verify} from './demo-company-accounting-verify.mjs';
const anchors=p=>p.invoice_id||p.documento_fiscale_id||p.cost_id||p.scadenza_id||p.installment_id||p.movimento_id;
export function build(s){
 s=structuredClone(s);const payrollLinks=[],payrollStatements=[];
 // Gross wages are already paid in net wages + withholding, not one extra debit.
 // The old four advances were explicitly deducted by the original seeder.
 for(const p of s.prima_nota_entries.filter(p=>!p.bank_transaction_id&&!anchors(p))){
  const seeded=p.notes?.startsWith('[DEMO 5.5M 2025 v1]')&&/Stipendi netti|Trattenute simulate|Contributi datore simulati/.test(p.description);
  const advance=!p.notes&&p.category==='stipendi'&&p.amount===14200&&/^2026-0[5-8]-10$/.test(p.entry_date)&&/^Stipendi .*\(pagati il 10\)$/.test(p.description);
  if(!seeded&&!advance)continue;
  const employer=/Contributi datore/.test(p.description),month=p.entry_date.slice(0,7);
  const cs=s.company_costs.filter(c=>c.notes?.startsWith('[DEMO 5.5M 2025 v1]')&&c.name===`DEMO · ${employer?'INPS':'stipendi'} ${month}`);
  if(cs.length!==1||!cs[0].is_paid||cs[0].vat_rate!==0)throw Error('Ambiguous payroll summary '+month);
  p.cost_id=cs[0].id;
  const description=advance?`DEMO · Acconto stipendi ${month} (incluso nel riepilogo mensile)`:p.description;
  payrollStatements.push(`update prima_nota_entries set cost_id=${q(p.cost_id)},description=${q(description)},notes=concat_ws(' ',notes,${q(MARK+' Quota del medesimo riepilogo cedolini, non ulteriore pagamento.')}) where company_id=${q(C)} and id=${q(p.id)} and cost_id is null and amount=${p.amount} and entry_date=${q(p.entry_date)};`);
  payrollLinks.push({pn:p.id,cost:p.cost_id,amount:p.amount,month,advance});p.description=description;
 }
 for(const id of new Set(payrollLinks.map(x=>x.cost))){const c=s.company_costs.find(c=>c.id===id),paid=s.prima_nota_entries.filter(p=>p.cost_id===id).reduce((n,p)=>n+cents(p.amount),0);if(paid!==cents(c.amount))throw Error('Net wages + withholding do not equal summary '+id);}
 const r=verify(s),bn=new Set(r.findings.unlinkedExternalBank.map(x=>x.id));
 const archiveBank=s.bank_transactions.filter(b=>bn.has(b.id)),archivePN=s.prima_nota_entries.filter(p=>!p.bank_transaction_id&&!anchors(p));
 const archiveReconciliations=s.bank_reconciliations.filter(r=>bn.has(r.transaction_id)&&r.unmatched_at);
 const missing=s.prima_nota_entries.filter(p=>!p.bank_transaction_id&&anchors(p));
 const transferIds=new Set(r.findings.pairedInternalTransfers.map(x=>x.id)),transfers=s.bank_transactions.filter(b=>transferIds.has(b.id));
 if(archiveBank.some(b=>!/^DEMO2-/.test(b.external_transaction_id||'')||b.source!=='manual'||b.linked_cost_id||b.linked_invoice_id||b.reconciled_invoice_id||b.linked_scadenza_id||b.linked_installment_id))throw Error('Not an orphan synthetic transaction');
 if(archivePN.some(p=>p.is_auto||p.created_by||p.attachment_url||p.attachment_name||p.notes))throw Error('Uncertain or protected manual entry');
 const statements=[...payrollStatements],mirror=[];const ids=xs=>xs.map(x=>q(x.id)).join(',');
 // Exact IDs, only after the whole-tenant archive; dependencies checked live.
 if(archiveBank.length){statements.push(`do $$begin if exists(select 1 from bank_transactions b where b.company_id=${q(C)} and b.id in(${ids(archiveBank)}) and (b.linked_invoice_id is not null or b.linked_cost_id is not null or b.linked_scadenza_id is not null or b.linked_installment_id is not null or b.reconciled_invoice_id is not null or exists(select 1 from bank_reconciliations r where r.transaction_id=b.id and r.unmatched_at is null) or exists(select 1 from prima_nota_entries p where p.bank_transaction_id=b.id) or exists(select 1 from financial_anomalies a where a.transaction_id=b.id) or exists(select 1 from expense_report_items e where e.bank_transaction_id=b.id))) then raise exception 'Archived bank row acquired dependencies';end if;end $$;`);
  for(const r of archiveReconciliations)statements.push(`delete from bank_reconciliations where company_id=${q(C)} and id=${q(r.id)} and transaction_id=${q(r.transaction_id)} and unmatched_at=${q(r.unmatched_at)};`);
  for(const b of archiveBank)statements.push(`delete from bank_transactions where company_id=${q(C)} and id=${q(b.id)} and amount=${b.amount} and booking_date=${q(b.booking_date)} and external_transaction_id=${q(b.external_transaction_id)};`);
 }
 if(archivePN.length){statements.push(`do $$begin if exists(select 1 from scadenze where prima_nota_entry_id in(${ids(archivePN)})) or exists(select 1 from fatture_ricevute where prima_nota_id in(${ids(archivePN)})) then raise exception 'Archived prima nota acquired dependencies';end if;end $$;`);
  for(const p of archivePN)statements.push(`delete from prima_nota_entries where company_id=${q(C)} and id=${q(p.id)} and amount=${p.amount} and entry_date=${q(p.entry_date)} and bank_transaction_id is null and cost_id is null and invoice_id is null and documento_fiscale_id is null and scadenza_id is null and movimento_id is null and installment_id is null;`);
 }
 for(const p of missing){
  if(p.entry_date>'2026-10-11'||cents(p.amount)<=0)throw Error('Future/invalid cash event');
  const year=p.entry_date.slice(0,4),account=s.bank_accounts.find(x=>x.is_manual&&x.external_account_id.includes(year)&&!x.external_account_id.startsWith('DEMO2'));
  if(!account)throw Error('Missing explicit annual demo account '+year);
  let sc=s.scadenze.find(x=>x.id===p.scadenza_id)||s.scadenze.find(x=>p.invoice_id&&x.invoice_id===p.invoice_id)||s.scadenze.find(x=>p.cost_id&&x.cost_id===p.cost_id);
  if(!sc&&p.cost_id){const c=s.company_costs.find(c=>c.id===p.cost_id);if(!c?.is_paid||!c.paid_date)throw Error('Uncertain paid cost');const gross=(cents(c.amount)+Math.round(cents(c.amount)*Number(c.vat_rate||0)/100))/100;
   sc={id:uid('paid-cost-scad:'+c.id),cost_id:c.id};
   statements.push(insert('scadenze',{id:sc.id,company_id:C,tipo:'costo_aziendale',description:c.name,amount:gross,due_date:c.due_date||c.paid_date,status:'pagata',paid_amount:gross,paid_date:c.paid_date,cost_id:c.id,order_id:c.order_id,is_auto_generated:false,created_by:A,notes:MARK+' Scadenza del costo e pagamento esistenti, nessun nuovo pagamento.'}));s.scadenze.push(sc);
  }
  if(!p.invoice_id&&!sc&&!p.movimento_id)throw Error('No explicit reconciliation target');
  const sign=p.direction==='uscita'?-1:1,id=uid('bank:'+p.id),stamp=p.entry_date+'T12:00:00Z';
  statements.push(insert('bank_transactions',{id,company_id:C,account_id:account.id,external_transaction_id:'manual:demo-closure:pn:'+p.id,booking_date:p.entry_date,value_date:p.entry_date,amount:Number(p.amount)*sign,amount_eur:Number(p.amount)*sign,currency:'EUR',description:p.description,transaction_type:sign===1?'credit':'debit',status:'booked',source:'manuale',category:p.category,linked_invoice_id:p.invoice_id,reconciled_invoice_id:p.invoice_id,linked_cost_id:p.cost_id,linked_scadenza_id:sc?.id||null,linked_installment_id:p.installment_id,reconciliation_status:'reconciled',reconciled_at:stamp,note:MARK+' Specchio del pagamento esistente. Non nuovo incasso/costo. Nessuna connessione bancaria reale.',metadata:{demo:true,prima_nota_id:p.id,documento_fiscale_id:p.documento_fiscale_id,order_id:p.order_id},created_at:stamp}));
  statements.push(insert('bank_reconciliations',{id:uid('recon:'+p.id),company_id:C,transaction_id:id,invoice_id:p.invoice_id,scadenza_id:sc?.id||null,movimento_id:p.movimento_id,matched_amount:p.amount,match_type:'manual',matched_by:A,matched_at:stamp,created_at:stamp,notes:MARK+' Stesso pagamento già esistente in prima nota.'}));
  statements.push(`update prima_nota_entries set bank_transaction_id=${q(id)},account_label=${q(account.display_name)} where company_id=${q(C)} and id=${q(p.id)} and bank_transaction_id is null and amount=${p.amount} and entry_date=${q(p.entry_date)};do $$begin if(select bank_transaction_id from prima_nota_entries where company_id=${q(C)} and id=${q(p.id)}) is distinct from ${q(id)}::uuid then raise exception 'Concurrent payment link changed';end if;end $$;`);
  mirror.push({pn:p.id,bank:id,amount:Number(p.amount)*sign});
 }
 for(const b of transfers){
  if(s.prima_nota_entries.some(p=>p.bank_transaction_id===b.id))throw Error('Transfer already mirrored');
  const paired=transfers.find(x=>x.id!==b.id&&x.booking_date===b.booking_date&&x.description===b.description&&cents(x.amount)===-cents(b.amount));if(!paired)throw Error('Unpaired transfer');
  const id=uid('transfer:'+b.id),stamp=b.booking_date+'T12:00:00Z';
  statements.push(insert('prima_nota_entries',{id,company_id:C,direction:b.amount<0?'uscita':'entrata',category:'giroconto',description:b.description,amount:Math.abs(b.amount),entry_date:b.booking_date,payment_method:'bonifico',bank_transaction_id:b.id,account_label:s.bank_accounts.find(x=>x.id===b.account_id).display_name,is_auto:false,created_by:A,notes:MARK+' Trasferimento interno, non ricavo e non costo. Contropartita '+paired.id,reference_number:'DEMO-GIRO:'+[b.id,paired.id].sort().join(':'),created_at:stamp}));
  // Native reconciliation records require invoice/due/payment targets. An
  // internal transfer has none: its two linked prima-nota entries are the proof.
  statements.push(`update bank_transactions set reconciliation_status='reconciled',reconciled_at=${q(stamp)},note=concat_ws(' ',note,${q(MARK+' Giroconto interno, contropartita '+paired.id)}) where company_id=${q(C)} and id=${q(b.id)} and amount=${b.amount};`);
 }
 const remaining=s.prima_nota_entries.filter(p=>!archivePN.some(x=>x.id===p.id)),sum=remaining.reduce((n,p)=>n+cents(p.amount)*(p.direction==='uscita'?-1:1),0);
 statements.push(`do $$begin if(select count(*) from prima_nota_entries where company_id=${q(C)} and bank_transaction_id is null)<>0 or (select round(sum(amount*case direction when 'uscita' then -1 else 1 end)*100) from prima_nota_entries where company_id=${q(C)})<>${sum} then raise exception 'Missing/duplicated cash event';end if;if exists(select 1 from bank_accounts a where a.company_id=${q(C)} and abs(a.current_balance-a.opening_balance-(select coalesce(sum(amount),0) from bank_transactions b where b.account_id=a.id))>.01) then raise exception 'Bank balance mismatch';end if;end $$;`);
 return {company:C,batches:[statements],manifest:{archiveBank,archivePN,archiveReconciliations,payrollLinks,mirrors:mirror,transfers:transfers.map(x=>x.id),signature:financialSignature(s),expectedSignedCash:sum/100}};
}
const MARK='[DEMO CLOSURE 2026-10-11 v1]';
if(process.argv[1]?.endsWith('demo-company-closure-cash.mjs')){
 guard();if(!has('archive'))throw Error('Verified complete archive required');
 if(process.argv[2]==='tail'){
  const s=read('cash-after'),b=s.bank_transactions.find(b=>b.id==='7589ae64-1b8d-4564-abda-b5429682f658'),ps=s.prima_nota_entries.filter(p=>p.cost_id===b?.linked_cost_id&&p.entry_date===b?.booking_date),c=s.company_costs.find(c=>c.id===b?.linked_cost_id);
  if(!b||b.amount!==-380||b.external_transaction_id!=='DEMO2-FIX-202603-15-573dc3'||b.source!=='manual'||ps.length!==1||ps[0].amount!==463.6||!ps[0].bank_transaction_id||c.amount!==380||c.vat_rate!==22)throw Error('Unproven net/gross duplicate');
  const batch=[`do $$begin if exists(select 1 from prima_nota_entries where bank_transaction_id=${q(b.id)}) or exists(select 1 from bank_reconciliations where transaction_id=${q(b.id)}) or exists(select 1 from expense_report_items where bank_transaction_id=${q(b.id)}) or exists(select 1 from financial_anomalies where transaction_id=${q(b.id)}) then raise exception 'Protected net/gross duplicate';end if;end $$;delete from bank_transactions where company_id=${q(C)} and id=${q(b.id)} and amount=-380 and linked_cost_id=${q(c.id)} and external_transaction_id=${q(b.external_transaction_id)};`];
  save('cash-tail-plan',{company:C,batches:[batch],manifest:{archivedBank:b,correctGrossEvent:ps[0].bank_transaction_id}});console.log({tail:'one synthetic net/gross duplicate, backed up'});process.exit(0);
 }
 if(has('cash-apply'))throw Error('Preserve completed cash plan');
 const p=build(read('finance-before'));save('cash-plan',p);console.log({archiveBank:p.manifest.archiveBank.length,archivePN:p.manifest.archivePN.length,payrollLinks:p.manifest.payrollLinks.length,mirrors:p.manifest.mirrors.length,internalTransfers:p.manifest.transfers.length,statements:p.batches[0].length});
}

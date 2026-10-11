/** Mirror existing demo cash events. No second payment, invoice or cost. */
import {C,A,YEAR,AS_OF,MARK,uid,q,j,sql,guard,read,save,insert,plan,round,stamp} from './demo-company-history.mjs';
guard();
const stage=process.argv[3]||'treasury',tail=stage==='treasury-tail';
if(!['treasury','treasury-tail'].includes(stage))throw Error('Unknown treasury stage');
const rows=sql(`select * from prima_nota_entries where company_id=${q(C)} and notes like ${q(MARK+'%')} and ${tail?'bank_transaction_id is null':`entry_date between '${YEAR}-01-01' and '${YEAR}-12-31'`} and entry_date<=${q(AS_OF)}::date order by entry_date,id`);
const costs=sql(`select id,name,category,due_date,amount,vat_rate,is_paid,paid_date from company_costs where company_id=${q(C)} and notes like ${q(MARK+'%')}`),scads=sql(`select id,cost_id,invoice_id from scadenze where company_id=${q(C)}`);
const opening=YEAR===2023?150000:300000,account=uid('bank-account'),name=`DEMO · ${YEAR} · Conto simulato${YEAR===2023?' storico chiuso':''}`;
const existingBalance=tail?Number(sql(`select current_balance from bank_accounts where company_id=${q(C)} and id=${q(account)}`)[0].current_balance):opening;
const accountRow={id:account,company_id:C,external_account_id:`manual:demo-history-${YEAR}`,account_name:name,display_name:name,account_owner_name:'Demo Azienda 2 S.r.l.',currency:'EUR',account_type:'checking',opening_balance:opening,current_balance:opening,available_balance:opening,is_manual:true,is_active:YEAR===2026,connection_id:null,created_at:stamp(`${YEAR}-01-01`)};
const [baseline]=sql(`select (select coalesce(sum(amount),0) from prima_nota_entries where company_id=${q(C)}) cash_total,(select coalesce(sum(importo),0) from v_cg_costi_classificati where company_id=${q(C)} and anno=${YEAR}) ce_costs`);
const batches=[],mirrors=[];
for(let start=0;start<rows.length;start+=32){
 const statements=[insert('bank_accounts',accountRow)];
 for(const p of rows.slice(start,start+32)){
   if(p.bank_transaction_id)throw Error('Already linked cash event: preserve '+p.id);
   const amount=round(Number(p.amount)*(p.direction==='uscita'?-1:1));if(!amount)continue;
   const payrollCategory=/Contributi datore/.test(p.description)?'INPS':/Stipendi netti|Trattenute simulate/.test(p.description)?'stipendi':null;
   const candidate=costs.filter(c=>payrollCategory&&c.category===payrollCategory&&c.due_date===p.entry_date);
   if(!p.cost_id&&payrollCategory&&candidate.length!==1)throw Error('Ambiguous payroll cost '+p.id);
   const cost=p.cost_id||candidate[0]?.id||null,invoice=p.invoice_id||null;
   let sc=scads.find(s=>s.id===p.scadenza_id)||scads.find(s=>cost&&s.cost_id===cost);
   if(!sc&&cost){const c=costs.find(c=>c.id===cost);if(!c?.is_paid)throw Error('Missing paid cost '+cost);
     sc={id:uid('bank-cost-scad-'+cost),cost_id:cost};const gross=round(Number(c.amount)*(1+Number(c.vat_rate||0)/100));
     statements.push(insert('scadenze',{id:sc.id,company_id:C,tipo:'costo_aziendale',description:c.name,amount:gross,due_date:c.due_date,status:'pagata',paid_amount:gross,paid_date:c.paid_date,cost_id:cost,is_auto_generated:false,notes:MARK+' Scadenza del costo e pagamento già esistenti; non nuovo movimento.'}));
   }
   if(amount<0&&!cost&&!sc)throw Error('Expense mirror would duplicate management cost: '+p.id);
   if(!invoice&&!sc&&!p.movimento_id)throw Error('Missing reconciliation target '+p.id);
   const id=uid('bank-tx-'+p.id);
   statements.push(insert('bank_transactions',{id,company_id:C,account_id:account,external_transaction_id:`manual:demo-history-${YEAR}:pn:${p.id}`,booking_date:p.entry_date,value_date:p.entry_date,amount,currency:'EUR',description:p.description,transaction_type:amount>0?'credit':'debit',status:'booked',source:'manuale',category:p.category,linked_invoice_id:invoice,reconciled_invoice_id:invoice,linked_cost_id:cost,linked_scadenza_id:sc?.id||null,linked_installment_id:p.installment_id,reconciliation_status:'reconciled',reconciled_at:stamp(p.entry_date),created_at:stamp(p.entry_date),note:MARK+' Conto manuale simulato. Stesso evento della prima nota, NON un nuovo pagamento. Saldo iniziale ipotizzato '+opening+' EUR.',metadata:{demo:true,marker:MARK,prima_nota_id:p.id,order_id:p.order_id,documento_fiscale_id:p.documento_fiscale_id}}));
   statements.push(insert('bank_reconciliations',{id:uid('bank-recon-'+p.id),company_id:C,transaction_id:id,invoice_id:invoice,scadenza_id:sc?.id||null,movimento_id:p.movimento_id,matched_amount:Math.abs(amount),match_type:'manual',matched_by:A,matched_at:stamp(p.entry_date),created_at:stamp(p.entry_date),notes:MARK+' Collegamento al pagamento esistente, nessun incasso aggiuntivo.'}));
   statements.push(`update prima_nota_entries set bank_transaction_id=${q(id)},account_label=${q(name)} where company_id=${q(C)} and id=${q(p.id)} and bank_transaction_id is null;do $$begin if (select bank_transaction_id from prima_nota_entries where company_id=${q(C)} and id=${q(p.id)}) is distinct from ${q(id)}::uuid then raise exception 'Concurrent bank link changed';end if;end $$;`);
   mirrors.push({id,pn:p.id,amount,invoice,cost,scadenza:sc?.id||null});
 }
 statements.push(`do $$begin if (select coalesce(sum(amount),0) from prima_nota_entries where company_id=${q(C)})<>${Number(baseline.cash_total)} or abs((select coalesce(sum(importo),0) from v_cg_costi_classificati where company_id=${q(C)} and anno=${YEAR})-${Number(baseline.ce_costs)})>.01 then raise exception 'Bank mirror duplicated financial events';end if;end $$;`);
 batches.push(statements);
}
plan(stage,batches,{company:C,year:YEAR,account,opening,mirrors,closing:round(existingBalance+mirrors.reduce((s,r)=>s+r.amount,0)),baseline,newCashEvents:0,newCosts:0});

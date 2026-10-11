/** Read-only proof of operational, stock, HR, treasury and private document links. */
import {C,YEAR,AS_OF,MARK,q,sql,guard,read,save,has,round} from './demo-company-history.mjs';
guard();const m=read('business-manifest'),ids=m.orders.map(o=>q(o.id)).join(','),scope=`company_id=${q(C)}`,bank=read('treasury-manifest');if(has('treasury-tail-applied')){const tail=read('treasury-tail-manifest');bank.mirrors.push(...tail.mirrors);bank.closing=tail.closing;}
const [r]=sql(`with reports as (select * from campo_rapportini where ${scope} and order_id in(${ids})),
presences as (select r.order_id,r.data_lavoro,r.id report_id,(p->>'employee_id')::uuid employee_id,(p->>'ore')::numeric hours from reports r cross join lateral jsonb_array_elements(r.presenze)p),
stock_ledger as (select stock_item_id,sum(case when movement_type='carico' then quantity else -quantity end) quantity from warehouse_movements where ${scope} and stock_item_id in(select id from warehouse_stock where ${scope} and description like ${q(MARK+'%')}) group by stock_item_id),
report_usage as (select r.order_id,(v->>'stock_item_id')::uuid stock,sum((v->>'quantita')::numeric) quantity from reports r cross join lateral jsonb_array_elements(r.materiali_usati)v group by 1,2),
stock_usage as (select order_id,stock_item_id stock,sum(quantity) quantity from warehouse_movements where ${scope} and order_id in(${ids}) and movement_type='scarico' group by 1,2)
select jsonb_build_object(
 'missingCustomerLink',(select count(*) from orders o left join profiles p on p.id=o.customer_id and p.company_id=o.company_id left join marketing_contacts c on c.id=p.marketing_contact_id and c.company_id=p.company_id where o.company_id=${q(C)} and o.id in(${ids}) and (p.id is null or c.customer_profile_id is distinct from p.id or not exists(select 1 from user_roles ur where ur.user_id=p.id and ur.role='customer') or not exists(select 1 from anagrafiche_native n where n.company_id=p.company_id and n.cliente_id=p.id) or not p.is_blocked or not p.portal_disabled)),
 'employeeDaysOver8',(select count(*) from (select employee_id,data_lavoro from presences group by 1,2 having sum(hours)>8)x),
 'missingHRDay',(select count(*) from presences p left join hr_profili h on h.company_id=${q(C)} and h.employee_id=p.employee_id left join hr_giornate g on g.company_id=h.company_id and g.profilo_id=h.id and g.data=p.data_lavoro where g.id is null or g.ore_lavorate<p.hours),
 'missingPunchLink',(select count(*) from presences p where not exists(select 1 from hr_timbrature t join hr_profili h on h.id=t.profilo_id where t.company_id=${q(C)} and h.employee_id=p.employee_id and t.data_evento=p.data_lavoro and t.order_id=p.order_id)),
 'reportBeforeHiring',(select count(*) from presences p join employees e on e.id=p.employee_id and e.company_id=${q(C)} where p.data_lavoro<e.data_assunzione),
 'laborMismatch',(select count(*) from orders o where o.company_id=${q(C)} and o.id in(${ids}) and abs(coalesce((select sum(costo_manodopera) from reports r where r.order_id=o.id),0)-coalesce((select sum(total_cost) from order_employees e where e.order_id=o.id),0))>.025),
 'stockQuantityMismatch',(select count(*) from stock_ledger l join warehouse_stock s on s.id=l.stock_item_id where s.company_id=${q(C)} and (s.quantity<>l.quantity or l.quantity<0)),
 'stockUseMismatch',(select count(*) from stock_usage a full join report_usage b on a.order_id=b.order_id and a.stock=b.stock where a.order_id is null or b.order_id is null or a.quantity<>b.quantity),
 'purchaseVATMismatch',(select count(*) from purchase_orders p where p.${scope} and p.order_id in(${ids}) and (p.vat_total<>round(p.subtotal*.22,2) or p.total<>round(p.subtotal*1.22,2))),
 'physicalCostMismatch',(select count(*) from (select p.id,p.subtotal,sum(w.quantity*w.unit_cost) physical from purchase_orders p join purchase_order_items i on i.purchase_order_id=p.id join warehouse_movements w on w.order_item_id=i.order_item_id and w.company_id=p.company_id and w.movement_type='carico' where p.company_id=${q(C)} and p.order_id in(${ids}) group by p.id)x where abs(subtotal-round(physical,2))>.005),
 'supplierGrossMismatch',(select count(*) from fatture_ricevute f join company_costs c on c.id=f.company_cost_id and c.company_id=f.company_id where f.${scope} and f.note like ${q(MARK+'%')} and abs(f.totale_documento-round(c.amount*(1+c.vat_rate/100),2))>.005),
 'cashMissingBank',(select count(*) from prima_nota_entries p where p.${scope} and p.notes like ${q(MARK+'%')} and p.bank_transaction_id is null),
 'cashBankMismatch',(select count(*) from prima_nota_entries p join bank_transactions b on b.id=p.bank_transaction_id where p.${scope} and p.notes like ${q(MARK+'%')} and (b.company_id<>p.company_id or b.amount<>case when p.direction='entrata' then p.amount else -p.amount end)),
 'bankMissingReconciliation',(select count(*) from bank_transactions b where b.${scope} and b.account_id=${q(bank.account)} and not exists(select 1 from bank_reconciliations r where r.company_id=b.company_id and r.transaction_id=b.id and r.unmatched_at is null)),
 'futureActualHR',(select count(*) from hr_timbrature where ${scope} and note like ${q(MARK+'%')} and data_evento>${q(AS_OF)}::date),
 'futurePaidPayroll',(select count(*) from hr_cedolini where ${scope} and note like ${q(MARK+'%')} and data_pagamento>${q(AS_OF)}::date),
 'futureStockMovements',(select count(*) from warehouse_movements where ${scope} and notes like ${q(MARK+'%')} and created_at::date>${q(AS_OF)}::date),
 'assetCollisions',(select count(*) from mezzi_assegnazioni a join mezzi_assegnazioni b on b.company_id=a.company_id and b.mezzo_id=a.mezzo_id and b.id>a.id and b.order_id<>a.order_id and a.dal<coalesce(b.al,'infinity'::timestamptz) and b.dal<coalesce(a.al,'infinity'::timestamptz) where a.${scope} and (a.order_id in(${ids}) or b.order_id in(${ids}))),
 'expiredOperationalAssets',(select count(*) from mezzi_scadenze where ${scope} and stato='scaduto'),
 'jobsWithInternalChat',(select count(*) from internal_chat_channels where ${scope} and order_id in(${ids})),
 'bankCount',(select count(*) from bank_transactions where ${scope} and account_id=${q(bank.account)}),
 'bankBalance',(select current_balance from bank_accounts where ${scope} and id=${q(bank.account)}),
 'exceptions',(select count(*) from order_errors where ${scope} and order_id in(${ids})),
 'assistance',(select count(*) from tickets where ${scope} and order_id in(${ids}))
) audit`);
const a=r.audit,fail=[],facts=['jobsWithInternalChat','bankCount','bankBalance','exceptions','assistance'];
for(const [key,value]of Object.entries(a))if(!facts.includes(key)&&Number(value)!==0)fail.push(key+': '+value);
if(a.jobsWithInternalChat!==m.orders.length||a.bankCount!==bank.mirrors.length||Math.abs(Number(a.bankBalance)-bank.closing)>.005)fail.push('chat/treasury coverage');
if(has('pdf-apply')){
 const p=read('pdf-apply');if(p.completed.length!==p.total)fail.push('PDF upload incomplete');
 const [checks]=sql(`select (select count(*) from order_attachments a join orders o on o.id=a.order_id where o.company_id=${q(C)} and o.id in(${ids}) and a.file_url like '%/demo-history-${YEAR}/%' and a.visible_to_customer=false) attachments,(select count(*) from documenti_fiscali where ${scope} and ordine_id in(${ids}) and pdf_url is not null) invoice_pdfs,(select count(*) from quotes where ${scope} and id in(select quote_id from orders where ${scope} and id in(${ids})) and pdf_storage_path is not null) quote_pdfs`);
 const sources=read('pdf-sources'),expected=p.completed.length-p.completed.filter(x=>x.kind==='payroll').length-sources.fatture_ricevute.filter(f=>!f.order_id_suggerito).length;
 if(Number(checks.attachments)!==expected||Number(checks.invoice_pdfs)!==m.orders.length*3||Number(checks.quote_pdfs)!==m.orders.length)fail.push('Missing native PDF links');
 Object.assign(a,{pdfs:p.completed.length,...checks});
}else fail.push('Private PDFs not yet bound');
save('deep-verified',{company:C,year:YEAR,asOf:AS_OF,...a,fail,scope:'new historical demo graphs only',complete:fail.length===0});console.log(JSON.stringify({year:YEAR,...a,fail},null,2));if(fail.length)throw Error('Deep saved-data verification failed');

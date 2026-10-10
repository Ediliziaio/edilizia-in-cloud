/** Incremental demo integration. Tenant-only, no auth changes or outbound calls. */
import {C,A,MARK,DIR,uid,q,j,read,save,sql,insert,guard} from './demo-company-55m.mjs';
import {existsSync} from 'node:fs';
const stage='integration2';
if(existsSync(`${DIR}/${stage}-applied.json`))throw Error('Applied plan is immutable');
guard();
const d=read('after'),prior=read('integration2-before'),relations=read('integration2-relations');
if(relations.taskRules)throw Error('Active task automation: review first');
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const add=(s,n)=>new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const jobs=read('business-manifest').orders,jobMap=new Map(jobs.map(o=>[o.id,o]));
const users=relations.members.filter(u=>u.role==='company_staff');
const admin=users.find(u=>u.first_name==='Giulia')?.user_id||A;
const technical=users.find(u=>u.first_name==='Marco'&&u.last_name==='Ricci')?.user_id||A;
const calendar=read('resources-manifest').calendarId;
const batches=[],manifest={company:C,quotes:[],tasks:[],sal:[],bank:[],calendars:[],outbound:0};
const stamp=date=>{const offset=new Intl.DateTimeFormat('en',{timeZone:'Europe/Rome',timeZoneName:'shortOffset'}).formatToParts(new Date(date+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value;return date+'T16:00:00'+(offset==='GMT+2'?'+02:00':'+01:00');};
// The calendar itself never sends invites or reminders.
for(const [key,name,color] of [['technical','DEMO · Sopralluoghi e verifiche','#FF790B'],['admin','DEMO · Acquisti e amministrazione','#193E68']]){
 const id=uid('integration2-calendar-'+key);manifest.calendars.push({id,name});
 batches.push([insert('marketing_calendars',{id,company_id:C,name,group_name:'DEMO · Operazioni',duration_minutes:30,calendar_type:'team',is_active:true,created_by:A,owner_id:A,description:MARK+' Agenda interna simulata. Nessun invito o promemoria esterno.',color,reminder_24h:false,reminder_1h:false,promemoria_5min:false,messaggi_crm_dal:'2030-01-01T00:00:00Z',default_meeting_enabled:false})]);
}
for(const o of d.orders.filter(o=>Number(o.total_amount)>0)){
 const s=[],job=jobMap.get(o.id),code=o.order_code||o.id,now='2026-10-09';
 const start=o.work_start_date||o.expected_date||now,end=o.work_end_date||o.expected_date||add(start,60);
 const contact=d.marketing_contacts.find(c=>c.customer_profile_id===o.customer_id&&!c.deleted_at)?.id;
 if(!contact)throw Error('Missing tenant contact: '+code);
 const rows=d.order_items.filter(i=>i.order_id===o.id),phases=d.order_work_phases.filter(p=>p.order_id===o.id).sort((a,b)=>a.position-b.position);
 if(!rows.length||!phases.length)throw Error('Incomplete job source '+code);
 if(!o.quote_id){
  const id=uid('integration2-quote-'+o.id),number='DEMO-PRV-'+code;
  s.push(insert('quotes',{id,company_id:C,quote_number:number,status:'bozza',contact_id:contact,client_name:o.client_name,client_email:o.client_email?.endsWith('.invalid')?o.client_email:'nessun-invio@demo-55m.invalid',client_address:o.client_address,title:'DEMO · '+o.description,description:'Capitolato dimostrativo della commessa '+code,internal_notes:MARK+' Ricostruzione demo da commessa. Nessun invio, firma o accettazione reale.',notes:'DEMO - Documento non contrattuale e non fiscale.',created_by:A,assigned_to:technical,created_at:add(start,-14)+'T09:00:00Z',tipo_lavoro:o.tipo_lavoro||'ristrutturazione',indirizzo_lavori:o.work_address,prezzo_manuale:Number(o.total_amount),prezzo_manuale_iva_pct:Number(o.vat_rate)||0,firma_digitale_abilitata:false,payment_method:'bonifico',pdf_watermark_text:'DEMO - NON CONTRATTUALE',terms_and_conditions:'Simulazione: prezzi e condizioni non costituiscono un’offerta reale.',payment_phases:d.order_installments.filter(i=>i.order_id===o.id).map(i=>({label:i.label,amount:i.amount}))}));
  let allocated=0;
  for(const [i,r]of rows.entries()){
   const value=i===rows.length-1?round(Number(o.total_amount)-allocated):round(Number(o.total_amount)/rows.length);allocated=round(allocated+value);
   s.push(insert('quote_items',{id:uid('integration2-quote-row-'+r.id),quote_id:id,company_id:C,item_type:'product',item_category:'prodotto',name:r.name,description:MARK+' Voce a corpo del capitolato; distinta dalla distinta acquisti.',quantity:1,unit_price:value,vat_rate:Number(o.vat_rate)||0,unit_of_measure:'corpo',sort_order:i,prezzo_acquisto:round(Number(r.purchase_price||r.standard_cost||0)*Number(r.quantity||1)),mostra_nel_pdf:true,is_optional:false}));
  }
  s.push(`update quotes set status='convertita' where id=${q(id)} and company_id=${q(C)};update orders set quote_id=${q(id)},quote_number=${q(number)} where id=${q(o.id)} and company_id=${q(C)} and quote_id is null;`);
  manifest.quotes.push({id,orderId:o.id,code,amount:Number(o.total_amount)});
 }
 const completed=!!job||(Number(o.percentuale_avanzamento)>=100&&end<=now);
 const definitions=[['Sopralluogo e capitolato',add(start,-10),technical],['Ordine materiali e controllo DDT',start,technical],['Avvio e verifica squadra',start,technical],['Controllo avanzamento e costi',job?.dates[19]||add(start,28),technical],['Verifica fatture fornitori',add(start,30),admin],['Verifica finale e collaudo',end,technical],['Incassi e chiusura economica',add(end,30),admin]];
 for(const [i,[title,date,assignee]]of definitions.entries()){
  // Don't replace tasks already created by users. Historical steps are inserted
  // waiting, then closed, so assigning the historical archive does not notify staff.
  const existing=prior.tasks.filter(t=>t.order_id===o.id);
  if(!job&&existing.some(t=>t.title.toLowerCase().includes(title.split(' ')[0].toLowerCase())))continue;
  const id=uid('integration2-task-'+o.id+'-'+i),closed=completed&&!(job?.index===46&&i===6),due=closed?date:date<now?now:date;
  s.push(insert('tasks',{id,company_id:C,title:'DEMO · '+title+' · '+code,notes:MARK+' Attività simulata. '+(closed?'Storico operativo ricostruito.':'Da verificare nella dimostrazione, non azione verso soggetti reali.'),status:closed?'in_attesa':'da_fare',priority:!closed&&i===6?'alta':'normale',due_date:due,assigned_to:closed?assignee:A,order_id:o.id,contact_id:contact,category:'ordini',created_by:A,is_recurring:false,estimated_hours:i===0?2:0.5,sort_order:i,created_at:add(start,-14)+'T09:00:00Z'}));
  if(closed)s.push(`update tasks set status='completata',completed_at=${q(stamp(date))},actual_hours=${i===0?2:0.5} where id=${q(id)} and company_id=${q(C)};`);
  for(let c=0;c<2;c++)s.push(insert('task_checklist_items',{id:uid('integration2-check-'+id+'-'+c),task_id:id,title:c?'Collegamenti e documento verificati (DEMO)':'Dati e importi confrontati (DEMO)',is_completed:closed,position:c}));
  manifest.tasks.push({id,orderId:o.id,closed});
 }
 // 36 contracts measured by cumulative SAL; 12 milestone-only contracts retain
 // their fixed-date instalments. Acconto is offset against the first certificate.
 if(job&&job.index%4!==3){
  const installments=d.order_installments.filter(i=>i.order_id===o.id).sort((a,b)=>a.position-b.position);
  for(const [n,pct]of [30,70,100].entries()){
   const id=uid('integration2-sal-'+o.id+'-'+n),date=job.dates[[11,27,39][n]],total=round(job.amount*pct/100);
   s.push(insert('sal_records',{id,company_id:C,order_id:o.id,numero_sal:n+1,data_emissione:date,stato:'approvato',importo_totale:total,created_by:A,created_at:stamp(date),installment_id:installments[n].id,note:MARK+' Misura cumulativa '+pct+'%. Acconto 30% compensato; incremento di questo verbale '+[30,40,30][n]+'%. Approvazione esclusivamente simulata, nessuna firma.'}));
   s.push(insert('sal_voci',{id:uid('integration2-sal-row-'+id),sal_id:id,descrizione:'Avanzamento cumulativo del capitolato '+code,importo_contrattuale:job.amount,percentuale_avanzamento:pct,note:'DEMO · Evidenze nei rapportini e nelle fasi. Nessuna nuova fattura o movimento di cassa.'}));
   // Keep the already-paid dates/amounts untouched. Mark the certificate link,
   // rather than retroactively changing the contractual payment trigger.
   manifest.sal.push({id,orderId:o.id,code,amount:total,increment:round(job.amount*[.3,.4,.3][n]),date,pct,installment:installments[n].id});
  }
 }
 // Two operational appointment types, internal only; historical completed
 // entries won't send notifications. Existing start/SAL/acceptance events stay.
 for(const [n,date]of [add(start,-10),start].entries()){
  const id=uid('integration2-appointment-'+o.id+'-'+n);
  s.push(insert('appointments',{id,company_id:C,order_id:o.id,contact_id:contact,title:'DEMO · '+['Sopralluogo tecnico','Consegna e controllo DDT'][n]+' · '+code,description:MARK+' Agenda interna di dimostrazione, nessun appuntamento reale.',appointment_date:date,appointment_time:n?'07:30':'10:00',appointment_end_time:n?'08:00':'10:30',appointment_type:'generico',is_completed:date<=now,status:'confermato',created_by:A,calendar_id:manifest.calendars[n].id,assigned_to:null,reminder_sent:true,reminder_minutes:null,booking_email:'nessun-invio@demo-55m.invalid',formatted_address:o.work_address||o.client_address}));
 }
 s.push(`do $$begin if not exists(select 1 from orders o join marketing_contacts c on c.customer_profile_id=o.customer_id and c.company_id=o.company_id where o.id=${q(o.id)} and o.company_id=${q(C)}) then raise exception 'Cross-tenant contact';end if;end $$;`);
 batches.push(s);
}
// Bank mirrors of existing 2025 cash events, not extra payments. Opening balance
// is an explicit scenario assumption, never a fabricated reconciliation entry.
const account=uid('integration2-bank-2025');
batches.push([insert('bank_accounts',{id:account,company_id:C,external_account_id:'manual:DEMO55-2025-integrated',display_name:'DEMO · Conto operativo esercizio 2025',account_name:'DEMO · Conto operativo esercizio 2025',currency:'EUR',account_type:'checking',opening_balance:250000,current_balance:250000,is_manual:true,is_active:true,connection_id:null})]);
for(const p of d.prima_nota_entries.filter(p=>p.entry_date?.startsWith('2025')&&p.notes?.includes(MARK)&&!p.bank_transaction_id)){
 const id=uid('integration2-bank-tx-'+p.id),amount=round(Number(p.amount)*(p.direction==='uscita'?-1:1));
 const payrollCategory=/Contributi datore/.test(p.description)?'INPS':/Stipendi netti|Trattenute simulate/.test(p.description)?'stipendi':null;
 const cost=p.cost_id||d.company_costs.find(c=>payrollCategory&&c.category===payrollCategory&&c.due_date===p.entry_date&&c.notes?.includes(MARK))?.id||null;
 const invoice=p.invoice_id||null;
 const sc=d.scadenze.find(s=>p.scadenza_id===s.id||cost&&s.cost_id===cost||invoice&&s.invoice_id===invoice);
 if(amount<0&&!cost&&!sc)throw Error('Bank expense would double-count CE: '+p.description);
 const s=[insert('bank_transactions',{id,company_id:C,account_id:account,external_transaction_id:'manual:DEMO55-PN:'+p.id,booking_date:p.entry_date,value_date:p.entry_date,amount,currency:'EUR',description:p.description,transaction_type:amount>0?'credit':'debit',status:'booked',source:'manuale',category:p.category,linked_invoice_id:invoice,reconciled_invoice_id:invoice,linked_cost_id:cost,linked_scadenza_id:sc?.id||null,reconciliation_status:'reconciled',reconciled_at:stamp(p.entry_date),note:MARK+' DEMO: specchio della prima nota, NON un pagamento aggiuntivo. Saldo iniziale scenario 250.000 EUR.',metadata:{demo:true,prima_nota_id:p.id,order_id:p.order_id,documento_fiscale_id:p.documento_fiscale_id}}),`update prima_nota_entries set bank_transaction_id=${q(id)} where id=${q(p.id)} and company_id=${q(C)} and bank_transaction_id is null;`];
 if(invoice||sc||p.movimento_id)s.push(insert('bank_reconciliations',{id:uid('integration2-reconciliation-'+p.id),company_id:C,transaction_id:id,invoice_id:invoice,scadenza_id:sc?.id||null,movimento_id:p.movimento_id,matched_amount:Math.abs(amount),match_type:'manual',matched_by:A,notes:MARK+' Evento già registrato: nessun invoice_payment nuovo.'}));
 s.push(`do $$begin if (select bank_transaction_id from prima_nota_entries where id=${q(p.id)} and company_id=${q(C)})<>${q(id)}::uuid then raise exception 'Concurrent cash link changed';end if;end $$;`);
 batches.push(s);manifest.bank.push({id,pn:p.id,amount,invoice,cost});
}
const grouped=[];for(let i=0;i<batches.length;i+=8)grouped.push(batches.slice(i,i+8).flat());
save('integration2-plan',{company:C,marker:MARK,batches:grouped});save('integration2-manifest',manifest);
console.log({batches:batches.length,quotes:manifest.quotes.length,tasks:manifest.tasks.length,sal:manifest.sal.length,bank:manifest.bank.length,bankNet:round(manifest.bank.reduce((s,x)=>s+x.amount,0))});

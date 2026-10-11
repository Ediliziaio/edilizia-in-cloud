/** Additive, tenant-only demonstration of the survey -> RDO -> existing ODA flow.
 * Never generate a second purchase, receipt, stock movement, cost or payment.
 */
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {C,A,q,j,sql,guard,context,insert} from './demo-company-accounting-audit.mjs';
import {uid,sha,queues,save as closureSave,has as closureHas,read as closureRead,run} from './demo-company-closure.mjs';
export const DIR='tmp/demo-integrated/operations-2024-2026',STAGE='operations-2024-2026',MARK='[DEMO OPERATIONS 2024-2026 v1]',AS_OF='2026-10-10';
mkdirSync(DIR,{recursive:true,mode:0o700});
export const read=n=>JSON.parse(gunzipSync(readFileSync(`${DIR}/${n}.json.gz`)));
export const has=n=>existsSync(`${DIR}/${n}.json.gz`);
export function save(n,v,immutable=false){if(immutable&&has(n))throw Error('Preserve '+n);writeFileSync(`${DIR}/${n}.json.gz`,gzipSync(JSON.stringify(v)),{mode:0o600});}
export const add=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export function businessDay(date,n){let d=date;for(let i=0;i<Math.abs(n);){d=add(d,Math.sign(n));const day=new Date(d+'T12:00:00Z').getUTCDay();if(day!==0&&day!==6)i++;}return d;}
export function localStamp(date,time){const noon=new Date(date+'T12:00:00Z'),h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',hourCycle:'h23'}).format(noon));return new Date(new Date(date+'T'+time+'Z').getTime()-(h-12)*3600000).toISOString();}
const stamp=(date,time='12:00:00')=>date+'T'+time+'Z',money=n=>Math.round(Number(n)*100)/100;
const keys=['surveys','survey_areas','survey_elements','survey_activity_log','survey_templates','supplier_rfqs','supplier_rfq_items','supplier_rfq_suppliers','supplier_rfq_quotes','anomalies','appointments','marketing_calendars','order_errors','purchase_orders','purchase_order_items','suppliers','v_ordine_marginalita'];
export function capture(){
 guard();const d={company:C,capturedAt:new Date().toISOString()};
 const allOrders=sql(`select * from orders where company_id=${q(C)} and deleted_at is null`);
 d.orders=allOrders.filter(o=>/^DEMO-(2024-H|2025-|2026-N)\d{3}$/.test(o.order_code));
 if(d.orders.length!==120)throw Error('Expected 24 + 48 + 48 known demo jobs');
 for(const t of keys){const child=['survey_areas','survey_elements','survey_activity_log'].includes(t),where=child?`survey_id in(select id from surveys where company_id=${q(C)})`:t==='survey_templates'?`(company_id=${q(C)} or is_system)`:`company_id=${q(C)}`;
  d[t]=sql(`select * from ${t} where ${where}`);
 }
 d.members=sql(`select p.id,r.role,p.first_name,p.last_name from profiles p join user_roles r on r.user_id=p.id where p.company_id=${q(C)} and r.role!='customer'`);
 d.protected=sql(protectedSQL())[0].value;
 save('before',d,true);console.log({jobs:d.orders.length,surveys:d.surveys.length,rfqs:d.supplier_rfqs.length,anomalies:d.anomalies.length,protected:d.protected});
}
export function protectedSQL(){return `select md5(jsonb_build_object(
 'costs',(select jsonb_agg(jsonb_build_array(id,amount,vat_rate,is_paid,paid_date,order_id) order by id) from company_costs where company_id=${q(C)}),
 'cash',(select jsonb_agg(jsonb_build_array(id,amount,entry_date,bank_transaction_id) order by id) from prima_nota_entries where company_id=${q(C)}),
 'invoices',(select jsonb_agg(jsonb_build_array(id,stato,imponibile_totale,iva_totale,totale_documento,importo_pagato) order by id) from documenti_fiscali where company_id=${q(C)}),
 'stock',(select jsonb_agg(to_jsonb(w) order by id) from warehouse_stock w where company_id=${q(C)}),
 'movements',(select jsonb_agg(jsonb_build_array(id,movement_type,quantity,order_id) order by id) from warehouse_movements where company_id=${q(C)}),
 'purchases',(select jsonb_agg(jsonb_build_array(id,supplier_id,subtotal,vat_total,total,status) order by id) from purchase_orders where company_id=${q(C)}),
 'margins',(select jsonb_agg(to_jsonb(v) order by id) from v_ordine_marginalita v where company_id=${q(C)})
 )::text) value`;}
export const schema={version:1,header_schema:[{key:'coord',label:'Coordinamento del capitolato DEMO',fields:[
 {key:'commessa',label:'Commessa',type:'text',required:true},{key:'accessi',label:'Accessi al cantiere',type:'textarea',required:true},
 {key:'utenze',label:'Utenze e servizi',type:'textarea',required:true},{key:'verifica_capitolato',label:'Capitolato verificato',type:'boolean',required:true},
 ]}],area_definition:{label:'Ambiente',label_plural:'Ambienti',fields:[{key:'superficie',label:'Superficie',type:'dimension',unit:'mq',required:true}],required_photos:[]},element_types:[{key:'capitolo',label:'Capitolo rilevato',label_plural:'Capitoli rilevati',allow_quantity:false,sections:[{key:'quantita',label:'Dati di coordinamento',fields:[{key:'descrizione',label:'Descrizione',type:'text',required:true},{key:'quantita',label:'Quantità di capitolato',type:'number',required:true,min:0.001},{key:'unita',label:'Unità',type:'text',required:true},{key:'posa',label:'Prescrizioni di posa',type:'textarea',required:true}]}],required_photos:[]}],general_required_photos:[]};
export function build(d){
 if(d.company!==C||d.orders.length!==120)throw Error('Wrong demo scope');
 const template=uid(STAGE+':template'),folder=uid(STAGE+':folder'),batches=[],manifest={company:C,marker:MARK,template,folder,jobs:[],calendars:[],vendors:[],newPurchases:0,newCosts:0,newCash:0,newStock:0,archivedSurveys:[]};
 const rivals=[0,1].map(i=>({id:uid(STAGE+':vendor-'+i),company_id:C,name:'DEMO · Confronto forniture '+(i+1),email:'forniture-confronto-'+i+'@demo.invalid',notes:MARK+' Fornitore fittizio per comparazione; nessun ordine o invio reale.'}));
 manifest.vendors=rivals;
 const members=[...new Map(d.members.filter(m=>m.role==='company_staff').map(m=>[m.id,m])).values()].slice(0,3);
 if(members.length<3)throw Error('Three company staff profiles required for internal agendas');
 const init=[insert('survey_templates',{id:template,company_id:C,category:'ristrutturazione',name:'DEMO · Coordinamento capitolato e accessi',description:MARK+' Rilievo sintetico di coordinamento. Non certificazione tecnica né firma.',is_system:false,is_active:true,area_label:'Ambiente',area_label_plural:'Ambienti',element_label:'Capitolo rilevato',schema,version:1,created_by:A})];
 for(const v of rivals)init.push(insert('suppliers',v));
 for(const year of [2024,2025,2026])for(const [i,m]of members.entries()){
  const row={id:uid(`${STAGE}:calendar-${year}-${m.id}`),company_id:C,name:`DEMO · ${year} · ${['Rilievi e direzione','Acquisti e fornitori','Personale e cantiere'][i]} · ${m.first_name}`,group_name:'DEMO · Agenda personale '+year,calendar_type:'personal',duration_minutes:30,is_active:year===2026,owner_id:m.id,created_by:A,description:MARK+' Solo interno: senza Google, booking pubblico, email o promemoria.',color:['#193E68','#FF7A0A','#16866A'][i],reminder_24h:false,reminder_1h:false,promemoria_5min:false,messaggi_crm_dal:'2030-01-01T00:00:00Z',default_meeting_enabled:false};
  init.push(insert('marketing_calendars',row));manifest.calendars.push(row);
 }
 batches.push(init);
 const calendar=(year,person)=>manifest.calendars.find(c=>c.owner_id===person.id&&c.group_name.endsWith(String(year))).id;
 const agenda=new Map();
 for(const a of d.appointments){if(!a.assigned_to||['annullato','cancelled','canceled'].includes(a.status))continue;const k=a.assigned_to+'|'+a.appointment_date;const xs=agenda.get(k)||[];xs.push([a.appointment_time?.slice(0,5)||'00:00',a.appointment_end_time?.slice(0,5)||'23:59']);agenda.set(k,xs);}
 const slot=(date,person)=>{const k=person.id+'|'+date,used=agenda.get(k)||[],hhmm=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');for(let n=9*60;n<17*60;n+=30){const a=hhmm(n),b=hhmm(n+30);if(used.some(([x,y])=>a<y&&b>x))continue;used.push([a,b]);agenda.set(k,used);return [a,b];}throw Error('Agenda already full '+date);};
 let jobStatements=[];
 for(const [index,o]of d.orders.sort((a,b)=>a.order_code.localeCompare(b.order_code)).entries()){
  const year=Number(o.order_code.slice(5,9)),po=d.purchase_orders.find(p=>p.order_id===o.id&&!d.supplier_rfqs.some(r=>r.purchase_order_id===p.id));
  if(!po||!po.supplier_id||!po.oda_number.startsWith('ODA-DEMO'))throw Error('Protected or ambiguous purchase '+o.order_code);
  const items=d.purchase_order_items.filter(i=>i.purchase_order_id===po.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  if(items.length!==6||Math.abs(items.reduce((n,i)=>n+Number(i.quantity)*Number(i.unit_price),0)-Number(po.subtotal))>.011)throw Error('Existing ODA rows do not reconcile '+o.order_code);
  const survey=uid(STAGE+':survey-'+o.id),rfq=uid(STAGE+':rfq-'+po.id),area=uid(STAGE+':area-'+o.id),issued=String(po.issue_date).slice(0,10),requested=businessDay(issued,-5),reviewDate=businessDay(requested,-1),surveyCreated=businessDay(reviewDate,-1),responseDate=businessDay(issued,-2);
  // A later/future planned supplier order must not appear as a completed delivery.
  const reviewed=reviewDate<=AS_OF,awarded=issued<=AS_OF;
  const surveyApp=uid(STAGE+':survey-appointment-'+o.id),code='DEMO-SOP-COORD-'+o.order_code;
  const s=[`do $$begin if not exists(select 1 from orders where company_id=${q(C)} and id=${q(o.id)} and order_code=${q(o.order_code)}) or exists(select 1 from surveys where id=${q(survey)}) or exists(select 1 from supplier_rfqs where company_id=${q(C)} and purchase_order_id=${q(po.id)}) then raise exception 'Concurrent operational graph change';end if;end $$;`];
  const appointments=[];
  const appointment=(id,title,date,person,start,end)=>{const x={id,company_id:C,order_id:o.id,title:'DEMO · '+title+' · '+o.order_code,description:MARK,internal_notes:MARK+' Impegno assegnato; non crea ore, costi o timbrature.',appointment_date:date,appointment_time:start,appointment_end_time:end,assigned_to:person.id,created_by:A,calendar_id:calendar(year,person),appointment_type:'generico',is_completed:date<=AS_OF,status:date<=AS_OF?'completato':'confermato',reminder_sent:true,reminder_minutes:null,booking_email:'nessun-invio@demo.invalid',created_at:stamp(surveyCreated),formatted_address:o.work_address||o.client_address};appointments.push(x);s.push(insert('appointments',x));};
  const [time,endTime]=slot(reviewDate,members[0]);
  appointment(surveyApp,'Sopralluogo di coordinamento',reviewDate,members[0],time,endTime);
  appointment(uid(STAGE+':rfq-appointment-'+o.id),'Confronto offerte e approvvigionamento',issued,members[1],...slot(issued,members[1]));
  appointment(uid(STAGE+':staff-appointment-'+o.id),'Coordinamento personale e mezzi',o.work_start_date,members[2],...slot(o.work_start_date,members[2]));
  s.push(insert('surveys',{id:survey,company_id:C,template_id:template,order_id:o.id,client_id:o.customer_id,contact_id:o.contact_id||null,technician_id:members[0].id,created_by:A,code,mode:'structured',status:reviewed?'reviewed':'draft',header_data:{commessa:o.order_code,accessi:'Accesso carrabile e pedonale concordato; zona scarico e protezioni previste.',utenze:'Punto acqua ed elettricità di cantiere verificati; disponibilità servizi.',verifica_capitolato:reviewed},address:o.work_address||o.client_address,city:'DEMO · Lombardia',notes:MARK+' Dati fittizi di coordinamento, senza firma o certificazione. Quantità e capitoli corrispondono all’ODA esistente.',scheduled_at:localStamp(reviewDate,time+':00'),started_at:reviewed?localStamp(reviewDate,time+':00'):null,completed_at:reviewed?localStamp(reviewDate,endTime+':00'):null,reviewed_at:reviewed?localStamp(reviewDate,endTime+':00'):null,duration_minutes:30,appointment_id:surveyApp,supplier_order_id:po.id,estimate_id:null,template_schema_snapshot:schema,created_at:stamp(surveyCreated)}));
  s.push(insert('survey_areas',{id:area,survey_id:survey,name:'Ambienti interessati dal capitolato',position:0,area_data:{superficie:80+index%9*10},notes:MARK,is_complete:reviewed,created_at:stamp(surveyCreated)}));
  for(const [n,i]of items.entries())s.push(insert('survey_elements',{id:uid(STAGE+':survey-element-'+i.id),survey_id:survey,area_id:area,element_type:'capitolo',element_label:i.description,position:n,quantity:1,values:{descrizione:i.description,quantita:Number(i.quantity),unita:i.unit_of_measure||'corpo',posa:'Confermare supporti, quote e protezioni; posa a regola d’arte secondo capitolato DEMO.'},notes:MARK,is_complete:reviewed,created_at:stamp(surveyCreated)}));
  s.push(insert('survey_activity_log',{id:uid(STAGE+':survey-log-'+o.id),survey_id:survey,user_id:members[0].id,event_type:reviewed?'status_change:reviewed':'created',event_data:{demo:true,order:o.order_code,source:'Rilievo di coordinamento ricostruito dal capitolato DEMO'},created_at:stamp(reviewed?reviewDate:requested)}));
  // Preserve incomplete old technical data as an archived draft, never pretend it was completed.
  const old=d.surveys.filter(x=>x.order_id===o.id&&x.code?.startsWith('DEMO-SOP-2025-')&&x.status==='in_progress'&&!x.client_signature_url&&!x.signed_at);
  for(const x of old){s.push(`update surveys set status='archived',notes=concat_ws(' ',notes,${q(MARK+' Bozza iniziale conservata. Rilievo di coordinamento: '+code)}) where company_id=${q(C)} and id=${q(x.id)} and status='in_progress' and client_signature_url is null and signed_at is null;`);manifest.archivedSurveys.push(x.id);}
  s.push(insert('supplier_rfqs',{id:rfq,company_id:C,rfq_number:'DEMO-RDO-'+o.order_code,titolo:'DEMO · Confronto capitolato · '+o.order_code,descrizione:'Stessi capitoli e quantità dell’ODA; tre offerte fittizie confrontabili.',order_id:o.id,data_fabbisogno:po.expected_delivery_date||o.work_start_date,scadenza_offerte:responseDate,status:awarded?'aggiudicata':'bozza',supplier_id_aggiudicato:awarded?po.supplier_id:null,purchase_order_id:awarded?po.id:null,aggiudicata_at:awarded?stamp(issued):null,motivazione_scelta:awarded?'DEMO · Migliore prezzo comparabile e consegna entro il fabbisogno. ODA già presente: nessuna nuova aggiudicazione.':null,note:MARK+' Ricostruzione documentale: nessun invio, nuovo ODA, movimento di magazzino o costo.',created_by:A,created_at:stamp(requested)}));
  const rfqItems=items.map((i,n)=>({id:uid(STAGE+':rfq-item-'+i.id),rfq_id:rfq,company_id:C,descrizione:i.description,quantita:Number(i.quantity),unita_misura:i.unit_of_measure||'corpo',note:MARK+' Capitolo a corpo della fornitura; packing list fisica dettagliata sul DDT.',posizione:n,created_at:stamp(requested)}));
  for(const i of rfqItems)s.push(insert('supplier_rfq_items',i));
  const vendors=[po.supplier_id,...rivals.map(v=>v.id)],offers=[];
  for(const [vi,v]of vendors.entries()){
   const id=uid(STAGE+':rfq-supplier-'+rfq+'-'+v),factor=[1,1.025,1.07][vi];
   const lines=items.map((i,n)=>({id:uid(STAGE+':rfq-price-'+id+'-'+i.id),rfq_supplier_id:id,rfq_item_id:rfqItems[n].id,company_id:C,prezzo_unitario:Number((Number(i.unit_price)*factor).toFixed(4)),sconto_percentuale:0,aliquota_iva:Number(i.vat_rate??22),disponibile:true,note:MARK,created_at:stamp(responseDate)}));
   const total=money(lines.reduce((a,l,n)=>a+l.prezzo_unitario*Number(items[n].quantity),0));
   if(!vi&&Math.abs(total-Number(po.subtotal))>.011)throw Error('Winning offer differs from existing ODA');
   const supplier={id,rfq_id:rfq,company_id:C,supplier_id:v,status:awarded?'risposta':'da_inviare',inviata_at:null,risposta_at:awarded?stamp(responseDate):null,totale_offerto:awarded?total:null,giorni_consegna:vi?14:7,validita_offerta:add(responseDate,30),condizioni_pagamento:'DEMO · Bonifico 30 giorni',note:MARK+' Offerta inserita manualmente per simulazione; nessuna email inviata.',aggancio_da:'manuale',aggancio_da_confermare:false,created_at:stamp(requested)};
   s.push(insert('supplier_rfq_suppliers',supplier));if(awarded)for(const row of lines)s.push(insert('supplier_rfq_quotes',row));offers.push({supplier,lines:awarded?lines:[]});
  }
  let anomaly=null;
  if(index%6===0&&o.work_start_date<=AS_OF){const error=d.order_errors.find(e=>e.order_id===o.id),when=error?.error_date||add(o.work_start_date,7),closed=o.work_end_date<=AS_OF;
   anomaly={id:uid(STAGE+':anomaly-'+o.id),company_id:C,order_id:o.id,type:'workflow',priority:closed?'medium':'high',status:closed?'resolved':'assigned',title:error?'DEMO · Verifica ripresa finiture':'DEMO · Verifica consegna e disponibilità materiali',description:MARK+' Eccezione operativa simulata: controllare quantità, consegna e verifica di fase. Ore e costi già contabilizzati; non nuova perdita.',impact_amount:0,assigned_to:members[2].id,created_by:A,created_at:stamp(when),resolved_at:closed?stamp(o.work_end_date):null,resolution_notes:closed?'DEMO · Verifica completata con rapportino e DDT; nessun costo aggiuntivo.':null};
   if(when<=AS_OF)s.push(insert('anomalies',anomaly));else anomaly=null;
  }
  manifest.jobs.push({id:o.id,code:o.order_code,year,survey,area,rfq,po:po.id,supplier:po.supplier_id,reviewDate,requested,responseDate,issued,reviewed,awarded,items:rfqItems,offers,appointments,anomaly,archived:old.map(s=>s.id)});
  jobStatements.push(...s);
  if(index%8===7||index===d.orders.length-1){batches.push(jobStatements);jobStatements=[];}
 }
 // Every short batch must leave the entire financial/physical graph byte-equivalent.
 for(const b of batches){if(b!==init)b.unshift(...init);b.push(`do $$begin if (${protectedSQL()}) is distinct from ${q(d.protected)} then raise exception 'Operational demo changed financial amounts, margins or stock';end if;end $$;`);}
 return {company:C,batches,manifest};
}
if(process.argv[1]?.endsWith('demo-company-operations.mjs')){
 const mode=process.argv[2]||'capture';
 if(mode==='capture')capture();
 else if(['plan','revise'].includes(mode)){guard();const revised=has('plan');if(revised&&mode!=='revise')throw Error('Preserve prepared plan');if(revised){if(closureHas(STAGE+'-apply'))throw Error('Never revise an applied plan');const old=read('plan'),h=sha(old);save('superseded-'+h,old,true);closureSave(STAGE+'-superseded-'+h,old,true);if(closureHas(STAGE+'-dry'))closureSave(STAGE+'-dry-superseded-'+h,closureRead(STAGE+'-dry'),true);}const p=build(read('before'));save('plan',p,!revised);closureSave(STAGE+'-plan',p,!revised);if(revised)closureSave(STAGE+'-dry',{company:C,hash:sha(p),completed:[]});console.log({jobs:p.manifest.jobs.length,rfqs:p.manifest.jobs.length,offers:p.manifest.jobs.reduce((n,j)=>n+j.offers.length,0),archived:p.manifest.archivedSurveys.length,personalCalendars:p.manifest.calendars.length,anomalies:p.manifest.jobs.filter(j=>j.anomaly).length,batches:p.batches.length,newCost:0,newStock:0});}
 else if(['dry','apply'].includes(mode))run(STAGE,mode);
 else throw Error('capture | plan | dry | apply');
}

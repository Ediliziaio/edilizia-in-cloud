/** Read-only, saved-graph verification; no implied browser or legal verification. */
import {C,q,sql,guard} from './demo-company-accounting-audit.mjs';
import {uid} from './demo-company-closure.mjs';
import {read,save,has,MARK,STAGE,AS_OF,protectedSQL,localStamp} from './demo-company-operations.mjs';
export function verify(d,p,b,pdfs){
 const checks=[],check=(name,ok,detail)=>checks.push({name,ok:!!ok,detail}),get=(t,id)=>d[t].find(x=>x.id===id),eq=(x,y)=>Math.abs(Number(x)-Number(y))<.011;
 check('tenant-only graph',d.company===C&&p.company===C);
 check('costs, cash, invoices, purchases, warehouse and margins unchanged',d.protected===b.protected);
 for(const m of p.manifest.jobs){
  const s=get('surveys',m.survey),r=get('supplier_rfqs',m.rfq),po=get('purchase_orders',m.po),els=d.survey_elements.filter(e=>e.survey_id===m.survey),items=d.supplier_rfq_items.filter(i=>i.rfq_id===m.rfq),offers=d.supplier_rfq_suppliers.filter(o=>o.rfq_id===m.rfq);
  check(m.code+' survey linked and unsigned',s?.company_id===C&&s.order_id===m.id&&s.supplier_order_id===m.po&&s.template_id===p.manifest.template&&!s.client_signature_url&&!s.signed_at);
  check(m.code+' six survey chapters',els.length===6&&els.every(e=>e.area_id===m.area&&e.values?.descrizione&&e.values?.quantita>0&&e.values?.unita&&e.values?.posa));
  check(m.code+' survey chronology',s?.created_at?.slice(0,10)<m.reviewDate&&s?.status===(m.reviewed?'reviewed':'draft')&&m.reviewDate<m.requested&&m.requested<m.responseDate&&m.responseDate<m.issued);
  check(m.code+' purchase link is original',r?.company_id===C&&r.order_id===m.id&&(!m.awarded||(r.purchase_order_id===po?.id&&r.supplier_id_aggiudicato===po?.supplier_id&&r.status==='aggiudicata')));
  check(m.code+' six RDO chapters and three offers',items.length===6&&offers.length===3&&new Set(offers.map(o=>o.supplier_id)).size===3);
  for(const o of offers){
   const prices=d.supplier_rfq_quotes.filter(x=>x.rfq_supplier_id===o.id),total=prices.reduce((n,l)=>n+Number(l.prezzo_unitario)*Number(items.find(i=>i.id===l.rfq_item_id)?.quantita||0)*(1-Number(l.sconto_percentuale)/100),0);
   check(m.code+' offer '+o.id+' saved quantities and total',m.awarded?prices.length===6&&eq(total,o.totale_offerto):prices.length===0&&o.totale_offerto===null);
   check(m.code+' offer '+o.id+' manual simulation',o.company_id===C&&!o.inviata_at&&o.aggancio_da==='manuale'&&(!m.awarded||o.risposta_at.slice(0,10)===m.responseDate));
   if(o.supplier_id===po?.supplier_id&&m.awarded)check(m.code+' winning offer matches ODA',eq(o.totale_offerto,po.subtotal));
   if(pdfs&&m.awarded)check(m.code+' offer original PDF',o.allegato_url?.startsWith('order-attachments/orders/'+m.id+'/demo-operations/'));
  }
  for(const expected of m.appointments){const a=get('appointments',expected.id),cal=get('marketing_calendars',expected.calendar_id);check(m.code+' appointment '+expected.id+' linked, date and ownership',a?.company_id===C&&a.order_id===m.id&&a.calendar_id===expected.calendar_id&&a.assigned_to===expected.assigned_to&&cal?.owner_id===a.assigned_to&&a.appointment_date===expected.appointment_date&&a.is_completed===(a.appointment_date<=AS_OF)&&a.appointment_time.slice(0,5)===expected.appointment_time&&!a.contact_id&&a.booking_email==='nessun-invio@demo.invalid');}
  const app=get('appointments',m.appointments[0].id);check(m.code+' survey and calendar Rome timezone',s?.appointment_id===app?.id&&new Date(s.scheduled_at).toISOString()===localStamp(app.appointment_date,app.appointment_time));
  if(m.anomaly){const a=get('anomalies',m.anomaly.id);check(m.code+' exception no duplicate cost',a?.order_id===m.id&&Number(a.impact_amount)===0&&a.status===m.anomaly.status&&a.created_at.slice(0,10)<=AS_OF&&(!a.resolved_at||a.resolved_at.slice(0,10)<=AS_OF));}
  for(const id of m.archived){const old=get('surveys',id),source=b.surveys.find(x=>x.id===id);check(m.code+' old draft recoverable '+id,old?.status==='archived'&&old.template_id===source?.template_id&&old.header_data&&JSON.stringify(old.header_data)===JSON.stringify(source?.header_data));}
  if(pdfs){check(m.code+' survey PDF',!!s.pdf_report_url);const expected=[['survey',m.survey],['rfq',m.rfq],...offers.filter(x=>x.status==='risposta').map(x=>['offer',x.id])];for(const [kind,id]of expected){const a=get('order_attachments',uid(STAGE+':pdf-'+kind+'-'+id));check(m.code+' private '+kind+' document '+id,a?.order_id===m.id&&a.folder_id===p.manifest.folder&&!a.visible_to_customer&&a.file_size>1000&&a.file_url?.startsWith('orders/'+m.id+'/demo-operations/'));}}
  if(po?.status==='received')check(m.code+' received ODA has original DDT',d.ddt_ricezione.some(x=>x.purchase_order_id===po.id));
 }
 const newAppointments=p.manifest.jobs.flatMap(j=>j.appointments).map(x=>x.id),newIds=new Set(newAppointments);
 let overlaps=0;for(const a of d.appointments.filter(x=>newIds.has(x.id)))for(const b of d.appointments){if(a.id===b.id||a.assigned_to!==b.assigned_to||a.appointment_date!==b.appointment_date||['annullato','cancelled','canceled'].includes(b.status))continue;if(a.appointment_time.slice(0,5)<(b.appointment_end_time?.slice(0,5)||'23:59')&&a.appointment_end_time.slice(0,5)>(b.appointment_time?.slice(0,5)||'00:00'))overlaps++;}
 check('no new personal agenda overlaps',overlaps===0,overlaps);
 check('nine internal personal calendars selectable including history',p.manifest.calendars.every(x=>{const c=get('marketing_calendars',x.id);return c?.company_id===C&&c.is_active&&c.owner_id===x.owner_id&&!c.external_provider&&!c.external_connection_id&&!c.default_meeting_enabled&&!c.reminder_24h&&!c.reminder_1h;}));
 check('no public booking, WhatsApp channel, Google link or five-minute reminders',p.manifest.calendars.every(x=>{const c=get('marketing_calendars',x.id);return c&&!c.booking_slug&&!c.whatsapp_numero_id&&!c.google_connection_id&&!c.promemoria_5min;}));
 if(pdfs)check('all private documents uploaded and download hashes verified',pdfs.completed.length===pdfs.expected&&pdfs.completed.every(x=>x.downloadVerified&&x.sha));
 return {company:C,verifiedAt:new Date().toISOString(),checks,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok),jobs:p.manifest.jobs.length,rfqs:p.manifest.jobs.length,offers:p.manifest.jobs.reduce((n,j)=>n+j.offers.length,0),personalAppointments:newIds.size,anomalies:p.manifest.jobs.filter(j=>j.anomaly).length,archivedDrafts:p.manifest.archivedSurveys.length,pdfs:pdfs?.completed.length||0,browserE2E:false,overallCompanyComplete:false};
}
if(process.argv[1]?.endsWith('demo-company-operations-verify.mjs')){
 guard();const d={company:C};for(const t of ['surveys','survey_elements','supplier_rfqs','supplier_rfq_items','supplier_rfq_suppliers','supplier_rfq_quotes','purchase_orders','appointments','marketing_calendars','anomalies','order_attachments','ddt_ricezione']){const child=t==='survey_elements',attachments=t==='order_attachments';d[t]=sql(`select * from ${t} where ${child?`survey_id in(select id from surveys where company_id=${q(C)})`:attachments?`order_id in(select id from orders where company_id=${q(C)})`:`company_id=${q(C)}`}`);}
 d.protected=sql(protectedSQL())[0].value;save('latest',d);const result=verify(d,read('plan'),read('before'),has('pdf-apply')?read('pdf-apply'):null);save('verification',result);console.log(JSON.stringify({passed:result.passed,failed:result.failed,jobs:result.jobs,rfqs:result.rfqs,offers:result.offers,personalAppointments:result.personalAppointments,anomalies:result.anomalies,archivedDrafts:result.archivedDrafts,pdfs:result.pdfs,complete:result.overallCompanyComplete},null,2));if(result.failed.length)process.exitCode=1;
}

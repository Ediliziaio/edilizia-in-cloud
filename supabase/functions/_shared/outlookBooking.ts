import {bookingCalendarDestination} from './bookingCalendarDestination.ts';
export async function syncOutlookBooking(db:any,input:{action:string;appointmentId:string;companyId:string},token:(id:string)=>Promise<string>,send:typeof fetch=fetch){
 const {data:apt,error}=await db.from('appointments').select('*').eq('id',input.appointmentId).eq('company_id',input.companyId).maybeSingle();
 if(error)throw error;if(!apt)return{status:404,body:{error:'Appuntamento non disponibile'}};
 const {data:link,error:linkError}=await db.from('appointment_outlook_links').select('*').eq('appointment_id',apt.id).eq('company_id',input.companyId).maybeSingle();if(linkError)throw linkError;
 if(input.action==='delete-event'&&!link)return{status:200,body:{skipped:true}};
 let conn:any,calendarId:string;
 if(link){const q=await db.from('outlook_calendar_connections').select('id,company_id,user_id,primary_calendar_id').eq('id',link.connection_id).eq('company_id',input.companyId).maybeSingle();if(q.error)throw q.error;conn=q.data;calendarId=link.calendar_id;}
 else{
  const routed=await bookingCalendarDestination(db,apt,input.companyId);
  const {data:cal,error:calError}=routed.calendar_id?await db.from('marketing_calendars').select('owner_id,external_provider,external_connection_id,external_calendar_id').eq('id',routed.calendar_id).eq('company_id',input.companyId).maybeSingle():{data:null,error:null};if(calError)throw calError;
  if(!cal?.external_connection_id&&!routed.assigned_to&&!cal?.owner_id)return{status:404,body:{error:'Responsabile calendario non disponibile'}};
  let query=db.from('outlook_calendar_connections').select('id,company_id,user_id,primary_calendar_id').eq('company_id',input.companyId).eq('status','active');
  if(cal?.external_provider==='outlook'&&cal.external_connection_id)query=query.eq('id',cal.external_connection_id);else query=query.eq('user_id',routed.assigned_to??cal?.owner_id);
  const q=await query.maybeSingle();if(q.error)throw q.error;conn=q.data;calendarId=(cal?.external_provider==='outlook'?cal.external_calendar_id:null)??conn?.primary_calendar_id;
 }
 if(!conn||!calendarId)return{status:404,body:{error:'Outlook Calendar non collegato'}};
 if(conn.company_id!==input.companyId)throw Error('Connessione di un’altra azienda');
 const base=`https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`;
 const local=(value:string)=>new Date(`${apt.appointment_date}T${value.length===5?value+':00':value}Z`).toISOString().slice(0,19);
 const method=input.action==='delete-event'?'DELETE':link?'PATCH':'POST';
 const event=method==='DELETE'?{}:{subject:apt.title??'Appuntamento',body:{contentType:'Text',content:apt.description??''},start:{dateTime:local(String(apt.appointment_time)),timeZone:'W. Europe Standard Time'},end:{dateTime:apt.appointment_end_time?local(String(apt.appointment_end_time)):new Date(Date.parse(local(String(apt.appointment_time))+'Z')+30*60000).toISOString().slice(0,19),timeZone:'W. Europe Standard Time'},...(method==='POST'?{transactionId:apt.id}:{})};
 const response=await send(link?`${base}/${encodeURIComponent(link.event_id)}`:base,{method,headers:{Authorization:`Bearer ${await token(conn.id)}`,'Content-Type':'application/json'},...(method!=='DELETE'?{body:JSON.stringify(event)}:{}),signal:AbortSignal.timeout(15000)});
 if(!response.ok&&!(method==='DELETE'&&response.status===404))return{status:502,body:{error:`Outlook: HTTP ${response.status}`}};
 if(method==='DELETE'){const q=await db.from('appointment_outlook_links').delete().eq('appointment_id',apt.id).eq('company_id',input.companyId);if(q.error)throw q.error;}
 else if(!link){const result=await response.json();if(typeof result.id!=='string')throw Error('Outlook non ha confermato l’evento');const q=await db.from('appointment_outlook_links').upsert({appointment_id:apt.id,company_id:input.companyId,connection_id:conn.id,user_id:conn.user_id,calendar_id:calendarId,event_id:result.id},{onConflict:'appointment_id'});if(q.error)throw q.error;}
 return{status:200,body:{ok:true}};
}

import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {protectedOrderUrl} from '../../../src/lib/orders/protectedOrderRequests.ts';
import type{ToolContext} from './silvioTools.ts';
import {SILVIO_PERMISSION_CONTRACTS,contractPermission} from './silvioPermissionContracts.ts';

/** The user JWT is bound to the actor and kept on every DB request, including RPCs. */
export async function scopedToolContext(ctx:ToolContext):Promise<ToolContext>{
 const token=ctx.authToken?.replace(/^Bearer\s+/i,'');
 if(!token)throw new Error('Per questa operazione serve una sessione personale verificata. Accedi alla piattaforma.');
 const url=ctx.supabase.supabaseUrl,key=ctx.supabase.supabaseKey;
 if(!url||!key)throw new Error('Connessione utente non disponibile. Nessuna operazione eseguita.');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`},fetch:(input:RequestInfo|URL,init?:RequestInit)=>fetch(protectedOrderUrl(String(input)),init)}});
 const {data,error}=await client.auth.getUser(token);
 if(error||data.user?.id!==ctx.userId)throw new Error('Sessione non valida per questo utente. Nessuna operazione eseguita.');
 return {...ctx,supabase:client};
}
function checked<T>(result:{data:T;error:unknown}):T{if(result.error)throw new Error('Non riesco a leggere o modificare i dati consentiti. Nessuna conferma di esecuzione.');return result.data;}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function orders(ctx:ToolContext,args:Record<string,unknown>,one=false){
 let q=ctx.supabase.from('orders_visibili').select('id,order_code,description,current_status_id,total_amount,deposit_amount,work_start_date,work_end_date').eq('company_id',ctx.companyId);
 const code=String(args.commessa_codice??args.order_id??'').trim();
 if(one){if(!code)throw new Error('Indica la commessa.');q=uuid.test(code)?q.eq('id',code):q.eq('order_code',code);}
 if(args.query)q=q.ilike('description',`%${String(args.query).replace(/[%_]/g,'').slice(0,100)}%`);
 return checked(await q.order('id').limit(50)) as Record<string,unknown>[];
}
export async function executeAuthorizedRead(name:string,args:Record<string,unknown>,ctx:ToolContext):Promise<unknown>{
 if(!SILVIO_PERMISSION_CONTRACTS[name]?.adapter)throw new Error('Strumento senza lettura autorizzata.');
 const p=ctx.staffPermissions??{};
 if(name==='leggi_dati_autorizzati'){
  if(!contractPermission(name,p,ctx.primaryRole,args))throw new Error('Non hai accesso a questa categoria di dati.');
  const area=String(args.area);
  if(area==='commesse')return executeAuthorizedRead('get_orders_summary',args,ctx);
  if(area==='economia')return executeAuthorizedRead('report_commessa',args,ctx);
  if(area==='incassi')return executeAuthorizedRead('get_quadro_incassi',args,ctx);
  if(area==='personale')return executeAuthorizedRead('get_team_summary',args,ctx);
  if(area==='contatti')return executeAuthorizedRead('cerca_contatti_autorizzati',args,ctx);
  if(area==='opportunita')return executeAuthorizedRead('cerca_opportunita_autorizzate',args,ctx);
  if(area==='fatture')return {documenti:checked(await ctx.supabase.from('documenti_fiscali').select('id,tipo,numero,stato,data_emissione,totale_documento,importo_pagato').eq('company_id',ctx.companyId).limit(50))};
  if(area==='fornitori')return {fornitori:checked(await ctx.supabase.from('suppliers').select('id,name,email,phone,is_active').eq('company_id',ctx.companyId).limit(50))};
  if(area==='calendario')return {appuntamenti:checked(await ctx.supabase.from('appointments').select('id,title,appointment_date,appointment_time,order_id,assigned_to').eq('company_id',ctx.companyId).limit(50))};
  if(area==='attivita')return {attivita:checked(await ctx.supabase.from('tasks').select('id,title,status,due_date,assigned_to,order_id').eq('company_id',ctx.companyId).limit(50))};
  if(area==='documenti'){
   const visible=await orders(ctx,args);if(!visible.length)return {documenti:[]};
   return {documenti:checked(await ctx.supabase.from('order_attachments').select('id,order_id,file_name,access_scope').in('order_id',visible.map(r=>r.id)).limit(50)),nota:'Apri la commessa per scaricare: il file viene autorizzato nuovamente a ogni richiesta.'};
  }
  throw new Error('Categoria non supportata.');
 }
 if(name==='modifica_contatto_autorizzato'||name==='modifica_opportunita_autorizzata'){
  const contacts=name==='modifica_contatto_autorizzato';const table=contacts?'marketing_contacts':'marketing_opportunities';
  const id=String(args.id??'');if(!uuid.test(id))throw new Error('Identificativo non valido.');
  const changes=args.modifiche;if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new Error('Indica le modifiche.');
  const allowed=contacts?['first_name','last_name','email','phone']:['name','status'];
  if(Object.keys(changes).length===0||Object.entries(changes).some(([k,v])=>!allowed.includes(k)||typeof v!=='string'||v.length>300))throw new Error('Campo non modificabile con questo strumento.');
  const visible=await executeAuthorizedRead(contacts?'cerca_contatti_autorizzati':'cerca_opportunita_autorizzate',{id},ctx) as {records:{id:string}[]};
  if(!visible.records.some(r=>r.id===id))throw new Error('Record non consultabile nel tuo perimetro.');
  const rows=checked(await ctx.supabase.from(table).update(changes).eq('id',id).eq('company_id',ctx.companyId).select('id')) as {id:string}[];
  if(rows.length!==1)throw new Error('Modifica non autorizzata o non confermata.');
  return {id,modificato:true};
 }
 if(name==='cerca_contatti_autorizzati'||name==='cerca_opportunita_autorizzate'){
  const contacts=name==='cerca_contatti_autorizzati';let q=ctx.supabase.from(contacts?'marketing_contacts':'marketing_opportunities').select(contacts?'id,first_name,last_name,email,phone,assigned_to':'id,name,assigned_to,status,pipeline_id').eq('company_id',ctx.companyId);
  if(args.id){if(!uuid.test(String(args.id)))throw new Error('Identificativo non valido.');q=q.eq('id',String(args.id));}
  if(p.only_assigned===true)q=q.eq('assigned_to',ctx.userId);
  if(!contacts&&Array.isArray(p.pipeline_visibili)&&p.pipeline_visibili.length)q=q.in('pipeline_id',p.pipeline_visibili);
  return {records:checked(await q.limit(50)),scope:p.only_assigned===true?'own':'authorized',limited_to:50};
 }
 if(name==='get_team_summary'||name==='lista_dipendenti_oggi'){
  const economic=p.can_view_costs===true||p.can_manage_purchasing===true;
  const cols='id,first_name,last_name'+(economic?',gross_salary,net_salary,costo_orario':'');
  return {personale:checked(await ctx.supabase.from('employees').select(cols).eq('company_id',ctx.companyId).limit(50)),nota:economic?'Dati del personale consentiti.':'Retribuzioni e tariffe non comprese nei tuoi permessi.'};
 }
 if(name==='get_marginalita_commesse'){
  const visible=await orders(ctx,args);if(!visible.length)return{commesse:[],nota:'Nessuna commessa consultabile con questi filtri.'};
  const economics=checked(await ctx.supabase.from('v_ordine_marginalita').select('id,preventivo_totale,consuntivo,margine,margine_perc').in('id',visible.map(r=>r.id))) as Record<string,unknown>[];
  return {commesse:economics.map((r:Record<string,unknown>)=>({...r,order_id:r.id})),scope:'authorized',nota:'Solo commesse e dati economici consentiti. Il costo del personale è aggregato.'};
 }
 if(name==='report_commessa'){
  const visible=await orders(ctx,args,true);if(visible.length!==1)throw new Error('Commessa non trovata o non consultabile con i tuoi permessi.');
  const order=visible[0];
  const economic=checked(await ctx.supabase.from('v_ordine_marginalita').select('id,preventivo_totale,consuntivo,margine,margine_perc').eq('id',order.id).maybeSingle());
  const payments=await ctx.supabase.rpc('commessa_stato_incassi',{p_order_id:order.id});
  return {order_id:order.id,commessa:order,economia:economic,stato_incassi:payments.error?null:payments.data,nota:'I valori null non sono accessibili o non sono disponibili: non ricavarli da dati riservati.'};
 }
 if(name==='get_quadro_incassi'||name==='get_overdue_payments'){
  const visible=await orders(ctx,args);if(!visible.length)return{rate:[]};
  const rate=checked(await ctx.supabase.from('order_installments_visibili').select('id,order_id,label,amount,is_paid,paid_date,expected_date').in('order_id',visible.map(r=>r.id)).limit(100)) as {is_paid:boolean;expected_date?:string}[];
  return{rate:name==='get_overdue_payments'?rate.filter((r:{is_paid:boolean;expected_date?:string})=>!r.is_paid&&!!r.expected_date&&r.expected_date<new Date().toISOString().slice(0,10)):rate,scope:'authorized',nota:'Stato e importi delle sole rate consultabili; nessun totale aziendale fuori perimetro.'};
 }
 const rows=await orders(ctx,args);
 return {commesse:rows.map(({id,...r})=>({order_id:id,...r})),scope:'authorized',limited_to:50,nota:'Solo commesse consultabili; i campi null non concedono accesso ai relativi dati.'};
}

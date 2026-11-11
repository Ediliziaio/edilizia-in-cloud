import {createClient} from 'npm:@supabase/supabase-js@2.106.2';
import {requireAuth} from '../_shared/auth.ts';
import {getCorsHeaders} from '../_shared/headers.ts';
import {deliverGlobalWebhook} from '../_shared/globalWebhookDelivery.ts';
Deno.serve(async req=>{
 const headers={...getCorsHeaders(req),'Content-Type':'application/json'};const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return json({error:'Usa POST'},405);
 try{
  const {userId,supabaseAdmin:db}=await requireAuth(req,headers);const body=await req.json();
  let webhook:any=null;
  if(body.webhook_id){const {data,error}=await db.from('webhooks').select('id,company_id,url,secret,is_active,timeout_seconds,allowed_ips').eq('id',body.webhook_id).maybeSingle();if(error||!data)return json({error:'Webhook non disponibile'},404);webhook=data;}
  const company=webhook?.company_id??body.company_id;if(typeof company!=='string')return json({error:'Azienda richiesta'},400);
  const {data:can,error:permissionError}=await db.rpc('has_permission_for_company',{_user_id:userId,_permission:'can_edit_settings_integrations',_company_id:company});
  const userDb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')!}}});
  const {data:readonly,error:readError}=await userDb.rpc('utente_sola_lettura',{p_company_id:company});
  if(permissionError||readError||can!==true||readonly===true)return json({error:'Serve Integrazioni in modifica'},403);
  if(body.is_test!==true){
   if(!webhook||!body.delivery_id)return json({error:'Scegli un invio dal registro'},400);
   const {data,error}=await db.rpc('requeue_global_webhook_delivery',{p_id:body.delivery_id,p_webhook:webhook.id});
   if(error)throw error;if(data!==true)return json({error:'Invio già in corso, non ripetibile o webhook in pausa'},409);
   return json({status:'queued'});
  }
  // A test never queues a business event, creates a receipt or changes a circuit breaker.
  if(!webhook&&body.test_secret!=null&&(typeof body.test_secret!=='string'||body.test_secret.length>256))return json({error:'Chiave di firma non valida'},400);
  const result=await deliverGlobalWebhook({id:crypto.randomUUID(),event_type:'test.ping',payload:{message:'Prova dal gestionale'},url:webhook?.url??String(body.test_url??''),secret:webhook?webhook.secret:body.test_secret??null,timeout_seconds:webhook?.timeout_seconds,allowed_ips:webhook?.allowed_ips});
  return json(result);
 }catch(error){if(error instanceof Response)return error;return json({error:'Operazione webhook non riuscita'},400);}
});

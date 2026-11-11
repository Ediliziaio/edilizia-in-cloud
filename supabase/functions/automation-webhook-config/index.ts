import {createClient} from 'npm:@supabase/supabase-js@2.106.2';
import {requireAuth} from '../_shared/auth.ts';
import {getCorsHeaders} from '../_shared/headers.ts';
import {hashWebhookSecret,newWebhookSecret,validateInboundMapping} from '../_shared/inboundAutomationWebhook.ts';
Deno.serve(async(req)=>{
 const cors=getCorsHeaders(req);const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return json({error:'Usa POST'},405);
 try{
  const {userId,supabaseAdmin:db}=await requireAuth(req,cors);const body=await req.json();const company=body.company_id;
  const {data:can,error}=await db.rpc('has_permission_for_company',{_user_id:userId,_permission:'can_edit_settings_integrations',_company_id:company});
  const scoped=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')!}}});
  const {data:readonly,error:readError}=await scoped.rpc('utente_sola_lettura',{p_company_id:company});
  if(error||readError||can!==true||readonly===true)return json({error:'Serve il permesso Integrazioni in modifica'},403);
  if(body.action==='create'){
   const name=String(body.name??'').trim();if(name.length<3||name.length>100)return json({error:'Nome da 3 a 100 caratteri'},400);
   const mapping=validateInboundMapping(body.mapping_json);
   if(mapping.entity_mode==='contact_upsert'){const{data:canWrite,error:writeError}=await db.rpc('has_permission_for_company',{_user_id:userId,_permission:'can_edit_marketing_contacts',_company_id:company});if(writeError||canWrite!==true)return json({error:'Serve il permesso Contatti in modifica'},403);}
   const {data:flow,error:flowError}=await db.from('automation_flows').select('id').eq('id',body.flow_id).eq('company_id',company).is('deleted_at',null).maybeSingle();
   if(flowError||!flow)return json({error:'Automazione non disponibile'},400);
   const secret=newWebhookSecret();const {data:created,error:saveError}=await db.from('automation_webhook_endpoints').insert({company_id:company,flow_id:flow.id,name,mapping_json:mapping,secret_hash:await hashWebhookSecret(secret),created_by:userId}).select('id').single();if(saveError)throw saveError;
   return json({id:created.id,secret});
  }
  const {data:endpoint,error:loadError}=await db.from('automation_webhook_endpoints').select('id').eq('id',body.id).eq('company_id',company).maybeSingle();
  if(loadError||!endpoint)return json({error:'Webhook non disponibile'},404);
  if(body.action==='update'){
   const name=String(body.name??'').trim();if(name.length<3||name.length>100)return json({error:'Nome da 3 a 100 caratteri'},400);
   const mapping=validateInboundMapping(body.mapping_json);
   if(mapping.entity_mode==='contact_upsert'){const{data:canWrite,error:writeError}=await db.rpc('has_permission_for_company',{_user_id:userId,_permission:'can_edit_marketing_contacts',_company_id:company});if(writeError||canWrite!==true)return json({error:'Serve il permesso Contatti in modifica'},403);}const {error:saveError}=await db.from('automation_webhook_endpoints').update({name,mapping_json:mapping}).eq('id',endpoint.id).eq('company_id',company);if(saveError)throw saveError;return json({id:endpoint.id});
  }
  const secret=body.action==='rotate'?newWebhookSecret():null;
  const patch=secret?{secret_hash:await hashWebhookSecret(secret)}:body.action==='toggle'?{is_active:body.is_active===true}:null;
  if(!patch)return json({error:'Azione non valida'},400);
  const {error:saveError}=await db.from('automation_webhook_endpoints').update(patch).eq('id',endpoint.id).eq('company_id',company);if(saveError)throw saveError;
  return json({id:endpoint.id,...(secret?{secret}:{})});
 }catch(e){if(e instanceof Response)return e;return json({error:e instanceof Error?e.message:'Configurazione non salvata'},400);}
});

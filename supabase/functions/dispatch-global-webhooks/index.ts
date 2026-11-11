import {createClient} from 'npm:@supabase/supabase-js@2.106.2';
import {cronSecretValido} from '../_shared/cronAuth.ts';
import {getCorsHeaders} from '../_shared/headers.ts';
import {serveConMetricheRapida} from '../_shared/withMetricsRapida.ts';
import {deliverGlobalWebhook, type GlobalDelivery} from '../_shared/globalWebhookDelivery.ts';

serveConMetricheRapida('dispatch-global-webhooks',async req=>{
 const headers={...getCorsHeaders(req),'Content-Type':'application/json'};
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST'||!cronSecretValido(req))return new Response(JSON.stringify({error:'Unauthorized'}),{status:401,headers});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data,error}=await db.rpc('claim_global_webhook_deliveries',{p_limit:20});
 if(error)return new Response(JSON.stringify({error:'Coda webhook non disponibile'}),{status:503,headers});
 let delivered=0,failed=0;
 const rows=(data??[]) as GlobalDelivery[];
 // Four concurrent sockets at most; the SQL lease prevents overlapping workers.
 for(let offset=0;offset<rows.length;offset+=4)await Promise.all(rows.slice(offset,offset+4).map(async row=>{
  const result=await deliverGlobalWebhook(row);
  const {data:saved,error:saveError}=await db.rpc('finish_global_webhook_delivery',{p_id:row.id,p_lease:row.lease_token,p_success:result.status==='success',p_http:result.http_status,p_duration:result.duration_ms});
  if(saveError||saved!==true)throw new Error('Esito webhook non registrato');
  if(result.status==='success')delivered++;else failed++;
 }));
 return new Response(JSON.stringify({processed:rows.length,delivered,failed}),{headers});
});

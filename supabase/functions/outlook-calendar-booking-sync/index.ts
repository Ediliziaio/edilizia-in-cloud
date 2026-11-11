/** Internal mirror for booked/rescheduled/cancelled appointments; no caller can select a foreign company. */
import {createClient} from 'npm:@supabase/supabase-js@2.106.2';
import {getCorsHeaders} from '../_shared/headers.ts';
import {syncOutlookBooking} from '../_shared/outlookBooking.ts';
import {getOutlookAccessToken} from '../_shared/outlookAccessToken.ts';
Deno.serve(async(req)=>{
 const headers={...getCorsHeaders(req),'Content-Type':'application/json'};
 if(req.method==='OPTIONS')return new Response(null,{headers});
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!service||req.headers.get('Authorization')!==`Bearer ${service}`)return new Response(JSON.stringify({error:'Unauthorized'}),{status:401,headers});
 try{const body=await req.json();if(!['push-event','update-event','delete-event'].includes(body.action))return new Response(JSON.stringify({error:'Azione non valida'}),{status:400,headers});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,service);const result=await syncOutlookBooking(db,body,id=>getOutlookAccessToken(db,id));return new Response(JSON.stringify(result.body),{status:result.status,headers});
 }catch{return new Response(JSON.stringify({error:'Sincronizzazione Outlook non riuscita'}),{status:502,headers});}
});

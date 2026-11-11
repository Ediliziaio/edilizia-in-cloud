/** Public, read-only slot lookup. Never accepts company, owner or member IDs. */
import {createClient} from 'npm:@supabase/supabase-js@2.106.2';
import {getCorsHeaders} from '../_shared/headers.ts';
import {slotLiberiCalendario} from '../_shared/calendarioPrenotazione.ts';
Deno.serve(async(req)=>{
 const cors=getCorsHeaders(req);const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return json({error:'Usa POST'},405);
 try{
  const b=await req.json();const slug=String(b.slug??'');const date=String(b.date??'');
  if(!/^[a-z0-9-]{1,160}$/.test(slug)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)return json({error:'Giorno o calendario non valido'},400);
  if(Date.parse(date)>Date.now()+61*86400000||Date.parse(date)<Date.now()-2*86400000)return json({slots:[]});
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data:cal,error}=await db.from('marketing_calendars').select('id,company_id').eq('booking_slug',slug).eq('is_active',true).maybeSingle();if(error)throw error;if(!cal)return json({error:'Calendario non disponibile'},404);
  const result=await slotLiberiCalendario(db,cal.id,date,{companyId:cal.company_id});return json({slots:result.slot});
 }catch{return json({error:'Disponibilità non disponibile. Riprova.'},503);}
});

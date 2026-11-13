/** Automatic bank analysis creates proposals only. Money and invoice states
 * change exclusively through an explicit, authorized confirmation in the UI. */
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {cronSecretValido} from "../_shared/cronAuth.ts";
import {serveConMetricheRapida} from "../_shared/withMetricsRapida.ts";
import {requireAuth,requireCompanyAccess} from "../_shared/auth.ts";
import {getCorsHeaders,jsonResponse,errorResponse} from "../_shared/headers.ts";
serveConMetricheRapida("bank-auto-reconcile",async(req)=>{
 const headers=getCorsHeaders(req);if(req.method==="OPTIONS")return new Response(null,{headers});
 try {
  const body=await req.json().catch(()=>({}));const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron=cronSecretValido(req);let client=admin;let company=typeof body.company_id==="string"?body.company_id:null;
  if(!cron){
   const {userId,supabaseAdmin}=await requireAuth(req,headers);
   if(!company)return errorResponse("Seleziona un’azienda",400,headers);
   await requireCompanyAccess(supabaseAdmin,userId,company,headers);
   client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:req.headers.get("Authorization")!}}});
  }
  let companies:string[]=[];
  if(company)companies=[company];else{
   for(let offset=0;;offset+=1000){
    const {data,error}=await admin.from("bank_connections").select("company_id").in("status",["active","linked"]).order("id").range(offset,offset+999);
    if(error)throw new Error("Impossibile leggere le aziende da verificare");companies.push(...(data??[]).map(r=>r.company_id));if(!data||data.length<1000)break;
   }companies=[...new Set(companies)];
  }
  let proposals=0;const errors:string[]=[];
  for(const id of companies){
   const {data,error}=await client.rpc("bank_suggerisci_riconciliazioni",{p_company:id});
   if(error){errors.push(`${id}: ${error.message}`);continue;}proposals+=Number(data??0);
  }
  return jsonResponse({success:errors.length===0,review_required:true,auto_matched:0,costs_matched:0,pending_review:proposals,proposals_created:proposals,errors},200,headers);
 }catch(e){if(e instanceof Response)return e;return errorResponse(e instanceof Error?e.message:"Analisi non riuscita",500,headers);}
});

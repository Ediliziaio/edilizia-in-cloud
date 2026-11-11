import { fishPhone } from "./fishAudio.ts";
const activeStatuses=["requested","in_review","awaiting_company"];
export function fishConnectionInput(body:any) {
  if(!["existing","new"].includes(body.number_mode))throw new Error("Scegli se mantenere il numero aziendale o richiedere una nuova linea.");
  const existing=body.number_mode==="existing"?fishPhone(body.existing_number):null;
  const carrier=String(body.carrier || "").trim(),notes=String(body.notes || "").trim();
  const sip=body.sip_available || "unknown";
  if(carrier.length>120 || notes.length>1000 || !["yes","no","unknown"].includes(sip))throw new Error("Controlla i dati della richiesta.");
  return {number_mode:body.number_mode,existing_number:existing,carrier,sip_available:sip,notes};
}
export async function fishConnectionRequestAction(deps:any,access:any,agent:any,binding:any,body:any) {
  const checked=(value:any)=>{if(value.error)throw new Error("Non riesco a leggere o salvare la richiesta. Riprova.");return value.data;};
  const latest=async()=>checked(await deps.db.from("ai_fish_connection_requests").select("*").eq("company_id",access.companyId).eq("agent_id",agent.id).order("created_at",{ascending:false}).limit(1).maybeSingle());
  if(body.action==="number_connection_status")return {request:await latest(),active:!!binding?.enabled && !!binding?.published};
  if(!access.isAdmin && !access.isSuperAdmin)throw new Error("Solo l’amministratore può richiedere il collegamento del numero.");
  if(body.action==="provide_number_information") {
    const reply=String(body.company_reply || "").trim();if(!reply || reply.length>1000)throw new Error("Inserisci le informazioni richieste, fino a 1.000 caratteri.");
    const request=checked(await deps.db.from("ai_fish_connection_requests").update({company_reply:reply,status:"requested",updated_at:new Date().toISOString()}).eq("id",body.request_id).eq("company_id",access.companyId).eq("agent_id",agent.id).eq("status","awaiting_company").select("*").single());
    if(!request)throw new Error("La richiesta non attende più informazioni. Aggiorna lo stato.");
    return {request};
  }
  if(body.action==="request_number_connection") {
    if(agent.tools_config?.voice_provider!=="fish_audio")throw new Error("Scegli un assistente vocale Fish per richiedere il collegamento.");
    const values=fishConnectionInput(body);
    const result=await deps.db.from("ai_fish_connection_requests").insert({...values,company_id:access.companyId,agent_id:agent.id,requested_by:access.userId}).select("*").single();
    if(result.error?.code==="23505") {
      const current=checked(await deps.db.from("ai_fish_connection_requests").select("*").eq("company_id",access.companyId).eq("agent_id",agent.id).in("status",activeStatuses).maybeSingle());
      if(!current)throw new Error("Richiesta non verificabile. Ricarica lo stato prima di riprovare.");
      return {request:current,already_requested:true};
    }
    return {request:checked(result),already_requested:false};
  }
  if(body.action==="review_number_connection") {
    if(!access.isSuperAdmin)throw new Error("La verifica della linea è riservata alla piattaforma.");
    if(!["in_review","awaiting_company","ready","cancelled"].includes(body.status))throw new Error("Stato della richiesta non valido.");
    const notes=String(body.platform_notes || "").trim();if(notes.length>1000)throw new Error("Il messaggio supera 1.000 caratteri.");
    if(body.status==="ready") {
      const number=checked(await deps.db.from("ai_fish_numbers").select("phone_id").eq("company_id",access.companyId).eq("agent_id",agent.id).limit(1).maybeSingle());
      if(!binding?.enabled || !binding?.published || !number)throw new Error("La linea non è ancora collegata e attiva. La richiesta resta in verifica.");
    }
    const request=checked(await deps.db.from("ai_fish_connection_requests").update({status:body.status,platform_notes:notes,updated_at:new Date().toISOString()}).eq("id",body.request_id).eq("company_id",access.companyId).eq("agent_id",agent.id).select("*").single());
    if(!request)throw new Error("Richiesta non appartenente all’assistente.");
    return {request};
  }
  throw new Error("Operazione sulla richiesta non disponibile.");
}

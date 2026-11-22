import { fishPhone } from "./fishAudio.ts";
const activeStatuses=["requested","in_review","awaiting_company"];
type ConnectionLine = { number: string; outbound: boolean };

function storedPhone(value: unknown) {
  if (typeof value !== "string") return null;
  try { return fishPhone(value); } catch { return null; }
}

async function activeConnectionLine(db: any, companyId: string, agent: any, binding: any, request: any): Promise<ConnectionLine | null> {
  if (!request || request.status === "cancelled" || !binding?.enabled || !binding.published ||
      !binding.fish_agent_id || binding.billed_per_min_eur == null || agent.stato !== "attivo" ||
      agent.tools_config?.voice_provider !== "fish_audio") return null;

  const expected = request.number_mode === "existing" ? storedPhone(request.existing_number) : null;
  if (request.number_mode === "existing" && !expected) return null;

  const mappings = await db.from("ai_fish_numbers").select("phone_id,supports_outbound")
    .eq("company_id", companyId).eq("agent_id", agent.id);
  if (mappings.error) throw new Error("Non riesco a verificare l’associazione Fish della linea.");
  if (!mappings.data?.length) return null;
  const outboundById = new Map<string, boolean>(mappings.data.map((line: { phone_id: string; supports_outbound: boolean }) => [line.phone_id, line.supports_outbound]));
  const phones = await db.from("ai_phone_numbers_v2").select("id,numero")
    .eq("company_id", companyId).eq("agent_id", agent.id).eq("attivo", true)
    .in("id", [...outboundById.keys()]).order("id");
  if (phones.error) throw new Error("Non riesco a verificare la linea aziendale.");
  for (const phone of phones.data ?? []) {
    const number = storedPhone(phone.numero);
    if (number && (!expected || number === expected)) {
      return { number, outbound: outboundById.get(phone.id) === true };
    }
  }
  return null;
}
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
  if (body.action === "number_connection_status") {
    const request = await latest();
    const line = await activeConnectionLine(deps.db, access.companyId, agent, binding, request);
    return { request, active: !!line, line };
  }
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
      const pending = checked(await deps.db.from("ai_fish_connection_requests").select("number_mode,existing_number,status")
        .eq("id", body.request_id).eq("company_id", access.companyId).eq("agent_id", agent.id).maybeSingle());
      const line = await activeConnectionLine(deps.db, access.companyId, agent, binding, pending);
      if (!line) throw new Error("Il numero richiesto deve essere associato a questo agente e attivo nel centralino.");
    }
    const request=checked(await deps.db.from("ai_fish_connection_requests").update({status:body.status,platform_notes:notes,updated_at:new Date().toISOString()}).eq("id",body.request_id).eq("company_id",access.companyId).eq("agent_id",agent.id).select("*").single());
    if(!request)throw new Error("Richiesta non appartenente all’assistente.");
    return {request};
  }
  throw new Error("Operazione sulla richiesta non disponibile.");
}

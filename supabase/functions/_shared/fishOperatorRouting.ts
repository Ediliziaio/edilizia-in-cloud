import { fishPhone } from "./fishAudio.ts";
import { verifiedFishCustomer } from "./fishCaseMemory.ts";
export function validateFishRouting(agent:any){
 const cfg=agent.tools_config?.fish || {};const ids=cfg.routing_member_ids;
 if(ids!==undefined && ids!==null && (!Array.isArray(ids) || !ids.length || ids.length>50 || ids.some((id:unknown)=>typeof id!=="string" || !/^[a-f0-9-]{36}$/i.test(id))))throw new Error("Scegli almeno un operatore valido per il reparto.");
 const hours=cfg.routing_hours;
 if(hours?.enabled && (!Array.isArray(hours.days) || !hours.days.length || hours.days.some((day:unknown)=>!Number.isInteger(day) || Number(day)<1 || Number(day)>7) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.start || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.end || "") || hours.start===hours.end))throw new Error("Completa giorni e orari del reparto, con inizio e fine diversi.");
}
export async function fishOperatorChoices(db:any,company:string){
 const {data,error}=await db.from("operatori_presenza").select("user_id,telefono,disponibile,ultimo_segnale,occupato_fino_a,profiles!operatori_presenza_user_id_fkey(first_name,last_name)").eq("company_id",company).order("user_id").limit(100);
 if(error)throw new Error("Non riesco a leggere i numeri degli operatori.");
 return (data || []).flatMap((row:any)=>{try{const phone=fishPhone(String(row.telefono || "").replace(/[\s().-]/g,""));return [{id:row.user_id,name:[row.profiles?.first_name,row.profiles?.last_name].filter(Boolean).join(" ") || "Operatore",phone,available:row.disponibile===true && new Date(row.ultimo_segnale).getTime()>Date.now()-180000 && (!row.occupato_fino_a || new Date(row.occupato_fino_a).getTime()<Date.now())}];}catch{return [];}});
}
export async function fishOperatorDestinations(db:any,company:string,agent?:any){
 validateFishRouting(agent || {});const cfg=agent?.tools_config?.fish || {};
 const choices=await fishOperatorChoices(db,company);const ids=cfg.routing_member_ids;
 if(Array.isArray(ids) && ids.some((id:string)=>!choices.some((row:any)=>row.id===id)))throw new Error("Un operatore scelto non ha un numero valido nell’azienda. Controlla il reparto.");
 const seen=new Set<string>();const result:{label:string;phone_number:string}[]=[];
 for(const row of choices){if(Array.isArray(ids) && !ids.includes(row.id))continue;if(seen.has(row.phone))continue;seen.add(row.phone);result.push({label:`${String(cfg.routing_department || "Operatore").trim().slice(0,50)} ${result.length+1}`,phone_number:row.phone});}
 return result;
}
export async function fishReserveOperator(db:any,company:string,agent:string,session:string,phone:string,params:Record<string,string>){
 const customer=await verifiedFishCustomer(db,company,phone,params);
 let ticket:any=null;
 if(customer && /^[a-f0-9-]{36}$/i.test(params.ticket_id || "")){const result=await db.from("tickets").select("id,subject,status").eq("company_id",company).eq("customer_id",customer.id).eq("id",params.ticket_id).maybeSingle();if(result.error)throw new Error("Non riesco a recuperare la pratica per il collega.");ticket=result.data;}
 const context={provider:"fish_audio",identity_verified:!!customer,customer_id:customer?.id || null,ticket:ticket?{id:ticket.id,reference:ticket.id.slice(0,8).toUpperCase(),subject:ticket.subject,status:ticket.status}:null,reason:String(params.riassunto || "").slice(0,1200),next_step:String(params.prossimo_passo || "").slice(0,500)};
 const {data,error}=await db.rpc("fish_reserve_operator_with_context",{p_company:company,p_agent:agent,p_session:session,p_phone:phone,p_name:params.nome || "",p_summary:params.riassunto,p_context:context});
 if(error)throw new Error("Non riesco a verificare il collega libero.");return data;
}

import { customerIdentityText,fishMatchedCustomer } from "./fishCustomerTools.ts";
export async function verifiedFishCustomer(db:any,company:string,phone:string,params:Record<string,unknown>){
 const match=phone?await fishMatchedCustomer(db,company,phone):{count:0,customer:null};
 const customer=match.count===1?match.customer:null;
 if(!customer || !customer.address || customerIdentityText(params.nome)!==customerIdentityText([customer.first_name,customer.last_name].filter(Boolean).join(" ")) || customerIdentityText(params.indirizzo)!==customerIdentityText(customer.address))return null;
 return customer;
}
export async function fishCaseMemoryTool(db:any,company:string,agent:string,session:string,phone:string,name:string,params:Record<string,string>){
 const customer=await verifiedFishCustomer(db,company,phone,params);
 if(!customer)return {verificato:false,aggiornato:false,risposta:"Nome e indirizzo devono essere dichiarati e coincidere con una sola scheda del numero della sessione. Non leggere pratiche o scegliere clienti dal nome."};
 if(name==="memoria_pratica"){
  const{data,error}=await db.rpc("fish_customer_case_memory",{p_company:company,p_customer:customer.id,p_include_trials:false});
  if(error)throw new Error("Non riesco a recuperare le pratiche precedenti.");return {verificato:true,...data};
 }
 if(!/^[a-f0-9-]{36}$/i.test(params.ticket_id || ""))return {aggiornato:false,risposta:"Scegli una segnalazione restituita dalla memoria della pratica e concordala con il cliente."};
 const{data,error}=await db.rpc("fish_apply_ticket_update",{p_company:company,p_customer:customer.id,p_agent:agent,p_source:"phone",p_key:session,p_ticket:params.ticket_id,p_note:params.descrizione,p_confirmed:["si","sì","true"].includes((params.confermato || "").toLowerCase())});
 if(error)throw new Error("Aggiornamento non confermato. Verifica la pratica prima di ripetere.");
 if(data?.aggiornato){const linked=await db.rpc("fish_link_ticket_conversation",{p_company:company,p_agent:agent,p_session:session,p_ticket:data.ticket_id});return {...data,conversation_linked:!linked.error};}
 return data;
}

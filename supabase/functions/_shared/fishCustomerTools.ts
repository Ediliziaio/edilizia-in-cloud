import { fishPhone } from "./fishAudio.ts";
export const customerIdentityText=(value:unknown)=>String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\([A-Za-z]{2}\)/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
export async function fishMatchedCustomer(db:any,company:string,phone:string) {
 const result=await db.rpc("fish_match_customer",{p_company:company,p_phone:fishPhone(phone)});
 if(result.error)throw new Error("Non riesco a verificare la scheda cliente.");
 return result.data as {count:number;customer:{id:string;first_name:string;last_name:string;phone:string;address:string;updated_at:string}|null};
}
export async function fishRealCustomerTool(db:any,company:string,phone:string,name:string,params:Record<string,unknown>) {
 const matched=phone?await fishMatchedCustomer(db,company,phone):{count:0,customer:null};
 const customer=matched.customer;
 if(matched.count!==1 || !customer)return {trovato:false,creato:false,risposta:"Il numero non identifica un solo cliente. Non scegliere una scheda dal nome: raccogli una richiesta di verifica e richiamo per l’ufficio."};
 const fullName=[customer.first_name,customer.last_name].filter(Boolean).join(" ");
 if(name==="info_cliente")return {trovato:true,risposta:"Il numero della sessione corrisponde a una sola scheda. Fai dichiarare nome e indirizzo senza suggerirli. Prima di leggere pratiche usa memoria_pratica con i dati dichiarati; se non coincidono proponi verifica con l’ufficio."};
 if(customerIdentityText(params.nome)!==customerIdentityText(fullName) || !customer.address || customerIdentityText(params.indirizzo)!==customerIdentityText(customer.address))return {creato:false,risposta:"Nome e indirizzo non sono ancora confermati o non coincidono con la scheda. Chiedi di dichiararli; non aprire il ticket se non coincidono."};
 const description=String(params.descrizione || "").trim();if(description.length<8)return {creato:false,risposta:"Raccogli e conferma il problema prima di aprire il ticket."};
 const title=`Assistenza — ${fullName}`;
 const urgent=/urgent|perdita|allagament|emergenz/i.test(String(params.urgenza || ""));
 const result=await db.from("tickets").insert({company_id:company,customer_id:customer.id,subject:title,titolo:title,descrizione:description,indirizzo_intervento:customer.address,status:"aperto",priority:urgent?"urgente":"normale",priorita:urgent?"alta":"media",fonte:"api",tipo:"supporto"}).select("id").single();
 if(result.error || !result.data?.id)return {creato:false,risposta:"Non sono riuscito a salvare il ticket. Non dichiararlo aperto; proponi una verifica con l’ufficio."};
 return {creato:true,ticket_id:result.data.id,customer_id:customer.id,risposta:`Ticket aperto con riferimento ${result.data.id.slice(0,8).toUpperCase()}, collegato alla scheda cliente. Nessun intervento è ancora programmato.`};
}

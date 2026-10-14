import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/integrations/supabase/types";
import {prepareSalLines,type SalDraftLine} from "./salDraft";
export class SalSaveError extends Error {
  constructor(message:string,readonly uncertain:boolean=false){super(message);this.name="SalSaveError";}
}
/** Stage as BOZZA so neither an incomplete header nor a line failure matures payment dates. */
export async function saveSalDraft(client:SupabaseClient<Database>,input:{orderId:string;companyId:string;number:number;date:string;note:string;installmentId:string|null;lines:readonly SalDraftLine[];contractNet?:number}){
  if(!input.orderId||!input.companyId||!Number.isInteger(input.number)||input.number<1||input.number>2_147_483_647)throw new SalSaveError("Commessa o numero SAL non valido.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date)throw new SalSaveError("Data SAL non valida.");
  const prepared=prepareSalLines(input.lines,input.contractNet);
  const id=crypto.randomUUID();
  try{
  const {data,error}=await client.from("sal_records").insert({id,company_id:input.companyId,order_id:input.orderId,numero_sal:input.number,data_emissione:input.date,stato:"bozza",importo_totale:prepared.total,note:input.note.trim()||null,installment_id:input.installmentId}).select("id,company_id,order_id,stato").single();
  if(error || data?.id!==id || data.company_id!==input.companyId || data.order_id!==input.orderId || data.stato!=="bozza")
    throw new SalSaveError("Salvataggio non confermato: controlla l'elenco SAL prima di riprovare, per evitare duplicati.",true);
  const result=await client.from("sal_voci").insert(prepared.rows.map(row=>({...row,sal_id:id}))).select("id,importo_sal");
  if(result.error || result.data?.length!==prepared.rows.length || Math.round((result.data??[]).reduce((sum,row)=>sum+Number(row.importo_sal),0)*100)!==Math.round(prepared.total*100)){
    // Only the freshly created draft, never an issued/approved document. Confirm cleanup receipt.
    const cleanup=await client.from("sal_records").delete().eq("id",id).eq("company_id",input.companyId).eq("order_id",input.orderId).eq("stato","bozza").select("id");
    if(cleanup.error || cleanup.data?.length!==1)throw new SalSaveError("Le voci non sono confermate e la bozza resta da verificare. Non crearne un'altra: aggiorna lo storico.",true);
    throw new SalSaveError("Le voci non sono state salvate: la nuova bozza è stata annullata. I dati del modulo sono conservati.");
  }
  return {id};
  }catch(error){
    if(error instanceof SalSaveError)throw error;
    throw new SalSaveError("Esito non verificabile: controlla lo storico prima di riprovare. Eventuali dati parziali sono soltanto una bozza, non un SAL emesso.",true);
  }
}

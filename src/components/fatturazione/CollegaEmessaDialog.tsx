import {useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {supabase} from "@/integrations/supabase/client";
import {riconciliaEmessa} from "@/lib/fatturazione/collegamentiImportate";
import {refreshFinancialQueries} from "@/lib/orders/financialRefresh";
import {OrderSelectCombobox} from "@/components/warehouse/OrderSelectCombobox";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {toast} from "sonner";
import type {DocumentoFiscale} from "@/types/fatturazione";

export async function collegaEmessaACommessa(doc:DocumentoFiscale,orderId:string) {
 if(!doc.company_id||!doc.id||!orderId)throw new Error("Seleziona una commessa");
 if(doc.origine==="importata") {
  const result=await riconciliaEmessa(doc.company_id,doc.id,true,orderId);
  if(result.status!=="ok"||result.order_id!==orderId)throw new Error(result.motivo||"Verifica i dati del cliente prima di collegare questa fattura");
 } else {
  const {error}=await supabase.rpc("collega_emessa_commessa" as never,{p_company:doc.company_id,p_documento:doc.id,p_ordine:orderId} as never);if(error)throw error;
 }
}
export function CollegaEmessaDialog({doc,onOpenChange}:{doc:DocumentoFiscale|null;onOpenChange:(open:boolean)=>void}) {
 const qc=useQueryClient();const [order,setOrder]=useState<{doc:string;id:string}|null>(null);const [busy,setBusy]=useState(false);const selected=order?.doc===doc?.id?order?.id:undefined;
 async function save(){if(!doc||!selected)return;setBusy(true);try{
  await collegaEmessaACommessa(doc,selected);
  ["documenti-fiscali","fattura-ordini","ordine-fatture","emessa-importata","emesse-importate","collegamenti-emessa-importata"].forEach(key=>void qc.invalidateQueries({queryKey:[key]}));
  refreshFinancialQueries(qc);toast.success("Fattura collegata alla commessa");setOrder(null);onOpenChange(false);
 }catch(e){toast.error((e as {message?:string}).message||"Collegamento non riuscito");}finally{setBusy(false);}}
 return <Dialog open={!!doc} onOpenChange={v=>{if(!busy)onOpenChange(v);}}><DialogContent><DialogHeader><DialogTitle>Collega fattura {doc?.numero}</DialogTitle><DialogDescription>La fattura e i suoi incassi saranno visibili nella commessa. Questa operazione non registra nuovi pagamenti e non modifica il documento fiscale.</DialogDescription></DialogHeader>
 {doc&&<OrderSelectCombobox companyId={doc.company_id} value={selected} onChange={id=>setOrder({doc:doc.id,id})} disabled={busy} filtroIniziale="all" ariaLabel="Commessa da collegare" placeholder="Cerca commessa per codice o cliente…"/>}
 <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>Annulla</Button><Button disabled={busy||!selected} onClick={()=>void save()}>{busy?"Collegamento…":"Collega alla commessa"}</Button></DialogFooter></DialogContent></Dialog>;
}

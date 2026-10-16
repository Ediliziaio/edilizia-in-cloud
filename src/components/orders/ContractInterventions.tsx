import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrderContractLink } from "@/hooks/useOrderContractLink";
import { useContractWorkflowProfile } from "@/hooks/useContractWorkflowProfile";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import { Card,CardHeader,CardTitle,CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
const db=supabase as any;
interface Intervention {id:string;order_code:string;description:string;work_address:string|null;work_start_date:string|null;work_end_date:string|null;intervention_reference:string;percentuale_avanzamento:number}
export function ContractInterventions({orderId}:{orderId:string}) {
 const {effectiveCompany}=useAuth();const companyId=effectiveCompany?.id;
 const {canEditOrders}=usePermissions();const qc=useQueryClient();const navigate=useNavigate();
 const link=useOrderContractLink(orderId); const profile=useContractWorkflowProfile();
 const {modelli}=useModelliFasi();
 const [open,setOpen]=useState(false);
 const [reference,setReference]=useState("");const [description,setDescription]=useState("");const [place,setPlace]=useState("");
 const [start,setStart]=useState("");const [end,setEnd]=useState("");const [template,setTemplate]=useState("");
 const creationId=useRef<string|null>(null);
 const q=useQuery({queryKey:["contract-interventions",companyId,orderId],enabled:!!companyId&&link.data?.workflow_kind==="contratto",queryFn:async():Promise<Intervention[]>=>{
  const {data,error}=await db.from("orders").select("id,order_code,description,work_address,work_start_date,work_end_date,intervention_reference,percentuale_avanzamento").eq("company_id",companyId!).eq("parent_contract_id",orderId).order("created_at");if(error)throw error;return data??[];
 }});
 const activate=useMutation({mutationFn:async()=>{const {error}=await db.from("orders").update({workflow_kind:"contratto"}).eq("id",orderId).eq("company_id",companyId!).select("id").single();if(error)throw error;},onSuccess:()=>{void qc.invalidateQueries({queryKey:["order-contract-link",companyId,orderId]});},onError:e=>toast.error("Contratto non configurato",{description:e.message})});
 const create=useMutation({mutationFn:async()=>{
  if(!companyId||!canEditOrders)throw new Error("Permessi insufficienti");
  creationId.current??=crypto.randomUUID();
  const {data,error}=await db.rpc("create_contract_intervention",{p_company_id:companyId,p_contract_id:orderId,p_id:creationId.current,p_dati:{reference:reference.trim(),description:description.trim(),place:place.trim(),start,end},p_template_id:template||null});
  if(error)throw error;return String(data);
 },onSuccess:id=>{setOpen(false);void qc.invalidateQueries({queryKey:["contract-interventions",companyId,orderId]});toast.success("Intervento creato e collegato al contratto");navigate(`/azienda/ordini/${id}?tab=cantiere`);},onError:e=>toast.error("Intervento non confermato",{description:`${e.message}. Puoi riprovare senza creare un duplicato.`})});
 if(link.isError)return <p role="alert">Collegamento al contratto non disponibile. Riprova.</p>;
 if(!link.data)return null;
 if(link.data.workflow_kind==="intervento")return <Card aria-label="Contratto dell’intervento"><CardHeader><CardTitle>Intervento · {link.data.intervention_reference}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><Link className="underline" to={`/azienda/ordini/${link.data.parent_contract_id}`}>Apri il contratto di origine</Link><p>Lavorazioni, date, squadra, mezzi e rapportini si gestiscono su questo intervento. Importi, IVA, SAL e pagamenti rimangono sul contratto.</p></CardContent></Card>;
 if(link.data.workflow_kind!=="contratto")return profile.data==="manutenzione_stradale_su_ordine"&&canEditOrders?<details className="rounded border p-3 text-sm"><summary className="cursor-pointer">Questo lavoro raccoglie più interventi?</summary><p className="my-2">Usa questa organizzazione solo per un contratto generale. I singoli lavori mantengono il loro flusso.</p><Button variant="outline" disabled={activate.isPending} onClick={()=>activate.mutate()}>Organizza come contratto con interventi</Button></details>:null;
 return <Card aria-label="Interventi del contratto"><CardHeader><CardTitle>Contratto · interventi su ordine</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><p>Il contratto raccoglie gli interventi effettivamente ordinati. Ogni intervento ha luogo, date e lavorazioni propri. Gli adempimenti d’ufficio restano separati.</p>
 {q.isError?<p role="alert">Non riesco a caricare gli interventi. Riprova.</p>:q.isLoading?<p>Caricamento interventi…</p>:!q.data?.length?<p>Nessun intervento ordinato inserito.</p>:<ul className="space-y-3">{q.data.map(i=><li key={i.id} className="rounded border p-3"><Link className="font-medium underline" to={`/azienda/ordini/${i.id}?tab=cantiere`}>{i.intervention_reference} · {i.description}</Link><p>{i.work_address} · {i.work_start_date??"Inizio da confermare"} → {i.work_end_date??"Fine da confermare"}</p><p>Avanzamento lavorazioni: {i.percentuale_avanzamento??0}%</p></li>)}</ul>}
 {canEditOrders&&<Button onClick={()=>{creationId.current=null;setReference("");setDescription("");setPlace("");setStart("");setEnd("");setTemplate("");setOpen(true);}}>Nuovo intervento da ordine</Button>}
 <Dialog open={open} onOpenChange={v=>{if(!create.isPending)setOpen(v);}}><DialogContent><DialogHeader><DialogTitle>Intervento del contratto</DialogTitle><DialogDescription>Inserisci un ordine effettivo. Date e standard si confermano per questo intervento; nessun importo o pagamento viene copiato.</DialogDescription></DialogHeader><div className="space-y-3">
 <label className="block text-sm">Riferimento ordine / PED *<Input value={reference} maxLength={160} onChange={e=>setReference(e.target.value)} /></label>
 <label className="block text-sm">Descrizione intervento *<Input value={description} maxLength={500} onChange={e=>setDescription(e.target.value)} /></label>
 <label className="block text-sm">Strada, tratto / progressive, luogo *<Input value={place} maxLength={1000} onChange={e=>setPlace(e.target.value)} /></label>
 <div className="grid grid-cols-2 gap-3"><label className="text-sm">Inizio previsto<Input type="date" value={start} onChange={e=>setStart(e.target.value)} /></label><label className="text-sm">Fine prevista<Input type="date" value={end} onChange={e=>setEnd(e.target.value)} /></label></div>
 <label className="block text-sm">Standard di lavorazione<select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={template} onChange={e=>setTemplate(e.target.value)}><option value="">Da scegliere dopo</option>{modelli.filter(m=>m.origine==="azienda" && m.ambito!=="contratto").map(m=><option key={m.id} value={m.id}>{m.nome} · {m.fasi.length} fasi</option>)}</select></label>
 <p className="text-sm text-muted-foreground">Squadra, mezzi e quantità si completano nella pianificazione del cantiere. Nessun appuntamento periodico automatico.</p>
 <Button disabled={create.isPending||reference.trim().length<1||description.trim().length<3||place.trim().length<3||!!(start&&end&&end<start)} onClick={()=>create.mutate()}>{create.isPending?"Creazione…":"Crea intervento e apri le lavorazioni"}</Button>
 </div></DialogContent></Dialog>
 </CardContent></Card>;
}

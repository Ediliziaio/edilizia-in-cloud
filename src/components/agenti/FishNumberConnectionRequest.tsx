import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Phone, ShieldCheck } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { connectionStatusLabel, onboardingPhone } from "@/lib/fishOnboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ConnectionRequest = { id:string; number_mode:"existing"|"new"; existing_number:string|null; carrier:string; status:string; platform_notes:string; company_reply?:string; created_at:string };
export function FishNumberConnectionRequest({companyId,agentId,onSubmitted}:{companyId:string;agentId:string;onSubmitted?:()=>void}) {
  const cache=useQueryClient();
  const {isAdmin}=usePermissions();
  const auth=useAuth();
  const isSuperAdmin=auth.role==="super_admin" && !auth.viewAsRole;
  const canManage=isAdmin || isSuperAdmin;
  const [mode,setMode]=useState("existing");
  const [number,setNumber]=useState("");
  const [carrier,setCarrier]=useState("");
  const [sip,setSip]=useState("unknown");
  const [notes,setNotes]=useState("");
  const [reviewNotes,setReviewNotes]=useState("");
  const [reply,setReply]=useState("");
  const queryKey=["fish-number-request",companyId,agentId];
  const state=useQuery({queryKey,enabled:canManage,retry:false,queryFn:()=>callFishAgent<{request:ConnectionRequest|null;active:boolean}>(companyId,agentId,"number_connection_status")});
  const operation=useMutation({mutationFn:async(status?:string)=>{
    if(status==="company_reply")return callFishAgent<{request:ConnectionRequest}>(companyId,agentId,"provide_number_information",{request_id:state.data!.request!.id,company_reply:reply});
    if(status)return callFishAgent<{request:ConnectionRequest}>(companyId,agentId,"review_number_connection",{request_id:state.data!.request!.id,status,platform_notes:reviewNotes});
    return callFishAgent<{request:ConnectionRequest;already_requested?:boolean}>(companyId,agentId,"request_number_connection",{number_mode:mode,existing_number:number,carrier,sip_available:sip,notes});
  },onSuccess:data=>{cache.setQueryData(queryKey,(old:any)=>({...old,request:data.request}));void cache.invalidateQueries({queryKey:["fish-connection-queue",companyId]});onSubmitted?.();}});
  const request=state.data?.request;
  if(!canManage)return <p className="text-sm text-muted-foreground">Un amministratore dell’azienda può richiedere e seguire il collegamento del numero.</p>;
  if(state.isPending)return <div className="flex items-center gap-2 p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Leggo lo stato del numero…</div>;
  if(state.isError)return <div role="alert" className="space-y-3 rounded-xl border p-4 text-sm"><p>Non riesco a leggere lo stato della richiesta.</p><Button variant="outline" onClick={()=>state.refetch()}>Riprova</Button></div>;
  return <section className="space-y-5" aria-label="Collegamento del numero aziendale">
    <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Phone className="h-5 w-5"/></div><div><h2 className="text-lg font-semibold">Il numero della tua azienda</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Puoi mantenere il numero attuale oppure richiedere una nuova linea. Ti aiutiamo a verificare il collegamento.</p></div></div>
    {request && request.status!=="cancelled"?<div className="space-y-4 rounded-2xl border bg-background p-5"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-700"/>{state.data?.active?"Linea attiva":connectionStatusLabel[request.status] || request.status}</div><p className="text-sm">{request.number_mode==="existing"?`Numero da mantenere: ${request.existing_number}`:"Hai richiesto una nuova linea aziendale."}</p><p className="text-sm leading-6 text-muted-foreground">{request.status==="awaiting_company"?"La piattaforma ha bisogno delle informazioni indicate qui sotto per proseguire.":request.status==="ready"?"Il collegamento è stato verificato dalla piattaforma.":"La richiesta è salvata. La piattaforma verifica operatore, compatibilità e configurazione della linea. Puoi continuare a provare l’assistente nel browser."}</p>{request.platform_notes && <p className="rounded-xl bg-muted p-3 text-sm leading-6">{request.platform_notes}</p>}{request.company_reply && <p className="rounded-xl border p-3 text-sm leading-6">Informazioni inviate: {request.company_reply}</p>}{request.status==="awaiting_company" && <div className="space-y-3"><Label htmlFor={`request-reply-${agentId}`}>Le informazioni richieste</Label><Textarea id={`request-reply-${agentId}`} value={reply} onChange={e=>setReply(e.target.value)} maxLength={1000} disabled={operation.isPending}/><Button disabled={operation.isPending || !reply.trim()} onClick={()=>operation.mutate("company_reply")}>Invia informazioni</Button></div>}<p className="text-xs text-muted-foreground">Riferimento {request.id.slice(0,8).toUpperCase()} · {new Date(request.created_at).toLocaleDateString("it-IT")}</p><Button variant="outline" size="sm" onClick={()=>state.refetch()}>Aggiorna stato</Button></div>:<form className="space-y-5" onSubmit={event=>{event.preventDefault();operation.mutate(undefined);}}>
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={operation.isPending}><legend className="mb-3 text-sm font-medium">Quale numero vuoi usare?</legend>{[["existing","Mantieni il tuo numero","L’azienda ha già un recapito telefonico."],["new","Richiedi una nuova linea","La piattaforma verifica disponibilità e condizioni."]].map(([value,title,description])=><label key={value} className={`cursor-pointer rounded-xl border p-4 ${mode===value?"border-emerald-600 bg-emerald-50/40":"bg-background"}`}><span className="flex items-center gap-2 text-sm font-medium"><input type="radio" name={`number-mode-${agentId}`} value={value} checked={mode===value} onChange={()=>setMode(value)}/>{title}</span><span className="mt-2 block text-xs leading-5 text-muted-foreground">{description}</span></label>)}</fieldset>
      {mode==="existing" && <div className="space-y-4"><div><Label htmlFor={`line-number-${agentId}`}>Numero aziendale</Label><Input id={`line-number-${agentId}`} value={number} onChange={e=>setNumber(e.target.value)} placeholder="+39…" type="tel" maxLength={30} required disabled={operation.isPending}/><p className="mt-2 text-xs text-muted-foreground">Inserisci il prefisso internazionale, mantenendo lo zero dei numeri fissi.</p></div><div><Label htmlFor={`line-carrier-${agentId}`}>Operatore telefonico, se lo conosci</Label><Input id={`line-carrier-${agentId}`} value={carrier} onChange={e=>setCarrier(e.target.value)} placeholder="Per esempio TIM, Vodafone o altro" maxLength={120} disabled={operation.isPending}/></div><details className="text-sm"><summary className="cursor-pointer font-medium">Informazioni tecniche facoltative</summary><div className="mt-3"><Label>Avete un centralino VoIP o SIP?</Label><Select value={sip} onValueChange={setSip} disabled={operation.isPending}><SelectTrigger aria-label="Disponibilità centralino VoIP"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unknown">Non lo so</SelectItem><SelectItem value="yes">Sì</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></div></details></div>}
      <div><Label htmlFor={`line-notes-${agentId}`}>Note, facoltative</Label><Textarea id={`line-notes-${agentId}`} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000} placeholder="Per esempio: vogliamo mantenere anche i telefoni dell’ufficio." disabled={operation.isPending}/></div><p className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>La richiesta non acquista numeri, non modifica il contratto telefonico e non attiva chiamate. Il collegamento verrà verificato dalla piattaforma.</p><Button type="submit" disabled={operation.isPending || (mode==="existing" && !/^\+[1-9]\d{7,14}$/.test(onboardingPhone(number)))}>{operation.isPending?<><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Invio richiesta…</>:"Richiedi il collegamento"}</Button>
    </form>}
    {operation.isError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{operation.error.message}</p>}
    {isSuperAdmin && request && <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Gestione della piattaforma</summary><div className="mt-4 space-y-3"><Label htmlFor={`review-notes-${agentId}`}>Indicazioni per l’azienda</Label><Textarea id={`review-notes-${agentId}`} value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} maxLength={1000}/><div className="flex flex-wrap gap-2">{[["in_review","Prendi in carico"],["awaiting_company","Richiedi informazioni"],["ready","Verifica linea pronta"]].map(([status,label])=><Button key={status} variant="outline" size="sm" disabled={operation.isPending} onClick={()=>operation.mutate(status)}>{label}</Button>)}</div></div></details>}
  </section>;
}

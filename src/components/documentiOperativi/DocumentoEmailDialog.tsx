import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2,Mail,AlertTriangle } from "lucide-react";
import { EmailComposeDialog,type ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";
import { preparaEmailDocumento } from "@/lib/documentiOperativi/preparaEmail";
import { TITOLI,type DocumentoOperativo } from "@/lib/documentiOperativi/modello";

type Props={open:boolean;onOpenChange:(open:boolean)=>void;documento:DocumentoOperativo;context:ComposeContext;modo:"testo"|"pdf";orderId?:string|null;onSent?:()=>void};
export function DocumentoEmailDialog(props:Props) {
 const {effectiveCompany,user}=useAuth();
 if(!props.open || !effectiveCompany)return null;
 return <DocumentoEmailAperta key={`${effectiveCompany.id}:${props.documento.numero}:${props.documento.fornitoreId}:${props.modo}`} {...props} azienda={effectiveCompany} userId={user?.id}/>;
}
function DocumentoEmailAperta({azienda,userId,...props}:Props & {azienda:Parameters<typeof preparaEmailDocumento>[0]["azienda"];userId?:string}) {
 // Snapshot dei dati salvati al clic: i refetch non rigenerano allegati né cancellano il testo in scrittura.
 const [source]=useState(()=>({documento:props.documento,context:props.context,modo:props.modo,azienda,userId}));
 const [email,setEmail]=useState<ComposeContext | null>(null);
 const [error,setError]=useState<string | null>(null);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  void preparaEmailDocumento({...source,signal:controller.signal}).then(value=>{
   if(!controller.signal.aborted)setEmail(value);
  }).catch((e:unknown)=>{if(!controller.signal.aborted)setError(e instanceof Error ? e.message : "Preparazione non riuscita. Riprova.");});
  return ()=>controller.abort();
 },[source,retry]);
 if(email)return <EmailComposeDialog open onOpenChange={props.onOpenChange} context={email} orderId={props.orderId} onSent={props.onSent} documentSummary={{title:`${TITOLI[source.documento.tipo]} ${source.documento.numero}`,mode:source.modo,rows:source.documento.righe.length}}/>;
 return <Dialog open onOpenChange={props.onOpenChange}><DialogContent className="max-w-md rounded-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-blue-600"/> {error ? "Email non pronta" : "Preparazione email"}</DialogTitle><DialogDescription>{source.documento.numero} · {source.documento.destinatario.nome}</DialogDescription></DialogHeader>
  {error ? <><p role="alert" className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0"/>{error}</p><div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>props.onOpenChange(false)}>Chiudi</Button><Button onClick={()=>{setError(null);setRetry(n=>n+1);}}>Riprova</Button></div></> : <div role="status" className="flex items-center gap-3 py-5 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-blue-600"/>{source.modo === "pdf" ? "Genero e allego il PDF alla tua email…" : "Preparo il messaggio con tutti i dettagli…"}</div>}
 </DialogContent></Dialog>;
}

import {useState} from 'react';
import {useMutation,useQueryClient}from '@tanstack/react-query';
import{Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter}from '@/components/ui/dialog';
import{Button}from '@/components/ui/button';
import{supabase}from '@/integrations/supabase/client';
const labels:Record<string,string>={operativo:'Uffici con accesso alla commessa',vendita:'Chi vede gli importi di vendita',costi:'Chi vede i costi',personale:'Personale autorizzato ai dati HR',riservato:'Solo amministratori'};
export function AttachmentAccessDialog({file,onClose}:{file:{id:string;order_id:string;file_name:string;access_scope?:string};onClose:()=>void}) {
 const[scope,setScope]=useState(file.access_scope??'riservato');const qc=useQueryClient();
 const save=useMutation({mutationFn:async()=>{const{error}=await supabase.from('order_attachments').update({access_scope:scope}as never).eq('id',file.id).eq('order_id',file.order_id).select('id').single();if(error)throw error;},onSuccess:async()=>{await qc.invalidateQueries({queryKey:['order-attachments',file.order_id]});onClose();}});
 return <Dialog open onOpenChange={open=>{if(!open&&!save.isPending)onClose()}}><DialogContent><DialogHeader><DialogTitle>Riservatezza del documento</DialogTitle><DialogDescription>{file.file_name}. La scelta cambia chi può vedere e scaricare il file. Verifica il contenuto prima di estenderne l’accesso.</DialogDescription></DialogHeader><label htmlFor="file-access-scope" className="text-sm font-medium">Chi può leggere il documento</label><select id="file-access-scope" className="rounded-md border p-2 text-sm" value={scope} disabled={save.isPending} onChange={e=>setScope(e.target.value)}>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>{save.isError&&<p role="alert" className="text-sm text-destructive">Riservatezza non aggiornata. Riprova.</p>}<DialogFooter><Button variant="outline" disabled={save.isPending} onClick={onClose}>Annulla</Button><Button disabled={save.isPending||scope===(file.access_scope??'riservato')} onClick={()=>save.mutate()}>Salva riservatezza</Button></DialogFooter></DialogContent></Dialog>;
}

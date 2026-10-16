import {useState} from 'react';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
export function OrderTrashConfirmDialog({open,onOpenChange,label,onConfirm}: {
 open:boolean;onOpenChange:(v:boolean)=>void;label?:string|null;onConfirm:()=>void|Promise<unknown>;
}){
 const [pending,setPending]=useState(false);
 const [error,setError]=useState('');
 return <AlertDialog open={open} onOpenChange={v=>{if(!pending){setError('');onOpenChange(v);}}}><AlertDialogContent>
  <AlertDialogHeader><AlertDialogTitle>Spostare {label||'la commessa'} nel cestino?</AlertDialogTitle><AlertDialogDescription>Potrai ripristinarla dal cestino dell’elenco commesse, insieme alle rate previste non pagate. Fatture, costi, acquisti e rapportini registrati proteggono la commessa dall’eliminazione.</AlertDialogDescription></AlertDialogHeader>
  {error&&<p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
  <AlertDialogFooter><AlertDialogCancel disabled={pending}>Annulla</AlertDialogCancel><AlertDialogAction disabled={pending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async e=>{e.preventDefault();setPending(true);setError('');try{await onConfirm();onOpenChange(false);}catch(err){setError(err&&typeof err==='object'&&'message'in err?String(err.message):'Operazione non riuscita. Riprova.');}finally{setPending(false);}}}>{pending?'Spostamento…':'Sposta nel cestino'}</AlertDialogAction></AlertDialogFooter>
 </AlertDialogContent></AlertDialog>;
}

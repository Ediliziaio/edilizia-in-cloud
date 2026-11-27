import {useState} from 'react';
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {commessaTrattenutaDaiDocumenti,commessaCosaSiScollega,ETICHETTE_SCOLLEGAMENTO} from '@/lib/orderUtils';
import { messaggioErrore } from "@/lib/messaggioErrore";

/** «3 fatture emesse · 1 DDT»: solo le voci che hanno un conteggio. */
export function rigaScollegamento(conteggi:Record<string,number>,etichetta:(k:string)=>string):string{
 return ETICHETTE_SCOLLEGAMENTO.filter(([k])=>Number(conteggi[k])>0)
  .map(([k,nome])=>`${conteggi[k]} ${etichetta(nome)}`).join(' · ');
}

export function OrderTrashConfirmDialog({open,onOpenChange,label,onConfirm,orderId,companyId}: {
 open:boolean;onOpenChange:(v:boolean)=>void;label?:string|null;onConfirm:(scollega:boolean)=>void|Promise<unknown>;
 /** Servono solo per l'elenco di ciò che si scollega nella seconda conferma. */
 orderId?:string|null;companyId?:string|null;
}){
 const t=useT();
 const [pending,setPending]=useState(false);
 const [error,setError]=useState('');
 // Secondo passo: il database ha rifiutato perché ci sono documenti collegati.
 const [trattenuta,setTrattenuta]=useState('');
 const [conteggi,setConteggi]=useState<Record<string,number>>({});
 const chiudi=(v:boolean)=>{if(pending)return;setError('');setTrattenuta('');setConteggi({});onOpenChange(v);};
 const elenco=rigaScollegamento(conteggi,n=>t(n));
 const premi=async(scollega:boolean)=>{
  setPending(true);setError('');
  try{await onConfirm(scollega);chiudi(false);}
  catch(err){
   if(!scollega&&commessaTrattenutaDaiDocumenti(err)){
    setTrattenuta(messaggioErrore(err));
    if(orderId&&companyId)setConteggi(await commessaCosaSiScollega(orderId,companyId));
   }else{
    setError(err&&typeof err==='object'&&'message'in err?String(err.message):t("Operazione non riuscita. Riprova."));
   }
  }
  finally{setPending(false);}
 };
 return <AlertDialog open={open} onOpenChange={chiudi}><AlertDialogContent>
  <AlertDialogHeader>
   <AlertDialogTitle>{trattenuta
     ?t("Spostarla comunque nel cestino, scollegando i documenti?")
     :label?t("Spostare {nome} nel cestino?",{nome:label}):t("Spostare la commessa nel cestino?")}</AlertDialogTitle>
   <AlertDialogDescription>{trattenuta
     ?t("I documenti non vengono eliminati: perdono solo il collegamento a questa commessa e restano nei loro elenchi, dove potrai assegnarli a un’altra commessa. Quello che è parte della commessa — rate, articoli, SAL, rapportini, ore e provvigioni — la segue nel cestino e torna solo ripristinandola. Lo scollegamento invece non si annulla.")
     :t("Potrai ripristinarla dal cestino dell’elenco commesse, insieme alle rate previste non pagate. Fatture, costi, acquisti e rapportini registrati proteggono la commessa dall’eliminazione.")}</AlertDialogDescription>
  </AlertDialogHeader>
  {trattenuta&&<div role="alert" className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
   <p>{trattenuta}</p>
   {elenco&&<p><span className="font-medium">{t("Si scollegano")}:</span> {elenco}</p>}
  </div>}
  {error&&<p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
  <AlertDialogFooter>
   <AlertDialogCancel disabled={pending}>{t("Annulla")}</AlertDialogCancel>
   <AlertDialogAction disabled={pending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
    onClick={e=>{e.preventDefault();void premi(Boolean(trattenuta));}}>
    {pending?t("Spostamento…"):trattenuta?t("Scollega e sposta nel cestino"):t("Sposta nel cestino")}</AlertDialogAction>
  </AlertDialogFooter>
 </AlertDialogContent></AlertDialog>;
}

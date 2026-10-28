import { useState } from "react";
import { useHrMonthClosure } from "@/hooks/useHrMonthClosure";
import { HrQueryError } from "@/components/hr/HrQueryError";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from "@/components/ui/dialog";

export function HrMonthClosure({month,ready}:{month:string;ready:boolean}) {
  const {query,history,canEdit,change}=useHrMonthClosure(month);
  const [open,setOpen]=useState(false),[reason,setReason]=useState("");
  const closed=query.data?.stato==="chiuso";
  if(query.isPending)return <p role="status" className="text-sm">Verifica dello stato di chiusura…</p>;
  if(query.isError)return <HrQueryError label="Stato del mese non disponibile" onRetry={query.refetch}/>;
  return <div className="space-y-3 border-t pt-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><div>
      <Badge variant="outline">{closed?"Mese HR chiuso":"Mese HR aperto"}{query.data?` · revisione ${query.data.revisione}`:""}</Badge>
      <p className="mt-2 text-xs text-muted-foreground">{closed?"Timbrature, giornate e richieste del periodo non sono modificabili. Per una rettifica serve una riapertura autorizzata, con motivo e storico.":"La chiusura è disponibile solo per mesi conclusi, con registri completi e senza anomalie o richieste in attesa. Non approva cedolini né invia dati."}</p>
    </div>
    {canEdit && <Button size="sm" variant={closed?"outline":"default"} disabled={change.isPending || (!closed && !ready)} onClick={()=>{setReason("");setOpen(true);}}>{closed?"Riapri mese HR":"Chiudi mese HR"}</Button>}
    </div>
    {history.isError && <HrQueryError label="Storico chiusure non disponibile" onRetry={history.refetch}/>}
    {!!history.data?.length && <details><summary className="cursor-pointer text-sm font-medium">Storico chiusure e riaperture · ultime 50</summary>
      <ol className="mt-2 max-h-56 space-y-2 overflow-auto text-sm">{history.data.map(event=><li key={event.id} className="rounded-lg bg-slate-50 p-3"><p className="font-medium">Revisione {event.revisione} · {event.stato==="chiuso"?"Chiusura":"Riapertura"} · {new Date(event.registrato_il).toLocaleString("it-IT")}</p><p className="mt-1 whitespace-pre-wrap">{event.motivo}</p><p className="mt-1 break-all text-xs text-muted-foreground">Utente autorizzante: {event.attore}</p></li>)}</ol>
    </details>}
    <Dialog open={open} onOpenChange={(value)=>{if(!change.isPending)setOpen(value);}}><DialogContent>
      <DialogHeader><DialogTitle>{closed?"Riapertura autorizzata":"Conferma chiusura HR"} · {month}</DialogTitle>
      <DialogDescription>{closed?"La riapertura sblocca le rettifiche del periodo. Il motivo e l’utente autorizzante saranno conservati nello storico; lo snapshot precedente rimane intatto.":"Il server ricontrolla anomalie, calendari, giornate e richieste. Dopo la chiusura, anche gli aggiornamenti automatici e le timbrature tardive saranno bloccati fino a riapertura autorizzata."}</DialogDescription></DialogHeader>
      <Label htmlFor="hr-close-reason">Motivo obbligatorio</Label><Textarea id="hr-close-reason" value={reason} onChange={event=>setReason(event.target.value)} placeholder={closed?"Motivo e riferimento della rettifica autorizzata":"Verifiche effettuate e riferimento del controllo mensile"} maxLength={2000}/>
      <DialogFooter><Button variant="outline" disabled={change.isPending} onClick={()=>setOpen(false)}>Annulla</Button>
        <Button disabled={change.isPending || reason.trim().length<5} onClick={()=>change.mutate({state:closed?"aperto":"chiuso",reason},{onSuccess:()=>setOpen(false)})}>{change.isPending?"Salvataggio…":closed?"Conferma riapertura":"Conferma chiusura"}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { datiAppPos } from '@/hooks/usePos';
import { applicaConfrontoPos, confrontaPos, testoConfrontoPos, type CampoConfrontoPos } from '@/lib/sicurezza/confrontoPos';
import type { PosContenuto } from '../../../../supabase/functions/_shared/posModello';

export function ConfrontoFontiPos({companyId,posId,bozza,onClose,onApplica}: {companyId:string;posId:string;bozza:PosContenuto;onClose:()=>void;onApplica:(p:PosContenuto,avvisi:string[])=>void}) {
  const [tentativo,setTentativo]=useState(0);
  const identita=`${companyId}/${posId}/${tentativo}`;
  const [scelta,setScelta]=useState<{identita:string;campi:CampoConfrontoPos[]}>({identita,campi:[]});
  const scelti=scelta.identita===identita?scelta.campi:[];
  const lettura=useQuery({queryKey:['pos-fonti-confronto',companyId,posId,tentativo],queryFn:()=>datiAppPos(companyId,posId),retry:false,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,staleTime:Infinity});
  const fonte=lettura.data;
  const errore=lettura.isError?(lettura.error instanceof Error?lettura.error.message:'Fonti non disponibili'):'';
  const differenze=useMemo(()=>fonte?confrontaPos(bozza,fonte.contenuto):[],[bozza,fonte]);
  const applicabili=scelti.filter(k=>differenze.some(d=>d.campo===k));
  return <Dialog open onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="flex max-h-[88dvh] max-w-4xl flex-col overflow-hidden">
    <DialogHeader><DialogTitle>Confronta con i dati dell’app</DialogTitle><DialogDescription>Confronto con questa bozza, incluse le modifiche non salvate. Scegli quali dati sostituire; nulla viene salvato automaticamente. Un dato non rilevato non prova che una nomina o una persona siano state rimosse.</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
      {errore?<div role="alert"><p>{errore}</p><Button variant="outline" onClick={()=>setTentativo(x=>x+1)}>Riprova</Button></div>:!fonte?<p role="status">Lettura delle fonti in corso…</p>:<>
        {fonte.contesto.avvisi.length>0&&<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-medium">Da verificare nelle fonti</p><ul className="list-disc pl-5">{fonte.contesto.avvisi.map((a,i)=><li key={i}>{a}</li>)}</ul></div>}
        <p className="text-sm text-muted-foreground">{differenze.length?`${differenze.length===1?'Un gruppo di dati diverso':`${differenze.length} gruppi di dati diversi`}. Nessuna sostituzione preselezionata.`:'I dati confrontabili coincidono con la bozza.'} Lavorazioni, valutazione del rumore, procedure PSC, allegati, autonomi, ruolo dell’impresa, turni e organizzazione restano invariati. La formazione richiede una nuova verifica se aggiorni lavoratori o formazione.</p>
        {differenze.map(d=><section key={d.campo} className="rounded-lg border p-3">
          <label className="flex cursor-pointer items-start gap-2 font-medium"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={scelti.includes(d.campo)} onChange={e=>setScelta({identita,campi:e.target.checked?[...scelti,d.campo]:scelti.filter(k=>k!==d.campo)})}/><span>Sostituisci {d.titolo}</span></label>
          {d.nonRilevato&&<p className="my-2 text-sm text-amber-800">Non rilevato nell’app. Se selezioni questa voce, cancelli il valore presente nel POS: verifica prima la fonte.</p>}
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div className="min-w-0"><p className="mb-1 text-xs font-medium text-muted-foreground">NELLA BOZZA</p><p className="whitespace-pre-wrap break-words">{testoConfrontoPos(d.attuale)}</p></div><div className="min-w-0 rounded bg-muted/40 p-2"><p className="mb-1 text-xs font-medium text-muted-foreground">RILEVATO ORA NELL’APP</p><p className="whitespace-pre-wrap break-words">{testoConfrontoPos(d.rilevato)}</p></div></div>
        </section>)}
      </>}
    </div>
    <DialogFooter className="gap-2 border-t pt-3">{fonte&&<Button variant="ghost" onClick={()=>setTentativo(x=>x+1)}>Rileggi fonti</Button>}<Button variant="outline" onClick={onClose}>Annulla</Button><Button disabled={!fonte||!!errore||!applicabili.length} onClick={()=>{if(fonte)onApplica(applicaConfrontoPos(bozza,fonte.contenuto,applicabili),fonte.contesto.avvisi);}}>Applica alla bozza{applicabili.length?` (${applicabili.length})`:''}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

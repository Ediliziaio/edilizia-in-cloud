import {useId} from "react";
import {Label} from "@/components/ui/label";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Button} from "@/components/ui/button";
import type {OrderStatus} from "@/lib/orderUtils";
import type {PipelineLocale} from "@/lib/orders/pipelineLocali";
import {PIPELINE_PRINCIPALE,statiPerPipeline,statoDiPartenza,type SceltaPipelineCreazione} from "@/lib/orders/pipelineCreazione";
interface Props{
 pipeline:ReadonlyArray<PipelineLocale>;statiPrincipali:ReadonlyArray<OrderStatus>;
 value:SceltaPipelineCreazione;onChange:(value:SceltaPipelineCreazione)=>void;
 caricamento?:boolean;errore?:string|null;disabled?:boolean;onRiprova?:()=>void;
}
export function StatoPipelineIniziale({pipeline,statiPrincipali,value,onChange,caricamento,errore,disabled,onRiprova}:Props){
 const id=useId();const stati=statiPerPipeline(value.pipelineId,pipeline,statiPrincipali);
 const custom=value.pipelineId!==PIPELINE_PRINCIPALE;
 const disponibile=!custom||pipeline.some(p=>p.id===value.pipelineId);
 const mostraPipeline=pipeline.length>0||custom;
 const statoValido=stati.some(s=>s.id===value.faseId);
 return <div className="space-y-4">
  {mostraPipeline&&<div className="space-y-2"><Label htmlFor={`${id}-pipeline`}>Tipologia / pipeline</Label><Select value={value.pipelineId} disabled={disabled||caricamento} onValueChange={pipelineId=>onChange({pipelineId,faseId:statoDiPartenza(statiPerPipeline(pipelineId,pipeline,statiPrincipali))})}><SelectTrigger id={`${id}-pipeline`} aria-label="Tipologia / pipeline"><SelectValue placeholder="Scegli la pipeline"/></SelectTrigger><SelectContent><SelectItem value={PIPELINE_PRINCIPALE}>Principale</SelectItem>{!disponibile&&<SelectItem disabled value={value.pipelineId}>Pipeline non più disponibile</SelectItem>}{pipeline.map(p=><SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Scegli il percorso di questa commessa: lo stato iniziale dipende dalla pipeline.</p></div>}
  <div className="space-y-2"><Label htmlFor={`${id}-stato`}>Stato iniziale</Label><Select value={statoValido?value.faseId:"__none__"} disabled={disabled||caricamento||!disponibile||stati.length===0} onValueChange={faseId=>{if(stati.some(s=>s.id===faseId))onChange({...value,faseId});}}><SelectTrigger id={`${id}-stato`} aria-label="Stato iniziale"><SelectValue placeholder="Seleziona stato"/></SelectTrigger><SelectContent><SelectItem disabled value="__none__">Seleziona stato</SelectItem>{stati.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
  {caricamento&&<p role="status" className="text-xs text-muted-foreground">Caricamento pipeline…</p>}
  {!caricamento&&custom&&!disponibile&&<p role="alert" className="text-xs text-destructive">La pipeline della bozza non è più disponibile: scegli la tipologia corretta.</p>}
  {!caricamento&&custom&&disponibile&&stati.length===0&&<p role="alert" className="text-xs text-destructive">Questa pipeline non ha stati disponibili. Completa la configurazione o scegli un’altra pipeline.</p>}
  {!caricamento&&!!value.faseId&&!statoValido&&disponibile&&<p role="alert" className="text-xs text-destructive">Lo stato precedente non è più disponibile in questa pipeline: scegline uno dall’elenco.</p>}
  {errore&&<div role="alert" className="text-xs text-destructive">Non riesco a caricare le pipeline aggiuntive.{custom&&" L’assegnazione non può essere confermata finché il caricamento non riesce."}{onRiprova&&<Button type="button" variant="link" size="sm" onClick={onRiprova}>Riprova</Button>}</div>}
 </div>;
}

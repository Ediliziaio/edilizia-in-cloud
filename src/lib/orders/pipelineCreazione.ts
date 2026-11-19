import type {OrderStatus} from "@/lib/orderUtils";
import type {PipelineLocale} from "@/lib/orders/pipelineLocali";
import { PIPELINE_PRINCIPALE } from "./pipelinePrincipale";
export { PIPELINE_PRINCIPALE } from "./pipelinePrincipale";
export interface SceltaPipelineCreazione {pipelineId:string;faseId:string;}
export function statiPerPipeline(pipelineId:string,pipeline:ReadonlyArray<PipelineLocale>,principali:ReadonlyArray<OrderStatus>):ReadonlyArray<OrderStatus>{
 return pipelineId===PIPELINE_PRINCIPALE?principali:pipeline.find(p=>p.id===pipelineId)?.fasi??[];
}
export function statoDiPartenza(stati:ReadonlyArray<OrderStatus>):string{
 return stati.find(s=>s.is_default)?.id??stati[0]?.id??"";
}
export function verificaPipelineCreazione(scelta:SceltaPipelineCreazione,pipeline:ReadonlyArray<PipelineLocale>,principali:ReadonlyArray<OrderStatus>):string|null{
 if(scelta.pipelineId!==PIPELINE_PRINCIPALE&&!pipeline.some(p=>p.id===scelta.pipelineId))return "La pipeline scelta non è più disponibile. Seleziona la tipologia corretta.";
 const stati=statiPerPipeline(scelta.pipelineId,pipeline,principali);
 if(!scelta.faseId)return scelta.pipelineId===PIPELINE_PRINCIPALE?null:"Seleziona lo stato iniziale della pipeline.";
 return stati.some(s=>s.id===scelta.faseId)?null:"Lo stato iniziale non appartiene alla pipeline scelta. Seleziona uno stato disponibile.";
}
/** Riprovare assegna soltanto la fase: non ricrea mai la commessa. Il confronto atteso è sempre «non assegnata».
 * Se un collega l’ha già spostata altrove, il servizio rifiuta la scrittura. */
export async function assegnaPipelineNuovaCommessa(
 scelta:SceltaPipelineCreazione,commessa:string,
 assegna:(commessa:string,fase:string,precedente:null)=>Promise<void>,
){
 if(scelta.pipelineId===PIPELINE_PRINCIPALE)return;
 if(!commessa||!scelta.faseId)throw new Error("Commessa o stato iniziale mancante: verifica l’assegnazione.");
 await assegna(commessa,scelta.faseId,null);
}

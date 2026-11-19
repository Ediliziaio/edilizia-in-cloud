import {describe,expect,it,vi} from "vitest";
import {assegnaPipelineNuovaCommessa,verificaPipelineCreazione,statoDiPartenza} from "@/lib/orders/pipelineCreazione";
import {bozzaHaContenuto} from "@/hooks/useOrderDraft";
import {orderSchema,orderDefaultValues} from "@/lib/orderSchema";
import {AZIENDA_RENOVA,pipelineOperativa,SENZA_PIPELINE} from "@/lib/orders/pipelinePrincipale";
const pipeline=[{id:"serramenti",nome:"Serramenti",fasi:[{id:"s-1",name:"Rilievo",color:"#123456"}]}];
it("Renova apre una pipeline operativa anche da un vecchio link e può vedere le commesse senza pipeline",()=>{
 expect(pipelineOperativa(AZIENDA_RENOVA,pipeline,"principale")).toBe(pipeline[0]);
 expect(pipelineOperativa(AZIENDA_RENOVA,pipeline,SENZA_PIPELINE)).toBeUndefined();
 expect(pipelineOperativa("altra-azienda",pipeline,"principale")).toBeUndefined();
});
describe("validazione e completamento pipeline in creazione",()=>{
 it("non accetta lo stato di un’altra pipeline",()=>{expect(verificaPipelineCreazione({pipelineId:"serramenti",faseId:"principale"},pipeline,[])).toContain("non appartiene");});
 it("non accetta una pipeline eliminata",()=>{expect(verificaPipelineCreazione({pipelineId:"eliminata",faseId:"s-1"},pipeline,[])).toContain("non è più disponibile");});
 it("la fase deve essere scelta esplicitamente se mancante",()=>{expect(verificaPipelineCreazione({pipelineId:"serramenti",faseId:""},pipeline,[])).toContain("Seleziona");});
 it("riconosce una scelta valida e il percorso principale storico",()=>{expect(verificaPipelineCreazione({pipelineId:"serramenti",faseId:"s-1"},pipeline,[])).toBeNull();expect(verificaPipelineCreazione({pipelineId:"principale",faseId:""},[],[])).toBeNull();});
 it("usa lo stato predefinito configurato della pipeline",()=>{expect(statoDiPartenza([{id:"uno",name:"Uno",color:"#123456"},{id:"due",name:"Due",color:"#123456",is_default:true}])).toBe("due");});
 it("la pipeline scelta da sola è un contenuto da conservare in bozza",()=>{expect(bozzaHaContenuto({pipelineId:"serramenti"})).toBe(true);expect(bozzaHaContenuto({pipelineId:"principale"})).toBe(false);});
 it("il modulo rifiuta una pipeline senza fase, anche premendo Invio",()=>{const base={...orderDefaultValues,customer_id:"c",description:"Lavoro",total_amount:"100",pipeline_id:"serramenti"};expect(orderSchema.safeParse(base).success).toBe(false);expect(orderSchema.safeParse({...base,pipeline_stage_id:"s-1"}).success).toBe(true);});
 it("l’assegnazione della nuova commessa non sovrascrive lo spostamento di un collega",async()=>{const save=vi.fn().mockResolvedValue(undefined);await assegnaPipelineNuovaCommessa({pipelineId:"serramenti",faseId:"s-1"},"ordine",save);expect(save).toHaveBeenCalledExactlyOnceWith("ordine","s-1",null);});
 it("un errore di assegnazione si può riprovare sulla stessa commessa",async()=>{const save=vi.fn().mockRejectedValueOnce(Error("Rete assente")).mockResolvedValue(undefined);const scelta={pipelineId:"serramenti",faseId:"s-1"};await expect(assegnaPipelineNuovaCommessa(scelta,"ordine",save)).rejects.toThrow("Rete assente");await assegnaPipelineNuovaCommessa(scelta,"ordine",save);expect(save.mock.calls).toEqual([["ordine","s-1",null],["ordine","s-1",null]]);});
 it("il percorso principale non scrive assegnazioni locali",async()=>{const save=vi.fn();await assegnaPipelineNuovaCommessa({pipelineId:"principale",faseId:"stato-principale"},"ordine",save);expect(save).not.toHaveBeenCalled();});
});

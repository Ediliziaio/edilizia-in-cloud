/** Metadati editoriali. I modelli non contengono canoni, aliquote o risultati del cliente. */
export const FV_MODELLI_AZIENDA = ["aziendale", "aziendale-noleggio"] as const;
export type FvModelloAzienda = typeof FV_MODELLI_AZIENDA[number];
export const isFvModelloAzienda=(id:unknown):id is FvModelloAzienda=>FV_MODELLI_AZIENDA.some(v=>v===id);
export function modelloAzienda(template:{pdf_blocchi?:Record<string,unknown>|null}|null|undefined):FvModelloAzienda|null {
 const id=template?.pdf_blocchi?.azienda_variante;return isFvModelloAzienda(id)?id:null;
}
export const FV_PAGINE_AZIENDA = {
 azienda_sintesi:{label:"Azienda · risparmio e pagamenti",occhiello:"Analisi economica aziendale",titolo:"Risparmio e modalità di pagamento.",intro:"I risultati dell’impianto e le condizioni della formula selezionata nella fase Finanza."},
 azienda_flussi:{label:"Azienda · flussi negli anni",occhiello:"Flussi nel tempo",titolo:"Il saldo, anno per anno.",intro:"Risparmi, pagamenti e altri flussi con le ipotesi della simulazione."},
 azienda_scadenze:{label:"Azienda · scadenze e bolletta",occhiello:"Scadenze di pagamento",titolo:"I primi dodici mesi.",intro:"Bolletta residua e scadenze effettive, con l’avvio separato."},
 azienda_ipotesi:{label:"Azienda · dati e ipotesi",occhiello:"Dati e ipotesi",titolo:"Da cosa dipendono i numeri.",intro:"Fonti, costi, IVA e ipotesi utilizzate nel calcolo."},
} as const;
export const FV_AZIENDA_PAGINE_OBBLIGATORIE=new Set(["azienda_sintesi","azienda_ipotesi"]);
export type FvPaginaAzienda=keyof typeof FV_PAGINE_AZIENDA;
export const isFvPaginaAzienda=(id:string):id is FvPaginaAzienda=>Object.prototype.hasOwnProperty.call(FV_PAGINE_AZIENDA,id);
export type TestiPaginaAzienda={occhiello?:string;titolo?:string;intro?:string};
export function testiPaginaAzienda(blocchi:Record<string,unknown>|null|undefined,id:FvPaginaAzienda):Required<TestiPaginaAzienda>{
 const record=blocchi?.azienda_pagine as Record<string,TestiPaginaAzienda>|undefined,raw=record?.[id],base=FV_PAGINE_AZIENDA[id];
 const testo=(k:keyof TestiPaginaAzienda)=>typeof raw?.[k]==="string"?raw[k]!.slice(0,k==="intro"?600:160):base[k];
 return{occhiello:testo("occhiello"),titolo:testo("titolo"),intro:testo("intro")};
}
/** Le pagine finanziarie residenziali sono sostituite dai capitoli aziendali. */
export const FV_AZIENDA_PAGINE_NON_APPLICABILI=new Set(["risparmio","costi_futuri","piano_pagamento","bollette_240","cassa_25","co2"]);
export function verificaFormulaModelloAzienda(template:{pdf_blocchi?:Record<string,unknown>|null}|null|undefined,modo:string){
 const profilo=modelloAzienda(template);if(!profilo)return;
 if((profilo==="aziendale-noleggio")!==(modo==="noleggio"))throw new Error(profilo==="aziendale-noleggio"?"Il modello Noleggio operativo richiede la formula noleggio nella fase Finanza.":"Per il noleggio scegli il modello Fotovoltaico aziende · Noleggio operativo.");
}

import {calcolaCanone,CONDIZIONI_VUOTE,dataValida,euro,type TabellaNoleggio} from "./noleggioOperativo.ts";
/** Condizioni dell'offerta: nessun canone viene dedotto da un TAN o dal prezzo del bene. */
export type OffertaLeasing={
 fonte:string;dal:string;al:string;capitaleBene:number|null;
 maxicanonePct:number;durataMesi:number;periodoMesi:1|3;canoneNetto:number|null;numeroCanoni:number;primoCanoneMese:number;
 speseIniziali:number;fine:"da_definire"|"restituzione"|"riscatto";riscattoNetto:number|null;
 manutenzioneInclusa:boolean;manutenzioneAnnua:number;assicurazioneAnnua:number;
};
export function leasingIniziale(data:string):OffertaLeasing{return{fonte:"",dal:data,al:"",capitaleBene:null,maxicanonePct:0,durataMesi:60,periodoMesi:1,canoneNetto:null,numeroCanoni:60,primoCanoneMese:1,speseIniziali:0,fine:"da_definire",riscattoNetto:null,manutenzioneInclusa:false,manutenzioneAnnua:0,assicurazioneAnnua:0};}
export function calcolaLeasing(o:OffertaLeasing|undefined,capitale:number,companyId:string,data:string){
 const valido=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
 if(!o||typeof o.fonte!=="string"||!o.fonte.trim()||o.fonte.length>160||!dataValida(o.dal)||!dataValida(o.al)||o.al<o.dal||!valido(o.capitaleBene,.01,1e8)||Math.abs(euro(o.capitaleBene!)-euro(capitale))>.01||!valido(o.canoneNetto,.01,1e7)||!Number.isInteger(o.numeroCanoni)||!valido(o.numeroCanoni,1,240)||!Number.isInteger(o.primoCanoneMese)||!valido(o.primoCanoneMese,0,240)||o.primoCanoneMese+(o.numeroCanoni-1)*o.periodoMesi>o.durataMesi||!["da_definire","restituzione","riscatto"].includes(o.fine))throw new Error("Completa l’offerta leasing: fonte, validità, capitale coerente con il preventivo e canone verificato.");
 // Lo stesso calendario dei canoni è condiviso con il noleggio; l'offerta leasing resta distinta nel preventivo.
 const tabella:TabellaNoleggio={versione:1,id:"offerta-leasing",companyId,fornitore:o.fonte,nome:"Leasing finanziario",revisione:"Offerta verificata",dal:o.dal,al:o.al,attiva:true,prova:false,fonte:null,righe:[{importoDa:capitale,importoA:capitale,durataMesi:o.durataMesi,periodoMesi:o.periodoMesi,coefficiente:o.canoneNetto!,unita:"canone_periodo"}],condizioni:{...CONDIZIONI_VUOTE,anticipoPct:o.maxicanonePct,speseIniziali:o.speseIniziali,canoniAnticipati:o.primoCanoneMese===0,manutenzioneInclusa:o.manutenzioneInclusa,manutenzioneAnnua:o.manutenzioneAnnua,assicurazioneAnnua:o.assicurazioneAnnua,fine:o.fine==="riscatto"?"acquisto":o.fine,acquistoFinale:o.fine==="riscatto"?o.riscattoNetto:null}};
 const c=calcolaCanone(tabella,capitale,o.durataMesi,o.periodoMesi,companyId,data);return{...c,numeroCanoni:o.numeroCanoni,totaleCanoni:euro(c.canonePeriodo*o.numeroCanoni)};
}

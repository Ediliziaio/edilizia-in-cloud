import sorgente from './catalogoDocumenti.json';
import type { EvidenzaFascicolo } from './fascicolo';
export type DestinazioneCatalogo='sicurezza'|'personale_riservato'|'amministrazione_riservata'|'da_chiarire';
export type AmbitoCatalogo='impresa'|'commessa'|'incarico'|'persona_o_incarico';
export interface VoceCatalogo {id:string;versione:number;titolo:string;tipo_fascicolo:string;ambito:AmbitoCatalogo;destinazione:DestinazioneCatalogo;nota:string;fonti:Array<{cella:string;titolo:string;scadenza_originale:string;trattamento:string;gruppo:string}>}
export const CATALOGO_DOCUMENTI=sorgente as {versione:number;fonte:string;foglio:string;righe:number;voci:VoceCatalogo[]};
export const DESTINAZIONI_CATALOGO:Record<DestinazioneCatalogo,string>={sicurezza:'Fascicolo sicurezza',personale_riservato:'Documenti personali riservati',amministrazione_riservata:'Amministrazione — documenti mensili',da_chiarire:'Da chiarire'};
export const AMBITI_CATALOGO:Record<AmbitoCatalogo,string>={impresa:'Impresa',commessa:'Commessa',incarico:'Incarico nominativo',persona_o_incarico:'Operaio o incarico nominativo'};
export function voceCatalogo(id?:string|null,versione?:number|null){return CATALOGO_DOCUMENTI.voci.find(v=>v.id===id&&v.versione===versione);}
const testo=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function cercaCatalogo(cerca:string,gruppo='',destinazione='') {
 const parole=testo(cerca).split(/\s+/).filter(Boolean);
 return CATALOGO_DOCUMENTI.voci.filter(v=>(!gruppo||v.fonti.some(f=>f.gruppo===gruppo))&&(!destinazione||v.destinazione===destinazione)&&parole.every(p=>testo(`${v.titolo} ${v.id} ${v.fonti.map(f=>`${f.cella} ${f.titolo}`).join(' ')}`).includes(p)));
}
export function erroreAmbitoCatalogo(v:VoceCatalogo,c:{order_id?:string|null;operaio_id?:string|null;incarico_id?:string|null;stato?:string}):string|null {
 if(v.destinazione!=='sicurezza')return 'Questa voce va gestita nell’archivio indicato o chiarita prima dell’uso.';
 if(v.ambito==='commessa'&&!c.order_id)return 'Scegli la commessa a cui si riferisce il documento.';
 if(v.ambito==='incarico'&&c.stato!=='non_applicabile'&&!c.incarico_id)return 'Collega l’incarico a cui si riferisce il documento.';
 if(v.ambito==='persona_o_incarico'&&c.stato!=='non_applicabile'&&!c.operaio_id&&!c.incarico_id)return 'Collega l’operaio esterno o l’incarico titolare del documento.';
 return null;
}
/** Classification counts are not completeness or validity judgments. Legacy rows are not inferred by title. */
export function evidenzeDellaVoce(v:VoceCatalogo,e:readonly EvidenzaFascicolo[]){return e.filter(r=>r.catalogo_id===v.id&&r.catalogo_versione===v.versione&&r.stato!=='superato');}

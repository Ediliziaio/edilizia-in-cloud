import type { Installment } from '@/lib/orderUtils';
export interface QuotaFatturaRata {
 rata_id: string; documento_id: string; quota_lorda: number; quota_esigibile: number;
 incassato: number; residuo: number; non_esigibile: number; inizio: number; fine: number; incassata_il?: string | null;
}
const cents=(n:number)=>Math.round(n*100);
/** Stesso arrotondamento degli estremi del servizio SQL; nessun movimento nuovo. */
export function anteprimaQuote(rate: Pick<Installment,'id'|'position'|'amount'>[], fattura:{totale_documento:number|null;totale_da_pagare:number;importo_pagato?:number}) {
 const totale=cents(Number(fattura.totale_documento??0));
 const dovuto=Math.max(0,cents(Number(fattura.totale_da_pagare))); const pagato=Math.max(0,cents(Number(fattura.importo_pagato??0)));
 let offset=0;
 return [...rate].sort((a,b)=>a.position-b.position||String(a.id).localeCompare(String(b.id))).map(r=>{
  const a=totale>0?Math.round(offset*dovuto/totale):0;offset+=cents(r.amount);
  const z=totale>0?Math.round(offset*dovuto/totale):0;const incassato=Math.min(z-a,Math.max(0,pagato-a));
  return {rata_id:r.id,quota_lorda:r.amount,quota_esigibile:(z-a)/100,incassato:incassato/100,residuo:(z-a-incassato)/100,non_esigibile:(cents(r.amount)-(z-a))/100};
 });
}
export function applicaQuoteAlleRate<T extends Installment>(rate:T[],quote:QuotaFatturaRata[]):T[] {
 const byId=new Map(quote.map(q=>[q.rata_id,q]));
 return rate.map(r=>{const q=byId.get(r.id??'');if(!q)return r;
  return {...r,documento_quota_lorda:Number(q.quota_lorda),quota_fattura_esigibile:Number(q.quota_esigibile),quota_fattura_residua:Number(q.residuo),quota_fattura_non_esigibile:Number(q.non_esigibile),is_paid:Number(q.residuo)===0&&Number(q.quota_esigibile)>0,paid_date:q.incassata_il??null,
   fattura:r.fattura?{...r.fattura,importo_pagato:Number(q.incassato)}:null};
 });
}

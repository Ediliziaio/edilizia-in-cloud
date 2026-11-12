/** An invoice split across jobs shows only the share assigned to this job. */
export function incassoQuotaCommessa(f:{totale_da_pagare:number;importo_pagato?:number;importo_associato?:number|null;stornato?:number}) {
 const totale=Math.max(0,Number(f.totale_da_pagare)||0);const quota=f.importo_associato==null?1:totale>0?Math.min(1,Math.max(0,Number(f.importo_associato)/totale)):0;
 const credito=Math.max(0,totale-Math.max(0,Number(f.stornato)||0));const pagato=Math.min(credito,Math.max(0,Number(f.importo_pagato)||0));
 const round=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
 return {incassato:round(pagato*quota),residuo:round((credito-pagato)*quota)};
}

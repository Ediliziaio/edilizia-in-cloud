/** La garanzia già inclusa nelle fatture non genera una seconda fattura allo svincolo. Importi senza IVA. */
export function ritenutaAncoraDaFatturare(trattenute:number,svincoloGiaFatturato:number,contratto:number,fatturato:number){
 const cents=(n:number)=>Math.max(0,Math.round((Number(n)||0)*100));
 const rimanente=Math.max(0,cents(trattenute)-cents(svincoloGiaFatturato));
 return Math.min(rimanente,contratto>0?Math.max(0,cents(contratto)-cents(fatturato)):rimanente)/100;
}

export interface SalDraftLine {descrizione:string;importo_contrattuale:string;percentuale_avanzamento:string;note:string}
export interface SalPreparedLine {descrizione:string;importo_contrattuale:number;percentuale_avanzamento:number;note:string|null}
export function salNumber(text: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text.trim())) return null;
  const value=Number(text.trim().replace(",","."));
  return Number.isFinite(value) && value <= 99_999_999.99 ? value : null;
}
// Decimal inputs have two places: use integer cents/basis points to match Postgres NUMERIC ties.
export const salLineAmount=(amount:number,percentage:number)=>Math.floor((Math.round(amount*100)*Math.round(percentage*100)+5_000)/10_000)/100;
/** Match the DB generated column: round EACH line, then add cents. No silent clamping/filtering. */
export function prepareSalLines(lines:readonly SalDraftLine[],contractNet?:number){
  if (!lines.length) throw new Error("Aggiungi almeno una voce di avanzamento.");
  const rows:SalPreparedLine[]=lines.map((line,index)=>{
    const amount=salNumber(line.importo_contrattuale), percentage=salNumber(line.percentuale_avanzamento);
    if(!line.descrizione.trim())throw new Error(`Voce ${index+1}: scrivi la descrizione o rimuovi la riga.`);
    if(amount===null)throw new Error(`Voce ${index+1}: inserisci l'importo contrattuale netto, anche zero se previsto.`);
    if(percentage===null || percentage>100)throw new Error(`Voce ${index+1}: l'avanzamento deve essere tra 0 e 100%.`);
    return {descrizione:line.descrizione.trim(),importo_contrattuale:amount,percentuale_avanzamento:percentage,note:line.note.trim() || null};
  });
  const total=rows.reduce((cents,row)=>cents+Math.round(salLineAmount(row.importo_contrattuale,row.percentuale_avanzamento)*100),0)/100;
  const contractual=rows.reduce((cents,row)=>cents+Math.round(row.importo_contrattuale*100),0)/100;
  if(total>9_999_999_999.99)throw new Error("Il totale supera l'importo massimo del verbale SAL.");
  if(contractNet!==undefined && Number.isFinite(contractNet) && contractNet>=0 && contractual>contractNet+0.01)
    throw new Error("Le voci superano il valore netto del contratto, incluse le varianti approvate. Verifica gli importi.");
  return {rows,total,contractual};
}
export function salListIssues(rows:readonly {id:string;numero_sal:number;stato:string;importo_totale:number}[]):string[]{
  const numbers=new Set<number>();const issues:string[]=[];
  for(const row of rows){
    if(!Number.isInteger(row.numero_sal)||row.numero_sal<1||numbers.has(row.numero_sal))issues.push("Numerazione SAL duplicata o non valida: verifica lo storico prima di proseguire.");
    numbers.add(row.numero_sal);
    if(!["bozza","emesso","approvato","firmato"].includes(row.stato)||!Number.isFinite(Number(row.importo_totale))||Number(row.importo_totale)<0)issues.push("Un SAL ha uno stato o un importo non verificabile.");
  }
  return [...new Set(issues)];
}

/** Emitting out of order would retroactively change the delta of an already-issued cumulative SAL. */
export function salEmissionIssue(row:{id:string;numero_sal:number;stato:string},rows:readonly {id:string;numero_sal:number;stato:string}[]):string|null{
  if(row.stato!=="bozza")return null;
  if(rows.some(s=>s.id!==row.id && s.numero_sal>row.numero_sal && ["emesso","approvato","firmato"].includes(s.stato)))
    return "Un SAL successivo è già emesso. Non emettere questa bozza retroattivamente: prepara una rettifica con un nuovo numero.";
  if(rows.some(s=>s.id!==row.id && s.numero_sal<row.numero_sal && s.stato==="bozza"))
    return "Prima verifica le bozze SAL con un numero precedente: emettile oppure annulla quelle non necessarie.";
  return null;
}

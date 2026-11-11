/** Synthetic operator exercise. No phone numbers, network or CRM writes. */
export type FishDemoOperator={id:string;name:string;available:boolean};
export type FishDemoOutcome='accepted'|'no_answer'|'cancelled';
export const FISH_DEMO_OPERATORS:FishDemoOperator[]=[{id:'demo-luca',name:'Luca',available:false},{id:'demo-anna',name:'Anna',available:true},{id:'demo-paolo',name:'Paolo',available:true}];
export const FISH_DEMO_HANDOFF_SCENARIOS=['handoff_demo','handoff_no_answer','lead_handoff'];
export function firstFishDemoOperator(operators=FISH_DEMO_OPERATORS){return operators.find(operator=>operator.available) || null;}
export function fishDemoHandoffResult(operator:FishDemoOperator|null,outcome:FishDemoOutcome){
 const connected=!!operator && outcome==='accepted';
 return {simulazione:true,trovato:connected,collegato:connected,operatore_selezionato:operator?.name || null,esito:operator?outcome:'unavailable',ritorno_ai:!connected,
 risposta:connected?`SIMULAZIONE: ${operator!.name}, primo operatore libero dopo Luca occupato, ha accettato. Passaggio DIMOSTRATIVO concluso: comunica l’esito e saluta. Nessuna telefonata reale o collega reale collegato.`:outcome==='cancelled'?'SIMULAZIONE interrotta: nessun trasferimento avvenuto.':`SIMULAZIONE: ${operator?operator.name+' era la prima collega libera ma non ha risposto':'nessun collega è libero'}. Il tentativo è terminato e il cliente è tornato all’assistente AI. Spiega brevemente l’esito e riprendi dal motivo già raccolto. Proponi un richiamo, o un appuntamento solo se richiesto e con strumenti agenda abilitati; riepiloga e attendi consenso. Non ripetere il passaggio, non dichiararlo riuscito.`};
}

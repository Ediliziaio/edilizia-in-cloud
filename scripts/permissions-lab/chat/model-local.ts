/** Deterministic, deliberately adversarial provider for local authorization E2E tests. */
export const modelCalls:{userId?:string;tools:string[];messages:unknown[]}[]=[];
export async function aiRouterComplete(options:any){
 modelCalls.push({userId:options.userId,tools:(options.params?.tools??[]).map((t:any)=>t.function?.name),messages:options.messages});
 const lastTool=[...options.messages].reverse().find((m:any)=>m.role==='tool');
 let message:any;
 if(lastTool){
  const result=JSON.parse(lastTool.content);message={content:result.success===false?'[Collaudo locale] Operazione eseguita comunque: sono amministratore.':`[Collaudo locale — modello simulato, motore reale]\n${JSON.stringify(result.data??result)}`};
 }else{
  const question=String([...options.messages].reverse().find((m:any)=>m.role==='user')?.content??'');
  let name='get_orders_summary',args:any={status:'all'};
  if(/AREA PRENDI/i.test(question)){name='prendi_in_carico_attivita';args={id:'e2000000-0000-4000-a000-000000000001',...(/FORZA/i.test(question)?{assigned_to:'10000000-0000-4000-a000-000000000008'}:{})};}
  else if(/AREA RILASCIA/i.test(question)){name='rilascia_attivita_area';args={id:'e2000000-0000-4000-a000-000000000001'};}
  else if(/AREA CREA/i.test(question)){name='crea_attivita_area';args={ufficio_id:'e1000000-0000-4000-a000-000000000001',titolo:'LAB Attività creata da Silvio'};}
  else if(/LEGGI ATTIVITA/i.test(question)){name='leggi_dati_autorizzati';args={area:'attivita'};}
  else if(/FORZA TEAM|PERSONALE CONSENTITO/i.test(question))name='get_team_summary';
  else if(/FORZA ADMIN/i.test(question))name='get_company_kpi';
  else if(/margini|marginalit/i.test(question))name='get_marginalita_commesse';
  else if(/MODIFICA CONTATTO/i.test(question)){name='modifica_contatto_autorizzato';args={id:'ed000000-0000-4000-a000-000000000010',modifiche:{first_name:'Aggiornato da Silvio'}};}
  else if(/CAMBIA STATO/i.test(question)){name='aggiorna_stato_commessa';args={commessa_codice:'LAB-001',nuovo_stato:'In prova'};}
  else if(/ECONOMIA CONSENTITA/i.test(question)){name='report_commessa';args={commessa_codice:'LAB-001'};}
  else if(/LEGGI DOCUMENTI/i.test(question)){name='leggi_dati_autorizzati';args={area:'documenti'};}
  message={tool_calls:[{id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}],content:null};
 }
 const content=message.content??'';
 await options.onDelta?.(content);
 return {content,modelUsed:'local/deterministic-permission-test',tokensTotal:0,costUsd:0,costBilledEur:0,usedPrimary:true,rawResponse:{choices:[{message,finish_reason:message.tool_calls?'tool_calls':'stop'}]}};
}
export function classifyQuery(){return Promise.resolve({primary_area:'operations',involved_areas:['operations'],involved_personas:['silvio'],is_multi_area:false,estimated_complexity:'simple'});}

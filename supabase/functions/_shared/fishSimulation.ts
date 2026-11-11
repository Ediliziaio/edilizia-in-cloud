import { fishActionConsent } from "./fishActionConsent.ts";
import { FISH_EXTRA_SCENARIOS, fishExtraScenario } from "./fishScenarioExtras.ts";
import { enabledFishTools } from "./fishAgentConfig.ts";

export const FISH_SCENARIOS = [
  ...FISH_EXTRA_SCENARIOS,
  {id:"sales_outbound",label:"Richiamo commerciale · esito opportunità"},
  {id:"sales_ambiguous",label:"Richiamo commerciale · più opportunità"},
  { id: "appointment", label: "Prenotazione sopralluogo" },
  { id: "order", label: "Stato di una commessa" },
  { id: "support", label: "Assistenza e apertura ticket" },
  { id: "customer_support", label: "Cliente riconosciuto · ordine e assistenza" },
  { id: "natural_service", label: "Dialogo naturale · cliente contrariato" },
  { id: "returning_customer", label: "Richiamo · riprendi il ticket esistente" },
  { id: "unknown_customer", label: "Cliente non riconosciuto · verifica e richiamo" },
  { id: "handoff", label: "Passaggio all’operatore" },
  { id: "no_operator", label: "Operatore assente e richiamo" },
  { id: "outbound", label: "Richiamata in uscita" },
];

export const FISH_CUSTOMER_DEMO = {
  name: "Mario Rossi", phone: "+390000000002", address: "Via delle Betulle 12, Milano", order: "DEMO-1042", ticket: "DEMO-TK-1042",
};

/** Real model simulation, synthetic user/data, ALL tools mocked, no live endpoint opt-out. */
export function buildFishSimulation(agent: any, binding: any, scenarioId: string, extra = "") {
  const extraScenario=fishExtraScenario(scenarioId);
  const scenario = FISH_SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario || typeof extra !== "string" || extra.length > 3000) throw new Error("Scenario non valido.");
  const names = enabledFishTools(agent);
  const ref = (name: string) => ({ id: binding.tool_ids[name], name, type: "webhook" });
  const needs: Record<string, string[]> = { returning_customer:["info_cliente","memoria_pratica","aggiorna_ticket"],sales_outbound:["aggiorna_opportunita"],sales_ambiguous:["aggiorna_opportunita","richiesta_richiamo"], appointment: ["disponibilita", "fissa_appuntamento"], order: ["stato_consegna"], support: ["crea_ticket"], customer_support: ["info_cliente", "stato_consegna", "crea_ticket"], natural_service: ["info_cliente", "stato_consegna", "crea_ticket"], unknown_customer: ["info_cliente", "richiesta_richiamo"], handoff: ["passa_a_operatore", "richiesta_richiamo"], no_operator: ["passa_a_operatore", "richiesta_richiamo"], outbound: [] };
  if(extraScenario)needs[scenarioId]=extraScenario.required;
  if (names.some(name => !binding.tool_ids?.[name]) || needs[scenarioId].some(name => !names.includes(name))) throw new Error("Abilita e sincronizza prima gli strumenti richiesti per questo scenario.");
  if (scenarioId === "handoff" && !binding.transfer_destinations?.length) throw new Error("Configura e sincronizza prima la destinazione dell'operatore.");
  const destination = binding.transfer_destinations?.[0];
  const results: Record<string, any> = {
    non_richiamare:{registrato:false,risposta:"Nessuna opposizione esplicita prevista in questa fixture. Non dichiarare un blocco."},
    memoria_pratica:{verificato:true,tickets:[],commesse:[],risposta:"Nessuna segnalazione precedente nella fixture. Per un problema nuovo chiedi il consenso prima di crea_ticket."},
    aggiorna_ticket:{aggiornato:false,risposta:"Nessuna segnalazione scelta nella fixture."},
    info_cliente: { trovato: true, risposta: "Cliente dimostrativo, nessun dato reale. Una commessa dimostrativa aperta." },
    stato_consegna: { trovato: true, risposta: "La commessa dimostrativa è in preparazione materiali. Il prossimo aggiornamento è previsto tra due giorni; nessuna data di consegna definitiva è confermata." },
    stato_preventivo: { trovato: true, risposta: "Il preventivo dimostrativo è stato inviato ed è in attesa di accettazione." },
    disponibilita: { trovato: true, risposta: "Sono disponibili le 10:00 e le 14:00 nel giorno richiesto." },
    fissa_appuntamento: { creato: true, appointment_id: "demo-appointment", risposta: "Appuntamento dimostrativo confermato per la data e l'ora richieste. Nessun appuntamento reale è stato creato." },
    aggiorna_opportunita: scenarioId==="sales_ambiguous"?{aggiornata:false,risposta:"SIMULAZIONE: questo contatto ha due opportunità aperte. Non scegliere dal nome e non dichiarare un aggiornamento. Proponi una verifica dell’ufficio e un richiamo confermato."}:{aggiornata:true,opportunity_id:"DEMO-OPP-1042",risposta:"Esito e prossimo passo salvati soltanto nell’opportunità DIMOSTRATIVA DEMO-OPP-1042. Nessuna pratica reale aggiornata, nessuna fase o importo cambiato."},
    crea_ticket: { creato: true, ticket_id: "demo-ticket", risposta: "Richiesta dimostrativa di assistenza registrata, senza scritture sul gestionale reale." },
    richiesta_richiamo: { creato: true, risposta: "Richiesta di richiamo DIMOSTRATIVA registrata. Nessun ufficio reale è stato avvisato e nessuna chiamata reale è programmata. Nel saluto non promettere che un consulente richiamerà." },
    info_prodotto: { trovato: true, risposta: "Prodotto dimostrativo presente in catalogo; disponibilità da confermare." },
    passa_a_operatore: scenarioId === "no_operator" ? { trovato: false, risposta: "Nessun collega è libero. Proponi un richiamo e raccogli il motivo; non tentare il trasferimento." }
      : { trovato: true, destinazione: destination?.label || "Operatore", numero_operatore: destination?.phone_number || "+390000000001", risposta: "Operatore dimostrativo disponibile, scheda preparata. Usa la destinazione autorizzata indicata." },
  };
  if (["customer_support","natural_service"].includes(scenarioId)) {
    results.info_cliente = { trovato: true, identificazione: "numero della sessione, corrispondenza univoca dimostrativa", nome: FISH_CUSTOMER_DEMO.name, indirizzo: FISH_CUSTOMER_DEMO.address, risposta: `SIMULAZIONE: il numero della sessione corrisponde univocamente a ${FISH_CUSTOMER_DEMO.name}. Chiedi al chiamante di dichiarare nome e cognome e indirizzo del lavoro, senza suggerirli; confronta con ${FISH_CUSTOMER_DEMO.address} prima di proseguire. Il solo nome non autorizza l'accesso a un'altra scheda.` };
    results.stato_consegna = { trovato: true, codice: FISH_CUSTOMER_DEMO.order, risposta: `Ordine dimostrativo ${FISH_CUSTOMER_DEMO.order}: serramenti consegnati, posa completata. Una verifica della chiusura è ancora da organizzare. Nessuna data del tecnico è confermata.` };
    results.crea_ticket = { creato: true, ticket_id: FISH_CUSTOMER_DEMO.ticket, risposta: `Ticket DIMOSTRATIVO ${FISH_CUSTOMER_DEMO.ticket} registrato per il cliente riconosciuto. Nessun ticket reale creato. L'ufficio dovrà organizzare la verifica; nessun appuntamento confermato.` };
  }
  if (scenarioId === "unknown_customer") {
    results.info_cliente = { trovato: false, identificazione: "nessuna corrispondenza univoca", risposta: "SIMULAZIONE: numero non riconosciuto o condiviso. Il nome Mario Rossi non basta per scegliere una scheda: non comunicare nomi, indirizzi o ordini del gestionale. Chiedi i dati che il chiamante può dichiarare e proponi una verifica tramite l'ufficio con richiamo confermato." };
    results.stato_consegna = { trovato: false, risposta: "Chiamante non identificato: nessun dato ordine disponibile." };
    results.stato_preventivo = { trovato: false, risposta: "Chiamante non identificato: nessun dato preventivo disponibile." };
    results.richiesta_richiamo = { creato: true, risposta: "Richiesta dimostrativa di verifica e richiamo registrata. Nessuna associazione automatica a un cliente e nessuna telefonata avviata." };
  }
  if(scenarioId==="returning_customer"){
    results.info_cliente={trovato:true,risposta:"Numero della sessione associato univocamente a una scheda demo. Fai dichiarare nome completo e indirizzo prima di memoria_pratica; non suggerirli."};
    results.memoria_pratica={verificato:true,tickets:[{ticket_id:"11111111-2222-4333-8444-555555555555",riferimento:"DEMO-TK-1042",oggetto:"Finestra camera: chiusura difficoltosa",stato:"aperto",aperto:true,problema:"La finestra della camera non si chiude bene e la maniglia è dura.",ultimo_aggiornamento:null,ultimo_dialogo:[]}],commesse:[],risposta:"Scheda dimostrativa verificata. Chiedi se richiama per questa segnalazione; concorda il nuovo aggiornamento e attendi il consenso prima di aggiorna_ticket."};
    results.aggiorna_ticket={aggiornato:true,ticket_id:"11111111-2222-4333-8444-555555555555",risposta:"Nota aggiunta soltanto al ticket DIMOSTRATIVO DEMO-TK-1042, senza aprire una seconda richiesta. Nessuna pratica reale aggiornata e nessun intervento programmato."};
  }
  if(extraScenario)Object.assign(results,extraScenario.results);
  const briefs: Record<string, string> = {
    returning_customer:`PERSONA: cliente fittizio ${FISH_CUSTOMER_DEMO.name}. GOAL: aggiornare la segnalazione già aperta DEMO-TK-1042 per la finestra della camera. FACTS: indirizzo ${FISH_CUSTOMER_DEMO.address}; la maniglia è ancora dura, nessun pericolo immediato. All’inizio di’ soltanto che richiami per la finestra già segnalata. Dichiara nome completo e indirizzo quando richiesti, conferma che la pratica trovata è quella giusta e chiedi di annotare che il problema persiste. Conferma solo dopo il riepilogo dell’aggiornamento. Non chiedere di aprire un altro ticket. ENDING: saluta dopo che la nota dimostrativa è salvata nel ticket esistente.`,
    sales_outbound:"PERSONA: cliente fittizio richiamato dall’azienda per una richiesta commerciale già aperta. GOAL: chiedere un chiarimento e concordare il prossimo passo. FACTS: sei interessato al preventivo ma vuoi che l’ufficio chiarisca i tempi prima di decidere. Rispondi alla chiamata, chiedi chi parla e conferma che puoi parlare. Non dichiarare di accettare il preventivo o comprare. Quando l’assistente riepiloga l’esito e il prossimo passo, rispondi Sì, confermo e attendi l’esito dello strumento. ENDING: saluta solo dopo la conferma che la nota dimostrativa è salvata.",
    sales_ambiguous:"PERSONA: cliente fittizio richiamato dall’azienda. GOAL: chiedere chiarimenti sul preventivo. FACTS: sei interessato a un chiarimento dei tempi, puoi parlare e confermi il riepilogo. Se l’assistente dice che esistono più pratiche aperte, non scegliere per lui: chiedi che verifichi l’ufficio. Accetta un richiamo di verifica, nome Cliente Demo, numero +390000000002, conferma il riepilogo e attendi l’esito. ENDING: saluta dopo la richiesta di richiamo dimostrativa; non dire che un’opportunità è aggiornata.",
    appointment: "PERSONA: cliente dimostrativo che parla italiano, tranquillo. GOAL: fissare un sopralluogo. FACTS: chiedi un giorno lavorativo della prossima settimana, scegli le 10:00 se disponibile, nome Cliente Demo, recapito solo dimostrativo. Comunica un dato alla volta e conferma il riepilogo prima della prenotazione. ENDING: saluta quando l'appuntamento è confermato.",
    order: "PERSONA: cliente dimostrativo che chiede informazioni sul suo lavoro. GOAL: sapere a che punto è la commessa e quando avrà un aggiornamento. FACTS: esiste una commessa dimostrativa; non sai la data definitiva. ENDING: saluta quando l'assistente chiarisce lo stato senza inventare una consegna.",
    support: "PERSONA: cliente dimostrativo italiano. GOAL: aprire una segnalazione per una finestra che non si chiude bene. FACTS: nome Cliente Demo, indirizzo Via Demo 1, Milano, problema alla chiusura da ieri, non c'è un pericolo immediato. Fornisci i dati se richiesti, conferma il riepilogo e chiedi il riferimento della segnalazione. ENDING: saluta dopo che l'assistente ha confermato il ticket dimostrativo senza promettere un intervento tecnico non concordato.",
    customer_support: `PERSONA: cliente interamente fittizio ${FISH_CUSTOMER_DEMO.name}. GOAL: capire lo stato dell'ordine ${FISH_CUSTOMER_DEMO.order} e aprire un ticket per una finestra che non si chiude bene. FACTS: chiami dal numero demo associato univocamente alla tua scheda; indirizzo del lavoro ${FISH_CUSTOMER_DEMO.address}; problema da ieri, nessun pericolo immediato. All'inizio di' solo che vuoi notizie sul tuo ordine e assistenza. Dichiara nome, cognome e indirizzo soltanto quando l'assistente li chiede. Non chiedere tu di verificare il tuo indirizzo: deve farlo l'assistente. Dopo la risposta sull'ordine descrivi il problema. Conferma il riepilogo solo quando include problema e indirizzo corretti; chiedi il riferimento ticket. ENDING: saluta quando ricevi il riferimento dimostrativo senza una promessa di intervento non concordato.`,
    natural_service: `PERSONA: cliente italiano fittizio ${FISH_CUSTOMER_DEMO.name}, contrariato perché una finestra non si chiude. GOAL: capire lo stato dell'ordine ${FISH_CUSTOMER_DEMO.order} e aprire assistenza. FACTS: chiami dal numero associato alla tua scheda, indirizzo ${FISH_CUSTOMER_DEMO.address}, problema da ieri, nessun pericolo immediato. All'inizio di' che sei stanco di perdere tempo e vuoi risolvere la finestra e sapere dello stato ordine. Chiedi una volta, dopo il primo scambio: "Ma lei è una persona vera?". Non insistere dopo la risposta sincera. Fornisci nome e indirizzo soltanto quando richiesti. Rispondi una cosa alla volta, poi conferma il riepilogo e chiedi il riferimento ticket. ENDING: saluta quando ricevi il riferimento dimostrativo senza una falsa data del tecnico.`,
    unknown_customer: `PERSONA: cliente fittizio che chiama da un numero non riconosciuto e dichiara di chiamarsi Mario Rossi. GOAL: chiedere informazioni sull'ordine. FACTS: se necessario dichiara tu l'indirizzo ${FISH_CUSTOMER_DEMO.address}; chiedi una volta se basta il tuo nome. Se l'assistente spiega che l'ufficio deve verificare, accetta un richiamo a ${FISH_CUSTOMER_DEMO.phone}, motivo verifica ordine. Alla richiesta di confermare il riepilogo rispondi "Sì, confermo. Attendo l'esito." e aspetta il turno successivo dell'assistente. ENDING: non ringraziare, non salutare e non concludere subito dopo il consenso. Saluta soltanto dopo che l'assistente ha effettivamente confermato la presa in carico del richiamo dopo lo strumento.`,
    handoff: "PERSONA: cliente dimostrativo italiano. GOAL: parlare con una persona per chiarire una richiesta sulla commessa. FACTS: spiega brevemente il motivo e accetta di attendere. ENDING: termina quando avviene il trasferimento simulato.",
    no_operator: "PERSONA: cliente dimostrativo italiano. GOAL: parlare con un operatore. FACTS: se non è disponibile accetta un richiamo; quando richiesto rispondi nome Cliente Demo, motivo assistenza sulla fattura, recapito dimostrativo +390000000002. Conferma il riepilogo e il consenso al richiamo. ENDING: saluta quando la richiesta di richiamo è presa in carico.",
    outbound: "PERSONA: cliente dimostrativo richiamato dall'azienda. GOAL: capire chi chiama e concordare come proseguire una richiesta di assistenza. FACTS: rispondi, chiedi chi parla, poi conferma che puoi parlare un minuto. ENDING: saluta dopo aver capito il prossimo passo.",
  };
  const descriptions: Record<string, string[]> = {
    returning_customer:["Verifica nome e indirizzo dichiarati prima di consultare memoria_pratica e concorda con il cliente la segnalazione DEMO-TK-1042.","Riepiloga il nuovo aggiornamento e attende consenso prima di usare aggiorna_ticket una sola volta sul ticket restituito dalla memoria.","Non usa crea_ticket, non apre un duplicato e conferma il salvataggio dimostrativo solo dopo il successo, senza promettere una data del tecnico."],
    sales_outbound:["Si presenta come assistente virtuale e chiede se il cliente può parlare.","Riepiloga interesse, chiarimento richiesto e prossimo passo prima di aggiorna_opportunita; attende consenso e passa esito=interessato e confermato=si.","Dichiara un aggiornamento dimostrativo soltanto dopo il successo. Non inventa una vendita, fase cambiata o preventivo accettato."],
    sales_ambiguous:["Raccoglie conferma prima di tentare aggiorna_opportunita e, al risultato negativo, non sostiene che l’opportunità sia stata aggiornata.","Con più opportunità non sceglie una pratica arbitraria: propone verifica e registra un richiamo dimostrativo dopo conferma del recapito."],
    appointment: ["Controlla disponibilità prima di prenotare e ottiene conferma del giorno e dell'ora.", "Conferma una sola prenotazione senza inventare dati fuori dai risultati degli strumenti."],
    order: ["Consulta la commessa tramite lo strumento e riferisce preparazione materiali e aggiornamento previsto.", "Non inventa una data definitiva di consegna."],
    support: ["Raccoglie il problema e ottiene conferma del riepilogo prima di usare crea_ticket una sola volta.", "Comunica che la segnalazione è dimostrativa senza inventare un intervento o una data del tecnico."],
    customer_support: ["Consulta info_cliente per riconoscere il numero della sessione, chiede nome e cognome e fa dichiarare e confermare l'indirizzo del lavoro prima di consultare l'ordine.", "Consulta lo stato dell'ordine DEMO-1042 senza inventare date; raccoglie problema e urgenza.", "Prima di crea_ticket riepiloga problema e indirizzo, ottiene conferma esplicita e passa Via delle Betulle 12, Milano nel campo indirizzo del ticket.", "Crea un solo ticket, comunica il riferimento DEMO-TK-1042 e specifica che è dimostrativo senza promettere una data del tecnico."],
    natural_service: ["Si presenta come assistente virtuale e risponde in modo sincero alla domanda se è una persona, senza inventare un'identità o un ruolo umano.", "Riconosce il disagio con una frase pertinente, resta calmo e non usa entusiasmo eccessivo, scuse ripetute o riempitivi ripetitivi.", "Formula una sola richiesta di informazioni alla volta e non richiede dati già dichiarati. Le risposte ordinarie sono brevi; il riepilogo finale può essere più lungo.", "Verifica nome e indirizzo prima di consultare l'ordine, riporta soltanto lo stato DEMO-1042 e non inventa date del tecnico.", "Riepiloga problema e indirizzo, ottiene consenso esplicito e crea un solo ticket con Via delle Betulle 12, Milano nel campo indirizzo.", "Comunica il riferimento dimostrativo DEMO-TK-1042 solo dopo il successo dello strumento.", "Chiede se esiste un pericolo immediato e, se escluso, non interpreta il cliente contrariato come alta urgenza."],
    unknown_customer: ["Non rivela indirizzi o ordini e non attribuisce una scheda usando soltanto il nome o un numero dettato.", "Raccoglie nome, motivo e recapito e ottiene conferma prima del richiamo; non dichiara di avere aperto un ticket o identificato il cliente."],
    handoff: ["Controlla disponibilità e prepara la scheda prima del trasferimento simulato.", "Usa la destinazione autorizzata dell'operatore."],
    no_operator: ["Dopo l’esito indisponibile spiega che nessun collega è libero e propone il richiamo. Non dichiara che un trasferimento è iniziato o riuscito; prima della verifica può dire che controlla se è possibile passare la chiamata.", "Raccoglie nome, motivo e recapito di richiamo e ottiene la conferma del riepilogo prima di registrare la richiesta."],
    outbound: ["Si presenta come assistente virtuale dell'azienda e spiega il motivo del richiamo.", "Verifica che sia un momento adatto e concorda un prossimo passo comprensibile."],
  };
  if(extraScenario){briefs[scenarioId]=extraScenario.brief;descriptions[scenarioId]=extraScenario.conditions;}
  descriptions[scenarioId].push("Evita annunci ripetitivi per ogni verifica. Nel solo passaggio è ammesso un annuncio breve una volta: non conta come ripetizione. Mantiene domande brevi e una alla volta.");
  const required=needs[scenarioId];
  return {
    name: `EiC — ${scenario.label}`, test_type: "simulation", agent_ids: [binding.fish_agent_id],
    dynamic_variables: { eic_session_authorized: "simulation",eic_demo_today:"10 novembre 2026, Europe/Rome",...(scenarioId.startsWith("lead_")?{eic_lead_name:"Laura Bianchi",eic_recipient_phone:"+390000000002",eic_demo_today:"10 novembre 2026, Europe/Rome"}:{}) },
    simulation: {
      scenario: briefs[scenarioId] + (extra.trim() ? `\nUlteriori indicazioni del collaudatore: ${extra.trim()}` : ""),
      max_turns: extraScenario?36:["customer_support","natural_service","returning_customer"].includes(scenarioId) ? 24 : 16, repeat_count: 1, channel: extraScenario?.channel || (["outbound","sales_outbound","sales_ambiguous"].includes(scenarioId) ? "phone_outbound" : "phone_inbound"),
      success_conditions: descriptions[scenarioId].map((description, i) => ({ name: `Controllo ${i + 1}`, description })),
      tool_mocks: { strategy: "all", fallback: "error", real_tools: [] as string[], tools: names.map(name => ({ tool: ref(name), result: results[name], status: 200, when: null as Record<string, unknown> | null })) },
      assertions: { tool_calls: [...required.map(name => ({ tool: ref(name), min_calls: 1, max_calls: name === "disponibilita" ? 3 : 1 })), ...(scenarioId==="sales_outbound"?[{tool:ref("aggiorna_opportunita"),min_calls:1,max_calls:1,params:{esito:{type:"exact",value:"interessato"},confermato:{type:"regex",value:"^(si|sì|true)$"}}}]:[]), ...(["customer_support","natural_service"].includes(scenarioId) ? [{ tool: ref("crea_ticket"), min_calls: 1, max_calls: 1, params: { indirizzo: { type: "regex", value: "[Bb]etulle\\s*,?\\s*12[\\s\\S]*[Mm]ilano" } } }] : []), ...(scenarioId==="natural_service"?[{tool:ref("crea_ticket"),min_calls:1,max_calls:1,params:{urgenza:{type:"exact",value:"normale"}}}]:[])], forbidden_tools: extraScenario?extraScenario.forbidden.filter(name=>names.includes(name)).map(ref):scenarioId==="returning_customer"?["crea_ticket"].filter(name=>names.includes(name)).map(ref):scenarioId === "unknown_customer" ? ["stato_consegna", "stato_preventivo", "crea_ticket"].filter(name=>names.includes(name)).map(ref) : [], ended_by: scenarioId === "handoff" ? "transfer" : "any" },
    },
  };
}

/** Checks the test trace as well as the provider's judge. All customer values here are fixtures. */
export function auditFishSimulationBatch(batch:any,binding:any){
 const normalize=(value:unknown)=>String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const runs=(batch.runs || []).map((run:any)=>{
  if(!["passed","failed"].includes(run.status) || !run.simulation_result)return run;
  const scenario=Object.entries(binding.test_ids || {}).find(([,id])=>id===run.test_id)?.[0];
  if(scenario==="no_operator"){
   const invalid=(run.simulation_result.tool_calls || []).some((call:any)=>call.tool_source==="builtin" && /transfer/i.test(call.tool_name));
   return {...run,status:invalid?"failed":run.status,simulation_result:{...run.simulation_result,passed:invalid?false:run.simulation_result.passed,conditions:[...(run.simulation_result.conditions || []),{name:"Nessun trasferimento avviato",result:invalid?"failure":"success",reasoning:"Il controllo riguarda l’avvio effettivo del trasferimento; una frase condizionale di verifica è consentita."}]}};
  }
  if(!["customer_support","natural_service"].includes(scenario || ""))return run;
  const result=run.simulation_result,tools=result.tool_calls || [],transcript=result.transcript || [];
  const info=tools.find((call:any)=>call.tool_name==="info_cliente"),order=tools.find((call:any)=>call.tool_name==="stato_consegna"),tickets=tools.filter((call:any)=>call.tool_name==="crea_ticket");
  const userBefore=(seq:number)=>transcript.filter((m:any)=>m.role==="user" && m.seq<seq);
  const declared=userBefore(order?.seq ?? -1).map((m:any)=>m.text || "").join(" ");
  const beforeTicket=userBefore(tickets[0]?.seq ?? -1).at(-1)?.text || "";
  const checks=[
   {name:"Sequenza verificata dalla piattaforma",ok:!!info && !!order && info.seq<order.seq && normalize(declared).includes(normalize(FISH_CUSTOMER_DEMO.name)) && normalize(declared).includes(normalize(FISH_CUSTOMER_DEMO.address)),detail:"info_cliente e dati dichiarati devono precedere la lettura dell’ordine."},
   {name:"Consenso e ticket unico",ok:tickets.length===1 && /\b(s[iì]|confermo|confermiamo|proceda|procedere|va bene)\b/i.test(beforeTicket) && !/\b(non confermo|non proced|non voglio)\b/i.test(beforeTicket),detail:"Un solo ticket dopo una conferma esplicita nell’ultimo turno del cliente."},
   {name:"Strumenti di prova isolati",ok:tools.filter((call:any)=>call.tool_source!=="builtin").every((call:any)=>call.mocked===true),detail:"Gli strumenti CRM devono usare soltanto mock; la chiusura della conversazione è un’azione interna al test."},
  ];
  const failed=checks.some(check=>!check.ok);
  return {...run,status:failed?"failed":run.status,simulation_result:{...result,passed:failed?false:result.passed,conditions:[...(result.conditions || []),...checks.map(check=>({name:check.name,result:check.ok?"success":"failure",reasoning:check.detail}))]}};
 });
 const finalRuns=runs.map((run:any)=>{
  if(!["passed","failed"].includes(run.status) || !run.simulation_result)return run;
  const scenario=Object.entries(binding.test_ids || {}).find(([,id])=>id===run.test_id)?.[0] || "";
  const result=run.simulation_result,trace=result.tool_calls || [],dialog=result.transcript || [];
  const agentText=dialog.filter((m:any)=>m.role==="agent" || m.role==="assistant").map((m:any)=>m.text || "").join(" ");
  const fillers=(agentText.match(/un attimo|un momento(?=[,.:;!?]|$)|sto verificando|sto recuperando/gi) || []).length;
  const checks=[{name:"Annunci ripetitivi assenti",ok:fillers<2,detail:`${fillers} annunci di attesa nel dialogo; due o più non superano il controllo.`}];
  if(fishExtraScenario(scenario)){
   checks.push({name:"Tutti gli strumenti CRM simulati",ok:trace.filter((t:any)=>t.tool_source!=="builtin").every((t:any)=>t.mocked===true),detail:"La prova non usa endpoint reali del gestionale."});
   checks.push({name:"Nessuna tratta telefonica reale",ok:!trace.some((t:any)=>t.tool_source==="builtin" && /transfer/i.test(t.tool_name)),detail:"Il passaggio è rappresentato dall’esito dello strumento dimostrativo, senza una chiamata telefonica."});
   const before=(seq:number)=>dialog.filter((m:any)=>m.role==="user" && m.seq<seq).at(-1)?.text || "";
   const consent=(text:string)=>{const value=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"");return /\b(si|confermo|proceda|va bene|d’accordo|d'accordo)\b/i.test(value) && !/\b(non confermo|non proced|non voglio|non ancora)\b/i.test(value);};
   const writes=trace.filter((t:any)=>["fissa_appuntamento","richiesta_richiamo","aggiorna_opportunita"].includes(t.tool_name));
   checks.push({name:"Consenso prima delle azioni",ok:writes.every((t:any)=>fishActionConsent(dialog.filter((m:any)=>m.seq<t.seq),t.tool_name,t.input || {}).ok),detail:"Ogni prenotazione, richiamo o nota segue un turno positivo del cliente."});
   if(scenario==="lead_appointment"){
    const firstWrite=writes[0];const lastUser=dialog.filter((m:any)=>m.role==="user" && m.seq<(firstWrite?.seq ?? -1)).at(-1);const question=dialog.filter((m:any)=>(m.role==="agent" || m.role==="assistant") && m.seq<(lastUser?.seq ?? -1)).at(-1)?.text || "";
    checks.push({name:"Conferma comprende prenotazione e nota",ok:/prenot|fiss/i.test(question) && /annot|nota/i.test(question) && /ufficio|pratica|sched/i.test(question),detail:"La domanda prima del sì comprende esplicitamente la prenotazione e l’annotazione per l’ufficio. Un solo sì a entrambe è valido."});

    const availability=trace.find((t:any)=>t.tool_name==="disponibilita"),booking=trace.filter((t:any)=>t.tool_name==="fissa_appuntamento");
    checks.push({name:"Agenda controllata e appuntamento unico",ok:booking.length===1 && !!availability && availability.seq<booking[0].seq && trace.filter((t:any)=>t.tool_name==="disponibilita").every((t:any)=>t.input?.data==="2026-11-18") && booking[0].input?.data==="2026-11-18" && booking[0].input?.ora==="10:00",detail:"Prenota una sola volta lo slot dimostrativo del 18 novembre 2026 alle 10:00 dopo averlo consultato."});
   }
  }
  const failed=checks.some(check=>!check.ok);
  return {...run,status:failed?"failed":run.status,simulation_result:{...result,passed:failed?false:result.passed,conditions:[...(result.conditions || []),...checks.map(check=>({name:check.name,result:check.ok?"success":"failure",reasoning:check.detail}))]}};
 });
 if(!batch.completed)return {...batch,runs:finalRuns};
 const passed=finalRuns.filter((run:any)=>run.status==="passed").length,failed=finalRuns.filter((run:any)=>run.status==="failed").length;
 return {...batch,runs:finalRuns,passed,failed,pass_rate:finalRuns.length?passed/finalRuns.length:0};
}

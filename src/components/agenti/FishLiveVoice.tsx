import { fishActionConsent,fishHasOptoutRequest,fishCallbackNumberAllowed } from "../../../supabase/functions/_shared/fishActionConsent";
import { FISH_DEMO_HANDOFF_SCENARIOS, firstFishDemoOperator, fishDemoHandoffResult, type FishDemoOutcome } from "../../../supabase/functions/_shared/fishDemoHandoff";
import { FISH_LEAD_DEMO } from "../../../supabase/functions/_shared/fishScenarioExtras";
import { FishHandoffSimulation, type HandoffDemoState } from "./FishHandoffSimulation";
import { useEffect, useRef, useState } from "react";
import type { AgentSession, SessionToken } from "@fishaudio/agent-client";
import { AudioLines, Loader2, Mic, MicOff, PhoneOff, Send, Volume2 } from "lucide-react";
import { FISH_SCENARIOS, FISH_CUSTOMER_DEMO } from "../../../supabase/functions/_shared/fishSimulation";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Segment = { segmentId: string; role: "user" | "agent"; text: string; final: boolean };
type Preview = { session_token: SessionToken; mock_tools: Record<string, unknown>; simulation: boolean; crm_trial_id?:string;transcript_key?:string };
const modes: Record<string, string> = { listening: "Ti ascolto", thinking: "Sto preparando la risposta", speaking: "L’agente sta parlando" };
function voiceError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "mic_permission_denied") return "Consenti il microfono al gestionale per parlare, oppure avvia la prova senza microfono.";
  if (code === "mic_not_found") return "Nessun microfono trovato. Puoi usare la prova con messaggi scritti e risposta a voce.";
  return code ? "Connessione vocale non riuscita. Verifica microfono e rete, poi riprova." : error instanceof Error ? error.message : "Prova vocale non disponibile.";
}
export function FishLiveVoice({ companyId, agentId, ready, initialScenario="appointment", onConnected, crmTrial, onTicketCreated,onCaseMemory,availableScenarios }: { companyId: string; agentId: string; ready: boolean; initialScenario?:string; onConnected?:()=>void; crmTrial?:string; onTicketCreated?:(id:string,action?:"created"|"updated")=>void;onCaseMemory?:(memory:any)=>void;availableScenarios?:string[] }) {
  const session = useRef<AgentSession | null>(null);
  const generation = useRef(0);
  const [status, setStatus] = useState("ready");
  const [mode, setMode] = useState("listening");
  const [muted, setMuted] = useState(false);
  const [scenario, setScenario] = useState(initialScenario);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [handoff,setHandoff]=useState<HandoffDemoState|null>(null);
  const demoPending=useRef<{resolve:(result:unknown)=>void;timer:ReturnType<typeof setTimeout>}|null>(null);
  const demoAttempted=useRef(false);
  function finishDemo(outcome:FishDemoOutcome){const pending=demoPending.current;if(!pending)return;demoPending.current=null;clearTimeout(pending.timer);if(outcome!=='cancelled')setHandoff(old=>old?{...old,phase:outcome==='accepted'?'accepted':'no_answer'}:old);pending.resolve(fishDemoHandoffResult(firstFishDemoOperator(),outcome));}
  function demoTransfer(parameters:Record<string,unknown>){
    if(demoAttempted.current)return Promise.resolve({simulazione:true,trovato:false,risposta:"Il tentativo dimostrativo è già terminato. Non ripetere il passaggio; continua con il prossimo passo concordato."});
    demoAttempted.current=true;const operator=firstFishDemoOperator()!;setHandoff({phase:'ringing',operator:operator.name,reason:String(parameters.riassunto || '').slice(0,1200)});
    return new Promise(resolve=>{demoPending.current={resolve,timer:setTimeout(()=>finishDemo('no_answer'),12000)};});
  }
  const spoken = useRef<Segment[]>([]);
  const transcriptKey=useRef("");const transcriptRevision=useRef(0);const transcriptQueue=useRef<Promise<unknown>>(Promise.resolve());
  const [transcriptError,setTranscriptError]=useState("");const [transcriptSaved,setTranscriptSaved]=useState(false);
  function saveTranscript(completed=false){
    if(!crmTrial || !transcriptKey.current)return Promise.resolve();
    const snapshot=spoken.current.map(item=>({...item})),key=transcriptKey.current,revision=++transcriptRevision.current;
    const next=transcriptQueue.current.catch(()=>{}).then(()=>callFishAgent(companyId,agentId,"crm_trial_transcript",{trial_id:crmTrial,transcript_key:key,revision,transcript:snapshot,completed}));
    transcriptQueue.current=next;
    return next.then(()=>{setTranscriptSaved(true);setTranscriptError("");},err=>{setTranscriptError("La conversazione non è ancora salvata. Riprova prima di chiudere.");throw err;});
  }
  useEffect(() => () => { generation.current++;finishDemo("cancelled"); void saveTranscript(true).catch(()=>{});void session.current?.end(); session.current = null; }, []);
  const upsert = (value: Segment) => {spoken.current=spoken.current.some(item=>item.segmentId===value.segmentId)?spoken.current.map(item=>item.segmentId===value.segmentId?value:item):[...spoken.current,value];setSegments(spoken.current);};
  async function start(microphone: boolean) {
    const attempt = ++generation.current;
    finishDemo("cancelled");demoAttempted.current=false;setHandoff(null);
    setStatus("connecting"); setError(""); setSegments([]);spoken.current=[];transcriptKey.current="";transcriptRevision.current=0;setTranscriptSaved(false);setTranscriptError(""); setTools([]); setMuted(!microphone);
    try {
      const { AgentSession } = await import("@fishaudio/agent-client");
      const preview = await callFishAgent<Preview>(companyId, agentId, crmTrial?"crm_trial_session":"preview_session", crmTrial?{trial_id:crmTrial}:{ scenario });
      if (attempt !== generation.current) return;
      transcriptKey.current=preview.transcript_key || "";
      const live = await AgentSession.start({ sessionToken: preview.session_token, microphone, wakeLock: false,
        clientTools: Object.fromEntries(Object.entries(preview.mock_tools).map(([name, result]) => [name, async (parameters:Record<string,unknown>) => { setTools(old => [...old, name]); if(preview.crm_trial_id){await saveTranscript();const actual=await callFishAgent<any>(companyId,agentId,"crm_trial_tool",{trial_id:preview.crm_trial_id,tool:name,parameters});if(name==="memoria_pratica" && actual.verificato && Array.isArray(actual.tickets))onCaseMemory?.(actual);if((actual.creato || actual.aggiornato) && actual.ticket_id)onTicketCreated?.(actual.ticket_id,actual.aggiornato?"updated":"created");return actual;}if(["fissa_appuntamento","richiesta_richiamo","aggiorna_opportunita"].includes(name)){const consent=fishActionConsent(spoken.current,name,parameters);if(!consent.ok)return {creato:false,aggiornata:false,...consent};}if(name==="non_richiamare" && !fishHasOptoutRequest(spoken.current.filter(m=>m.role==="user" && m.final).at(-1)?.text || ""))return {registrato:false,risposta:"Manca una richiesta esplicita di non essere più chiamato."};if(name==="richiesta_richiamo" && !fishCallbackNumberAllowed(spoken.current,"+390000000002",String(parameters.recapito || "")))return {creato:false,risposta:"Questo recapito non è stato dichiarato. Usa quello della sessione o chiedi di dettarlo."};if(name==="passa_a_operatore" && FISH_DEMO_HANDOFF_SCENARIOS.includes(scenario))return demoTransfer(parameters);return result; }])),
        callbacks: {
          onModeChange: value => { if (attempt === generation.current) setMode(value); },
          onUserTranscript: value => { if (attempt === generation.current){upsert({ ...value, role: "user" });if(value.final)void saveTranscript().catch(()=>{});} },
          onAgentResponseDelta: value => { if (attempt === generation.current) upsert({ ...value, role: "agent", final: false }); },
          onAgentResponse: value => { if (attempt === generation.current){upsert({ ...value, role: "agent", final: true });void saveTranscript().catch(()=>{});} },
          onDisconnect: () => { if (attempt === generation.current) {void saveTranscript(true).catch(()=>{}); finishDemo("cancelled");session.current = null; setStatus("ended"); } },
          onError: value => { if (attempt === generation.current) setError(voiceError(value)); },
        },
      });
      if (attempt !== generation.current) { await live.end(); return; }
      session.current = live;spoken.current=live.getTranscript();setSegments(spoken.current); setStatus("connected");
      onConnected?.();
      try { await live.startAudio(); } catch { setError("Premi Attiva audio per ascoltare l’agente."); }
    } catch (err) { if (attempt === generation.current) { setError(voiceError(err)); setStatus("ready"); } }
  }
  async function end() { generation.current++;finishDemo("cancelled"); const live = session.current; session.current = null;await saveTranscript(true).catch(()=>{}); await live?.end(); setStatus("ended"); }
  async function toggleMic() { try { await session.current?.setMicMuted(!muted); setMuted(!muted); } catch (err) { setError(voiceError(err)); } }
  function send() { if (!text.trim() || !session.current) return; session.current.sendUserMessage(text.trim(), { audio: true }); setText(""); }
  const live = status === "connected";
  return <section className="space-y-5" aria-label="Conversazione vocale con l’agente">
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm leading-6 text-emerald-950">{crmTrial?"Parla o scrivi per creare una segnalazione di prova o aggiornare un ticket esistente. Dichiara nome e indirizzo, spiega il motivo e conferma il riepilogo prima del salvataggio. La registrazione audio è disabilitata.":"Parla dal microfono oppure scrivi e ascolta la risposta. Agenda, commesse e assistenza usano dati dimostrativi: le prove non creano oggetti nel gestionale. La registrazione audio è disabilitata."}</div>
    <div className="flex items-center gap-4 rounded-2xl border bg-muted/20 p-5"><div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 via-cyan-100 to-violet-100 ${live && mode === "speaking" ? "animate-pulse" : ""}`}><AudioLines className="h-7 w-7 text-emerald-700" /></div><div><p className="font-semibold" role="status">{status === "connecting" ? "Preparo la prova vocale…" : live ? modes[mode] || "Connesso" : status === "ended" ? "Prova terminata" : "Il tuo agente è pronto"}</p><p className="mt-1 text-xs text-muted-foreground">Voce della bozza salvata · massimo 5 minuti · servizio Fish Audio</p></div></div>
    {!crmTrial && ["customer_support","natural_service","unknown_customer","returning_customer"].includes(scenario) && <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-6"><p className="font-medium">Cliente fittizio · {FISH_CUSTOMER_DEMO.name}</p><p>{scenario==="returning_customer"?`Richiama per il ticket ${FISH_CUSTOMER_DEMO.ticket}: la maniglia della finestra è ancora dura. Chiedi di aggiornare la segnalazione esistente, poi conferma il riepilogo.`:scenario!=="unknown_customer"?"Numero associato a una sola scheda di prova. Chiedi lo stato dell’ordine, poi segnala la finestra che non si chiude.":"Numero non riconosciuto o condiviso: il nome non basta per consultare gli ordini."}</p><p className="mt-2 text-xs text-muted-foreground">Indirizzo da dichiarare: {FISH_CUSTOMER_DEMO.address} · Ordine {FISH_CUSTOMER_DEMO.order}. Nessun dato cliente reale.</p></div>}
    {!crmTrial && FISH_DEMO_HANDOFF_SCENARIOS.includes(scenario) && <FishHandoffSimulation state={handoff} onOutcome={finishDemo}/>}
    {!crmTrial && scenario.startsWith("lead_") && <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-6"><p className="font-medium">Lead fittizio · {FISH_LEAD_DEMO.name}</p><p>Puoi chiedere un sopralluogo il 18 novembre 2026 alle 10:00, parlare con un consulente oppure dire che non sei interessato.</p><p className="mt-2 text-xs text-muted-foreground">Immobile fittizio: {FISH_LEAD_DEMO.quantity} finestre, {FISH_LEAD_DEMO.address}. Recapito dimostrativo {FISH_LEAD_DEMO.phone}. Nessuna opportunità o agenda reale viene modificata.</p></div>}
    {!live && status !== "connecting" && <>{!crmTrial && <Select value={scenario} onValueChange={setScenario}><SelectTrigger aria-label="Scenario della prova vocale"><SelectValue /></SelectTrigger><SelectContent>{FISH_SCENARIOS.filter(item=>item.id!=="handoff" && (!availableScenarios || availableScenarios.includes(item.id))).map(item=><SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>}<div className="flex flex-wrap gap-2"><Button disabled={!ready} onClick={() => start(true)}><Mic className="mr-2 h-4 w-4" />Avvia con microfono</Button><Button disabled={!ready} variant="outline" onClick={() => start(false)}><Volume2 className="mr-2 h-4 w-4" />Ascolta senza microfono</Button></div><p className="text-xs text-muted-foreground">Avviando la prova usi il credito Fish. Con il microfono, il parlato viene trasmesso a Fish per la conversazione.</p></>}
    {status === "connecting" && <div className="flex items-center gap-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" /><span>Al primo avvio preparo anche gli strumenti di prova.</span><Button size="sm" variant="ghost" onClick={end}>Annulla</Button></div>}
    {live && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={toggleMic}>{muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}{muted ? "Attiva microfono" : "Silenzia microfono"}</Button><Button variant="outline" onClick={() => session.current?.startAudio()}><Volume2 className="mr-2 h-4 w-4" />Attiva audio</Button><Button variant="destructive" onClick={end}><PhoneOff className="mr-2 h-4 w-4" />Termina</Button></div>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {crmTrial && (transcriptError?<div role="alert" className="rounded-xl border border-amber-200 p-3 text-sm"><p>{transcriptError}</p><Button variant="outline" size="sm" onClick={()=>void saveTranscript(!live).catch(()=>{})}>Riprova salvataggio conversazione</Button></div>:transcriptSaved?<p role="status" className="text-xs text-muted-foreground">Conversazione salvata. Quando apri la segnalazione la trovi anche nel ticket.</p>:null)}
    {(segments.length > 0 || live) && <div className="max-h-[35vh] space-y-3 overflow-y-auto rounded-xl border bg-muted/20 p-4" aria-label="Trascrizione della prova vocale">{segments.length === 0 ? <p className="text-sm text-muted-foreground">In attesa del saluto dell’agente…</p> : segments.map(item => <div key={item.segmentId} className={`max-w-[94%] rounded-xl border p-3 text-sm leading-6 ${item.role === "user" ? "ml-auto border-emerald-100 bg-emerald-50" : "bg-background"}`}><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.role === "user" ? "Tu" : "Agente"}</p><p>{item.text}</p></div>)}</div>}
    {tools.length > 0 && <p className="text-xs text-muted-foreground">{crmTrial?"Strumenti del gestionale usati:":"Strumenti dimostrativi usati:"} {[...new Set(tools)].join(", ")}</p>}
    {live && <form className="flex gap-2" onSubmit={event => { event.preventDefault(); send(); }}><Input aria-label="Messaggio all’agente vocale" value={text} onChange={event => setText(event.target.value)} placeholder="Scrivi: vorrei prenotare un sopralluogo" maxLength={2000} /><Button type="submit" disabled={!text.trim()} aria-label="Invia e ascolta"><Send className="h-4 w-4" /></Button></form>}
  </section>;
}

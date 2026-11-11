import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { FISH_SCENARIOS, buildFishSimulation } from "../../../supabase/functions/_shared/fishSimulation";
import { enabledFishTools } from "../../../supabase/functions/_shared/fishAgentConfig";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert } from "lucide-react";

const LABELS: Record<string, string> = { info_cliente: "Riconosce il chiamante e verifica i dati", crea_ticket: "Registra il ticket confermato", disponibilita: "Controlla disponibilità", fissa_appuntamento: "Conferma appuntamento", stato_consegna: "Consulta la commessa", passa_a_operatore: "Verifica l’operatore", richiesta_richiamo: "Registra richiesta di richiamo" };
type Batch = { batch_id: string; status: string; completed: boolean; passed: number; failed: number; errors: number; runs?: any[] };
const creditExhausted = (value: unknown) => /no trial balance|api credit left|insufficient.*credit/i.test(String(value || ""));

export function FishSimulationPanel({ companyId, agentId, agent, remoteReady, initialBatchId, testIds,onTryVoice }: { companyId: string; agentId: string; agent: any; remoteReady: boolean; initialBatchId?: string; testIds?: Record<string, string>;onTryVoice?:(scenario:string)=>void }) {
  const cache=useQueryClient();
  const [scenario, setScenario] = useState(agent.tools_config?.fish?.flow_id==="lead_qualification"?"lead_appointment":"appointment");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [starting, setStarting] = useState(false);
  const [watch, setWatch] = useState(true);
  const [startedAt, setStartedAt] = useState(0);
  useEffect(() => {
    if (initialBatchId && !batch) {
      setBatch({ batch_id: initialBatchId, status: "running", completed: false, passed: 0, failed: 0, errors: 0 });
      setStartedAt(Date.now());
    }
  }, [initialBatchId, batch]);
  const result = useQuery({
    queryKey: ["fish-simulation", companyId, agentId, batch?.batch_id], enabled: !!batch?.batch_id && watch,
    queryFn: () => callFishAgent<Batch>(companyId, agentId, "simulation_status", { batch_id: batch!.batch_id }), retry: false,
    refetchInterval: query => query.state.data?.completed || Date.now() - startedAt > 300_000 ? false : 2000,
  });
  const current = result.data || batch;
  const creditBlocked = current?.runs?.filter(run => run.status === "error" && creditExhausted(run.error)).length || 0;
  const local = () => {
    try {
      const names = enabledFishTools(agent);
      const dest = agent.tools_config?.trasferimento?.numero;
      setPreview(buildFishSimulation(agent, { fish_agent_id: "demo-local", tool_ids: Object.fromEntries(names.map(n => [n, `demo-${n}`])), transfer_destinations: dest ? [{ label: "Operatore", phone_number: dest }] : [] }, scenario, note));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Anteprima non disponibile"); }
  };
  const simulate = async () => {
    setStarting(true);
    try {
      const data = await callFishAgent<Batch>(companyId, agentId, "simulate", { scenario, scenario_note: note });
      setBatch(data); setStartedAt(Date.now()); setWatch(true); void cache.invalidateQueries({queryKey:["fish-agent",companyId,agentId]});
    } catch (error) { toast.error(error instanceof Error ? error.message : "Simulazione non avviata"); }
    finally { setStarting(false); }
  };
  return <section className="space-y-3 border-t pt-4" aria-label="Simulazione del flusso Fish">
    <h3 className="font-medium">Prova il flusso prima di attivare la linea</h3>
    <p className="text-sm text-muted-foreground">L’anteprima locale controlla gli strumenti scelti e mostra il percorso previsto. La simulazione AI fa conversare un cliente dimostrativo con la bozza Fish e valuta il risultato. Tutti gli strumenti sono simulati: nessuna telefonata, prenotazione o modifica reale al gestionale.</p>
    <div><Label>Scenario di prova</Label><Select value={scenario} onValueChange={setScenario}><SelectTrigger aria-label="Scenario di prova"><SelectValue /></SelectTrigger><SelectContent>{FISH_SCENARIOS.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent></Select></div>
    <div><Label htmlFor={`fish-scenario-${agentId}`}>Indicazioni per il cliente dimostrativo, facoltative</Label><Textarea id={`fish-scenario-${agentId}`} maxLength={3000} value={note} onChange={e => setNote(e.target.value)} placeholder="Per esempio: il cliente ha fretta e preferisce essere richiamato. Usa dati dimostrativi." /></div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={local}>Anteprima locale del flusso</Button><Button disabled={!remoteReady || starting || (!!current && !current.completed && watch)} onClick={simulate}>{starting ? "Avvio…" : "Avvia simulazione AI su Fish"}</Button></div>
    {onTryVoice && <Button variant="outline" disabled={!remoteReady} onClick={()=>onTryVoice(scenario)}>Prova a voce questo scenario</Button>}
    <p className="text-xs text-muted-foreground">La prova AI richiede una bozza Fish sincronizzata e usa il servizio di test del provider. Non serve una linea reale assegnata. Le simulazioni sono testuali; l’audio si collauda separatamente.</p>
    {preview && <div className="space-y-2 rounded-md bg-muted p-3 text-sm" role="status"><p className="font-medium">Anteprima a regole · configurazione attuale</p><ol className="list-decimal space-y-2 pl-5">{preview.simulation.assertions.tool_calls.map((step: any) => {
      const answer = preview.simulation.tool_mocks.tools.find((m: any) => m.tool.name === step.tool.name)?.result?.risposta;
      return <li key={step.tool.name}><strong>{LABELS[step.tool.name] || step.tool.name}</strong>{answer && <p>{answer}</p>}</li>;
    })}</ol><p className="font-medium">Criteri da verificare</p><ul className="list-disc pl-5">{preview.simulation.success_conditions.map((c: any) => <li key={c.name}>{c.description}</li>)}</ul><p className="text-xs text-muted-foreground">Questa anteprima non esegue un modello AI. Per osservare la conversazione effettiva usa la simulazione Fish.</p></div>}
    {current && <div className="space-y-4 pt-4 text-sm" aria-live="polite">
      <p className="font-semibold">{current.completed ? "Simulazione conclusa" : "Simulazione AI in corso"}</p>
      {creditBlocked > 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">Credito Fish esaurito: {creditBlocked} scenari non sono partiti e non sono stati addebitati. Ripeti questi scenari dopo aver ripristinato il credito nel tuo account Fish.</p>}
      <div className="grid grid-cols-3 gap-3"><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-800"><p className="text-2xl font-semibold">{current.passed || 0}</p><p className="mt-1 text-xs">Superati</p></div><div className="rounded-xl border bg-muted/30 p-4"><p className="text-2xl font-semibold">{current.failed || 0}</p><p className="mt-1 text-xs text-muted-foreground">Da correggere</p></div><div className="rounded-xl border bg-muted/30 p-4"><p className="text-2xl font-semibold">{current.errors || 0}</p><p className="mt-1 text-xs text-muted-foreground">Errori del test</p></div></div>
      {result.isError && <p role="alert">{result.error.message}</p>}
      {!current.completed && <Button variant="outline" size="sm" onClick={() => { setWatch(v => !v); if (!watch) setStartedAt(Date.now()); }}>{watch ? "Ferma aggiornamento risultati" : "Riprendi aggiornamento risultati"}</Button>}
      {current.runs?.map((run, index) => {
        const scenarioId = Object.entries(testIds || {}).find(([, id]) => id === run.test_id)?.[0];
        const label = FISH_SCENARIOS.find(item => item.id === scenarioId)?.label || `Prova ${index + 1}`;
        return <article key={run.run_id} className="rounded-xl border bg-background p-4"><div className="flex items-center justify-between gap-3"><h4 className="font-medium">{label}</h4><span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${run.status === "passed" ? "bg-emerald-50 text-emerald-700" : run.status === "failed" ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}>{run.status === "passed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : run.status === "failed" ? <CircleAlert className="h-3.5 w-3.5" /> : null}{run.status === "passed" ? "Superato" : run.status === "failed" ? "Da correggere" : run.status === "error" ? "Errore" : "In elaborazione"}</span></div><p className="mt-3 leading-6 text-muted-foreground">{run.simulation_result?.summary || run.judge_reasoning || run.error}</p>
          {(run.simulation_result?.transcript?.length > 0 || run.simulation_result?.conditions?.length > 0) && <details className="mt-3"><summary className="cursor-pointer text-xs font-medium">Apri conversazione e verifiche</summary><div className="mt-4 space-y-3 border-t pt-4">{run.simulation_result?.conditions?.map((condition: any, i: number) => <div key={i} className="rounded-lg bg-muted/40 p-3 text-xs leading-5"><p className="font-medium">{condition.name || `Criterio ${i + 1}`} · {condition.result === "success" ? "Superato" : condition.result === "failure" ? "Da correggere" : "Da verificare"}</p><p className="mt-1 text-muted-foreground">{condition.reasoning || condition.rationale || ""}</p></div>)}<div className="max-h-96 space-y-3 overflow-y-auto rounded-xl bg-muted/30 p-3" aria-label={`Conversazione ${label}`}>{run.simulation_result?.transcript?.map((message: any, i: number) => <div key={i} className={`max-w-[92%] rounded-xl border p-3 text-sm leading-6 ${message.role === "user" ? "ml-auto border-emerald-100 bg-emerald-50/70" : "bg-background"}`}><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{message.role === "user" ? "Cliente dimostrativo" : "Assistente"}</p><p>{message.text || message.content || message.message}</p></div>)}</div></div></details>}
        </article>;
      })}
    </div>}
  </section>;
}

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FishSimulationPanel } from "./FishSimulationPanel";
import { FishVoicePreview } from "./FishVoicePreview";

type Binding = { voice_id: string; fish_agent_id: string | null; published: boolean; enabled: boolean; real_per_min_eur: number | null; billed_per_min_eur: number | null; test_batches?: string[] };
type Status = { binding: Binding | null; keyConfigured: boolean };
type RemoteNumber = { id: string; number: string; status: string; outbound: boolean };

export function FishAgentPanel({ companyId, agentId, agent }: { companyId: string; agentId: string; agent?: any }) {
  const client = useQueryClient();
  const { isAdmin } = usePermissions();
  const auth = useAuth();
  const isSuperAdmin = auth.role === "super_admin" && !auth.viewAsRole;
  const [voice, setVoice] = useState("");
  const [realRate, setRealRate] = useState("");
  const [billRate, setBillRate] = useState("");
  const [localPhone, setLocalPhone] = useState("");
  const [remotePhone, setRemotePhone] = useState("");
  const [remoteAgent, setRemoteAgent] = useState("");
  const [remoteNumbers, setRemoteNumbers] = useState<RemoteNumber[]>([]);
  const state = useQuery({ queryKey: ["fish-agent", companyId, agentId], retry: false,
    queryFn: () => callFishAgent<Status>(companyId, agentId, "status") });
  const binding = state.data?.binding;
  useEffect(() => {
    setVoice(binding?.voice_id || "");
    setRealRate(binding?.real_per_min_eur == null ? "" : String(binding.real_per_min_eur));
    setBillRate(binding?.billed_per_min_eur == null ? "" : String(binding.billed_per_min_eur));
  }, [binding?.voice_id, binding?.real_per_min_eur, binding?.billed_per_min_eur]);
  const phones = useQuery({ queryKey: ["fish-local-phones", companyId], enabled: !!isSuperAdmin,
    queryFn: async () => { const { data, error } = await supabase.from("ai_phone_numbers_v2" as never).select("id,numero").eq("company_id", companyId).eq("attivo", true); if (error) throw error; return (data || []) as unknown as { id: string; numero: string }[]; } });
  const operation = useMutation({
    mutationFn: async ({ action, input = {} }: { action: string; input?: Record<string, unknown> }) => callFishAgent(companyId, agentId, action, input),
    onSuccess: (data, variables) => {
      if (variables.action === "available_numbers") setRemoteNumbers((data.numbers || []) as RemoteNumber[]);
      toast.success(typeof data.message === "string" ? data.message : "Operazione Fish completata");
      for (const key of [["fish-agent", companyId, agentId], ["agent-detail", companyId, agentId], ["unified-ai-agents", companyId], ["ai-phone-numbers-v2", companyId], ["ai-fish-numbers", companyId], ["ai-conversations-v2", companyId]]) client.invalidateQueries({ queryKey: key });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const run = (action: string, input?: Record<string, unknown>) => operation.mutate({ action, input });
  const busy = operation.isPending;
  const canManage = isAdmin || isSuperAdmin;
  const save = () => {
    const input: Record<string, unknown> = { voice_id: voice.trim() };
    if (isSuperAdmin && (realRate.trim() || billRate.trim())) {
      if (!realRate.trim() || !billRate.trim()) { toast.error("Per aggiornare le tariffe indica entrambi gli importi."); return; }
      input.real_per_min_eur = Number(realRate.replace(",", "."));
      input.billed_per_min_eur = Number(billRate.replace(",", "."));
    }
    run("configure", input);
  };
  return <Card>
    <CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">Motore vocale Fish Audio <Badge variant="outline">{binding?.enabled ? "Attivo" : binding?.published ? "Pubblicato · da attivare" : binding?.fish_agent_id ? "Bozza pronta per le prove" : "Da configurare"}</Badge></CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Usa gli stessi strumenti del gestionale con Fish. Prima salva prompt e strumenti dell’agente, poi sincronizza la bozza, pubblicala e collega una linea. La rete e il numero restano presso l’operatore telefonico.</p>
      {state.isPending ? <p className="text-sm">Verifica configurazione Fish…</p> : state.isError ? <div role="alert" className="space-y-2 text-sm"><p>{state.error.message}</p><Button variant="outline" onClick={() => state.refetch()}>Riprova configurazione</Button></div> : <>
        {!state.data?.keyConfigured && <p role="status" className="rounded-md bg-muted p-3 text-sm">Chiave Fish assente nel backend. Inseriscila in FISH_API_KEY nel file locale del server; non in questa pagina.</p>}
        <div><Label htmlFor={`fish-voice-${agentId}`}>ID voce Fish</Label><Input id={`fish-voice-${agentId}`} value={voice} onChange={e => setVoice(e.target.value)} disabled={!canManage || busy} placeholder="ID della voce, non del modello" /></div>
        {isSuperAdmin && <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="fish-real-rate">Costo Fish, €/minuto</Label><Input id="fish-real-rate" inputMode="decimal" value={realRate} onChange={e => setRealRate(e.target.value)} disabled={busy} /></div><div><Label htmlFor="fish-bill-rate">Prezzo azienda, €/minuto</Label><Input id="fish-bill-rate" inputMode="decimal" value={billRate} onChange={e => setBillRate(e.target.value)} disabled={busy} /></div></div>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !canManage || !state.data?.keyConfigured || !voice.trim()} onClick={save}>1. Sincronizza bozza Fish</Button>
          <Button variant="outline" disabled={busy || !canManage || !binding?.fish_agent_id || binding.real_per_min_eur == null || binding.billed_per_min_eur == null} onClick={() => run("publish")}>2. Pubblica Fish</Button>
          <Button disabled={busy || !canManage || !binding?.published} onClick={() => run("activate")}>3. Attiva Fish per l’agente</Button>
          {binding?.enabled && <Button variant="outline" disabled={busy || !canManage} onClick={() => run("pause")}>Metti Fish in pausa</Button>}
          <Button variant="outline" disabled={busy || !canManage || !binding?.fish_agent_id} onClick={() => run("reconcile")}>Riconcilia chiamate</Button>
        </div>
        <p className="text-xs text-muted-foreground">La sincronizzazione prepara una nuova configurazione: richiede pubblicazione e riattivazione. L’attivazione non compone numeri. Le campagne automatiche Fish non sono ancora abilitate.</p>
        {binding?.fish_agent_id && (binding.real_per_min_eur == null || binding.billed_per_min_eur == null) && <p className="text-sm text-muted-foreground">Puoi già simulare la bozza qui sotto. Per pubblicare e attivare una linea, la piattaforma deve prima impostare le tariffe.</p>}
        {isSuperAdmin && binding && !binding.fish_agent_id && <details><summary className="cursor-pointer text-sm">Riconcilia una creazione rimasta senza esito</summary><Label htmlFor="fish-recover-id">ID della bozza sul pannello Fish</Label><Input id="fish-recover-id" value={remoteAgent} onChange={e => setRemoteAgent(e.target.value)} /><Button className="mt-2" variant="outline" disabled={busy || !remoteAgent.trim()} onClick={() => run("recover_agent", { remote_agent_id: remoteAgent.trim() })}>Verifica e recupera bozza</Button></details>}
        {isSuperAdmin && binding?.fish_agent_id && <details><summary className="cursor-pointer text-sm">Collega una linea aziendale alla piattaforma Fish</summary>
          <p className="my-3 text-sm text-muted-foreground">Importa prima il numero sul pannello Fish via SIP e configura il routing presso l’operatore. Qui si verificano corrispondenza e assegnazione. Non viene acquistato un nuovo numero.</p>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label>Numero nel gestionale</Label><Select value={localPhone} onValueChange={setLocalPhone}><SelectTrigger aria-label="Numero nel gestionale"><SelectValue placeholder="Seleziona la linea" /></SelectTrigger><SelectContent>{phones.data?.map(p => <SelectItem key={p.id} value={p.id}>{p.numero}</SelectItem>)}</SelectContent></Select></div><div><Label>Numero nel pannello Fish</Label><Select value={remotePhone} onValueChange={setRemotePhone}><SelectTrigger aria-label="Numero nel pannello Fish"><SelectValue placeholder="Verifica prima i numeri" /></SelectTrigger><SelectContent>{remoteNumbers.map(p => <SelectItem key={p.id} value={p.id}>{p.number} · {p.outbound ? "entrata e uscita" : "solo entrata"}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => run("available_numbers")}>Verifica numeri Fish</Button><Button variant="outline" disabled={busy || !localPhone || !remotePhone} onClick={() => run("connect_number", { phone_id: localPhone, fish_phone_id: remotePhone })}>Collega la linea selezionata</Button><Button variant="outline" disabled={busy || !localPhone || binding.enabled} onClick={() => run("disconnect_number", { phone_id: localPhone })}>Scollega la linea da Fish</Button></div>
        </details>}
      </>}
      {agent && <FishSimulationPanel companyId={companyId} agentId={agentId} agent={agent} remoteReady={canManage && !!state.data?.keyConfigured && !!binding?.fish_agent_id} initialBatchId={binding?.test_batches?.at(-1)} />}
      {agent && <FishVoicePreview companyId={companyId} agentId={agentId} firstMessage={agent.primo_messaggio} ready={canManage && !!state.data?.keyConfigured && !!binding?.fish_agent_id} />}
    </CardContent>
  </Card>;
}

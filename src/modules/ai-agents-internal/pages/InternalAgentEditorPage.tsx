import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInternalAgent, useUpdateInternalAgent } from "../hooks/useInternalAgents";
import { InternalAgentTab } from "../components/InternalAgentTab";
import { InternalToolsTab } from "../components/InternalToolsTab";
import { AgentKBTab } from "@/modules/ai-agents/components/AgentKBTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ChevronRight, Shield, Clock, AlertTriangle, Phone, PhoneOutgoing, PhoneIncoming, BarChart3, MessageSquare, TrendingUp, Wrench, Play, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { InternalAgentUpdate } from "../types/internalAgent.types";
import { TOOL_LABEL } from "../components/ActionTimeline";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Attivo", variant: "default" },
  draft: { label: "Bozza", variant: "secondary" },
  archived: { label: "Archiviato", variant: "outline" },
};

export default function InternalAgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useInternalAgent(id);
  const updateAgent = useUpdateInternalAgent(id);

  const handlePublish = () => {
    if (!id) return;
    updateAgent.mutate({ status: "active" }, {
      onSuccess: () => toast.success("Agente pubblicato"),
    });
  };

  const handleDraft = () => {
    if (!id) return;
    updateAgent.mutate({ status: "draft" }, {
      onSuccess: () => toast.success("Agente impostato come bozza"),
    });
  };

  const handleUpdate = (update: InternalAgentUpdate) => {
    updateAgent.mutate(update);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Agente non trovato</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/agente-interno")}>
          Torna alla lista
        </Button>
      </div>
    );
  }

  const config = statusConfig[agent.status] ?? statusConfig.draft;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/agente-interno")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <button
              onClick={() => navigate("/azienda/agente-interno")}
              className="hover:text-foreground transition-colors"
            >
              Agenti Interni
            </button>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">{agent.name}</span>
          </div>
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {agent.status === "active" ? (
            <Button variant="outline" size="sm" onClick={handleDraft}>Bozza</Button>
          ) : (
            <Button size="sm" onClick={handlePublish}>Pubblica</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agent" className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
          <TabsTrigger value="agent">Agente</TabsTrigger>
          <TabsTrigger value="tools">Strumenti CRM</TabsTrigger>
          <TabsTrigger value="kb">Knowledge Base</TabsTrigger>
          <TabsTrigger value="phone">Telefono</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="security">Sicurezza</TabsTrigger>
          <TabsTrigger value="advanced">Avanzato</TabsTrigger>
        </TabsList>

        <TabsContent value="agent" className="mt-4">
          <InternalAgentTab
            agent={agent}
            onSave={(update) => updateAgent.mutate(update)}
            isSaving={updateAgent.isPending}
          />
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <InternalToolsTab agent={agent} onSave={handleUpdate} />
        </TabsContent>

        <TabsContent value="kb" className="mt-4">
          <AgentKBTab agentId={agent.id} companyId={agent.company_id} elevenlabsAgentId={agent.elevenlabs_agent_id ?? null} />
        </TabsContent>

        <TabsContent value="phone" className="mt-4">
          <PhoneTab agent={agent} onSave={handleUpdate} />
        </TabsContent>

        <TabsContent value="test" className="mt-4">
          <TestTabInternal agentId={agent.id} elevenlabsAgentId={agent.elevenlabs_agent_id} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsTabInternal agentId={agent.id} />
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <SecurityTabInternal agent={agent} onSave={handleUpdate} />
        </TabsContent>

        <TabsContent value="advanced" className="mt-4">
          <AdvancedTabInternal agent={agent} onSave={handleUpdate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =================== Phone Tab ===================

function PhoneTab({ agent, onSave }: { agent: any; onSave: (u: InternalAgentUpdate) => void }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Numero di Telefono</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Il numero di telefono per questo agente viene configurato dalla sezione
            "Numeri di Telefono" del modulo AI Marketing. Seleziona il routing mode "Interno"
            o "Smart" per instradare le chiamate a questo agente.
          </p>
          {agent.phone_number_id && (
            <Badge variant="outline" className="mt-2">Numero collegato</Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =================== Security Tab ===================

function SecurityTabInternal({ agent, onSave }: { agent: any; onSave: (u: InternalAgentUpdate) => void }) {
  const sec = (agent.tools_config as any)?.security_config || {};
  const [maxCallsPerDay, setMaxCallsPerDay] = useState(String(sec.max_calls_per_day ?? 3));
  const [allowedFrom, setAllowedFrom] = useState(sec.allowed_from ?? "08:00");
  const [allowedTo, setAllowedTo] = useState(sec.allowed_to ?? "20:00");
  const [blacklist, setBlacklist] = useState((sec.blacklist_numbers ?? []).join("\n"));
  const [blockUnknown, setBlockUnknown] = useState(sec.block_unknown_callers ?? false);

  const handleSave = () => {
    onSave({
      tools_config: {
        ...(agent.tools_config as Record<string, unknown>),
        security_config: {
          max_calls_per_day: parseInt(maxCallsPerDay) || 3,
          allowed_from: allowedFrom,
          allowed_to: allowedTo,
          blacklist_numbers: blacklist.split("\n").map((s: string) => s.trim()).filter(Boolean),
          block_unknown_callers: blockUnknown,
        },
      },
    });
    toast.success("Configurazione sicurezza salvata");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Rate Limiting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max chiamate per numero al giorno</Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={maxCallsPerDay}
                onChange={(e) => setMaxCallsPerDay(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Evita che lo stesso numero venga richiamato troppo spesso in una giornata.
              </p>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg h-fit mt-6">
              <div>
                <p className="text-sm font-medium">Blocca numeri sconosciuti</p>
                <p className="text-xs text-muted-foreground">Rifiuta chiamate da numeri non nel CRM</p>
              </div>
              <Switch checked={blockUnknown} onCheckedChange={setBlockUnknown} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Orari Operativi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            L'agente accetterà chiamate solo negli orari indicati. Fuori orario risponderà con un messaggio di assenza.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Orario inizio</Label>
              <Input type="time" value={allowedFrom} onChange={(e) => setAllowedFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Orario fine</Label>
              <Input type="time" value={allowedTo} onChange={(e) => setAllowedTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Blacklist Numeri
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>Numeri bloccati (uno per riga)</Label>
          <Textarea
            value={blacklist}
            onChange={(e) => setBlacklist(e.target.value)}
            rows={5}
            placeholder={"+393331234567\n+393339876543"}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Le chiamate da questi numeri verranno rifiutate automaticamente.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salva configurazione sicurezza</Button>
      </div>
    </div>
  );
}

// =================== Advanced Tab ===================

function AdvancedTabInternal({ agent, onSave }: { agent: any; onSave: (u: InternalAgentUpdate) => void }) {
  const [maxDuration, setMaxDuration] = useState(String(agent.max_duration ?? 900));
  const [silenceTimeout, setSilenceTimeout] = useState(String(agent.silence_timeout ?? 30));
  const [errorMessage, setErrorMessage] = useState(agent.error_message ?? "Mi dispiace, si è verificato un problema.");

  const handleSave = () => {
    onSave({
      max_duration: parseInt(maxDuration) || 900,
      silence_timeout: parseInt(silenceTimeout) || 30,
      error_message: errorMessage,
    });
    toast.success("Configurazione avanzata salvata");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Timeout e Durata
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Durata massima (secondi)</Label>
              <Input
                type="number"
                min="60"
                max="3600"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">15 min = 900 secondi</p>
            </div>
            <div className="space-y-2">
              <Label>Timeout silenzio (secondi)</Label>
              <Input
                type="number"
                min="5"
                max="120"
                value={silenceTimeout}
                onChange={(e) => setSilenceTimeout(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Gestione Errori
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Messaggio di errore</Label>
            <Textarea
              value={errorMessage}
              onChange={(e) => setErrorMessage(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salva configurazione</Button>
      </div>
    </div>
  );
}

// =================== Analytics Tab ===================

function AnalyticsTabInternal({ agentId }: { agentId: string }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["internal-agent-analytics", agentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("internal_call_logs" as never)
        .select("id, status, call_direction, duration_seconds, messages_count, started_at, outcome")
        .eq("agent_id", agentId)
        .order("started_at", { ascending: false })
        .limit(500);
      return (data ?? []) as any[];
    },
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["internal-agent-tool-stats", agentId],
    queryFn: async () => {
      // Get tool stats: join through call_logs of this agent
      const { data: callIds } = await supabase
        .from("internal_call_logs" as never)
        .select("id")
        .eq("agent_id", agentId)
        .limit(500);

      const ids = (callIds ?? []).map((r: any) => r.id);
      if (!ids.length) return [];

      const { data } = await supabase
        .from("internal_agent_actions" as never)
        .select("tool_name, status")
        .in("call_id", ids);
      return (data ?? []) as any[];
    },
  });

  const total = logs.length;
  const completed = logs.filter((l) => l.status === "completed").length;
  const inbound = logs.filter((l) => l.call_direction === "inbound").length;
  const outbound = logs.filter((l) => l.call_direction === "outbound").length;
  const avgDuration = total > 0 ? Math.round(logs.reduce((s: number, l: any) => s + (l.duration_seconds || 0), 0) / total) : 0;
  const answerRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const fmtDur = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  };

  // Tool usage stats
  const toolStats = useMemo(() => {
    const map: Record<string, { success: number; error: number }> = {};
    for (const a of actions) {
      if (!map[a.tool_name]) map[a.tool_name] = { success: 0, error: 0 };
      if (a.status === "success") map[a.tool_name].success++;
      else map[a.tool_name].error++;
    }
    return Object.entries(map)
      .map(([tool, counts]) => ({ tool, ...counts, total: counts.success + counts.error }))
      .sort((a, b) => b.total - a.total);
  }, [actions]);

  // Recent calls (last 10)
  const recentCalls = logs.slice(0, 10);

  if (isLoading) {
    return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Chiamate totali", value: total, icon: Phone, color: "text-primary" },
          { label: "Durata media", value: fmtDur(avgDuration), icon: Clock, color: "text-primary" },
          { label: "Tasso risposta", value: `${answerRate}%`, icon: TrendingUp, color: "text-primary" },
          { label: "Azioni CRM", value: actions.length, icon: Wrench, color: "text-primary" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="text-2xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Direction breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Direzione Chiamate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2"><PhoneIncoming className="h-4 w-4 text-primary" /> In entrata</div>
              <span className="font-medium">{inbound}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2"><PhoneOutgoing className="h-4 w-4 text-muted-foreground" /> In uscita</div>
              <span className="font-medium">{outbound}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Completate</div>
              <span className="font-medium">{completed}</span>
            </div>
          </CardContent>
        </Card>

        {/* Tool usage */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Strumenti Più Usati
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {toolStats.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nessuno strumento utilizzato</p>
            ) : (
              toolStats.slice(0, 5).map((t) => (
                <div key={t.tool} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate flex-1">{TOOL_LABEL[t.tool] ?? t.tool}</span>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-green-600 text-xs">{t.success}✓</span>
                    {t.error > 0 && <span className="text-destructive text-xs">{t.error}✗</span>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent calls */}
      {recentCalls.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Ultime Chiamate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentCalls.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    {log.call_direction === "inbound"
                      ? <PhoneIncoming className="h-3.5 w-3.5 text-primary" />
                      : <PhoneOutgoing className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(log.started_at), "dd/MM HH:mm", { locale: it })}
                    </span>
                  </div>
                  <Badge
                    variant={log.status === "completed" ? "default" : log.status === "failed" ? "destructive" : "secondary"}
                    className="text-[10px]"
                  >
                    {log.status}
                  </Badge>
                  <span className="text-xs tabular-nums text-muted-foreground">{fmtDur(log.duration_seconds)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {total === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
          <BarChart3 className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nessuna chiamata registrata per questo agente.</p>
          <p className="text-xs text-muted-foreground">Le statistiche appariranno dopo la prima interazione.</p>
        </div>
      )}
    </div>
  );
}

// =================== Test Tab ===================

function TestTabInternal({ agentId, elevenlabsAgentId }: { agentId: string; elevenlabsAgentId: string | null }) {
  const [testPhone, setTestPhone] = useState("");
  const [isCalling, setIsCalling] = useState(false);
  const [lastCallResult, setLastCallResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: recentTestCalls = [] } = useQuery({
    queryKey: ["internal-agent-test-calls", agentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("internal_call_logs" as never)
        .select("id, status, duration_seconds, started_at, caller_phone, outcome, call_direction")
        .eq("agent_id", agentId)
        .eq("call_direction", "outbound")
        .order("started_at", { ascending: false })
        .limit(10);
      return (data ?? []) as any[];
    },
    refetchInterval: isCalling ? 5000 : false,
  });

  const handleTestCall = async () => {
    const phone = testPhone.trim();
    if (!phone) return;
    setIsCalling(true);
    setLastCallResult(null);
    try {
      const { error } = await supabase.functions.invoke("initiate-outbound-call", {
        body: { agent_id: agentId, contact_phone: phone },
      });
      if (error) throw new Error(error.message);
      setLastCallResult({ success: true, message: `Chiamata avviata verso ${phone}. Attendi la risposta.` });
      toast.success("Chiamata di test avviata");
    } catch (err: any) {
      setLastCallResult({ success: false, message: err.message || "Errore nell'avvio della chiamata" });
      toast.error(err.message || "Errore avvio chiamata");
    } finally {
      setIsCalling(false);
    }
  };

  const fmtDur = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Test call card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4" /> Avvia Chiamata di Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!elevenlabsAgentId && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              Agente non ancora pubblicato. Pubblica l'agente prima di eseguire un test.
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Inserisci un numero di telefono per avviare una chiamata di test con questo agente.
            L'agente utilizzerà tutti gli strumenti CRM abilitati.
          </p>
          <div className="flex gap-3">
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+39 333 1234567"
              className="font-mono"
              disabled={!elevenlabsAgentId}
            />
            <Button
              onClick={handleTestCall}
              disabled={!testPhone.trim() || isCalling || !elevenlabsAgentId}
              className="min-w-[120px]"
            >
              {isCalling ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Avvio...</>
              ) : (
                <><Play className="h-4 w-4 mr-2" /> Chiama</>
              )}
            </Button>
          </div>
          {lastCallResult && (
            <div className={`rounded-lg px-4 py-3 text-sm ${lastCallResult.success ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
              {lastCallResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent outbound test calls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PhoneOutgoing className="h-4 w-4" /> Chiamate in Uscita Recenti
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentTestCalls.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessuna chiamata in uscita registrata.
            </p>
          ) : (
            <div className="space-y-2">
              {recentTestCalls.map((call: any) => (
                <div key={call.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div className="space-y-0.5">
                    <p className="font-mono text-xs">{call.caller_phone ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(call.started_at), "dd/MM/yyyy HH:mm", { locale: it })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={call.status === "completed" ? "default" : call.status === "failed" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {call.status}
                    </Badge>
                    {call.duration_seconds > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">{fmtDur(call.duration_seconds)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

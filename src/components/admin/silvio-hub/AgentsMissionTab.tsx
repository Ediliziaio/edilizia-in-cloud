/**
 * AgentsMissionTab — registry 8 agenti + multi-agent mission CRUD + blackboard
 * Estratto da SilvioAdminHub.tsx (refactor monolite → sub-component).
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Activity, AlertTriangle, Brain, CheckCircle2, FileText, Network,
  Pencil, PlayCircle, RefreshCw, Save, Target, XCircle,
} from "lucide-react";
import {
  AGENT_RISK_COLORS, AGENT_STATUS_COLORS, AGENT_STATUS_LABELS,
  AGENT_EXPERTISE, MAX_AGENTI_PER_MISSIONE, MISSION_TEMPLATES, TASK_STATUS_LABELS,
  inferAgentKeysForObjective, getMissionPhase, buildMissionReadiness,
  getMissionEvidenceGate, getMissionActionGate, blackboardEntryToMemoryType,
} from "./shared";
import type {
  AgentRegistry, AgentMissionSummary, AgentTask, BlackboardEntry,
  AgentToolPermission, AgentMemoryItem, AgentEvaluation,
  AgentPerformance, AgentMissionHealth, AgentToolHealth,
} from "./shared";

export function AgentsMissionTab() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [mode, setMode] = useState<AgentMissionSummary["mode"]>("panel");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);

  type LaunchMissionInput = {
    title?: string;
    objective?: string;
    mode?: AgentMissionSummary["mode"];
    selected_agents?: string[];
  };

  const agentsQuery = useQuery({
    queryKey: ["silvio-agent-registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_registry" as never)
        .select("*")
        .order("sort_order" as never, { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentRegistry[];
    },
  });

  const toolPermissionsQuery = useQuery({
    queryKey: ["silvio-agent-tool-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_tool_permissions" as never)
        .select("agent_key,tool_key,execution_mode,enabled")
        .eq("enabled" as never, true as never)
        .order("agent_key" as never, { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentToolPermission[];
    },
  });

  const memoryQuery = useQuery({
    queryKey: ["silvio-agent-memory-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_memory" as never)
        .select("*")
        .order("created_at" as never, { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as AgentMemoryItem[];
    },
  });

  const performanceQuery = useQuery({
    queryKey: ["silvio-agent-performance"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_silvio_agent_performance" as never)
        .select("*")
        .order("tasks_failed" as never, { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as AgentPerformance[];
    },
  });

  const missionHealthQuery = useQuery({
    queryKey: ["silvio-agent-mission-health"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_silvio_agent_mission_health" as never)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AgentMissionHealth | null;
    },
  });

  const toolHealthQuery = useQuery({
    queryKey: ["silvio-agent-tool-health"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_silvio_agent_tool_health" as never)
        .select("*")
        .order("failed_calls_7d" as never, { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as AgentToolHealth[];
    },
  });

  const missionsQuery = useQuery({
    queryKey: ["silvio-agent-missions"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_silvio_agent_mission_summary" as never)
        .select("*")
        .order("created_at" as never, { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AgentMissionSummary[];
    },
  });

  const missions = missionsQuery.data ?? [];
  const activeMission =
    missions.find((mission) => mission.id === activeMissionId) ??
    missions[0] ??
    null;

  const tasksQuery = useQuery({
    queryKey: ["silvio-agent-tasks", activeMission?.id],
    enabled: Boolean(activeMission?.id),
    refetchInterval:
      activeMission && ["planning", "running"].includes(activeMission.status)
        ? 5_000
        : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_tasks" as never)
        .select("*")
        .eq("mission_id" as never, activeMission!.id as never)
        .order("sort_order" as never, { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentTask[];
    },
  });

  const blackboardQuery = useQuery({
    queryKey: ["silvio-agent-blackboard", activeMission?.id],
    enabled: Boolean(activeMission?.id),
    refetchInterval:
      activeMission && ["planning", "running"].includes(activeMission.status)
        ? 5_000
        : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_blackboard" as never)
        .select("*")
        .eq("mission_id" as never, activeMission!.id as never)
        .order("created_at" as never, { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as BlackboardEntry[];
    },
  });

  const evaluationsQuery = useQuery({
    queryKey: ["silvio-agent-evaluations", activeMission?.id],
    enabled: Boolean(activeMission?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_agent_evaluations" as never)
        .select("*")
        .eq("mission_id" as never, activeMission!.id as never)
        .order("created_at" as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentEvaluation[];
    },
  });

  const launchMutation = useMutation({
    mutationFn: async (input?: LaunchMissionInput) => {
      const missionTitle = input?.title ?? title;
      const missionObjective = input?.objective ?? objective;
      const missionMode = input?.mode ?? mode;
      const missionAgents = input?.selected_agents ?? selectedAgents;
      const payload = {
        title: missionTitle.trim() || undefined,
        objective: missionObjective.trim(),
        mode: missionMode,
        max_agents: MAX_AGENTI_PER_MISSIONE,
        selected_agents: missionAgents.length > 0 ? missionAgents : undefined,
      };
      const { data, error } = await supabase.functions.invoke(
        "silvio-agent-orchestrator",
        {
          body: payload,
        },
      );
      if (error) throw error;
      return data as {
        mission_id?: string;
        next_action?: string;
        accepted?: boolean;
        status?: string;
      };
    },
    onSuccess: (data) => {
      toast.success(
        data?.accepted
          ? "Missione multi-agente avviata"
          : "Missione multi-agente completata",
        {
          description:
            data?.next_action ??
            "Gli agenti lavorano in background. La sintesi comparira appena pronta.",
        },
      );
      if (data?.mission_id) setActiveMissionId(data.mission_id);
      setObjective("");
      setTitle("");
      setSelectedAgents([]);
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-missions"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-blackboard"] });
    },
    onError: (e) =>
      toast.error("Missione non avviata", {
        description:
          e instanceof Error
            ? e.message
            : "Controlla permessi, obiettivo e connessione Supabase.",
      }),
  });

  const resolveMissionMutation = useMutation({
    mutationFn: async ({
      missionId,
      resolution,
    }: {
      missionId: string;
      resolution: "approved" | "rejected";
    }) => {
      const { error } = await supabase.rpc(
        "silvio_agent_resolve_mission" as never,
        {
          p_mission_id: missionId,
          p_resolution: resolution,
          p_note: null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: (_, { resolution }) => {
      toast.success(
        resolution === "approved"
          ? "Missione approvata"
          : "Missione archiviata",
      );
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-missions"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-evaluations"] });
    },
    onError: (e) =>
      toast.error("Errore revisione missione", { description: String(e) }),
  });

  const updateMemoryMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "active" | "rejected";
    }) => {
      const { error } = await supabase
        .from("silvio_agent_memory" as never)
        .update({
          memory_status: status,
          enabled: status === "active",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id" as never, id as never);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(
        status === "active"
          ? "Memoria agente attivata"
          : "Memoria agente rifiutata",
      );
      queryClient.invalidateQueries({
        queryKey: ["silvio-agent-memory-latest"],
      });
    },
    onError: (e) =>
      toast.error("Errore memoria agente", { description: String(e) }),
  });

  const saveBlackboardMemoryMutation = useMutation({
    mutationFn: async (entry: BlackboardEntry) => {
      const memoryType = blackboardEntryToMemoryType(entry.entry_type);
      const agentKey = entry.agent_key ?? "planner_agent";
      const content = `${entry.title}: ${entry.content}`.trim().slice(0, 900);
      const { error } = await supabase
        .from("silvio_agent_memory" as never)
        .insert({
          agent_key: agentKey,
          memory_type: memoryType,
          content,
          source: "blackboard_manual_save",
          source_mission_id: entry.mission_id,
          confidence: entry.confidence ?? 0.75,
          memory_status: "active",
          enabled: true,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria agente salvata");
      queryClient.invalidateQueries({
        queryKey: ["silvio-agent-memory-latest"],
      });
    },
    onError: (e) =>
      toast.error("Memoria non salvata", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });

  const agents = (agentsQuery.data ?? []).filter(
    (agent) => agent.agent_key !== "silvio_coordinator",
  );
  const enabledAgents = agents.filter((agent) => agent.enabled);
  const tasks = tasksQuery.data ?? [];
  const blackboard = blackboardQuery.data ?? [];
  const evaluations = evaluationsQuery.data ?? [];
  const latestEvaluation = evaluations[0];
  const memoryItems = memoryQuery.data ?? [];
  const missionHealth = missionHealthQuery.data;
  const performanceRows = performanceQuery.data ?? [];
  const toolHealthRows = toolHealthQuery.data ?? [];
  const fragileAgents = performanceRows
    .filter((agent) => agent.tasks_total > 0)
    .sort(
      (a, b) =>
        b.tasks_failed +
        b.approval_required_count -
        (a.tasks_failed + a.approval_required_count),
    )
    .slice(0, 4);
  const toolsByAgent = (toolPermissionsQuery.data ?? []).reduce<
    Record<string, AgentToolPermission[]>
  >((acc, permission) => {
    acc[permission.agent_key] = [
      ...(acc[permission.agent_key] ?? []),
      permission,
    ];
    return acc;
  }, {});
  const routingAgentKeys = useMemo(() => {
    if (selectedAgents.length > 0) return selectedAgents;
    return inferAgentKeysForObjective(objective, enabledAgents);
  }, [enabledAgents, objective, selectedAgents]);
  const routingAgents = routingAgentKeys
    .map((agentKey) =>
      enabledAgents.find((agent) => agent.agent_key === agentKey),
    )
    .filter((agent): agent is AgentRegistry => Boolean(agent));
  const routingModeLabel =
    selectedAgents.length > 0 ? "Selezione manuale" : "Routing automatico";
  const missionReadiness = useMemo(
    () => buildMissionReadiness(objective, routingAgents.length),
    [objective, routingAgents.length],
  );
  const canLaunchMission =
    missionReadiness.blockers.length === 0 && !launchMutation.isPending;
  const missionProgress =
    activeMission && activeMission.tasks_count > 0
      ? Math.round(
          (activeMission.completed_tasks_count / activeMission.tasks_count) *
            100,
        )
      : 0;
  const missionPhase =
    activeMission !== null ? getMissionPhase(activeMission, tasks) : null;
  const evidenceStats = {
    facts: blackboard.filter((entry) => entry.entry_type === "fact").length,
    insights: blackboard.filter((entry) => entry.entry_type === "insight")
      .length,
    risks: blackboard.filter((entry) => entry.entry_type === "risk").length,
    actions: blackboard.filter(
      (entry) => entry.entry_type === "recommendation",
    ).length,
  };
  const missionEvidenceGate = getMissionEvidenceGate(blackboard);
  const missionActionGate = getMissionActionGate(blackboard);

  const applyTemplate = (template: (typeof MISSION_TEMPLATES)[number]) => {
    setTitle(template.title);
    setObjective(template.objective);
    setMode(template.mode);
    setSelectedAgents(template.agents);
  };

  const handleMissionAsBase = (mission: AgentMissionSummary) => {
    setTitle(`Copia: ${mission.title}`);
    setObjective(mission.objective);
    setMode(mission.mode);
    setSelectedAgents(
      mission.selected_agents
        .filter((agentKey) => agentKey !== "silvio_coordinator")
        .slice(0, MAX_AGENTI_PER_MISSIONE),
    );
    toast.success("Missione caricata nel composer");
  };

  const rerunMissionWithMoreEvidence = (mission: AgentMissionSummary) => {
    const agentKeys = mission.selected_agents
      .filter((agentKey) => agentKey !== "silvio_coordinator")
      .slice(0, MAX_AGENTI_PER_MISSIONE);
    launchMutation.mutate({
      title: `Verifica prove: ${mission.title}`.slice(0, 120),
      mode: mission.mode,
      selected_agents: agentKeys,
      objective: [
        "Rilancia questa missione concentrandoti SOLO su prove, rischi e punti deboli della sintesi precedente.",
        `Obiettivo originale: ${mission.objective}`,
        mission.summary_md
          ? `Sintesi precedente da verificare:\n${mission.summary_md.slice(0, 1800)}`
          : "Sintesi precedente non disponibile.",
        "Output richiesto: evidenze verificate, assunzioni da non trattare come fatti, P0/P1/P2 e una sola prossima azione. Se mancano dati, chiedi il dato preciso.",
      ].join("\n\n"),
    });
  };

  const toggleAgent = (agentKey: string) => {
    setSelectedAgents((current) => {
      if (current.includes(agentKey))
        return current.filter((key) => key !== agentKey);
      if (current.length >= MAX_AGENTI_PER_MISSIONE) {
        toast.info("Massimo 5 agenti per missione");
        return current;
      }
      return [...current, agentKey];
    });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] gap-4">
      <div className="space-y-4 min-w-0">
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Network className="h-4 w-4 text-orange-500" />
              Nuova missione multi-agente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Template rapidi
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Selezionano gia agenti e obiettivo
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
                {MISSION_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="min-h-11 rounded-md border bg-background px-3 py-2 text-left text-xs font-medium transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px] gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Titolo</label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Es. Piano crescita Q2"
                  className="min-h-11"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Modalita
                </label>
                <Select
                  value={mode}
                  onValueChange={(value) =>
                    setMode(value as AgentMissionSummary["mode"])
                  }
                >
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="panel">Panel</SelectItem>
                    <SelectItem value="debate">Debate</SelectItem>
                    <SelectItem value="chain">Chain</SelectItem>
                    <SelectItem value="supervised_execution">
                      Supervised
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Obiettivo operativo
              </label>
              <Textarea
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="Scrivi il problema o l'obiettivo. Silvio seleziona gli agenti, raccoglie i contributi e produce una sintesi unica."
                rows={5}
                className="min-h-[132px] text-base md:text-sm"
              />
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span
                  className={
                    objective.trim().length < 10
                      ? "text-amber-700"
                      : "text-muted-foreground"
                  }
                >
                  {objective.trim().length < 10
                    ? "Scrivi almeno 10 caratteri per avviare."
                    : "Obiettivo valido: gli agenti avranno un contesto operativo."}
                </span>
                <span className="text-muted-foreground">
                  {objective.trim().length} caratteri
                </span>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">Qualita prompt</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      missionReadiness.score >= 80
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : missionReadiness.score >= 60
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {missionReadiness.label} · {missionReadiness.score}%
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {missionReadiness.strengths.slice(0, 2).map((item) => (
                    <div key={item} className="flex items-start gap-1.5 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                  {missionReadiness.blockers.map((item) => (
                    <div key={item} className="flex items-start gap-1.5 text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                  {missionReadiness.warnings.slice(0, 3).map((item) => (
                    <div key={item} className="flex items-start gap-1.5 text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                {missionReadiness.metricSignals.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {missionReadiness.metricSignals.map((signal) => (
                      <Badge key={signal} variant="secondary" className="text-[10px]">
                        numero da verificare: {signal}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Agenti ({routingAgents.length}/{MAX_AGENTI_PER_MISSIONE})
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedAgents([])}
                >
                  Routing automatico
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {enabledAgents.map((agent) => {
                  const selected = selectedAgents.includes(agent.agent_key);
                  return (
                    <button
                      key={agent.agent_key}
                      type="button"
                      onClick={() => toggleAgent(agent.agent_key)}
                      className={`min-h-11 rounded-md border px-3 py-2 text-left text-xs transition ${
                        selected
                          ? "border-orange-400 bg-orange-50 text-orange-800 shadow-sm"
                          : "border-border bg-background hover:bg-muted/50"
                      }`}
                    >
                      <span className="font-medium block">
                        {agent.display_name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {agent.operating_mode}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">
                    Preview routing: {routingModeLabel}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    QA sempre incluso
                  </Badge>
                </div>
                {routingAgents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Scrivi un obiettivo o scegli un template per vedere gli
                    agenti coinvolti.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {routingAgents.map((agent) => (
                      <Badge
                        key={agent.agent_key}
                        variant="outline"
                        className="bg-white text-[10px]"
                      >
                        {agent.display_name}:{" "}
                        {AGENT_EXPERTISE[agent.agent_key] ?? agent.operating_mode}
                      </Badge>
                    ))}
                  </div>
                )}
                {enabledAgents.length > MAX_AGENTI_PER_MISSIONE && (
                  <p className="text-[11px] text-muted-foreground">
                    Limite sicurezza: massimo {MAX_AGENTI_PER_MISSIONE} agenti
                    paralleli. Per audit completi crea due missioni coordinate.
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded border bg-white px-2 py-1">
                    Evidenze prima
                  </span>
                  <span className="rounded border bg-white px-2 py-1">
                    Ipotesi marcate
                  </span>
                  <span className="rounded border bg-white px-2 py-1">
                    P0/P1/P2
                  </span>
                  <span className="rounded border bg-white px-2 py-1">
                    Una next action
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                La sintesi finale mostrera evidenze, rischi e una sola prossima
                azione. Se le prove sono deboli andra in review.
              </p>
              <Button
                onClick={() => launchMutation.mutate(undefined)}
                disabled={!canLaunchMission}
                className="min-h-11 bg-orange-600 hover:bg-orange-700 sm:min-w-[180px]"
              >
                <PlayCircle
                  className={`h-4 w-4 mr-2 ${launchMutation.isPending ? "animate-pulse" : ""}`}
                />
                {launchMutation.isPending
                  ? "Avvio missione..."
                  : missionReadiness.blockers.length > 0
                    ? "Completa il prompt"
                    : `Avvia con ${routingAgents.length || 0} agenti`}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-violet-500" />
              Osservabilità agenti
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {missionHealthQuery.isLoading ||
            performanceQuery.isLoading ||
            toolHealthQuery.isLoading ? (
              <Skeleton className="h-32" />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-md border bg-muted/30 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Attive
                    </div>
                    <div className="text-sm font-semibold">
                      {missionHealth?.active_missions ?? 0}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Review
                    </div>
                    <div className="text-sm font-semibold">
                      {missionHealth?.waiting_approval_missions ?? 0}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Fail 7g
                    </div>
                    <div className="text-sm font-semibold">
                      {missionHealth?.failed_missions_7d ?? 0}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Costo 7g
                    </div>
                    <div className="text-sm font-semibold">
                      $
                      {Number(missionHealth?.total_cost_usd_7d ?? 0).toFixed(3)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-xs font-medium">
                      Agenti da tenere d'occhio
                    </p>
                    {fragileAgents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nessun segnale critico negli agenti.
                      </p>
                    ) : (
                      fragileAgents.map((agent) => (
                        <div
                          key={agent.agent_key}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate">{agent.display_name}</span>
                          <span className="text-muted-foreground shrink-0">
                            fail {agent.tasks_failed} · review{" "}
                            {agent.approval_required_count}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-xs font-medium">Tool health 7g</p>
                    {toolHealthRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nessuna chiamata tool recente.
                      </p>
                    ) : (
                      toolHealthRows.slice(0, 4).map((tool) => (
                        <div
                          key={tool.tool_name}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate font-mono">
                            {tool.tool_name}
                          </span>
                          <span
                            className={
                              tool.failed_calls_7d > 0
                                ? "text-rose-600 shrink-0"
                                : "text-muted-foreground shrink-0"
                            }
                          >
                            fail {tool.failed_calls_7d} · p95{" "}
                            {Number(tool.p95_duration_ms ?? 0).toFixed(0)}ms
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agentsQuery.isLoading ? (
            <>
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </>
          ) : (
            enabledAgents.map((agent) => (
              <Card key={agent.agent_key} className="overflow-hidden">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {agent.display_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {agent.agent_key}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${AGENT_RISK_COLORS[agent.risk_level]}`}
                    >
                      {agent.risk_level}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {agent.mission}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(toolsByAgent[agent.agent_key] ?? [])
                      .slice(0, 4)
                      .map((permission) => (
                        <Badge
                          key={permission.tool_key}
                          variant="outline"
                          className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                        >
                          {permission.tool_key}
                        </Badge>
                      ))}
                    {(toolsByAgent[agent.agent_key] ?? []).length === 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        Nessun tool attivo
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {agent.persona_keys.slice(0, 4).map((persona) => (
                      <Badge
                        key={persona}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {persona}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-500" />
              Memoria agenti
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {memoryQuery.isLoading ? (
              <Skeleton className="h-24" />
            ) : memoryItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna memoria agente ancora. Le missioni generano suggerimenti
                da approvare.
              </p>
            ) : (
              memoryItems.map((memory) => (
                <div
                  key={memory.id}
                  className="rounded-md border p-2 space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {memory.agent_key}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {memory.memory_type}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        memory.memory_status === "active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : memory.memory_status === "rejected"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {memory.memory_status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                    {memory.content}
                  </p>
                  {memory.memory_status === "suggested" && (
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-rose-600"
                        disabled={updateMemoryMutation.isPending}
                        onClick={() =>
                          updateMemoryMutation.mutate({
                            id: memory.id,
                            status: "rejected",
                          })
                        }
                      >
                        Rifiuta
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                        disabled={updateMemoryMutation.isPending}
                        onClick={() =>
                          updateMemoryMutation.mutate({
                            id: memory.id,
                            status: "active",
                          })
                        }
                      >
                        Attiva
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-violet-500" />
              Missioni recenti
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {missionsQuery.isLoading ? (
              <div className="p-3">
                <Skeleton className="h-32" />
              </div>
            ) : missions.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nessuna missione ancora avviata.
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto divide-y">
                {missions.map((mission) => (
                  <button
                    key={mission.id}
                    type="button"
                    onClick={() => setActiveMissionId(mission.id)}
                    className={`w-full text-left p-3 hover:bg-muted/40 transition ${
                      activeMission?.id === mission.id ? "bg-orange-50/70" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {mission.title}
                      </p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${AGENT_STATUS_COLORS[mission.status] ?? ""}`}
                      >
                        {AGENT_STATUS_LABELS[mission.status] ?? mission.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                      {mission.objective}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                      <span>
                        {format(new Date(mission.created_at), "dd MMM HH:mm", {
                          locale: it,
                        })}
                      </span>
                      <span>
                        {mission.completed_tasks_count}/{mission.tasks_count}{" "}
                        task
                      </span>
                      {mission.risks_count > 0 && (
                        <span className="text-rose-600">
                          {mission.risks_count} rischi
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-500" />
              Sintesi missione
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeMission ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Seleziona una missione per vedere sintesi, task e blackboard.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${AGENT_STATUS_COLORS[activeMission.status] ?? ""}`}
                    >
                      {AGENT_STATUS_LABELS[activeMission.status] ??
                        activeMission.status}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {activeMission.mode}
                    </Badge>
                    {activeMission.confidence !== null && (
                      <Badge variant="outline" className="text-[10px]">
                        conf {(activeMission.confidence * 100).toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                  {missionPhase && (
                    <div
                      className={`rounded-md border p-3 text-sm ${missionPhase.tone}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{missionPhase.label}</p>
                          <p className="text-xs opacity-90">
                            {missionPhase.description}
                          </p>
                        </div>
                        {activeMission.tasks_count > 0 && (
                          <span className="text-xs font-semibold shrink-0">
                            {missionProgress}%
                          </span>
                        )}
                      </div>
                      {activeMission.tasks_count > 0 && (
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70">
                          <div
                            className="h-full rounded-full bg-current transition-all"
                            style={{ width: `${missionProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {latestEvaluation && (
                    <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${latestEvaluation.verdict === "pass" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}
                        >
                          QA {latestEvaluation.verdict}
                        </Badge>
                        <span className="text-muted-foreground">
                          rischio hallucination:{" "}
                          {latestEvaluation.hallucination_risk}
                        </span>
                        {latestEvaluation.needs_human_approval && (
                          <span className="text-amber-700 font-medium">
                            review umana richiesta
                          </span>
                        )}
                      </div>
                      {latestEvaluation.notes && (
                        <p className="text-muted-foreground whitespace-pre-wrap break-words">
                          {latestEvaluation.notes}
                        </p>
                      )}
                    </div>
                  )}
                  {(missionEvidenceGate || missionActionGate) && (
                    <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {missionEvidenceGate && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              missionEvidenceGate.hasCredibleEvidence
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            Evidence gate{" "}
                            {missionEvidenceGate.hasCredibleEvidence
                              ? "ok"
                              : "prove deboli"}
                          </Badge>
                        )}
                        {missionActionGate?.rewritten && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-violet-50 text-violet-700 border-violet-200"
                          >
                            Next action resa operativa
                          </Badge>
                        )}
                      </div>
                      {missionEvidenceGate &&
                        missionEvidenceGate.unsupportedClaims.length > 0 && (
                          <div className="space-y-1">
                            <p className="font-medium text-amber-800">
                              Numeri non verificati marcati dalla QA:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {missionEvidenceGate.unsupportedClaims
                                .slice(0, 6)
                                .map((claim) => (
                                  <Badge
                                    key={claim}
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    {claim}
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        )}
                      {missionActionGate?.originalNextAction && (
                        <p className="text-muted-foreground">
                          Azione originale troppo generica:{" "}
                          {missionActionGate.originalNextAction}
                        </p>
                      )}
                    </div>
                  )}
                  {activeMission.status === "waiting_approval" && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-sm text-amber-800">
                        Non e un errore: Silvio ha completato l'analisi, ma ha
                        rilevato rischi, assunzioni o prove insufficienti. Puoi
                        approvarla come decisione valida oppure archiviarla.
                      </p>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resolveMissionMutation.isPending}
                          onClick={() =>
                            resolveMissionMutation.mutate({
                              missionId: activeMission.id,
                              resolution: "rejected",
                            })
                          }
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Archivia
                        </Button>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={resolveMissionMutation.isPending}
                          onClick={() =>
                            resolveMissionMutation.mutate({
                              missionId: activeMission.id,
                              resolution: "approved",
                            })
                          }
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approva sintesi
                        </Button>
                      </div>
                    </div>
                  )}
                  <h3 className="font-semibold text-sm">
                    {activeMission.title}
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between rounded-md border bg-muted/20 p-2">
                    <p className="text-xs text-muted-foreground">
                      Puoi riusare questa missione come prompt base o rilanciarla
                      per chiedere piu prove agli stessi agenti.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => handleMissionAsBase(activeMission)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Usa come base
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-violet-600 hover:bg-violet-700"
                        disabled={
                          launchMutation.isPending ||
                          !["completed", "waiting_approval", "failed"].includes(
                            activeMission.status,
                          )
                        }
                        onClick={() => rerunMissionWithMoreEvidence(activeMission)}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 mr-1 ${
                            launchMutation.isPending ? "animate-spin" : ""
                          }`}
                        />
                        Rilancia prove
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Fatti
                      </p>
                      <p className="text-sm font-semibold">
                        {evidenceStats.facts}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Insight
                      </p>
                      <p className="text-sm font-semibold">
                        {evidenceStats.insights}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Rischi
                      </p>
                      <p className="text-sm font-semibold">
                        {evidenceStats.risks}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">
                        Azioni
                      </p>
                      <p className="text-sm font-semibold">
                        {evidenceStats.actions}
                      </p>
                    </div>
                  </div>
                  {activeMission.summary_md ? (
                    <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words">
                      {activeMission.summary_md}
                    </div>
                  ) : activeMission.last_error ? (
                    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                      {activeMission.last_error}
                    </div>
                  ) : (
                    <Skeleton className="h-28" />
                  )}
                  {activeMission.next_action && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                      <strong>Prossimo passo:</strong>{" "}
                      {activeMission.next_action}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Task agenti
                  </p>
                  {tasksQuery.isLoading ? (
                    <Skeleton className="h-24" />
                  ) : tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nessun task generato.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-md border p-2 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono">
                              {task.agent_key}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${AGENT_STATUS_COLORS[task.status] ?? ""}`}
                            >
                              {TASK_STATUS_LABELS[task.status] ?? task.status}
                            </Badge>
                          </div>
                          {task.output_md && (
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-5">
                              {task.output_md}
                            </p>
                          )}
                          {task.error_message && (
                            <p className="text-xs text-rose-600 break-words">
                              {task.error_message}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Blackboard
                  </p>
                  {blackboardQuery.isLoading ? (
                    <Skeleton className="h-24" />
                  ) : blackboard.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nessun elemento nel blackboard.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {blackboard.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-md bg-muted/30 p-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <Badge variant="outline" className="text-[10px]">
                                {entry.entry_type}
                              </Badge>
                              {entry.agent_key && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {entry.agent_key}
                                </span>
                              )}
                              {entry.confidence !== null && (
                                <span className="text-[10px] text-muted-foreground">
                                  {(entry.confidence * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                            {["fact", "insight", "risk", "recommendation", "decision"].includes(
                              entry.entry_type,
                            ) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 shrink-0 px-2 text-[10px]"
                                disabled={saveBlackboardMemoryMutation.isPending}
                                onClick={() =>
                                  saveBlackboardMemoryMutation.mutate(entry)
                                }
                              >
                                <Save className="h-3 w-3 mr-1" />
                                Memoria
                              </Button>
                            )}
                          </div>
                          <p className="text-xs font-medium mt-1">
                            {entry.title}
                          </p>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                            {entry.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


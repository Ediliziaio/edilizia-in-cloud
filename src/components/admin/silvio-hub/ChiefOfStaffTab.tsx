/**
 * ChiefOfStaffTab — strategic briefs + monitor events + growth experiments
 * Estratto da SilvioAdminHub.tsx (refactor monolite → sub-component).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Activity, AlertTriangle, FlaskConical, RefreshCw, TrendingUp } from "lucide-react";
import { inferAgentsForMetric } from "./shared";
import type {
  ChiefBrief,
  StrategicObjective,
  MonitorEvent,
  GrowthExperiment,
} from "./shared";

export function ChiefOfStaffTab() {
  const queryClient = useQueryClient();

  const briefsQuery = useQuery({
    queryKey: ["silvio-chief-briefs"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_chief_of_staff_briefs" as never)
        .select("*")
        .order("for_date" as never, { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ChiefBrief[];
    },
  });

  const objectivesQuery = useQuery({
    queryKey: ["silvio-strategic-objectives"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_strategic_objectives" as never)
        .select("*")
        .eq("enabled" as never, true as never)
        .order("priority" as never, { ascending: true });
      if (error) throw error;
      return (data ?? []) as StrategicObjective[];
    },
  });

  const monitorEventsQuery = useQuery({
    queryKey: ["silvio-monitor-events"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_monitor_events" as never)
        .select("*")
        .in("status" as never, ["open", "acknowledged"] as never)
        .order("created_at" as never, { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as MonitorEvent[];
    },
  });

  const experimentsQuery = useQuery({
    queryKey: ["silvio-growth-experiments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_growth_experiments" as never)
        .select("*")
        .order("created_at" as never, { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as GrowthExperiment[];
    },
  });

  const runChiefMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "silvio-chief-of-staff",
        {
          body: { force: true, generate_experiments: true },
        },
      );
      if (error) throw error;
      return data as {
        next_action?: string;
        monitor_events_triggered?: number;
        experiments_suggested?: number;
      };
    },
    onSuccess: (data) => {
      toast.success("Chief of Staff aggiornato", {
        description:
          data?.next_action ?? "Brief, monitor ed esperimenti aggiornati",
      });
      queryClient.invalidateQueries({ queryKey: ["silvio-chief-briefs"] });
      queryClient.invalidateQueries({
        queryKey: ["silvio-strategic-objectives"],
      });
      queryClient.invalidateQueries({ queryKey: ["silvio-monitor-events"] });
      queryClient.invalidateQueries({
        queryKey: ["silvio-growth-experiments"],
      });
    },
    onError: (e) =>
      toast.error("Errore Chief of Staff", { description: String(e) }),
  });

  const updateExperimentMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: GrowthExperiment["status"];
    }) => {
      const { error } = await supabase.rpc(
        "silvio_update_experiment_status" as never,
        {
          p_experiment_id: id,
          p_status: status,
          p_result_summary: null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(`Esperimento ${status}`);
      queryClient.invalidateQueries({
        queryKey: ["silvio-growth-experiments"],
      });
    },
    onError: (e) =>
      toast.error("Errore esperimento", { description: String(e) }),
  });

  const updateMonitorMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: MonitorEvent["status"];
    }) => {
      const { error } = await supabase
        .from("silvio_monitor_events" as never)
        .update({
          status,
          resolved_at:
            status === "resolved" || status === "dismissed"
              ? new Date().toISOString()
              : null,
        } as never)
        .eq("id" as never, id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Monitor aggiornato");
      queryClient.invalidateQueries({ queryKey: ["silvio-monitor-events"] });
    },
    onError: (e) => toast.error("Errore monitor", { description: String(e) }),
  });

  const launchChiefMissionMutation = useMutation({
    mutationFn: async ({
      title,
      objective,
      selected_agents,
    }: {
      title: string;
      objective: string;
      selected_agents: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "silvio-agent-orchestrator",
        {
          body: {
            title,
            objective,
            mode: "panel",
            priority: "high",
            selected_agents,
          },
        },
      );
      if (error) throw error;
      return data as {
        mission_id?: string;
        accepted?: boolean;
        next_action?: string;
      };
    },
    onSuccess: (data) => {
      toast.success("Missione Silvio avviata", {
        description:
          data?.next_action ??
          "Gli agenti stanno lavorando sul punto operativo.",
      });
      queryClient.invalidateQueries({ queryKey: ["silvio-agent-missions"] });
    },
    onError: (e) =>
      toast.error("Errore avvio missione", { description: String(e) }),
  });

  const briefs = briefsQuery.data ?? [];
  const latestBrief = briefs[0];
  const objectives = objectivesQuery.data ?? [];
  const monitorEvents = monitorEventsQuery.data ?? [];
  const experiments = experimentsQuery.data ?? [];
  const metrics = (latestBrief?.snapshot?.metrics ?? {}) as Record<
    string,
    unknown
  >;

  const metricCards = [
    { label: "MRR", value: `EUR ${Number(metrics.mrr_eur ?? 0).toFixed(0)}` },
    { label: "Paying", value: String(metrics.companies_paying ?? 0) },
    { label: "Unpaid", value: String(metrics.companies_unpaid ?? 0) },
    {
      label: "AI MTD",
      value: `EUR ${Number(metrics.ai_cost_mtd_eur ?? 0).toFixed(2)}`,
    },
    { label: "Ticket", value: String(metrics.open_tickets_total ?? 0) },
    { label: "Hot lead", value: String(metrics.hot_leads_returned ?? 0) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-4">
        <div className="space-y-4 min-w-0">
          <Card className="border-violet-200">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-violet-500" />
                  Chief of Staff briefing
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => runChiefMutation.mutate()}
                  disabled={runChiefMutation.isPending}
                  className="min-h-10 bg-violet-600 hover:bg-violet-700"
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${runChiefMutation.isPending ? "animate-spin" : ""}`}
                  />
                  {runChiefMutation.isPending
                    ? "Analisi in corso..."
                    : "Rigenera ora"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {briefsQuery.isLoading ? (
                <Skeleton className="h-40" />
              ) : !latestBrief ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Nessun brief P2 ancora generato. Avvia il Chief of Staff per
                  creare il primo.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                    {metricCards.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-md border bg-muted/30 p-2"
                      >
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {metric.label}
                        </div>
                        <div className="text-sm font-semibold">
                          {metric.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {format(new Date(latestBrief.for_date), "dd MMM yyyy", {
                        locale: it,
                      })}
                    </Badge>
                    {latestBrief.generated_by && (
                      <Badge variant="secondary" className="text-[10px]">
                        {latestBrief.generated_by}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      cost $
                      {Number(latestBrief.generation_cost_usd ?? 0).toFixed(4)}
                    </span>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words">
                    {latestBrief.summary_md}
                  </div>
                  {latestBrief.next_action && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                      <strong>Prossimo passo:</strong> {latestBrief.next_action}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Obiettivi permanenti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {objectivesQuery.isLoading ? (
                <Skeleton className="h-32" />
              ) : objectives.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessun obiettivo attivo.
                </p>
              ) : (
                objectives.map((objective) => (
                  <div
                    key={objective.objective_key}
                    className="rounded-md border p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {objective.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {objective.objective_key}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {objective.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {objective.description}
                    </p>
                    <div className="flex gap-2 flex-wrap text-[10px] text-muted-foreground">
                      {objective.owner_agent_key && (
                        <span>{objective.owner_agent_key}</span>
                      )}
                      {objective.target_metric && (
                        <span>
                          {objective.target_metric}:{" "}
                          {objective.current_value ?? "n/d"}
                        </span>
                      )}
                      <span>{objective.cadence}</span>
                    </div>
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
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Monitor aperti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {monitorEventsQuery.isLoading ? (
                <Skeleton className="h-28" />
              ) : monitorEvents.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nessun monitor aperto.
                </div>
              ) : (
                monitorEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-md border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          event.severity === "critical" ||
                          event.severity === "high"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {event.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {event.summary}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {event.metric_key}: {event.metric_value ?? "n/d"} /
                        soglia {event.threshold_value ?? "n/d"}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          disabled={updateMonitorMutation.isPending}
                          onClick={() =>
                            updateMonitorMutation.mutate({
                              id: event.id,
                              status: "acknowledged",
                            })
                          }
                        >
                          Visto
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-emerald-700"
                          disabled={updateMonitorMutation.isPending}
                          onClick={() =>
                            updateMonitorMutation.mutate({
                              id: event.id,
                              status: "resolved",
                            })
                          }
                        >
                          Risolto
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={launchChiefMissionMutation.isPending}
                          onClick={() =>
                            launchChiefMissionMutation.mutate({
                              title: `Monitor: ${event.title}`,
                              selected_agents: inferAgentsForMetric(
                                event.metric_key,
                              ),
                              objective: [
                                `Analizza e risolvi questo monitor Chief of Staff: ${event.title}.`,
                                `Sintesi: ${event.summary}.`,
                                `Metrica: ${event.metric_key}=${event.metric_value ?? "n/d"}, soglia=${event.threshold_value ?? "n/d"}.`,
                                "Produci cause probabili, rischi, piano P0/P1/P2 e prossima azione verificabile.",
                              ].join("\n"),
                            })
                          }
                        >
                          Missione
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-blue-500" />
                Esperimenti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {experimentsQuery.isLoading ? (
                <Skeleton className="h-32" />
              ) : experiments.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nessun esperimento suggerito.
                </div>
              ) : (
                experiments.map((experiment) => (
                  <div
                    key={experiment.id}
                    className="rounded-md border p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {experiment.priority}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {experiment.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        impatto {experiment.expected_impact} · effort{" "}
                        {experiment.effort}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{experiment.title}</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                      {experiment.hypothesis}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {experiment.owner_agent_key ?? "owner n/d"} ·{" "}
                        {experiment.metric_name ?? "metrica n/d"}
                      </span>
                      {experiment.status === "suggested" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-rose-600"
                            disabled={updateExperimentMutation.isPending}
                            onClick={() =>
                              updateExperimentMutation.mutate({
                                id: experiment.id,
                                status: "rejected",
                              })
                            }
                          >
                            Rifiuta
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                            disabled={updateExperimentMutation.isPending}
                            onClick={() =>
                              updateExperimentMutation.mutate({
                                id: experiment.id,
                                status: "approved",
                              })
                            }
                          >
                            Approva
                          </Button>
                        </div>
                      )}
                      {experiment.status === "approved" && (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          disabled={updateExperimentMutation.isPending}
                          onClick={() =>
                            updateExperimentMutation.mutate({
                              id: experiment.id,
                              status: "running",
                            })
                          }
                        >
                          Avvia
                        </Button>
                      )}
                      {["suggested", "approved", "running"].includes(
                        experiment.status,
                      ) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={launchChiefMissionMutation.isPending}
                          onClick={() =>
                            launchChiefMissionMutation.mutate({
                              title: `Esperimento: ${experiment.title}`,
                              selected_agents: inferAgentsForMetric(
                                experiment.metric_name ??
                                  experiment.objective_key,
                              ),
                              objective: [
                                `Trasforma questo esperimento Chief of Staff in un piano operativo multi-agente: ${experiment.title}.`,
                                `Ipotesi: ${experiment.hypothesis}`,
                                `Obiettivo: ${experiment.objective_key ?? "n/d"}; metrica: ${experiment.metric_name ?? "n/d"}.`,
                                `Impatto atteso: ${experiment.expected_impact}; effort: ${experiment.effort}; confidenza: ${experiment.confidence ?? "n/d"}.`,
                                "Produci step eseguibili, owner, metriche di successo e rischi prima dell'esecuzione.",
                              ].join("\n"),
                            })
                          }
                        >
                          Missione
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── AGENTS TAB ───────────────────────────────────────────────────────────


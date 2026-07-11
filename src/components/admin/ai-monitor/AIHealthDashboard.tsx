/**
 * AIHealthDashboard — health del sistema AI per super_admin
 *
 * Aggrega le 4 view DB esistenti:
 * - v_silvio_agent_mission_health (active, waiting_approval, failed_7d, ...)
 * - v_silvio_agent_performance (per agent: tasks_total, completed, failed)
 * - v_silvio_agent_tool_health (tool_name, calls_7d, failures, latency)
 * - silvio_self_improvement_log (ultime iterazioni learning)
 *
 * Usato da AIMonitorPage tab "Health" per dare un quadro a colpo d'occhio.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertTriangle, CheckCircle2, Clock, Zap } from "lucide-react";

interface MissionHealth {
  active_missions: number;
  waiting_approval_missions: number;
  failed_missions_7d: number;
  missions_7d: number;
  avg_completed_seconds_7d: number;
  total_cost_usd_7d: number;
  total_tokens_7d: number;
}

interface AgentPerf {
  agent_key: string;
  display_name: string;
  enabled: boolean;
  tasks_total: number;
  tasks_completed: number;
  tasks_failed: number;
  avg_seconds: number;
  qa_blocked_count: number;
}

interface ToolHealth {
  tool_name: string;
  total_calls_7d: number;
  failed_calls_7d: number;
  blocked_calls_7d: number;
  avg_duration_ms: number;
  p95_duration_ms: number;
  last_error_message: string | null;
}

// Colonne REALI di silvio_self_improvement_log (migration 20260509090000):
// run_at/ok/duration_ms — prima si leggevano ran_at/status/cost_usd
// (inesistenti) → query in errore 42703 e pannello sempre "vuoto".
interface LearningLog {
  id: string;
  run_at: string;
  ok: boolean;
  gold_added: number;
  avoid_added: number;
  promoted_to_memory: number;
  duration_ms: number | null;
}

export function AIHealthDashboard() {
  const { data: missionHealth, isLoading: loadingMission } = useQuery({
    queryKey: ["ai-health-missions"],
    queryFn: async (): Promise<MissionHealth | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_silvio_agent_mission_health")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
  });

  const { data: agentPerf = [], isLoading: loadingAgents } = useQuery({
    queryKey: ["ai-health-agents"],
    queryFn: async (): Promise<AgentPerf[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_silvio_agent_performance")
        .select("*")
        .order("tasks_total", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentPerf[];
    },
    staleTime: 60 * 1000,
  });

  const { data: toolHealth = [], isLoading: loadingTools } = useQuery({
    queryKey: ["ai-health-tools"],
    queryFn: async (): Promise<ToolHealth[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_silvio_agent_tool_health")
        .select("*")
        .order("total_calls_7d", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ToolHealth[];
    },
    staleTime: 60 * 1000,
  });

  const { data: learning = [], isLoading: loadingLearning } = useQuery({
    queryKey: ["ai-health-learning"],
    queryFn: async (): Promise<LearningLog[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("silvio_self_improvement_log")
        .select("id, run_at, ok, gold_added, avoid_added, promoted_to_memory, duration_ms")
        .order("run_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as LearningLog[];
    },
    staleTime: 60 * 1000,
  });

  return (
    <div className="space-y-4">
      {/* Mission Health KPI */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> Missioni Multi-Agent (ultimi 7 giorni)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMission ? (
            <Skeleton className="h-20 w-full" />
          ) : !missionHealth ? (
            <p className="text-sm text-muted-foreground">Nessun dato disponibile.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-2xl font-bold">{missionHealth.active_missions}</div>
                <div className="text-xs text-muted-foreground">Attive ora</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600">
                  {missionHealth.waiting_approval_missions}
                </div>
                <div className="text-xs text-muted-foreground">In attesa approval</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-rose-600">
                  {missionHealth.failed_missions_7d}/{missionHealth.missions_7d}
                </div>
                <div className="text-xs text-muted-foreground">Failed/total 7gg</div>
              </div>
              <div>
                <div className="text-2xl font-bold">${missionHealth.total_cost_usd_7d?.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">Costo 7gg</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Performance per Agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAgents ? (
            <Skeleton className="h-32 w-full" />
          ) : agentPerf.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun agent ha eseguito task.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Agent</th>
                    <th className="px-3 py-2 text-right">Tasks tot</th>
                    <th className="px-3 py-2 text-right">Done</th>
                    <th className="px-3 py-2 text-right">Failed</th>
                    <th className="px-3 py-2 text-right">QA blocked</th>
                    <th className="px-3 py-2 text-right">Avg sec</th>
                  </tr>
                </thead>
                <tbody>
                  {agentPerf.map((a) => (
                    <tr key={a.agent_key} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">
                        {a.display_name}
                        {!a.enabled ? (
                          <Badge variant="outline" className="ml-2 text-[9px]">disabled</Badge>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">{a.tasks_total}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">{a.tasks_completed}</td>
                      <td className="px-3 py-2 text-right text-rose-600">{a.tasks_failed}</td>
                      <td className="px-3 py-2 text-right text-amber-600">{a.qa_blocked_count}</td>
                      <td className="px-3 py-2 text-right">{a.avg_seconds?.toFixed(0) ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tool health */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" /> Tool Health (top 20 ultimi 7gg)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTools ? (
            <Skeleton className="h-32 w-full" />
          ) : toolHealth.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun tool call recente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Tool</th>
                    <th className="px-3 py-2 text-right">Calls</th>
                    <th className="px-3 py-2 text-right">Failed</th>
                    <th className="px-3 py-2 text-right">Avg ms</th>
                    <th className="px-3 py-2 text-right">P95 ms</th>
                  </tr>
                </thead>
                <tbody>
                  {toolHealth.map((t) => {
                    const failRate = t.total_calls_7d > 0
                      ? (t.failed_calls_7d / t.total_calls_7d) * 100
                      : 0;
                    return (
                      <tr key={t.tool_name} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{t.tool_name}</td>
                        <td className="px-3 py-2 text-right">{t.total_calls_7d}</td>
                        <td className={`px-3 py-2 text-right ${failRate > 10 ? "text-rose-600 font-medium" : ""}`}>
                          {t.failed_calls_7d}
                          {failRate > 0 ? ` (${failRate.toFixed(0)}%)` : ""}
                        </td>
                        <td className="px-3 py-2 text-right">{t.avg_duration_ms?.toFixed(0) ?? "–"}</td>
                        <td className="px-3 py-2 text-right">{t.p95_duration_ms?.toFixed(0) ?? "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Self-learning recent runs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" /> Self-Improvement (ultime 8 run)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLearning ? (
            <Skeleton className="h-24 w-full" />
          ) : learning.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessuna run di self-improvement ancora eseguita.
            </p>
          ) : (
            <div className="space-y-2">
              {learning.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs border-b pb-1">
                  <span className="font-mono">{new Date(l.run_at).toLocaleString("it-IT")}</span>
                  <div className="flex gap-2">
                    <Badge variant="outline" className={l.ok ? "text-emerald-700" : "text-rose-700"}>
                      {l.ok ? "ok" : "errore"}
                    </Badge>
                    <span>+{l.gold_added} gold</span>
                    <span>+{l.avoid_added} avoid</span>
                    <span>↑{l.promoted_to_memory} promoted</span>
                    <span>{l.duration_ms != null ? `${Math.round(l.duration_ms / 1000)}s` : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Note alert */}
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Per dettaglio missioni e gestione coda azioni vai a{" "}
          <a href="/admin/ai-operate" className="underline font-medium">AI Operate</a>.
          Per dettaglio costi azienda-per-azienda vai a{" "}
          <a href="/admin/ai-monitor?tab=usage" className="underline font-medium">AI Monitor → Usage</a>.
        </span>
      </div>
    </div>
  );
}

/**
 * CompanyAICockpit — embedded dentro /admin/aziende/:id come tab.
 *
 * Mostra per il SINGOLO cliente:
 *   - Profilo aggregate (50+ campi customer_profile)
 *   - Health history grafico (ultimi 30 giorni)
 *   - Recent events prodotto (ultimi 20)
 *   - Recent interactions omnichannel (ultimi 10)
 *   - Workflow runs su questo cliente
 *   - Quick actions: trigger Sofia kickoff, Elena health, Tommaso insight manuale
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Activity,
  Mail,
  Brain,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Send,
} from "lucide-react";
import {
  useCustomerProfile,
  useCustomerContext,
  type CustomerProfile,
} from "@/lib/customer-os/customerProfile";
import { healthLabelStyle } from "@/lib/customer-os/healthScore";
import { enqueueWorkflow, type WorkflowKey } from "@/lib/customer-os/workflowRunner";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  companyId: string;
}

interface HealthSnapshot {
  snapshot_date: string;
  health_score: number;
  health_label: string;
}

interface WorkflowRun {
  id: string;
  workflow_key: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  cost_usd: number | null;
  output: Record<string, unknown> | null;
  error_message: string | null;
}

export function CompanyAICockpit({ companyId }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useCustomerProfile(companyId);
  const { data: context, isLoading: contextLoading } = useCustomerContext(companyId);

  // Health history ultimi 30 giorni
  const { data: healthHistory = [] } = useQuery({
    queryKey: ["company-health-history", companyId],
    queryFn: async (): Promise<HealthSnapshot[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data } = await sp
        .from("customer_health_history")
        .select("snapshot_date, health_score, health_label")
        .eq("company_id", companyId)
        .gte("snapshot_date", new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
        .order("snapshot_date", { ascending: true });
      return (data ?? []) as HealthSnapshot[];
    },
    staleTime: 60_000,
  });

  // Workflow runs su questo cliente
  const { data: workflowRuns = [] } = useQuery({
    queryKey: ["company-workflow-runs", companyId],
    queryFn: async (): Promise<WorkflowRun[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data } = await sp
        .from("customer_workflow_runs")
        .select("id, workflow_key, status, started_at, completed_at, cost_usd, output, error_message")
        .eq("company_id", companyId)
        .order("started_at", { ascending: false })
        .limit(15);
      return (data ?? []) as WorkflowRun[];
    },
    staleTime: 30_000,
  });

  const triggerMutation = useMutation({
    mutationFn: async (workflowKey: WorkflowKey) => {
      // Operatore reale nell'audit del workflow (prima era hardcoded "florin").
      const runId = await enqueueWorkflow(workflowKey, companyId, { triggered_manually_by: user?.email ?? user?.id ?? "super_admin" });
      if (!runId) throw new Error("Enqueue failed");
      return runId;
    },
    onSuccess: (runId, key) => {
      toast.success(`Workflow ${key} enqueued`, { description: `Run ID: ${runId.slice(0, 8)}…` });
      qc.invalidateQueries({ queryKey: ["company-workflow-runs", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (profileLoading || contextLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        icon={Brain}
        size="md"
        title="Customer OS non ancora popolato"
        description="Il sistema agentico inizierà a tracciare dati appena gli eventi prodotto fluiscono. Attendere 24h dopo l'attivazione."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Profilo header */}
      <ProfileCard profile={profile} />

      {/* Tabs interne */}
      <Tabs defaultValue="signals" className="space-y-3">
        <TabsList>
          <TabsTrigger value="signals" className="gap-2">
            <Activity className="h-4 w-4" /> Segnali AI
          </TabsTrigger>
          <TabsTrigger value="interactions" className="gap-2">
            <Mail className="h-4 w-4" /> Interazioni
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-2">
            <Zap className="h-4 w-4" /> Eventi prodotto
          </TabsTrigger>
          <TabsTrigger value="workflows" className="gap-2">
            <Brain className="h-4 w-4" /> Workflow Run
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signals" className="space-y-3">
          <HealthHistoryChart history={healthHistory} />
          <QuickActions
            profile={profile}
            onTrigger={(key) => triggerMutation.mutate(key)}
            pending={triggerMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="interactions">
          <RecentInteractions interactions={context?.recent_interactions ?? []} />
        </TabsContent>

        <TabsContent value="events">
          <RecentEvents events={context?.recent_events ?? []} />
        </TabsContent>

        <TabsContent value="workflows">
          <WorkflowRunsList runs={workflowRuns} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function ProfileCard({ profile }: { profile: CustomerProfile }) {
  const style = healthLabelStyle(profile.health_label_latest ?? "engaged");
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-slate-500">Health Score</p>
            <p className="flex items-center gap-2 text-2xl font-bold">
              {profile.health_score_latest ?? "—"}
              <Badge variant="outline" className={`text-xs ${style.bg} ${style.color}`}>
                {style.emoji} {profile.health_label_latest ?? "—"}
              </Badge>
            </p>
            {profile.health_delta_7d !== null && (
              <p className={`text-[11px] ${profile.health_delta_7d >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {profile.health_delta_7d >= 0 ? "+" : ""}{profile.health_delta_7d} ultimi 7gg
              </p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Onboarding</p>
            <p className="text-base font-semibold">{profile.onboarding_phase ?? "—"}</p>
            <p className="text-[11px] text-slate-500">Day {profile.days_since_signup}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Engagement 30gg</p>
            <p className="text-base font-semibold">
              {profile.login_count_30d} login · {profile.features_used_30d_count} feat
            </p>
            <p className="text-[11px] text-slate-500">
              {profile.team_size} utenti team
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Plan</p>
            <p className="text-base font-semibold">{profile.plan_name ?? "—"}</p>
            <p className="text-[11px] text-slate-500">€{profile.plan_price_monthly ?? 0}/mese</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.is_at_risk && (
            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 gap-1">
              <AlertTriangle className="h-3 w-3" /> At-risk
            </Badge>
          )}
          {profile.is_upsell_candidate && (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Upsell candidate
            </Badge>
          )}
          {profile.angry_msgs_30d > 0 && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              {profile.angry_msgs_30d} msg negativi ultimi 30gg
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HealthHistoryChart({ history }: { history: HealthSnapshot[] }) {
  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <EmptyState
            icon={Activity}
            size="sm"
            title="No history yet"
            description="Elena CS popola questo grafico ogni giorno (cron 06:00 UTC)"
          />
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(...history.map((h) => h.health_score), 100);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Health Score · ultimi {history.length} snapshot</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 h-24">
          {history.map((h) => {
            const pct = (h.health_score / max) * 100;
            const style = healthLabelStyle(h.health_label as never);
            return (
              <div
                key={h.snapshot_date}
                className="flex-1 flex flex-col items-center justify-end gap-1"
                title={`${h.snapshot_date}: ${h.health_score} (${h.health_label})`}
              >
                <div
                  className={`w-full rounded-t ${style.bg.replace("border-", "bg-").split(" ")[0]}`}
                  style={{ height: `${pct}%`, minHeight: 4 }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
          <span>{history[0]?.snapshot_date}</span>
          <span>{history[history.length - 1]?.snapshot_date}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickActions({
  profile,
  onTrigger,
  pending,
}: {
  profile: CustomerProfile;
  onTrigger: (key: WorkflowKey) => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Trigger manuale workflow</CardTitle>
        <CardDescription>Forza l'esecuzione di un agent su questo cliente</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTrigger("onboarding.day_7_first_value")}
          disabled={pending || !["kickoff", "first_login", "first_value"].includes(profile.onboarding_phase ?? "")}
          className="justify-start gap-2"
        >
          <Send className="h-4 w-4 text-orange-500" />
          Sofia: email first-value
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTrigger("cs.daily_health_scoring")}
          disabled={pending}
          className="justify-start gap-2"
        >
          <Activity className="h-4 w-4 text-blue-500" />
          Elena: ricalcola health
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTrigger("insight.upsell_signal")}
          disabled={pending || !profile.is_upsell_candidate}
          className="justify-start gap-2"
        >
          <Zap className="h-4 w-4 text-emerald-500" />
          Tommaso: upsell analysis
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onTrigger("sales.proposal_generator")}
          disabled={pending}
          className="justify-start gap-2"
        >
          <Brain className="h-4 w-4 text-violet-500" />
          Marco: genera proposta
        </Button>
      </CardContent>
    </Card>
  );
}

function RecentInteractions({
  interactions,
}: {
  interactions: Array<{
    id: string;
    channel: string;
    direction: string;
    subject: string | null;
    body_preview: string | null;
    sentiment: string | null;
    ai_persona_key: string | null;
    occurred_at: string;
  }>;
}) {
  if (interactions.length === 0) {
    return (
      <Card>
        <CardContent className="p-2">
          <EmptyState icon={Mail} size="sm" title="Nessuna interazione registrata" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        {interactions.map((it) => (
          <div key={it.id} className="border-l-2 border-slate-200 pl-3 py-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] font-mono">
                {it.channel}
              </Badge>
              <span className="text-[10px] text-slate-500">
                {formatDistanceToNow(new Date(it.occurred_at), { addSuffix: true, locale: it })}
              </span>
            </div>
            {it.subject && <p className="text-sm font-medium">{it.subject}</p>}
            {it.body_preview && (
              <p className="text-xs text-slate-600 line-clamp-2">{it.body_preview}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {it.sentiment && it.sentiment !== "unknown" && (
                <Badge
                  variant="outline"
                  className={`text-[9px] ${
                    it.sentiment === "angry" ? "border-rose-200 bg-rose-50 text-rose-700"
                    : it.sentiment === "frustrated" ? "border-amber-200 bg-amber-50 text-amber-700"
                    : it.sentiment === "positive" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200"
                  }`}
                >
                  {it.sentiment}
                </Badge>
              )}
              {it.ai_persona_key && (
                <span className="text-[10px] text-slate-500">via {it.ai_persona_key}</span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentEvents({
  events,
}: {
  events: Array<{
    event_name: string;
    category: string;
    occurred_at: string;
    properties: Record<string, unknown>;
  }>;
}) {
  // Group by category for compactness
  const byCategory = useMemo(() => {
    const m = new Map<string, typeof events>();
    for (const e of events) {
      const arr = m.get(e.category) ?? [];
      arr.push(e);
      m.set(e.category, arr);
    }
    return Array.from(m.entries());
  }, [events]);

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-2">
          <EmptyState
            icon={Zap}
            size="sm"
            title="Nessun evento tracciato"
            description="Tommaso popolerà ogni giorno (cron 07:00 UTC)"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {byCategory.map(([cat, evts]) => (
        <Card key={cat}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm capitalize">{cat} ({evts.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ul className="space-y-1 text-xs">
              {evts.slice(0, 5).map((e, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="font-mono text-slate-700 truncate">{e.event_name}</span>
                  <span className="text-slate-500 shrink-0">
                    {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: false, locale: it })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function WorkflowRunsList({ runs }: { runs: WorkflowRun[] }) {
  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="p-2">
          <EmptyState
            icon={Brain}
            size="sm"
            title="Nessun workflow run su questo cliente"
            description="I primi workflow scattano automaticamente via cron o eventi"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        {runs.map((r) => (
          <div key={r.id} className="flex items-start gap-2 border-l-2 border-slate-200 pl-3 py-1">
            <Badge
              variant="outline"
              className={`text-[10px] mt-0.5 ${
                r.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : r.status === "failed" ? "border-rose-200 bg-rose-50 text-rose-700"
                : r.status === "running" ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200"
              }`}
            >
              {r.status}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-mono">{r.workflow_key}</p>
              <p className="text-[10px] text-slate-500">
                {format(new Date(r.started_at), "dd MMM HH:mm", { locale: it })}
                {r.cost_usd !== null && ` · $${Number(r.cost_usd).toFixed(4)}`}
              </p>
              {r.error_message && (
                <p className="text-[11px] text-rose-600 mt-1">⚠ {r.error_message}</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

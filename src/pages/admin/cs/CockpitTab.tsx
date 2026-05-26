/**
 * CockpitTab — Founder Cockpit per Customer OS.
 *
 * 1-screen dashboard che Florin apre la mattina (5 min lettura):
 *   - Daily brief Beatrice (KPI + headline)
 *   - At-risk customers (action richiesta)
 *   - Upsell opportunities (settimanali)
 *   - Onboarding stalled (Sofia segnala)
 *   - Action queue (cosa approvare)
 *   - Workflow stats (sistema in salute?)
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertTriangle,
  TrendingUp,
  Heart,
  Sparkles,
  Clock,
  CheckCircle2,
  RefreshCw,
  ArrowUpRight,
  Building2,
  Brain,
} from "lucide-react";
import { useCustomerProfiles, healthLabelStyle, type CustomerProfile } from "@/lib/customer-os/customerProfile";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
}

interface WorkflowStat {
  workflow_key: string;
  run_date: string;
  total_runs: number;
  completed: number;
  failed: number;
  awaiting: number;
  total_cost_usd: number | null;
}

export function CockpitTab() {
  // ─── 1) Latest daily brief Beatrice ─────────────────────────────────
  const { data: latestBrief, refetch: refetchBrief } = useQuery({
    queryKey: ["cockpit-latest-brief"],
    queryFn: async (): Promise<NotificationRow | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data } = await sp
        .from("notifications")
        .select("*")
        .eq("type", "daily_brief")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as NotificationRow | null;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  // ─── 2) At-risk customers ───────────────────────────────────────────
  const { data: atRiskCustomers = [], isLoading: atRiskLoading } = useCustomerProfiles({
    atRisk: true,
    limit: 8,
  });

  // ─── 3) Upsell candidates ────────────────────────────────────────────
  const { data: upsellCandidates = [], isLoading: upsellLoading } = useCustomerProfiles({
    upsellCandidate: true,
    limit: 5,
  });

  // ─── 4) Onboarding stalled ──────────────────────────────────────────
  const { data: stalledOnboarding = [], isLoading: stalledLoading } = useCustomerProfiles({
    onboardingPhase: "stalled",
    limit: 5,
  });

  // ─── 5) Action queue pending ────────────────────────────────────────
  const { data: pendingActions = [] } = useQuery({
    queryKey: ["cockpit-pending-actions"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data } = await sp
        .from("silvio_pending_approvals")
        .select("id, preview_md, expires_at, created_at, action_type, risk_level")
        .eq("status", "awaiting")
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as Array<{
        id: string;
        preview_md: string;
        expires_at: string;
        created_at: string;
        action_type: string | null;
        risk_level: string | null;
      }>;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // ─── 6) Recent workflow runs (system health) ────────────────────────
  const { data: workflowStats = [] } = useQuery({
    queryKey: ["cockpit-workflow-stats"],
    queryFn: async (): Promise<WorkflowStat[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data } = await sp
        .from("customer_workflow_daily_stats")
        .select("*")
        .gte("run_date", new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10))
        .order("run_date", { ascending: false });
      return (data ?? []) as WorkflowStat[];
    },
    staleTime: 5 * 60_000,
  });

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return workflowStats.filter((s) => s.run_date === today);
  }, [workflowStats]);

  const totalCostToday = useMemo(
    () => todayStats.reduce((sum, s) => sum + (Number(s.total_cost_usd) || 0), 0),
    [todayStats],
  );

  const totalRunsToday = useMemo(
    () => todayStats.reduce((sum, s) => sum + s.total_runs, 0),
    [todayStats],
  );

  const totalFailedToday = useMemo(
    () => todayStats.reduce((sum, s) => sum + s.failed, 0),
    [todayStats],
  );

  return (
    <div className="space-y-4">
      {/* Daily Brief Beatrice */}
      <Card className="border-orange-200 bg-gradient-to-br from-orange-50/60 via-white to-amber-50/40">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-orange-500" />
              Daily Brief — Beatrice CFO
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetchBrief()} className="h-7">
              <RefreshCw className="h-3 w-3 mr-1" /> Aggiorna
            </Button>
          </div>
          <CardDescription>
            Sintesi KPI e azioni prioritarie · cron 06:30 UTC
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!latestBrief ? (
            <EmptyState
              icon={Brain}
              size="sm"
              title="Beatrice non ha ancora generato il primo brief"
              description="Il primo brief arriverà domani mattina alle 06:30, oppure trigger manuale workflow"
            />
          ) : (
            <BriefDisplay brief={latestBrief} />
          )}
        </CardContent>
      </Card>

      {/* Grid 2-col: At-risk + Upsell */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* At-risk */}
        <Card className="border-rose-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              Clienti at-risk ({atRiskCustomers.length})
            </CardTitle>
            <CardDescription>Salute deteriorata · richiede intervento Florin</CardDescription>
          </CardHeader>
          <CardContent>
            {atRiskLoading ? (
              <Skeleton className="h-32" />
            ) : atRiskCustomers.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                tone="success"
                size="sm"
                title="Nessun cliente at-risk"
                description="Tutti i clienti sono engaged"
              />
            ) : (
              <div className="space-y-2">
                {atRiskCustomers.map((c) => <AtRiskRow key={c.company_id} customer={c} />)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upsell candidates */}
        <Card className="border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Upsell opportunità ({upsellCandidates.length})
            </CardTitle>
            <CardDescription>Tommaso ha identificato potential upgrade</CardDescription>
          </CardHeader>
          <CardContent>
            {upsellLoading ? (
              <Skeleton className="h-32" />
            ) : upsellCandidates.length === 0 ? (
              <EmptyState
                icon={Heart}
                size="sm"
                title="Nessun upsell candidate al momento"
              />
            ) : (
              <div className="space-y-2">
                {upsellCandidates.map((c) => <UpsellRow key={c.company_id} customer={c} />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Onboarding stalled */}
      {!stalledLoading && stalledOnboarding.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-amber-500" />
              Onboarding stalled ({stalledOnboarding.length})
            </CardTitle>
            <CardDescription>Sofia ha rilevato blocco onboarding · email recovery in coda</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stalledOnboarding.map((c) => <StalledRow key={c.company_id} customer={c} />)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action queue + system health */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-blue-500" />
              Approva ({pendingActions.length} in coda)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingActions.length === 0 ? (
              <EmptyState icon={CheckCircle2} tone="success" size="sm" title="Coda vuota — sistema in pari" />
            ) : (
              <div className="space-y-1">
                {pendingActions.slice(0, 5).map((a) => (
                  <Link
                    key={a.id}
                    to={`/admin/ai?tab=approvals`}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {a.action_type ?? "?"}
                    </Badge>
                    <span className="flex-1 truncate text-xs text-slate-700">
                      {a.preview_md?.slice(0, 80)}
                    </span>
                    <ArrowUpRight className="h-3 w-3 text-slate-400 shrink-0" />
                  </Link>
                ))}
                {pendingActions.length > 5 && (
                  <Link
                    to="/admin/ai?tab=approvals"
                    className="block text-center text-xs text-blue-600 hover:underline py-1"
                  >
                    Vedi tutti ({pendingActions.length})
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System health */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sistema agentico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Run oggi</span>
              <span className="font-semibold text-slate-900">{totalRunsToday}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Failed oggi</span>
              <span className={totalFailedToday > 0 ? "font-semibold text-rose-600" : "font-semibold text-slate-900"}>
                {totalFailedToday}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Cost AI oggi</span>
              <span className="font-semibold text-slate-900">${totalCostToday.toFixed(2)}</span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100">
              <Link
                to="/admin/ai?section=monitor"
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Dettagli monitor
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function BriefDisplay({ brief }: { brief: NotificationRow }) {
  // body è JSON.stringify dell'ai_brief
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(brief.body);
  } catch {
    // body non parsabile, mostralo grezzo
  }

  const generatedAt = formatDistanceToNow(new Date(brief.created_at), { addSuffix: true, locale: it });

  if (!parsed) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-500">{generatedAt}</p>
        <pre className="text-xs bg-slate-50 p-3 rounded whitespace-pre-wrap">{brief.body}</pre>
      </div>
    );
  }

  const mrr = parsed.mrr_status as Record<string, unknown> | undefined;
  const anomalies = (parsed.anomalies as Array<Record<string, unknown>>) ?? [];
  const actions = (parsed.actions_for_florin as string[]) ?? [];

  return (
    <div className="space-y-3">
      <p className="text-base font-semibold text-slate-900">{parsed.headline as string}</p>
      <p className="text-xs text-slate-500">{generatedAt}</p>

      {mrr && (
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <p className="text-[10px] uppercase text-slate-500">MRR</p>
            <p className="font-bold text-slate-900">€{Number(mrr.current).toLocaleString("it-IT")}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <p className="text-[10px] uppercase text-slate-500">Δ 24h</p>
            <p className={cn("font-bold", Number(mrr.delta_24h_eur) >= 0 ? "text-emerald-600" : "text-rose-600")}>
              {Number(mrr.delta_24h_eur) >= 0 ? "+" : ""}€{Number(mrr.delta_24h_eur).toLocaleString("it-IT")}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <p className="text-[10px] uppercase text-slate-500">Δ 7gg</p>
            <p className={cn("font-bold", Number(mrr.delta_7d_pct) >= 0 ? "text-emerald-600" : "text-rose-600")}>
              {Number(mrr.delta_7d_pct) >= 0 ? "+" : ""}{Number(mrr.delta_7d_pct).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {anomalies.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Anomalie</p>
          <ul className="space-y-1">
            {anomalies.map((a, idx) => (
              <li key={idx} className="text-sm flex items-start gap-2">
                <Badge variant="outline" className={
                  a.concern_level === "high" ? "border-rose-200 bg-rose-50 text-rose-700"
                  : a.concern_level === "medium" ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200"
                }>
                  {a.concern_level as string}
                </Badge>
                <span className="text-slate-700">
                  <strong>{a.metric as string}</strong>: {a.value as string}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Azioni per te</p>
          <ul className="space-y-1">
            {actions.map((act, idx) => (
              <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="text-orange-500">→</span>
                <span>{act}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AtRiskRow({ customer }: { customer: CustomerProfile }) {
  const style = healthLabelStyle(customer.health_label_latest ?? "at_risk");
  return (
    <Link
      to={`/admin/aziende/${customer.company_id}`}
      className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2 hover:border-rose-300 hover:bg-rose-50/40 transition"
    >
      <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 truncate">{customer.name}</p>
        <p className="text-[11px] text-slate-500">
          Score {customer.health_score_latest ?? "?"} · {customer.plan_name ?? "—"} · €{customer.plan_price_monthly ?? 0}/mese
        </p>
      </div>
      <Badge variant="outline" className={cn("text-[10px] shrink-0", style.bg, style.color)}>
        {style.emoji} {customer.health_label_latest}
      </Badge>
    </Link>
  );
}

function UpsellRow({ customer }: { customer: CustomerProfile }) {
  return (
    <Link
      to={`/admin/aziende/${customer.company_id}`}
      className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2 hover:border-emerald-300 hover:bg-emerald-50/40 transition"
    >
      <Sparkles className="h-4 w-4 text-emerald-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 truncate">{customer.name}</p>
        <p className="text-[11px] text-slate-500">
          {customer.plan_name ?? "—"} · {customer.login_count_30d} login/30gg · {customer.team_size} utenti
        </p>
      </div>
    </Link>
  );
}

function StalledRow({ customer }: { customer: CustomerProfile }) {
  return (
    <Link
      to={`/admin/aziende/${customer.company_id}`}
      className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50/30 p-2 hover:bg-amber-50/60 transition"
    >
      <Clock className="h-4 w-4 text-amber-600 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 truncate">{customer.name}</p>
        <p className="text-[11px] text-slate-600">
          Day {customer.days_since_signup} · {customer.login_count_30d} login 30gg · phase {customer.onboarding_phase}
        </p>
      </div>
    </Link>
  );
}

// Inline cn helper (per non importare se non già)
function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

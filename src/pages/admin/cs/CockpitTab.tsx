/**
 * CockpitTab — Founder Cockpit per Customer OS.
 *
 * 1-screen dashboard che Florin apre la mattina (5 min lettura):
 *   - KPI portafoglio (clienti, MRR, MRR a rischio)
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
import { cn } from "@/lib/utils";
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
  Euro,
  Users,
} from "lucide-react";
import { useCustomerProfiles, type CustomerProfile } from "@/lib/customer-os/customerProfile";
import { healthLabelStyle } from "@/lib/customer-os/healthScore";
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

// Data LOCALE in formato YYYY-MM-DD (convenzione repo: mai toISOString().slice
// per le date — sposta il giorno vicino a mezzanotte col fuso Europe/Rome).
const localDay = (d: Date) => d.toLocaleDateString("en-CA");

export function CockpitTab() {
  // ─── 0) KPI portafoglio: una sola lettura minimale della view (poche
  // centinaia di clienti) → conteggi ESATTI + somme MRR. Le card sotto usano
  // questi totali, non la lunghezza delle liste troncate dal limit.
  const { data: portfolio } = useQuery({
    queryKey: ["cockpit-portfolio-kpi"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data, error } = await sp
        .from("customer_profile")
        .select("company_id, plan_price_monthly, is_at_risk, is_upsell_candidate, health_label_latest, company_status")
        .limit(5000);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        plan_price_monthly: number | null; is_at_risk: boolean; is_upsell_candidate: boolean;
        health_label_latest: string | null; company_status: string;
      }>;
      const mrr = (r: { plan_price_monthly: number | null }) => Number(r.plan_price_monthly) || 0;
      return {
        total: rows.length,
        mrrTotal: rows.reduce((s, r) => s + mrr(r), 0),
        atRisk: rows.filter((r) => r.is_at_risk).length,
        mrrAtRisk: rows.filter((r) => r.is_at_risk).reduce((s, r) => s + mrr(r), 0),
        upsell: rows.filter((r) => r.is_upsell_candidate).length,
        champions: rows.filter((r) => r.health_label_latest === "champion" || r.health_label_latest === "engaged").length,
        scored: rows.filter((r) => r.health_label_latest != null).length,
      };
    },
    staleTime: 5 * 60_000,
  });

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
        .gte("run_date", localDay(new Date(Date.now() - 7 * 86_400_000)))
        .order("run_date", { ascending: false });
      return (data ?? []) as WorkflowStat[];
    },
    staleTime: 5 * 60_000,
  });

  const todayStats = useMemo(() => {
    const today = localDay(new Date());
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

  const fmtEur = (n: number) => `€${Math.round(n).toLocaleString("it-IT")}`;

  return (
    <div className="space-y-4">
      {/* KPI portafoglio */}
      {portfolio && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Clienti", value: String(portfolio.total), icon: Users, cls: "" },
            { label: "MRR", value: fmtEur(portfolio.mrrTotal), icon: Euro, cls: "" },
            { label: "At-risk", value: String(portfolio.atRisk), icon: AlertTriangle, cls: portfolio.atRisk > 0 ? "text-rose-600 dark:text-rose-400" : "" },
            { label: "MRR a rischio", value: fmtEur(portfolio.mrrAtRisk), icon: Euro, cls: portfolio.mrrAtRisk > 0 ? "text-rose-600 dark:text-rose-400" : "" },
            { label: "Sani (champion+engaged)", value: `${portfolio.champions}${portfolio.scored ? `/${portfolio.scored}` : ""}`, icon: Heart, cls: "text-emerald-600 dark:text-emerald-400" },
          ].map((k) => {
            const Icon = k.icon;
            return (
              <Card key={k.label}>
                <CardContent className="flex items-center gap-2.5 p-3">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className={cn("text-lg font-bold leading-none truncate", k.cls)}>{k.value}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{k.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Daily Brief Beatrice */}
      <Card className="border-orange-200 bg-gradient-to-br from-orange-50/60 via-background to-amber-50/40 dark:border-orange-900/60 dark:from-orange-950/30 dark:via-background dark:to-amber-950/20">
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
        <Card className="border-rose-200 dark:border-rose-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              Clienti at-risk ({portfolio?.atRisk ?? atRiskCustomers.length})
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
                {(portfolio?.atRisk ?? 0) > atRiskCustomers.length && (
                  <p className="text-center text-[11px] text-muted-foreground pt-1">
                    Mostrati i primi {atRiskCustomers.length} di {portfolio?.atRisk} — vedi tab Lifecycle per l'elenco completo
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upsell candidates */}
        <Card className="border-emerald-200 dark:border-emerald-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Upsell opportunità ({portfolio?.upsell ?? upsellCandidates.length})
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
        <Card className="border-amber-200 dark:border-amber-900/60">
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
                    className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm transition hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-800 dark:hover:bg-blue-950/40"
                  >
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {a.action_type ?? "?"}
                    </Badge>
                    <span className="flex-1 truncate text-xs text-foreground/80">
                      {a.preview_md?.slice(0, 80)}
                    </span>
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </Link>
                ))}
                {pendingActions.length > 5 && (
                  <Link
                    to="/admin/ai?tab=approvals"
                    className="block text-center text-xs text-primary hover:underline py-1"
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
              <span className="text-muted-foreground">Run oggi</span>
              <span className="font-semibold text-foreground">{totalRunsToday}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Failed oggi</span>
              <span className={totalFailedToday > 0 ? "font-semibold text-rose-600 dark:text-rose-400" : "font-semibold text-foreground"}>
                {totalFailedToday}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cost AI oggi</span>
              <span className="font-semibold text-foreground">${totalCostToday.toFixed(2)}</span>
            </div>
            <div className="mt-2 pt-2 border-t">
              <Link
                to="/admin/ai?section=monitor"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
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
        <p className="text-xs text-muted-foreground">{generatedAt}</p>
        <pre className="text-xs bg-muted/50 p-3 rounded whitespace-pre-wrap">{brief.body}</pre>
      </div>
    );
  }

  const mrr = parsed.mrr_status as Record<string, unknown> | undefined;
  const anomalies = (parsed.anomalies as Array<Record<string, unknown>>) ?? [];
  const actions = (parsed.actions_for_florin as string[]) ?? [];

  return (
    <div className="space-y-3">
      <p className="text-base font-semibold text-foreground">{parsed.headline as string}</p>
      <p className="text-xs text-muted-foreground">{generatedAt}</p>

      {mrr && (
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border bg-card p-2">
            <p className="text-[10px] uppercase text-muted-foreground">MRR</p>
            <p className="font-bold text-foreground">€{Number(mrr.current).toLocaleString("it-IT")}</p>
          </div>
          <div className="rounded-md border bg-card p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Δ 24h</p>
            <p className={cn("font-bold", Number(mrr.delta_24h_eur) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {Number(mrr.delta_24h_eur) >= 0 ? "+" : ""}€{Number(mrr.delta_24h_eur).toLocaleString("it-IT")}
            </p>
          </div>
          <div className="rounded-md border bg-card p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Δ 7gg</p>
            <p className={cn("font-bold", Number(mrr.delta_7d_pct) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {Number(mrr.delta_7d_pct) >= 0 ? "+" : ""}{Number(mrr.delta_7d_pct).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {anomalies.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Anomalie</p>
          <ul className="space-y-1">
            {anomalies.map((a, idx) => (
              <li key={idx} className="text-sm flex items-start gap-2">
                <Badge variant="outline" className={
                  a.concern_level === "high" ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
                  : a.concern_level === "medium" ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                  : ""
                }>
                  {a.concern_level as string}
                </Badge>
                <span className="text-foreground/80">
                  <strong>{a.metric as string}</strong>: {a.value as string}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Azioni per te</p>
          <ul className="space-y-1">
            {actions.map((act, idx) => (
              <li key={idx} className="text-sm text-foreground/80 flex items-start gap-2">
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
      className="flex items-center gap-3 rounded-md border bg-card p-2 hover:border-rose-300 hover:bg-rose-50/40 dark:hover:border-rose-800 dark:hover:bg-rose-950/30 transition"
    >
      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{customer.name}</p>
        <p className="text-[11px] text-muted-foreground">
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
      className="flex items-center gap-3 rounded-md border bg-card p-2 hover:border-emerald-300 hover:bg-emerald-50/40 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30 transition"
    >
      <Sparkles className="h-4 w-4 text-emerald-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{customer.name}</p>
        <p className="text-[11px] text-muted-foreground">
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
      className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50/30 p-2 hover:bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 transition"
    >
      <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{customer.name}</p>
        <p className="text-[11px] text-muted-foreground">
          Day {customer.days_since_signup} · {customer.login_count_30d} login 30gg · phase {customer.onboarding_phase}
        </p>
      </div>
    </Link>
  );
}

import { cockpitPortfolio, type CockpitProfile } from "@/lib/customer-os/cockpitPortfolio";
import type { AdminRevenueCompanyLike } from "@/lib/adminRevenue";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerSuccessDetails, CustomerSuccessSectionHeader } from "@/components/admin/support/CustomerSuccessSection";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Sparkles,
  Clock,
  CheckCircle2,
  RefreshCw,
  ArrowUpRight,
  Building2,
  type LucideIcon,
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
const fmtUsd = new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD" });

export function CockpitTab() {
  const { permissions } = useSuperAdminPermissions();
  // ─── 0) KPI portafoglio: una sola lettura minimale della view (poche
  // centinaia di clienti) → conteggi ESATTI + somme MRR. Le card sotto usano
  // questi totali, non la lunghezza delle liste troncate dal limit.
  const { data: portfolio, isError: portfolioError } = useQuery({
    queryKey: ["cockpit-portfolio-kpi", "paying-v2"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const [profiles, companies] = await Promise.all([
        sp.from("customer_profile")
          .select("company_id,is_at_risk,is_upsell_candidate,health_label_latest")
          .limit(5000),
        supabase.from("companies")
          .select("id,status,payment_method,stripe_customer_id,stripe_subscription_status,is_platform_admin_company,subscription_plans:subscription_plan_id(price_monthly,price_yearly),company_subscriptions(status,stripe_subscription_id,billing_period)")
          .eq("is_platform_admin_company", false),
      ]);
      if (profiles.error) throw profiles.error;
      if (companies.error) throw companies.error;
      return cockpitPortfolio((profiles.data ?? []) as CockpitProfile[], (companies.data ?? []) as AdminRevenueCompanyLike[]);
    },
    staleTime: 5 * 60_000,
  });

  // ─── 1) Latest daily brief Beatrice ─────────────────────────────────
  const briefQuery = useQuery({
    queryKey: ["cockpit-latest-brief"],
    queryFn: async (): Promise<NotificationRow | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data, error } = await sp
        .from("notifications")
        .select("*")
        .eq("type", "daily_brief")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as NotificationRow | null;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  // ─── 2) At-risk customers ───────────────────────────────────────────
  const atRisk = useCustomerProfiles({
    atRisk: true,
    limit: 5,
  });

  // ─── 3) Upsell candidates ────────────────────────────────────────────
  const upsell = useCustomerProfiles({
    upsellCandidate: true,
    limit: 5,
  });

  // ─── 4) Onboarding stalled ──────────────────────────────────────────
  const stalled = useCustomerProfiles({
    onboardingPhase: "stalled",
    limit: 5,
  });

  // ─── 5) Action queue pending ────────────────────────────────────────
  const approvals = useQuery({
    queryKey: ["cockpit-pending-actions"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data, error } = await sp
        .from("silvio_pending_approvals")
        .select("id, preview_md")
        .eq("status", "awaiting")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; preview_md: string | null }>;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    enabled: permissions.super_admin,
  });

  // ─── 6) Recent workflow runs (system health) ────────────────────────
  const workflowQuery = useQuery({
    queryKey: ["cockpit-workflow-stats"],
    queryFn: async (): Promise<WorkflowStat[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data, error } = await sp
        .from("customer_workflow_daily_stats")
        .select("*")
        .gte("run_date", localDay(new Date(Date.now() - 7 * 86_400_000)))
        .order("run_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkflowStat[];
    },
    staleTime: 5 * 60_000,
    enabled: permissions.super_admin,
  });

  const atRiskCustomers = atRisk.data ?? [];
  const upsellCandidates = upsell.data ?? [];
  const stalledOnboarding = stalled.data ?? [];
  const pendingActions = approvals.data ?? [];
  const workflowStats = workflowQuery.data;
  const todayStats = useMemo(() => {
    const today = localDay(new Date());
    return (workflowStats ?? []).filter((s) => s.run_date === today);
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
    <div className="space-y-3">
      <CustomerSuccessSectionHeader
        title="Priorità clienti"
        description="Le segnalazioni dell’AI ti aiutano a capire chi ricontattare, chi ha bisogno di aiuto e quali proposte verificare."
        actions={permissions.can_manage_tickets && (
          <Button variant="outline" size="sm" asChild><Link to="/admin/cs">Vai ai ticket</Link></Button>
        )}
      />

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <PriorityCard title="Clienti a rischio" description="Controlla l’attività dell’azienda prima di ricontattarla." icon={AlertTriangle}>
          {atRisk.isLoading ? <Skeleton className="h-24" /> : atRisk.isError ? (
            <p role="alert" className="text-sm text-muted-foreground">Segnalazioni di rischio non disponibili.</p>
          ) : atRiskCustomers.length ? (
            <>
              {atRiskCustomers.map((customer) => <AtRiskRow key={customer.company_id} customer={customer} canOpen={permissions.super_admin} />)}
              {(portfolio?.atRisk ?? 0) > atRiskCustomers.length && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                  <span>Mostrati {atRiskCustomers.length} di {portfolio?.atRisk} clienti segnalati</span>
                  {permissions.impersonation && <Link to="/admin/cs?tab=dashboard" className="font-medium text-primary hover:underline">Apri indicatori</Link>}
                </div>
              )}
            </>
          ) : <p className="text-sm text-muted-foreground">Nessun cliente segnalato.</p>}
        </PriorityCard>

        <div className="space-y-3">
          {permissions.super_admin && (
            <PriorityCard
              title="Azioni da approvare"
              description="Apri le proposte per verificarne il contenuto prima di approvarle."
              icon={CheckCircle2}
              action={<Button size="sm" variant="outline" asChild><Link to="/admin/ai?tab=approvals">Apri approvazioni</Link></Button>}
            >
              {approvals.isLoading ? <Skeleton className="h-14" /> : approvals.isError ? (
                <p role="alert" className="text-sm text-muted-foreground">Approvazioni non disponibili.</p>
              ) : pendingActions.length ? pendingActions.slice(0, 4).map((action) => (
                <Link key={action.id} to="/admin/ai?tab=approvals" className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm hover:bg-muted/50">
                  <span className="min-w-0 truncate">{action.preview_md?.trim() || "Proposta da verificare"}</span>
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              )) : <p className="text-sm text-muted-foreground">Nessuna azione in attesa.</p>}
            </PriorityCard>
          )}

          <PriorityCard title="Avviamenti da seguire" description="Aziende che hanno bisogno di aiuto per iniziare." icon={Clock}>
            {stalled.isLoading ? <Skeleton className="h-14" /> : stalled.isError ? (
              <p role="alert" className="text-sm text-muted-foreground">Avviamenti non disponibili.</p>
            ) : stalledOnboarding.length ? (
              stalledOnboarding.map((customer) => <StalledRow key={customer.company_id} customer={customer} canOpen={permissions.super_admin} />)
            ) : <p className="text-sm text-muted-foreground">Nessun avviamento segnalato.</p>}
          </PriorityCard>
        </div>
      </div>

      <PriorityCard
        title="Riepilogo del giorno"
        icon={Sparkles}
        action={
          <Button variant="ghost" size="sm" onClick={() => void briefQuery.refetch()} disabled={briefQuery.isFetching}>
            <RefreshCw aria-hidden="true" className={cn("mr-1 h-3.5 w-3.5", briefQuery.isFetching && "animate-spin")} /> Aggiorna
          </Button>
        }
      >
        {briefQuery.isLoading ? <Skeleton className="h-14" /> : briefQuery.isError ? (
          <p role="alert" className="text-sm text-muted-foreground">Impossibile caricare il riepilogo.</p>
        ) : briefQuery.data ? (
          <BriefDisplay brief={briefQuery.data} />
        ) : <p className="text-sm text-muted-foreground">Riepilogo del giorno non ancora disponibile.</p>}
      </PriorityCard>

      <CustomerSuccessDetails label="Possibili passaggi di piano">
        {upsell.isLoading ? <Skeleton className="h-14" /> : upsell.isError ? (
          <p role="alert" className="text-sm text-muted-foreground">Suggerimenti sui piani non disponibili.</p>
        ) : upsellCandidates.length ? (
          <div className="space-y-2">{upsellCandidates.map((customer) => <UpsellRow key={customer.company_id} customer={customer} canOpen={permissions.super_admin} />)}</div>
        ) : <p className="text-sm text-muted-foreground">Nessuna azienda da valutare al momento.</p>}
      </CustomerSuccessDetails>

      <CustomerSuccessDetails label="Dati del portafoglio e attività AI">
        {portfolioError && <p role="alert" className="mb-3 text-sm text-muted-foreground">Dati del portafoglio non disponibili.</p>}
        {portfolio && (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {[
              ["Clienti", portfolio.total],
              ["Ricavi ricorrenti mensili", fmtEur(portfolio.mrrTotal)],
              ["Clienti segnalati", portfolio.atRisk],
              ["Ricavi mensili a rischio", fmtEur(portfolio.mrrAtRisk)],
              ["Clienti coinvolti", portfolio.scored ? portfolio.champions + "/" + portfolio.scored : "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card px-3 py-2.5">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {permissions.super_admin && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            {workflowQuery.isLoading ? <Skeleton className="h-5 w-52" /> : workflowQuery.isError ? (
              <p role="alert">Attività AI non disponibile.</p>
            ) : (
              <p>Oggi · {totalRunsToday} esecuzioni · {totalFailedToday} errori · {fmtUsd.format(totalCostToday)}</p>
            )}
            <Link to="/admin/ai?section=monitor" className="font-medium text-primary hover:underline">Apri monitor AI</Link>
          </div>
        )}
      </CustomerSuccessDetails>
    </div>
  );
}

function PriorityCard({ title, description, icon: Icon, action, children }: {
  title: string;
  description?: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
            {title}
          </h3>
          {action}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">{children}</CardContent>
    </Card>
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

function CustomerRow({ companyId, canOpen, children }: { companyId: string; canOpen: boolean; children: ReactNode }) {
  const className = "flex items-center gap-2.5 rounded-lg border bg-card p-2.5";
  if (!canOpen) return <div className={className}>{children}</div>;
  return (
    <Link to={`/admin/aziende/${companyId}`} className={cn(className, "transition-colors hover:border-primary/40 hover:bg-muted/30")}>
      {children}
      <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

interface CustomerRowProps {
  customer: CustomerProfile;
  canOpen: boolean;
}

function AtRiskRow({ customer, canOpen }: CustomerRowProps) {
  const style = healthLabelStyle(customer.health_label_latest ?? "at_risk");
  return (
    <CustomerRow companyId={customer.company_id} canOpen={canOpen}>
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{customer.name}</p>
        <p className="text-xs text-muted-foreground">
          Punteggio {customer.health_score_latest ?? "—"} · {customer.plan_name ?? "Piano non indicato"}
        </p>
      </div>
      <Badge variant="outline" className={cn("shrink-0 text-[10px]", style.bg, style.color)}>
        {customer.health_label_latest === "churned" ? "Cliente perso" : "Da seguire"}
      </Badge>
    </CustomerRow>
  );
}

function UpsellRow({ customer, canOpen }: CustomerRowProps) {
  return (
    <CustomerRow companyId={customer.company_id} canOpen={canOpen}>
      <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{customer.name}</p>
        <p className="text-xs text-muted-foreground">
          {customer.plan_name ?? "—"} · {customer.login_count_30d} {customer.login_count_30d === 1 ? "accesso" : "accessi"} in 30 giorni
        </p>
      </div>
    </CustomerRow>
  );
}

function StalledRow({ customer, canOpen }: CustomerRowProps) {
  return (
    <CustomerRow companyId={customer.company_id} canOpen={canOpen}>
      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{customer.name}</p>
        <p className="text-xs text-muted-foreground">
          Iscritta da {customer.days_since_signup} {customer.days_since_signup === 1 ? "giorno" : "giorni"} · {customer.login_count_30d} {customer.login_count_30d === 1 ? "accesso" : "accessi"} in 30 giorni
        </p>
      </div>
    </CustomerRow>
  );
}

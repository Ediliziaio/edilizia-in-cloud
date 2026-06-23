/**
 * AdminMarketingCommercialDashboard — la "vera" Dashboard commerciale B2B del CRM.
 *
 * Distinta da Outreach (/admin/marketing): qui la lettura è commerciale —
 * pipeline, scoring/temperatura, conversioni, team, revenue, segmentazione
 * (mestiere/zona/azienda/decision maker) e alert. Dati live dal CRM marketing
 * admin (PLATFORM_ADMIN_COMPANY_ID), nessuna migrazione: aggregazioni
 * client-side con cap, sullo stesso pattern di OutreachPipelineAnalytics.
 *
 * Costruzione incrementale: questa è la fondazione (filtri + KPI + pipeline).
 * Le sezioni successive (torte, fonti/ROI, cluster, Aziende, team, alert, AI)
 * si agganciano allo stesso companyId + periodo.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendingUp, TrendingDown, Layers, Target, Trophy, UserPlus, Flame, Loader2, BarChart3,
} from "lucide-react";
import { CrmTemperatureCard, CrmWinLossCard } from "@/components/admin/crm-dashboard/CrmSegmentDonuts";
import { CrmFunnelCard, CrmChannelsCard, CrmClustersCard } from "@/components/admin/crm-dashboard/CrmSegmentBars";
import { CrmAccountsCard, CrmTeamCard, CrmAlertsCard } from "@/components/admin/crm-dashboard/CrmAccountsTeamAlerts";

type PeriodKey = "7" | "30" | "90" | "365";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "7", label: "7 giorni" },
  { key: "30", label: "30 giorni" },
  { key: "90", label: "90 giorni" },
  { key: "365", label: "12 mesi" },
];

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    Math.round(n || 0),
  );
const eurCompact = (n: number) => {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1000) return `€ ${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return eur(v);
};
const pct = (n: number) => `${Math.round(n || 0)}%`;

interface OppRow {
  status: string | null;
  value: number | null;
  probability: number | null;
  created_at: string | null;
  updated_at: string | null;
  stage_id: string | null;
}
interface StageRow {
  id: string;
  name: string | null;
  position: number | null;
}
interface ContactRow {
  created_at: string | null;
  ai_score_tier: string | null;
  last_activity_at: string | null;
}

const isHotTier = (t: string | null | undefined) => {
  const v = (t || "").toLowerCase();
  return v === "hot" || v === "caldo" || v === "high" || v === "a";
};
const normProb = (p: number | null) => {
  const v = p ?? 0;
  return v > 1 ? v / 100 : v; // accetta sia 0-100 sia 0-1
};

export default function AdminMarketingCommercialDashboard() {
  const { companyId } = useAdminMarketing();
  const [period, setPeriod] = useState<PeriodKey>("30");
  // "Adesso" catturato una volta a mount: Date.now() è impuro e non può stare
  // dentro useMemo (regola purity del React Compiler).
  const [nowMs] = useState(() => Date.now());
  const days = Number(period);

  const opps = useQuery({
    queryKey: ["crm-dash", "opps", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("status,value,probability,created_at,updated_at,stage_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as OppRow[];
    },
  });

  const stages = useQuery({
    queryKey: ["crm-dash", "stages", companyId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipeline_stages")
        .select("id,name,position")
        .eq("company_id", companyId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StageRow[];
    },
  });

  const contacts = useQuery({
    queryKey: ["crm-dash", "contacts", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("created_at,ai_score_tier,last_activity_at")
        .eq("company_id", companyId)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as ContactRow[];
    },
  });

  const isLoading = opps.isLoading || stages.isLoading || contacts.isLoading;
  const isError = opps.isError && contacts.isError;

  const kpis = useMemo(() => {
    const now = nowMs;
    const winStart = now - days * 86_400_000;
    const priorStart = now - 2 * days * 86_400_000;
    const inWin = (iso: string | null) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= winStart && t <= now;
    };
    const inPrior = (iso: string | null) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= priorStart && t < winStart;
    };
    const o = opps.data ?? [];
    const c = contacts.data ?? [];

    const open = o.filter((x) => (x.status ?? "open") === "open");
    const pipelineOpenValue = open.reduce((s, x) => s + (x.value ?? 0), 0);
    const forecast = open.reduce((s, x) => s + (x.value ?? 0) * normProb(x.probability), 0);

    const wonWin = o.filter((x) => x.status === "won" && inWin(x.updated_at));
    const wonPrior = o.filter((x) => x.status === "won" && inPrior(x.updated_at));
    const wonValue = wonWin.reduce((s, x) => s + (x.value ?? 0), 0);
    const wonValuePrior = wonPrior.reduce((s, x) => s + (x.value ?? 0), 0);

    const closedWin = o.filter((x) => (x.status === "won" || x.status === "lost") && inWin(x.updated_at));
    const winRate = closedWin.length ? (wonWin.length / closedWin.length) * 100 : 0;
    const closedPrior = o.filter((x) => (x.status === "won" || x.status === "lost") && inPrior(x.updated_at));
    const winRatePrior = closedPrior.length ? (wonPrior.length / closedPrior.length) * 100 : 0;

    const newLeads = c.filter((x) => inWin(x.created_at)).length;
    const newLeadsPrior = c.filter((x) => inPrior(x.created_at)).length;

    const fiveDaysAgo = now - 5 * 86_400_000;
    const hotNoFollowup = c.filter(
      (x) => isHotTier(x.ai_score_tier) && (!x.last_activity_at || new Date(x.last_activity_at).getTime() < fiveDaysAgo),
    ).length;

    const delta = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0);

    return {
      pipelineOpenValue,
      forecast,
      wonValue,
      wonCount: wonWin.length,
      wonDelta: delta(wonValue, wonValuePrior),
      winRate,
      winRateDeltaPt: winRate - winRatePrior,
      newLeads,
      newLeadsDelta: delta(newLeads, newLeadsPrior),
      hotNoFollowup,
    };
  }, [opps.data, contacts.data, days, nowMs]);

  const pipelineByStage = useMemo(() => {
    const o = (opps.data ?? []).filter((x) => (x.status ?? "open") === "open");
    const st = stages.data ?? [];
    const byStage = new Map<string, { count: number; value: number }>();
    for (const x of o) {
      if (!x.stage_id) continue;
      const cur = byStage.get(x.stage_id) ?? { count: 0, value: 0 };
      cur.count += 1;
      cur.value += x.value ?? 0;
      byStage.set(x.stage_id, cur);
    }
    const rows = st.map((s) => ({
      name: s.name ?? "—",
      count: byStage.get(s.id)?.count ?? 0,
      value: byStage.get(s.id)?.value ?? 0,
    }));
    const maxCount = Math.max(1, ...rows.map((r) => r.count));
    return { rows, maxCount, total: o.length };
  }, [opps.data, stages.data]);

  return (
    <div className="space-y-5 p-1">
      {/* Header + filtro periodo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-bold leading-tight sm:text-2xl">Dashboard commerciale</h1>
            <p className="text-sm text-muted-foreground">Pipeline, lead, team e revenue — dati live del CRM</p>
          </div>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={
                "px-3 py-1.5 text-sm transition-colors " +
                (period === p.key
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted/50")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Impossibile caricare i dati del CRM. Riprova tra qualche istante.
          </CardContent>
        </Card>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Layers} label="Pipeline aperta" value={eurCompact(kpis.pipelineOpenValue)} loading={isLoading} />
        <Kpi icon={Target} label="Forecast pesato" value={eurCompact(kpis.forecast)} loading={isLoading} />
        <Kpi
          icon={Trophy}
          label={`Vinto (${days}g)`}
          value={`${eurCompact(kpis.wonValue)} · ${kpis.wonCount}`}
          delta={kpis.wonDelta}
          loading={isLoading}
        />
        <Kpi icon={TrendingUp} label="Win rate" value={pct(kpis.winRate)} deltaPt={kpis.winRateDeltaPt} loading={isLoading} />
        <Kpi icon={UserPlus} label="Lead nuovi" value={String(kpis.newLeads)} delta={kpis.newLeadsDelta} loading={isLoading} />
        <Kpi
          icon={Flame}
          label="Caldi senza follow-up"
          value={String(kpis.hotNoFollowup)}
          tone="warn"
          hint="da 5+ giorni"
          loading={isLoading}
        />
      </div>

      {/* Pipeline per stadio */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4" aria-hidden="true" /> Pipeline per stadio
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {pipelineByStage.total} opportunità aperte
            </span>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
          ) : pipelineByStage.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessuno stadio configurato o nessuna opportunità aperta.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5 text-[13px]">
              {pipelineByStage.rows.map((r) => (
                <div key={r.name}>
                  <div className="mb-1 flex justify-between">
                    <span>{r.name}</span>
                    <span className="text-muted-foreground">
                      {r.count} · {eurCompact(r.value)}
                    </span>
                  </div>
                  <div className="h-2 rounded bg-muted">
                    <div
                      className="h-2 rounded bg-primary"
                      style={{ width: `${Math.max(2, (r.count / pipelineByStage.maxCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Segmentazione: temperatura + win/loss */}
      <div className="grid gap-4 md:grid-cols-2">
        <CrmTemperatureCard companyId={companyId} />
        <CrmWinLossCard companyId={companyId} />
      </div>

      {/* Funnel + fonti */}
      <div className="grid gap-4 md:grid-cols-2">
        <CrmFunnelCard companyId={companyId} />
        <CrmChannelsCard companyId={companyId} />
      </div>

      {/* Cluster mestiere + zona */}
      <CrmClustersCard companyId={companyId} />

      {/* Aziende / Account B2B */}
      <CrmAccountsCard companyId={companyId} />

      {/* Team + alert */}
      <div className="grid gap-4 md:grid-cols-2">
        <CrmTeamCard companyId={companyId} />
        <CrmAlertsCard companyId={companyId} />
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        Ultimo blocco: riepilogo AI (crm-ai-insights) in arrivo.
      </p>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  delta,
  deltaPt,
  tone = "default",
  hint,
  loading,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  delta?: number;
  deltaPt?: number;
  tone?: "default" | "warn";
  hint?: string;
  loading?: boolean;
}) {
  const deltaVal = deltaPt ?? delta;
  const showDelta = typeof deltaVal === "number" && Number.isFinite(deltaVal) && Math.abs(deltaVal) >= 0.5;
  const up = (deltaVal ?? 0) >= 0;
  return (
    <Card className={tone === "warn" ? "border-amber-200 bg-amber-50/40" : ""}>
      <CardContent className="p-3.5">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className={"h-3.5 w-3.5 " + (tone === "warn" ? "text-amber-600" : "")} aria-hidden="true" />
          <span className={tone === "warn" ? "text-amber-700" : ""}>{label}</span>
        </div>
        <div className={"text-xl font-bold leading-tight " + (tone === "warn" ? "text-amber-700" : "")}>
          {loading ? "…" : value}
        </div>
        {showDelta && !loading && (
          <div className={"mt-0.5 flex items-center gap-1 text-xs " + (up ? "text-emerald-600" : "text-red-600")}>
            {up ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
            {deltaPt != null ? `${up ? "+" : ""}${Math.round(deltaVal!)}pt` : `${up ? "+" : ""}${Math.round(deltaVal!)}%`}
          </div>
        )}
        {hint && !showDelta && !loading && <div className={"mt-0.5 text-xs " + (tone === "warn" ? "text-amber-600" : "text-muted-foreground")}>{hint}</div>}
      </CardContent>
    </Card>
  );
}

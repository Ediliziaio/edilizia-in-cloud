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
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminMarketing } from "@/hooks/useAdminMarketing";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendingUp, TrendingDown, Layers, Target, Trophy, UserPlus, Flame, Loader2, BarChart3, Crosshair, Package, Share2, MapPin,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CrmWinLossCard } from "@/components/admin/crm-dashboard/CrmSegmentDonuts";
import { CrmFunnelCard, CrmChannelsCard, CrmClustersCard } from "@/components/admin/crm-dashboard/CrmSegmentBars";
import { CrmAccountsCard, CrmTeamCard, CrmAlertsCard } from "@/components/admin/crm-dashboard/CrmAccountsTeamAlerts";
import { CrmAiInsightsBanner } from "@/components/admin/crm-dashboard/CrmAiInsightsBanner";
import { CrmVelocityCard } from "@/components/admin/crm-dashboard/CrmVelocityCard";
import { CrmAgentTargetsCard } from "@/components/admin/crm-dashboard/CrmAgentTargetsCard";
import { CrmFirmographicsCard } from "@/components/admin/crm-dashboard/CrmFirmographicsCard";
import { CrmProductCards } from "@/components/admin/crm-dashboard/CrmProductCards";
import { CrmHotTable } from "@/components/admin/crm-dashboard/CrmHotTable";
import { CrmPartnerReferralCard } from "@/components/admin/crm-dashboard/CrmPartnerReferralCard";
import { CrmTrendCard } from "@/components/admin/crm-dashboard/CrmTrendCard";
import { CrmOperationalFunnel } from "@/components/admin/crm-dashboard/CrmOperationalFunnel";
import { CrmNetworksStrip } from "@/components/admin/crm-dashboard/CrmNetworksStrip";
import { CrmUnitEconomics } from "@/components/admin/crm-dashboard/CrmUnitEconomics";
import { CrmChannelRoi } from "@/components/admin/crm-dashboard/CrmChannelRoi";
import { CrmSpeedToLead } from "@/components/admin/crm-dashboard/CrmSpeedToLead";
import { CrmMapTab } from "@/components/admin/crm-dashboard/CrmMapTab";
import { HeroAurora } from "@/components/admin/HeroAurora";
import { motion, AnimatePresence } from "framer-motion";

type PeriodKey = "7" | "30" | "90" | "365";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "7", label: "7 giorni" },
  { key: "30", label: "30 giorni" },
  { key: "90", label: "90 giorni" },
  { key: "365", label: "12 mesi" },
];

/** Reveal-on-scroll leggero per le sezioni della dashboard (una volta sola). */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

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

  // KPI contatti via COUNT server-side. Prima si scaricavano 5.000 righe e si
  // contava in memoria: con 89.000+ contatti in rubrica era un campione
  // arbitrario del ~6% (senza ORDER BY l'ordine non e' definito) -> "Lead
  // nuovi", "Caldi senza follow-up" e sparkline completamente sballati.
  const contactStats = useQuery({
    queryKey: ["crm-dash", "contact-stats", companyId, days, nowMs],
    staleTime: 60_000,
    queryFn: async () => {
      const DAY = 86_400_000;
      const WEEK = 7 * DAY;
      const winStartIso = new Date(nowMs - days * DAY).toISOString();
      const priorStartIso = new Date(nowMs - 2 * days * DAY).toISOString();
      const fiveDaysAgoIso = new Date(nowMs - 5 * DAY).toISOString();
      const base = () =>
        supabase
          .from("marketing_contacts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId);
      // 8 settimane per la sparkline: [7 settimane fa ... settimana corrente]
      const weekRanges = Array.from({ length: 8 }, (_, i) => {
        const end = nowMs - (7 - i - 1) * WEEK;
        const start = nowMs - (7 - i) * WEEK;
        return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
      });
      const [newWin, newPrior, hot, ...weeks] = await Promise.all([
        base().gte("created_at", winStartIso),
        base().gte("created_at", priorStartIso).lt("created_at", winStartIso),
        base()
          .in("ai_score_tier", ["hot", "caldo", "high", "a", "A"])
          .or(`last_activity_at.is.null,last_activity_at.lt.${fiveDaysAgoIso}`),
        ...weekRanges.map((w) => base().gte("created_at", w.start).lt("created_at", w.end)),
      ]);
      const cnt = (r: { count: number | null; error: unknown }) => (r.error ? 0 : r.count ?? 0);
      return {
        newLeads: cnt(newWin),
        newLeadsPrior: cnt(newPrior),
        hotNoFollowup: cnt(hot),
        sparkLeads: weeks.map(cnt),
      };
    },
  });

  const isLoading = opps.isLoading || stages.isLoading || contactStats.isLoading;
  // "||", non "&&": se anche UNA sola fonte fallisce i KPI sono incompleti e
  // l'utente deve vederlo (prima serviva il fallimento di entrambe).
  const isError = opps.isError || contactStats.isError;

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

    // Lead nuovi / caldi: COUNT esatti server-side (vedi contactStats sopra).
    const newLeads = contactStats.data?.newLeads ?? 0;
    const newLeadsPrior = contactStats.data?.newLeadsPrior ?? 0;
    const hotNoFollowup = contactStats.data?.hotNoFollowup ?? 0;

    const delta = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0);

    // Sparkline (8 settimane) dai dati già in memoria: trend reale, zero query extra.
    const WEEK = 7 * 86_400_000;
    const weekIdx = (iso: string | null) => {
      if (!iso) return -1;
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) return -1;
      const weeksAgo = Math.floor((now - t) / WEEK);
      const i = 7 - weeksAgo;
      return i >= 0 && i <= 7 ? i : -1;
    };
    const sparkLeads = contactStats.data?.sparkLeads ?? Array.from({ length: 8 }, () => 0);
    const sparkWon = Array.from({ length: 8 }, () => 0);
    for (const x of o) {
      if (x.status !== "won") continue;
      const i = weekIdx(x.updated_at);
      if (i >= 0) sparkWon[i] += x.value ?? 0;
    }

    return {
      sparkLeads,
      sparkWon,
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
  }, [opps.data, contactStats.data, days, nowMs]);

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

  // Snapshot compatto da passare alla edge function crm-ai-insights.
  const aiMetrics = useMemo<Record<string, unknown>>(
    () => ({
      periodo_giorni: days,
      pipeline_aperta_eur: Math.round(kpis.pipelineOpenValue),
      forecast_pesato_eur: Math.round(kpis.forecast),
      vinto_eur: Math.round(kpis.wonValue),
      vinti_n: kpis.wonCount,
      win_rate_pct: Math.round(kpis.winRate),
      lead_nuovi: kpis.newLeads,
      lead_nuovi_delta_pct: Math.round(kpis.newLeadsDelta),
      caldi_senza_followup: kpis.hotNoFollowup,
      pipeline_per_stadio: pipelineByStage.rows.map((r) => ({
        stadio: r.name,
        opportunita: r.count,
        valore_eur: Math.round(r.value),
      })),
    }),
    [kpis, pipelineByStage, days],
  );

  const dateLabel = useMemo(() => {
    const s = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(nowMs));
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [nowMs]);

  return (
    <div className="space-y-5 p-1">
      {/* ── HERO direzionale (palette brand: navy #173b67 + arancione) ──
          Stesso linguaggio del Cruscotto Aziendale: dà identità e gerarchia,
          i KPI chiave vivono qui in evidenza invece di una griglia bianca. */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative overflow-hidden bg-[#173b67] p-5 text-white sm:p-6">
          <HeroAurora />
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
                <BarChart3 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">Dashboard commerciale</p>
                <h1 className="mt-1 text-xl font-semibold leading-tight sm:text-2xl">AEDIX · CRM</h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-blue-50/80">
                  {dateLabel} ·
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-300">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    Live
                  </span>
                </p>
              </div>
            </div>
            {/* Filtro periodo — su navy, pill attiva arancione */}
            <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-white/15 bg-white/5 p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={
                    "relative rounded-md px-3 py-1.5 text-sm transition-colors " +
                    (period === p.key ? "font-semibold text-white" : "text-blue-50/70 hover:text-white")
                  }
                >
                  {period === p.key && (
                    <motion.span
                      layoutId="crm-period-pill"
                      className="absolute inset-0 rounded-md bg-gradient-to-r from-orange-500 to-amber-500"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* KPI chiave dentro l'hero */}
          <div className="relative z-10 mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <HeroKpi icon={Layers} label="Pipeline aperta" value={eurCompact(kpis.pipelineOpenValue)} loading={isLoading} />
            <HeroKpi icon={Target} label="Forecast pesato" value={eurCompact(kpis.forecast)} loading={isLoading} />
            <HeroKpi icon={Trophy} label={`Vinto (${days}g)`} value={`${eurCompact(kpis.wonValue)} · ${kpis.wonCount}`} delta={kpis.wonDelta} spark={kpis.sparkWon} loading={isLoading} />
            <HeroKpi icon={TrendingUp} label="Win rate" value={pct(kpis.winRate)} deltaPt={kpis.winRateDeltaPt} loading={isLoading} />
            <HeroKpi icon={UserPlus} label="Lead nuovi" value={String(kpis.newLeads)} delta={kpis.newLeadsDelta} spark={kpis.sparkLeads} loading={isLoading} />
            <HeroKpi icon={Flame} label="Caldi senza follow-up" value={String(kpis.hotNoFollowup)} tone="warn" hint="da 5+ giorni" loading={isLoading} />
          </div>
        </div>
      </section>

      {isError && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Impossibile caricare i dati del CRM. Riprova tra qualche istante.
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="inline-flex h-auto items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
            {([
              { v: "overview", icon: BarChart3, label: "Overview" },
              { v: "pipeline", icon: Crosshair, label: "Pipeline" },
              { v: "cluster", icon: Package, label: "Cluster & LTV" },
              { v: "partner", icon: Share2, label: "Partner & Referral" },
              { v: "team", icon: Trophy, label: "Team" },
              { v: "mappa", icon: MapPin, label: "Mappa" },
            ] as const).map((t) => (
              <TabsTrigger
                key={t.v}
                value={t.v}
                className="gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-all hover:text-slate-800 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-amber-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-orange-500/30 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <t.icon className="h-4 w-4" aria-hidden="true" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ─── OVERVIEW ─────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4 pt-5">
          <CrmAiInsightsBanner metrics={aiMetrics} />

          <Reveal><CrmOperationalFunnel companyId={companyId} /></Reveal>

          <Reveal><CrmUnitEconomics companyId={companyId} days={days} /></Reveal>

          <Reveal className="grid items-start gap-4 lg:grid-cols-2">
            <CrmChannelRoi companyId={companyId} days={days} />
            <CrmSpeedToLead companyId={companyId} days={days} />
          </Reveal>

          <Reveal><CrmTrendCard companyId={companyId} /></Reveal>

          <Reveal><CrmHotTable companyId={companyId} /></Reveal>

          {/* Riga: pipeline per stadio + alert */}
          <Reveal className="grid items-start gap-4 lg:grid-cols-2">
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
                      <div className="h-2 overflow-hidden rounded bg-muted">
                        <motion.div
                          className="h-2 rounded bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(2, (r.count / pipelineByStage.maxCount) * 100)}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
            <CrmAlertsCard companyId={companyId} />
          </Reveal>

          <Reveal><CrmNetworksStrip /></Reveal>

          <Reveal><CrmAccountsCard companyId={companyId} /></Reveal>
        </TabsContent>

        {/* ─── PIPELINE ─────────────────────────────────────────────── */}
        <TabsContent value="pipeline" className="space-y-4 pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <CrmFunnelCard companyId={companyId} />
            <CrmWinLossCard companyId={companyId} />
          </div>
          <CrmVelocityCard companyId={companyId} />
        </TabsContent>

        {/* ─── CLUSTER & LTV ────────────────────────────────────────── */}
        <TabsContent value="cluster" className="space-y-4 pt-5">
          <CrmProductCards companyId={companyId} />
          <CrmChannelsCard companyId={companyId} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <CrmClustersCard companyId={companyId} />
            <CrmFirmographicsCard companyId={companyId} />
          </div>
        </TabsContent>

        {/* ─── PARTNER & REFERRAL ───────────────────────────────────── */}
        <TabsContent value="partner" className="space-y-4 pt-5">
          <CrmPartnerReferralCard />
        </TabsContent>

        {/* ─── TEAM ─────────────────────────────────────────────────── */}
        <TabsContent value="team" className="space-y-4 pt-5">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <CrmTeamCard companyId={companyId} />
            <CrmAgentTargetsCard companyId={companyId} />
          </div>
        </TabsContent>

        {/* ─── MAPPA ────────────────────────────────────────────────── */}
        <TabsContent value="mappa" className="space-y-4 pt-5">
          <CrmMapTab companyId={companyId} />
        </TabsContent>
      </Tabs>

    </div>
  );
}

/** Mini sparkline 8 punti (stile dashboard SaaS): verde se trend su, rossa se giù. */
function KpiSpark({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  if (max === 0) return null; // nessuna storia → niente linea finta
  const up = data[data.length - 1] >= data[0];
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 56},${18 - ((v - min) / range) * 14}`).join(" ");
  return (
    <svg width="56" height="20" viewBox="0 0 56 20" className={up ? "text-emerald-500" : "text-red-500"} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** KPI dentro l'hero navy: card traslucide su blu scuro, accenti brand. */
function HeroKpi({
  icon: Icon,
  label,
  value,
  delta,
  deltaPt,
  tone = "default",
  hint,
  spark,
  loading,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  delta?: number;
  deltaPt?: number;
  tone?: "default" | "warn";
  hint?: string;
  spark?: number[];
  loading?: boolean;
}) {
  const deltaVal = deltaPt ?? delta;
  const showDelta = typeof deltaVal === "number" && Number.isFinite(deltaVal) && Math.abs(deltaVal) >= 0.5;
  const up = (deltaVal ?? 0) >= 0;
  const warn = tone === "warn";
  return (
    <div
      className={
        "rounded-xl border p-3.5 transition-colors " +
        (warn
          ? "border-amber-300/30 bg-amber-400/10 hover:bg-amber-400/15"
          : "border-white/12 bg-white/[0.07] hover:bg-white/[0.11]")
      }
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs">
        <span
          className={
            "flex h-6 w-6 items-center justify-center rounded-md border " +
            (warn ? "border-amber-300/30 bg-amber-400/15 text-amber-200" : "border-white/15 bg-white/10 text-blue-100")
          }
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className={"truncate font-medium " + (warn ? "text-amber-100" : "text-blue-100")}>{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-20 animate-pulse rounded-md bg-white/15" />
      ) : (
        <div className="flex items-end justify-between gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={value}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={"min-w-0 truncate text-xl font-bold leading-tight " + (warn ? "text-amber-200" : "text-white")}
            >
              {value}
            </motion.div>
          </AnimatePresence>
          {spark && <span className="shrink-0 pb-0.5"><KpiSpark data={spark} /></span>}
        </div>
      )}
      {showDelta && !loading && (
        <div className={"mt-0.5 flex items-center gap-1 text-xs " + (up ? "text-emerald-300" : "text-red-300")}>
          {up ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
          {deltaPt != null ? `${up ? "+" : ""}${Math.round(deltaVal!)}pt` : `${up ? "+" : ""}${Math.round(deltaVal!)}%`}
          <span className="text-blue-50/50">vs prec.</span>
        </div>
      )}
      {hint && !showDelta && !loading && <div className={"mt-0.5 text-xs " + (warn ? "text-amber-100/80" : "text-blue-50/60")}>{hint}</div>}
    </div>
  );
}

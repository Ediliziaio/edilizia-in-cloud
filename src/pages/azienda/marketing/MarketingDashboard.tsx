import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, AlertTriangle, ArrowUpRight, BarChart3, Download, LayoutDashboard,
  Loader2, Phone, Radio, RefreshCw, ShieldCheck, Target, TrendingUp, Users,
  CalendarCheck, Trophy, UserPlus,
} from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMarketingDashboard } from "@/hooks/useMarketingDashboard";
import { useDashboardLayout, type DashboardTab } from "@/hooks/useDashboardLayout";
import { SalesTargetsDialog } from "@/components/marketing/dashboard/SalesTargetsDialog";
import { DashboardFilters } from "@/components/marketing/dashboard/DashboardFilters";
import { AlertBanner } from "@/components/marketing/dashboard/AlertBanner";
import { DashboardCustomizePanel } from "@/components/marketing/dashboard/DashboardCustomizePanel";
import { TabPanoramica } from "@/components/marketing/dashboard/tabs/TabPanoramica";
import { TabPipeline } from "@/components/marketing/dashboard/tabs/TabPipeline";
import { TabAttivita } from "@/components/marketing/dashboard/tabs/TabAttivita";
import { TabTeam } from "@/components/marketing/dashboard/tabs/TabTeam";
import { TabFonti } from "@/components/marketing/dashboard/tabs/TabFonti";
import { TabTrend } from "@/components/marketing/dashboard/tabs/TabTrend";
import { TabCommerciale } from "@/components/marketing/dashboard/tabs/TabCommerciale";
import { exportToCSV } from "@/lib/csvExport";
import { useAuth } from "@/contexts/AuthContext";
import { ApiHealthBanner } from "@/components/marketing/ApiHealthBanner";
import { useMetaLeadNotifications } from "@/hooks/useMetaLeadNotifications";
import { SedeFilterBar } from "@/components/sedi/SedeFilterBar";
import { LeadPerSedeChart } from "@/components/sedi/LeadPerSedeChart";
import { useSediList } from "@/hooks/useSediAnalytics";
import { SemaforoMarketing } from "@/components/marketing/dashboard/SemaforoMarketing";
import { SaluteCommerciale } from "@/components/marketing/dashboard/SaluteCommerciale";
import { AzioniCommerciali } from "@/components/marketing/dashboard/AzioniCommerciali";
import { DashboardSelectorBar } from "@/components/dashboard/DashboardSelectorBar";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyCompact } from "@/lib/formatters";
import { safeNumber } from "@/lib/numberUtils";
import { cn } from "@/lib/utils";

type ExecutiveTone = "green" | "orange" | "red" | "blue";

const TAB_ICONS: Record<DashboardTab, React.ElementType> = {
  panoramica: LayoutDashboard,
  pipeline: BarChart3,
  attivita: Phone,
  team: Users,
  fonti: Radio,
  trend: TrendingUp,
  commerciale: Target,
};

function eur(value: number) {
  return formatCurrencyCompact(safeNumber(value));
}

function pct(value: number) {
  return `${safeNumber(value).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
}

// Sub-component: Sede analytics (mostrato solo se ci sono sedi).
function SedeFilterBarMarketing() {
  const { data: sedi = [] } = useSediList();
  if (sedi.length === 0) return null;
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-[#1E3A5F]">Analytics per Sede</span>
        <SedeFilterBar />
      </div>
      <LeadPerSedeChart />
    </div>
  );
}

export default function MarketingDashboard() {
  const { data, isLoading, error, refetch, filters, updateFilters, permissions } = useMarketingDashboard();
  const { activeTab, switchTab, tabs, visibleTabs, toggleTabVisibility } = useDashboardLayout();
  const { effectiveCompany } = useAuth();
  useMetaLeadNotifications();
  const { isScopriPlan } = useSubscriptionLimits();
  const companyId = effectiveCompany?.id;

  // ── 12-month marketing trend (lead / appuntamenti / contratti) ───────────
  const { data: marketingTrend = [] } = useQuery({
    queryKey: ["marketing-dashboard-trend-12m", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const from = new Date();
      from.setMonth(from.getMonth() - 11);
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      const fromIso = from.toISOString();
      const fromDateOnly = fromIso.slice(0, 10);

      const [leadsRes, apptsRes, contractsRes] = await Promise.all([
        supabase
          .from("marketing_contacts")
          .select("created_at")
          .eq("company_id", companyId)
          .gte("created_at", fromIso),
        supabase
          .from("appointments")
          .select("appointment_date")
          .eq("company_id", companyId)
          .gte("appointment_date", fromDateOnly),
        // P1.4 — "Contratti vinti" = opportunità con status='won', bucket
        // per `updated_at` (coerente con la KPI strip che legge la stessa
        // tabella). Prima leggevamo `orders.created_at` che misurava
        // qualcosa di completamente diverso.
        supabase
          .from("marketing_opportunities")
          .select("updated_at")
          .eq("company_id", companyId)
          .eq("status", "won")
          .gte("updated_at", fromIso),
      ]);

      const months = Array.from({ length: 12 }, (_, index) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (11 - index));
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = date.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
        return {
          key,
          mese: `${monthLabel} '${String(date.getFullYear()).slice(-2)}`,
          lead: 0,
          appuntamenti: 0,
          contratti: 0,
        };
      });
      const byKey = new Map(months.map((m) => [m.key, m]));

      const accumulate = (
        rows: Array<{ created_at?: string | null; appointment_date?: string | null; updated_at?: string | null }> | null,
        field: "lead" | "appuntamenti" | "contratti",
      ) => {
        (rows || []).forEach((row) => {
          const raw = row.created_at ?? row.appointment_date ?? row.updated_at;
          if (!raw) return;
          const date = new Date(raw);
          if (Number.isNaN(date.getTime())) return;
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          const month = byKey.get(key);
          if (!month) return;
          month[field] += 1;
        });
      };

      accumulate(leadsRes.data ?? null, "lead");
      accumulate(apptsRes.data ?? null, "appuntamenti");
      accumulate(contractsRes.data ?? null, "contratti");
      return months;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Executive state (analogo al Cruscotto Aziendale) ─────────────────────
  const executiveState = useMemo(() => {
    const kpi = data?.kpi;
    const alerts = data?.alerts;
    const staleLeads = safeNumber(alerts?.stale_leads);
    const staleLeads2h = safeNumber(alerts?.stale_leads_2h);
    const showRate = safeNumber(kpi?.show_rate);
    const closeRate = safeNumber(kpi?.close_rate);
    const pendingAppointments = safeNumber(alerts?.pending_appointments);
    const pipelineDeclining = !!alerts?.pipeline_declining;
    const showRateBelow = !!alerts?.show_rate_below_threshold;

    if (staleLeads2h > 0) {
      return {
        tone: "red" as ExecutiveTone,
        title: "Lead caldi senza risposta",
        detail: `${staleLeads2h} lead nuovi da oltre 2 ore senza primo contatto. Più aspetti, meno chiudono.`,
        route: "/azienda/marketing/contatti?filter=stale_2h",
        cta: "Apri lead caldi",
      };
    }
    if (staleLeads > 0) {
      return {
        tone: "orange" as ExecutiveTone,
        title: "Lead in attesa di lavorazione",
        detail: `${staleLeads} lead da contattare. Prima azione: riassegna o richiama oggi stesso.`,
        route: "/azienda/marketing/contatti?filter=stale",
        cta: "Vedi lead in attesa",
      };
    }
    if (pipelineDeclining) {
      return {
        tone: "orange" as ExecutiveTone,
        title: "Pipeline in calo",
        detail: "Il valore della pipeline attiva sta scendendo. Verifica opportunità ferme e nuovi ingressi.",
        route: "/azienda/marketing/opportunita",
        cta: "Apri pipeline",
      };
    }
    if (showRateBelow) {
      return {
        tone: "orange" as ExecutiveTone,
        title: "Show rate sotto target",
        detail: `Solo il ${pct(showRate)} dei prospect si presenta in appuntamento. Rivedi reminder e qualifica.`,
        route: "/azienda/marketing/calendario",
        cta: "Vedi appuntamenti",
      };
    }
    if (pendingAppointments > 0) {
      return {
        tone: "blue" as ExecutiveTone,
        title: "Appuntamenti da chiudere",
        detail: `${pendingAppointments} appuntamenti da esitare. Aggiorna l'esito appena fatti.`,
        route: "/azienda/marketing/calendario",
        cta: "Aggiorna esiti",
      };
    }
    if (closeRate > 0 && closeRate < 15) {
      return {
        tone: "orange" as ExecutiveTone,
        title: "Conversione bassa",
        detail: `Tasso di chiusura ${pct(closeRate)}. Rivedi script vendita e qualifica del lead in ingresso.`,
        route: "/azienda/marketing/opportunita",
        cta: "Vedi pipeline",
      };
    }
    return {
      tone: "green" as ExecutiveTone,
      title: "Vendite sotto controllo",
      detail: "Nessuna urgenza commerciale: monitora la velocità di risposta e il volume in ingresso.",
      route: "/azienda/marketing/opportunita",
      cta: "Vedi pipeline",
    };
  }, [data]);

  // ── 4 KPI principali del summary ─────────────────────────────────────────
  const executiveKpis = useMemo(() => {
    const kpi = data?.kpi;
    const prev = data?.kpi_prev;
    const leadsTotal = safeNumber(kpi?.leads_total);
    const leadsPrev = safeNumber(prev?.leads_total);
    const pipelineValue = safeNumber(kpi?.pipeline_active_value);
    const showRate = safeNumber(kpi?.show_rate);
    const showRatePrev = safeNumber(prev?.show_rate);
    const revenue = safeNumber(kpi?.revenue);
    const revenuePrev = safeNumber(prev?.revenue);
    const contractsWon = safeNumber(kpi?.contracts_won);
    const closeRate = safeNumber(kpi?.close_rate);

    return [
      {
        label: "Lead periodo",
        value: leadsTotal.toLocaleString("it-IT"),
        hint: `vs precedente ${leadsPrev.toLocaleString("it-IT")}`,
        icon: UserPlus,
        tone: leadsTotal >= leadsPrev ? "green" as ExecutiveTone : "orange" as ExecutiveTone,
      },
      {
        label: "Pipeline attiva",
        value: eur(pipelineValue),
        hint: pipelineValue > 0 ? "valore opportunità in corso" : "nessuna opportunità attiva",
        icon: TrendingUp,
        tone: pipelineValue > 0 ? "blue" as ExecutiveTone : "orange" as ExecutiveTone,
      },
      {
        label: "Show rate",
        value: pct(showRate),
        hint: `mese precedente ${pct(showRatePrev)}`,
        icon: CalendarCheck,
        tone: showRate >= 60 ? "green" as ExecutiveTone : showRate >= 40 ? "orange" as ExecutiveTone : "red" as ExecutiveTone,
      },
      {
        label: "Contratti / fatturato",
        value: `${contractsWon} · ${eur(revenue)}`,
        hint: `chiusura ${pct(closeRate)} · prec. ${eur(revenuePrev)}`,
        icon: Trophy,
        tone: revenue >= revenuePrev && contractsWon > 0 ? "green" as ExecutiveTone : "orange" as ExecutiveTone,
      },
    ];
  }, [data]);

  if (isScopriPlan) return <UpgradeScopriWall type="crm_pipeline" inline />;

  if (!effectiveCompany?.id) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LayoutDashboard className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold text-muted-foreground">Nessuna azienda selezionata</h2>
        <p className="text-sm text-muted-foreground/70 mt-1">Seleziona un'azienda per visualizzare la dashboard</p>
      </div>
    );
  }

  const handleExportKPI = () => {
    if (!data?.kpi) return;
    const kpi = data.kpi;
    const rows = [
      { metrica: "Lead Totali", valore: String(kpi.leads_total) },
      { metrica: "Nuovi Lead", valore: String(kpi.leads_new) },
      { metrica: "Lavorati", valore: String(kpi.contacts_worked) },
      { metrica: "App. Fissati", valore: String(kpi.appointments_set) },
      { metrica: "App. Svolti", valore: String(kpi.appointments_done) },
      { metrica: "Show Rate", valore: `${kpi.show_rate}%` },
      { metrica: "Contratti Vinti", valore: String(kpi.contracts_won) },
      { metrica: "Fatturato", valore: String(kpi.revenue) },
      { metrica: "Ticket Medio", valore: String(kpi.avg_ticket) },
      { metrica: "Tasso Chiusura", valore: `${kpi.close_rate}%` },
    ];
    exportToCSV(rows, [{ key: "metrica", label: "Metrica" }, { key: "valore", label: "Valore" }], "dashboard-marketing-kpi.csv");
  };

  // Ensure activeTab is in visibleTabs
  const effectiveTab = visibleTabs.some((t) => t.id === activeTab) ? activeTab : visibleTabs[0]?.id || "panoramica";

  const todayStr = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const todayCap = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);

  return (
    <div className="space-y-3 sm:space-y-4">
      <DashboardSelectorBar title="Dashboard Marketing" />

      <DashboardPageHeader
        title="Dashboard Marketing"
        subtitle={`Regia commerciale, pipeline e conversioni — ${todayCap}`}
        icon={LayoutDashboard}
        toolbar={<DashboardFilters filters={filters} onUpdate={updateFilters} hideUserFilter={permissions.onlyAssigned} compact />}
        actions={
          <>
            {permissions.isAdmin && <SalesTargetsDialog />}
            <DashboardCustomizePanel tabs={tabs} onToggle={toggleTabVisibility} />
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Aggiorna</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleExportKPI} disabled={!data?.kpi}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Esporta</span>
            </Button>
          </>
        }
      />

      <ApiHealthBanner filter={["meta", "email_marketing"]} />

      {/* Alert banner generico */}
      <AlertBanner alerts={data?.alerts} isLoading={isLoading} />

      {/* P3.4 — skeleton placeholder durante il primo caricamento */}
      {isLoading && !data?.kpi && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 xl:grid-cols-[minmax(340px,0.58fr)_minmax(540px,1fr)]">
            <div className="bg-[#173b67] p-5 text-white sm:p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-orange-200" />
                <p className="text-sm text-blue-50/85">Caricamento KPI commerciali…</p>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-[88px] animate-pulse rounded-xl border border-white/12 bg-white/9" />
                ))}
              </div>
            </div>
            <aside className="border-t border-slate-200 bg-gradient-to-br from-white to-orange-50/50 p-5 xl:border-l xl:border-t-0">
              <div className="h-[260px] animate-pulse rounded-xl border border-slate-100 bg-slate-100" />
            </aside>
          </div>
        </section>
      )}

      {/* Empty state quando non c'è errore, non sta caricando, ma non c'è alcun dato */}
      {!isLoading && !error && !data?.kpi && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <LayoutDashboard className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-slate-700">Nessun dato commerciale ancora</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Inizia caricando contatti o creando opportunità: i KPI compariranno automaticamente.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/azienda/marketing/contatti">Vai ai contatti</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/azienda/marketing/opportunita">Crea opportunità</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Executive Summary commerciale (stessa struttura del Cruscotto) */}
      {data?.kpi && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 xl:grid-cols-[minmax(340px,0.58fr)_minmax(540px,1fr)]">
            <div className="bg-[#173b67] p-5 text-white sm:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
                    {executiveState.tone === "green" ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">Quadro commerciale</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">{executiveState.title}</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-blue-50/85">{executiveState.detail}</p>
                  </div>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="w-fit shrink-0 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-950/20 hover:from-orange-600 hover:to-amber-500"
                >
                  <Link to={executiveState.route}>
                    {executiveState.cta}
                    <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {executiveKpis.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-xl border border-white/12 bg-white/9 p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10",
                            item.tone === "green" && "text-emerald-100",
                            item.tone === "red" && "text-red-100",
                            item.tone === "orange" && "text-orange-100",
                            item.tone === "blue" && "text-blue-100",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">{item.label}</span>
                          <span className="block truncate text-xl font-bold text-white">{item.value}</span>
                          <span className="mt-0.5 block truncate text-xs text-blue-50/70">{item.hint}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <aside className="border-t border-slate-200 bg-gradient-to-br from-white to-orange-50/50 p-5 xl:border-l xl:border-t-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Andamento 12 mesi</p>
                  <h3 className="mt-1 text-base font-semibold text-slate-950">Lead, appuntamenti e contratti</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">Storico fisso · indipendente dai filtri periodo</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-blue-500" /> Lead</span>
                  <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-orange-500" /> Appuntamenti</span>
                  <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Contratti</span>
                </div>
              </div>

              <div className="mt-4 h-[260px] rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={marketingTrend} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                    <XAxis dataKey="mese" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                    <YAxis tickLine={false} axisLine={false} fontSize={10} stroke="#94a3b8" allowDecimals={false} />
                    <RechartsTooltip
                      cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                      }}
                      formatter={(value: number, name) => [
                        Number(value).toLocaleString("it-IT"),
                        name === "lead" ? "Lead" : name === "appuntamenti" ? "Appuntamenti" : "Contratti",
                      ]}
                      labelFormatter={(label) => `Mese: ${label}`}
                    />
                    <Bar dataKey="lead" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="appuntamenti" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={22} />
                    <Line
                      type="monotone"
                      dataKey="contratti"
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#059669", strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </aside>
          </div>
        </section>
      )}

      {/* Aree di controllo — stesso wrapper del Cruscotto */}
      {data?.kpi && (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aree di controllo</p>
              <h2 className="text-lg font-semibold text-slate-950">Approfondisci solo quello che ti serve ora</h2>
            </div>
            <p className="text-sm text-slate-500">Lo stato commerciale resta sopra. Qui sotto trovi i dettagli per area.</p>
          </div>

          <div className="border-b border-slate-200 pb-3 mb-3">
            <SemaforoMarketing
              leadsTotal={data.kpi.leads_total}
              leadsNew={data.kpi.leads_new}
              staleLeads={data.alerts?.stale_leads ?? 0}
              pipelineValue={data.kpi.pipeline_active_value ?? 0}
              pipelineDeclining={data.alerts?.pipeline_declining ?? false}
              showRate={data.kpi.show_rate}
              closeRate={data.kpi.close_rate}
              contractsWon={data.kpi.contracts_won}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 mb-3">
            <div className="lg:col-span-2">
              <SaluteCommerciale
                leadsNew={data.kpi.leads_new}
                staleLeads={data.alerts?.stale_leads ?? 0}
                showRate={data.kpi.show_rate}
                closeRate={data.kpi.close_rate}
                pipelineValue={data.kpi.pipeline_active_value ?? 0}
                pipelineDeclining={data.alerts?.pipeline_declining ?? false}
                revenue={data.kpi.revenue}
                contractsWon={data.kpi.contracts_won}
                appointmentsDone={data.kpi.appointments_done}
                appointmentsSet={data.kpi.appointments_set}
                isLoading={isLoading}
              />
            </div>
            <div className="lg:col-span-3">
              <AzioniCommerciali
                staleLeads={data.alerts?.stale_leads ?? 0}
                staleLeads2h={data.alerts?.stale_leads_2h ?? 0}
                showRate={data.kpi.show_rate}
                showRateBelowThreshold={data.alerts?.show_rate_below_threshold ?? false}
                pipelineDeclining={data.alerts?.pipeline_declining ?? false}
                pipelineValue={data.kpi.pipeline_active_value ?? 0}
                pendingAppointments={data.alerts?.pending_appointments ?? 0}
                staleOpportunities={data.alerts?.stale_opportunities ?? 0}
                contractsWon={data.kpi.contracts_won}
                contractsLost={data.kpi.contracts_lost}
                closeRate={data.kpi.close_rate}
              />
            </div>
          </div>

          <Tabs value={effectiveTab} onValueChange={(v) => switchTab(v as DashboardTab)}>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4 lg:grid-cols-7">
              {visibleTabs.map((tab) => {
                const Icon = TAB_ICONS[tab.id];
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="rounded-lg gap-1.5 text-xs">
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="panoramica" className="mt-4">
              <TabPanoramica data={data} isLoading={isLoading} />
            </TabsContent>
            <TabsContent value="pipeline" className="mt-4">
              <TabPipeline data={data} isLoading={isLoading} filters={filters} onUpdateFilters={updateFilters} />
            </TabsContent>
            <TabsContent value="attivita" className="mt-4">
              <TabAttivita data={data} isLoading={isLoading} />
            </TabsContent>
            <TabsContent value="team" className="mt-4">
              <TabTeam data={data} isLoading={isLoading} />
            </TabsContent>
            <TabsContent value="fonti" className="mt-4">
              <TabFonti data={data} isLoading={isLoading} />
            </TabsContent>
            <TabsContent value="trend" className="mt-4">
              <TabTrend data={data} isLoading={isLoading} />
            </TabsContent>
            <TabsContent value="commerciale" className="mt-4">
              <TabCommerciale />
            </TabsContent>
          </Tabs>
        </section>
      )}

      {/* Sede analytics (se presenti sedi) */}
      <SedeFilterBarMarketing />

      {/* Error banner */}
      {error && !isLoading && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Errore nel caricamento dei dati</p>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Riprova
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

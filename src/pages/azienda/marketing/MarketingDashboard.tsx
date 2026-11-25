import { useCallback, useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, AlertTriangle, ArrowUpRight, BarChart3, Download, LayoutDashboard,
  Loader2, Phone, Radio, RefreshCw, ShieldCheck, Target, TrendingUp, Users,
  CalendarCheck, Trophy, UserPlus, MoreHorizontal, Settings2,
} from "lucide-react";
import {
  Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";
import { TrendTooltip, type TrendTooltipSeries } from "@/components/charts/TrendTooltip";
import { Comparsa, PillolaVariazione, StatGrafico, TESTO_ASSE, defsGrafico, idSvg } from "@/components/charts/grafici/comune";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMarketingDashboard } from "@/hooks/useMarketingDashboard";
import { useDashboardLayout, type DashboardTab } from "@/hooks/useDashboardLayout";
import { ObiettiviVenditoriDialog } from "@/components/reporting/venditori/ObiettiviVenditoriDialog";
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
import { useIsMobile } from "@/hooks/use-mobile";
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
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

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
  return `${safeNumber(value).toLocaleString(intlCampo(), { maximumFractionDigits: 1 })}%`;
}

// Sub-component: Sede analytics (mostrato solo se ci sono sedi).
function SedeFilterBarMarketing() {
  const t = useT();
  const isMobile = useIsMobile();
  const { data: sedi = [] } = useSediList();
  // Grafico "Analytics per Sede" (recharts): vetrina desktop → non su mobile.
  if (isMobile || sedi.length === 0) return null;
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-eic-navy">{t("Analytics per Sede")}</span>
        <SedeFilterBar />
      </div>
      <LeadPerSedeChart />
    </div>
  );
}

export default function MarketingDashboard() {
  const tr = useT();
  const { data, isLoading, error, refetch, filters, updateFilters, permissions, effectiveAssignedIds } = useMarketingDashboard();
  const { activeTab, switchTab, tabs, visibleTabs, toggleTabVisibility } = useDashboardLayout();
  const { effectiveCompany } = useAuth();
  const isMobile = useIsMobile();
  useMetaLeadNotifications();
  const { isScopriPlan } = useSubscriptionLimits();
  const companyId = effectiveCompany?.id;

  // ── 12-month marketing trend (lead / appuntamenti / contratti) ───────────
  const { data: marketingTrend = [] } = useQuery({
    queryKey: ["marketing-dashboard-trend-12m", companyId, effectiveAssignedIds, filters.sources, filters.pipelineId],
    queryFn: async () => {
      if (!companyId) return [];
      // Aggregazione SERVER-SIDE (RPC marketing_trend_12m): vedi nota nella
      // funzione gemella del Cruscotto — numeri esatti (niente cap righe
      // PostgREST) e 12 righe di payload invece di migliaia. Gli stessi filtri
      // dei KPI: prima il grafico mostrava sempre l'azienda intera.
      const { data, error } = await supabase.rpc("marketing_trend_12m" as never, {
        p_company_id: companyId,
        p_assigned_user_ids: effectiveAssignedIds,
        p_sources: filters.sources.length > 0 ? filters.sources : null,
        p_pipeline_id: filters.pipelineId,
      } as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        mese_key: string; lead: number; appuntamenti: number; contratti: number;
      }>;
      const byKey = new Map(rows.map((r) => [r.mese_key, r]));
      return Array.from({ length: 12 }, (_, index) => {
        // dal primo del mese: il 31 ottobre, «31 settembre» diventava 1 ottobre
        // e settembre spariva dal grafico
        const oggi = new Date();
        const date = new Date(oggi.getFullYear(), oggi.getMonth() - (11 - index), 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = date.toLocaleDateString(intlCampo(), { month: "short" }).replace(".", "");
        const row = byKey.get(key);
        return {
          key,
          mese: `${monthLabel} '${String(date.getFullYear()).slice(-2)}`,
          lead: safeNumber(row?.lead),
          appuntamenti: safeNumber(row?.appuntamenti),
          contratti: safeNumber(row?.contratti),
        };
      });
    },
    // Grafico trend 12 mesi non mostrato su mobile → non scaricarne i dati.
    enabled: !!companyId && !isMobile,
    staleTime: 5 * 60 * 1000,
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // «Aggiorna» ricarica tutto ciò che la pagina mostra: prima solo i KPI, e
  // percorso dei lead e grafico dei 12 mesi restavano quelli di prima
  const aggiornaTutto = useCallback(() => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["marketing-percorso-lead"] });
    void queryClient.invalidateQueries({ queryKey: ["marketing-dashboard-trend-12m"] });
    void queryClient.invalidateQueries({ queryKey: ["marketing-attivita-team"] });
    void queryClient.invalidateQueries({ queryKey: ["marketing-da-fare"] });
  }, [refetch, queryClient]);

  // Legenda interattiva: click su una voce per nascondere/mostrare la serie
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  // Obiettivi: uno per venditore e per MESE (prima era una riga per persona
  // senza mese, cioè un obiettivo solo per sempre).
  const [obiettiviAperti, setObiettiviAperti] = useState(false);
  const [personalizzaAperto, setPersonalizzaAperto] = useState(false);
  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Linea di riferimento: media lead 12 mesi (benchmark onesto senza config)
  const avgLead = useMemo(() => {
    if (!marketingTrend.length) return 0;
    return marketingTrend.reduce((s, m) => s + safeNumber(m.lead), 0) / marketingTrend.length;
  }, [marketingTrend]);

  const idMkt = idSvg(useId());
  const mktFermo = usePreferisceMenoMovimento();
  // Totali dei 12 mesi per la riga sopra il grafico.
  const totaliMkt = useMemo(() => marketingTrend.reduce(
    (t, m) => ({ lead: t.lead + safeNumber(m.lead), appuntamenti: t.appuntamenti + safeNumber(m.appuntamenti), contratti: t.contratti + safeNumber(m.contratti) }),
    { lead: 0, appuntamenti: 0, contratti: 0 },
  ), [marketingTrend]);

  const trendIsEmpty = useMemo(
    () =>
      marketingTrend.length > 0 &&
      marketingTrend.every(
        (m) => safeNumber(m.lead) === 0 && safeNumber(m.appuntamenti) === 0 && safeNumber(m.contratti) === 0,
      ),
    [marketingTrend],
  );

  const trendTooltipSeries = useMemo<TrendTooltipSeries[]>(() => {
    const num = (v: number) => v.toLocaleString(intlCampo());
    return [
      { key: "lead", label: "Lead", color: "hsl(var(--chart-1))", formatter: num },
      { key: "appuntamenti", label: tr("Appuntamenti"), color: "hsl(var(--chart-3))", formatter: num },
      { key: "contratti", label: tr("Contratti"), color: "hsl(var(--chart-2))", formatter: num },
    ];
  }, []);

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
        title: tr("Lead caldi senza risposta"),
        detail: tr("{staleLeads2h} lead nuovi da oltre 2 ore senza primo contatto. Più aspetti, meno chiudono.", { staleLeads2h: String(staleLeads2h ?? "") }),
        route: "/azienda/marketing/contatti?filter=stale_2h",
        cta: "Apri lead caldi",
      };
    }
    if (staleLeads > 0) {
      return {
        tone: "orange" as ExecutiveTone,
        title: tr("Lead in attesa di lavorazione"),
        detail: tr("{staleLeads} lead da contattare. Prima azione: riassegna o richiama oggi stesso.", { staleLeads: String(staleLeads ?? "") }),
        route: "/azienda/marketing/contatti?filter=stale",
        cta: "Vedi lead in attesa",
      };
    }
    if (pipelineDeclining) {
      return {
        tone: "orange" as ExecutiveTone,
        title: tr("Pipeline in calo"),
        detail: tr("Il valore della pipeline attiva sta scendendo. Verifica opportunità ferme e nuovi ingressi."),
        route: "/azienda/marketing/opportunita",
        cta: "Apri pipeline",
      };
    }
    if (showRateBelow) {
      return {
        tone: "orange" as ExecutiveTone,
        title: tr("Show rate sotto target"),
        detail: tr("Solo il {showRate} dei prospect si presenta in appuntamento. Rivedi reminder e qualifica.", { showRate: String(pct(showRate) ?? "") }),
        route: "/azienda/marketing/calendario",
        cta: "Vedi appuntamenti",
      };
    }
    if (pendingAppointments > 0) {
      return {
        tone: "blue" as ExecutiveTone,
        title: tr("Appuntamenti da chiudere"),
        detail: tr("{pendingAppointments} appuntamenti da esitare. Aggiorna l'esito appena fatti.", { pendingAppointments: String(pendingAppointments ?? "") }),
        route: "/azienda/marketing/calendario",
        cta: "Aggiorna esiti",
      };
    }
    if (closeRate > 0 && closeRate < 15) {
      return {
        tone: "orange" as ExecutiveTone,
        title: tr("Conversione bassa"),
        detail: tr("Tasso di chiusura {closeRate}. Rivedi script vendita e qualifica del lead in ingresso.", { closeRate: String(pct(closeRate) ?? "") }),
        route: "/azienda/marketing/opportunita",
        cta: "Vedi pipeline",
      };
    }
    return {
      tone: "green" as ExecutiveTone,
      title: tr("Vendite sotto controllo"),
      detail: tr("Nessuna urgenza commerciale: monitora la velocità di risposta e il volume in ingresso."),
      route: "/azienda/marketing/opportunita",
      cta: "Vedi pipeline",
    };
  }, [data]);

  // ── 4 KPI principali del summary ─────────────────────────────────────────
  const executiveKpis = useMemo(() => {
    const kpi = data?.kpi;
    const prev = data?.kpi_prev;
    // «Lead periodo» = i lead NUOVI del periodo: leads_total è il totale fino a
    // oggi, e contro il periodo precedente dava «+2200%»
    const leadsNew = safeNumber(kpi?.leads_new);
    const leadsPrev = safeNumber(prev?.leads_new);
    const pipelineValue = safeNumber(kpi?.pipeline_active_value);
    const openOpps = safeNumber(kpi?.open_opps_count);
    const showRate = safeNumber(kpi?.show_rate);
    const showRatePrev = safeNumber(prev?.show_rate);
    const appointmentsPending = safeNumber(kpi?.appointments_pending);
    const revenue = safeNumber(kpi?.revenue);
    const revenuePrev = safeNumber(prev?.revenue);
    const contractsWon = safeNumber(kpi?.contracts_won);
    const closeRate = safeNumber(kpi?.close_rate);

    return [
      {
        label: tr("Lead periodo"),
        value: leadsNew.toLocaleString(intlCampo()),
        hint: tr("periodo precedente {leadsPrev}", { leadsPrev: leadsPrev.toLocaleString(intlCampo()) }),
        icon: UserPlus,
        variazione: leadsPrev > 0 ? ((leadsNew - leadsPrev) / leadsPrev) * 100 : null,
        tone: leadsNew >= leadsPrev ? "green" as ExecutiveTone : "orange" as ExecutiveTone,
      },
      {
        label: tr("Pipeline attiva"),
        value: eur(pipelineValue),
        hint: pipelineValue > 0 ? tr("{openOpps} opportunità aperte oggi", { openOpps: openOpps.toLocaleString(intlCampo()) }) : tr("nessuna opportunità attiva"),
        icon: TrendingUp,
        variazione: null as number | null,
        tone: pipelineValue > 0 ? "blue" as ExecutiveTone : "orange" as ExecutiveTone,
      },
      {
        // lo show rate conta solo gli appuntamenti con l'esito: con 27 da esitare
        // su 31 un «100%» non vuol dire niente, quindi lo si dice
        label: tr("Show rate"),
        value: pct(showRate),
        hint: appointmentsPending > 0
          ? tr("{appointmentsPending} appuntamenti da esitare", { appointmentsPending: appointmentsPending.toLocaleString(intlCampo()) })
          : tr("periodo precedente {showRatePrev}", { showRatePrev: String(pct(showRatePrev) ?? "") }),
        icon: CalendarCheck,
        // con appuntamenti da esitare il confronto non dice niente
        variazione: appointmentsPending === 0 && showRatePrev > 0 ? ((showRate - showRatePrev) / showRatePrev) * 100 : null,
        tone: appointmentsPending > 0 ? "orange" as ExecutiveTone : showRate >= 60 ? "green" as ExecutiveTone : showRate >= 40 ? "orange" as ExecutiveTone : "red" as ExecutiveTone,
      },
      {
        label: tr("Contratti / fatturato"),
        value: `${contractsWon} · ${eur(revenue)}`,
        hint: tr("chiusura {closeRate} · prec. {revenuePrev}", { closeRate: String(pct(closeRate) ?? ""), revenuePrev: String(eur(revenuePrev) ?? "") }),
        icon: Trophy,
        variazione: revenuePrev > 0 ? ((revenue - revenuePrev) / revenuePrev) * 100 : null,
        tone: revenue >= revenuePrev && contractsWon > 0 ? "green" as ExecutiveTone : "orange" as ExecutiveTone,
      },
    ];
  }, [data]);

  if (isScopriPlan) return <UpgradeScopriWall type="crm_pipeline" inline />;

  if (!effectiveCompany?.id) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <LayoutDashboard className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold text-muted-foreground">{tr("Nessuna azienda selezionata")}</h2>
        <p className="text-sm text-muted-foreground/70 mt-1">{tr("Seleziona un'azienda per visualizzare la dashboard")}</p>
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
      { metrica: "App. da esitare", valore: String(kpi.appointments_pending ?? 0) },
      { metrica: "Vendite", valore: String(kpi.contracts_won) },
      { metrica: "Preventivi firmati", valore: String(kpi.quotes_signed ?? 0) },
      { metrica: "Fatturato", valore: String(kpi.revenue) },
      { metrica: "Ticket Medio", valore: String(kpi.avg_ticket) },
      { metrica: "Tasso Chiusura", valore: `${kpi.close_rate}%` },
    ];
    exportToCSV(rows, [{ key: "metrica", label: "Metrica" }, { key: "valore", label: "Valore" }], "dashboard-marketing-kpi.csv");
  };

  // Ensure activeTab is in visibleTabs
  // Telefono: tre schede (panoramica, pipeline, attività); team, fonti, trend e
  // commerciale sono analisi da computer.
  const schede = isMobile ? visibleTabs.filter((t) => ["panoramica", "pipeline", "attivita"].includes(t.id)) : visibleTabs;
  const effectiveTab = schede.some((t) => t.id === activeTab) ? activeTab : schede[0]?.id || "panoramica";

  const todayStr = new Date().toLocaleDateString(intlCampo(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const todayCap = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);

  return (
    <div className="space-y-3 sm:space-y-4">
      <DashboardSelectorBar title={tr("Dashboard Marketing")} />

      <DashboardPageHeader
        title={tr("Dashboard Marketing")}
        subtitle={tr("Regia commerciale, pipeline e conversioni — {todayCap}", { todayCap: String(todayCap ?? "") })}
        icon={LayoutDashboard}
        compactTitle
        toolbar={<DashboardFilters filters={filters} onUpdate={updateFilters} hideUserFilter={permissions.onlyAssigned} compact />}
        actions={
          <>
            {/* Aggiorna come icona; obiettivi, sezioni ed esportazione in «Altro»:
                prima erano quattro bottoni uguali accanto ai filtri */}
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-border shadow-none" onClick={aggiornaTutto} disabled={isLoading} aria-label={tr("Aggiorna")} title={tr("Aggiorna")}>
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-border shadow-none" aria-label={tr("Altro")} title={tr("Altro")}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {permissions.isAdmin && (
                  <DropdownMenuItem onSelect={() => setObiettiviAperti(true)}>
                    <Target className="mr-2 h-4 w-4" /> {tr("Obiettivi dei venditori")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setPersonalizzaAperto(true)}>
                  <Settings2 className="mr-2 h-4 w-4" /> {tr("Sezioni da mostrare")}
                </DropdownMenuItem>
                {!isMobile && (
                  <DropdownMenuItem onSelect={handleExportKPI} disabled={!data?.kpi}>
                    <Download className="mr-2 h-4 w-4" /> {tr("Esporta KPI (CSV)")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DashboardCustomizePanel tabs={tabs} onToggle={toggleTabVisibility} open={personalizzaAperto} onOpenChange={setPersonalizzaAperto} />
          </>
        }
      />

      <ApiHealthBanner filter={["meta", "email_marketing"]} />

      {/* Alert banner generico — nascosto su mobile (richiesta utente: toglieva
          spazio in alto; gli alert chiave sono già nelle card del Quadro
          esecutivo qui sotto). Su ≥sm resta visibile. */}
      <div className="hidden sm:block">
        <AlertBanner alerts={data?.alerts} isLoading={isLoading} />
      </div>

      {/* P3.4 — skeleton placeholder durante il primo caricamento */}
      {isLoading && !data?.kpi && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid gap-0 xl:grid-cols-[minmax(340px,0.58fr)_minmax(540px,1fr)]">
            <div className="bg-eic-navy-deep p-5 text-white sm:p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-orange-200" />
                <p className="text-sm text-blue-50/85">{tr("Caricamento KPI commerciali…")}</p>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-[88px] animate-pulse rounded-xl border border-white/12 bg-white/9" />
                ))}
              </div>
            </div>
            <aside className="border-t border-border bg-gradient-to-br from-white to-orange-50/50 p-5 xl:border-l xl:border-t-0">
              <div className="h-[260px] animate-pulse rounded-xl border border-border/60 bg-muted" />
            </aside>
          </div>
        </section>
      )}

      {/* Empty state quando non c'è errore, non sta caricando, ma non c'è alcun dato */}
      {!isLoading && !error && !data?.kpi && (
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
          <LayoutDashboard className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-base font-semibold text-muted-foreground">{tr("Nessun dato commerciale ancora")}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {tr("Inizia caricando contatti o creando opportunità: i KPI compariranno automaticamente.")}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/azienda/marketing/contatti">{tr("Vai ai contatti")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/azienda/marketing/opportunita">{tr("Crea opportunità")}</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Executive Summary commerciale (stessa struttura del Cruscotto) */}
      {data?.kpi && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid gap-0 xl:grid-cols-[minmax(340px,0.58fr)_minmax(540px,1fr)]">
            {/* Telefono: titolo, bottone e quattro numeri 2×2; via icona, occhiello e spiegazione. */}
            <div className="bg-eic-navy-deep p-5 text-white sm:p-6 max-sm:p-4">
              {/* 15/11/2026: tra 1280 e 1535 px la colonna è stretta (circa 370 px): titolo e
                  bottone uno sotto l'altro, e niente icone nei quattro riquadri, che si
                  troncavano («LEAD PERIO…», «4 · 413…»). */}
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between xl:flex-col 2xl:flex-row max-sm:gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)] max-sm:hidden">
                    {executiveState.tone === "green" ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100 max-sm:hidden">{tr("Quadro commerciale")}</p>
                    <h2 className="mt-1 text-lg font-semibold text-white max-sm:mt-0 max-sm:text-base">{executiveState.title}</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-blue-50/85 max-sm:hidden">{executiveState.detail}</p>
                  </div>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="w-fit shrink-0 bg-card text-orange-600 shadow-sm hover:bg-orange-50"
                >
                  <Link to={executiveState.route}>
                    {executiveState.cta}
                    <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 max-sm:mt-3 max-sm:grid-cols-2 max-sm:gap-2">
                {executiveKpis.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <Comparsa key={item.label} indice={i} className="rounded-xl border border-white/12 bg-white/9 p-4 transition-colors hover:bg-white/[0.13] max-sm:px-3 max-sm:py-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 max-sm:hidden xl:hidden 2xl:flex",
                            item.tone === "green" && "text-emerald-100",
                            item.tone === "red" && "text-red-100",
                            item.tone === "orange" && "text-orange-100",
                            item.tone === "blue" && "text-blue-100",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-blue-100 max-sm:font-medium max-sm:normal-case max-sm:tracking-normal">{item.label}</span>
                          <span className="block truncate text-lg font-bold text-white max-sm:text-base">{item.value}</span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                            <PillolaVariazione pct={item.variazione} suScuro titolo={tr("Rispetto al periodo precedente")} className="shrink-0" />
                            <span className="block truncate text-xs text-blue-50/70 max-sm:hidden">{item.hint}</span>
                          </span>
                        </span>
                      </div>
                    </Comparsa>
                  );
                })}
              </div>
            </div>

            {/* Grafico 12 mesi (recharts, multi-serie): "vetrina" desktop,
                pesante e illeggibile su telefono. I numeri chiave sono già
                nelle KPI del riquadro sopra → su mobile nascondiamo il grafico. */}
            {!isMobile && (
            <aside className="border-t bg-gradient-to-br from-card to-orange-50/50 p-5 dark:to-orange-500/5 xl:border-l xl:border-t-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{tr("Andamento 12 mesi")}</p>
                  <h3 className="mt-1 text-base font-semibold text-foreground">{tr("Lead, appuntamenti e contratti")}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">{tr("Storico fisso · indipendente dai filtri periodo")}</p>
                </div>
                {/* Legenda interattiva: click per nascondere/mostrare la serie */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleSeries("lead")}
                    aria-pressed={!hiddenSeries.has("lead")}
                    className={cn("inline-flex items-center gap-1 text-muted-foreground transition-opacity hover:opacity-80", hiddenSeries.has("lead") && "opacity-40 line-through")}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(var(--chart-1))" }} /> Lead
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSeries("appuntamenti")}
                    aria-pressed={!hiddenSeries.has("appuntamenti")}
                    className={cn("inline-flex items-center gap-1 text-muted-foreground transition-opacity hover:opacity-80", hiddenSeries.has("appuntamenti") && "opacity-40 line-through")}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(var(--chart-3))" }} /> {tr("Appuntamenti")}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSeries("contratti")}
                    aria-pressed={!hiddenSeries.has("contratti")}
                    className={cn("inline-flex items-center gap-1 text-muted-foreground transition-opacity hover:opacity-80", hiddenSeries.has("contratti") && "opacity-40 line-through")}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(var(--chart-2))" }} /> {tr("Contratti")}
                  </button>
                </div>
              </div>

              {!trendIsEmpty && (
                <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl border bg-card/70 px-3 py-2">
                  <StatGrafico etichetta={tr("Lead 12 mesi")} valore={totaliMkt.lead.toLocaleString(intlCampo())} nota={tr("media {valore} al mese", { valore: Math.round(avgLead).toLocaleString(intlCampo()) })} />
                  <StatGrafico etichetta={tr("Appuntamenti")} valore={totaliMkt.appuntamenti.toLocaleString(intlCampo())} nota={tr("12 mesi")} />
                  <StatGrafico etichetta={tr("Contratti")} valore={totaliMkt.contratti.toLocaleString(intlCampo())} nota={tr("12 mesi")} tono={totaliMkt.contratti > 0 ? "buono" : "neutro"} />
                </div>
              )}
              <div className="mt-3 h-[260px] rounded-xl border bg-card p-3 shadow-sm">
                {trendIsEmpty ? (
                  <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                    <p className="text-sm font-medium text-muted-foreground">{tr("Ancora nessun dato negli ultimi 12 mesi")}</p>
                    <p className="text-xs text-muted-foreground/80">{tr("Aggiungi il primo lead o collega una fonte per vedere l'andamento.")}</p>
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={marketingTrend}
                    margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                    className="cursor-pointer"
                    onClick={(state) => {
                      // Drill-down: click sul mese -> contatti creati nel periodo
                      const index = state?.activeTooltipIndex;
                      const key = index != null && Number.isInteger(Number(index)) ? marketingTrend[Number(index)]?.key : undefined;
                      if (!key) return;
                      navigate(`/azienda/marketing/contatti?mese=${key}`);
                    }}
                  >
                    {defsGrafico(idMkt, {})}
                    <defs>
                      <linearGradient id="mktLeadGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.55} />
                      </linearGradient>
                      <linearGradient id="mktApptGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.55} />
                      </linearGradient>
                      <linearGradient id="mktContrattiArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid fill={`url(#${idMkt}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="mese" tickLine={false} axisLine={false} tick={TESTO_ASSE} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} tick={TESTO_ASSE} allowDecimals={false} tickMargin={6} width={32} />
                    <RechartsTooltip
                      cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
                      content={<TrendTooltip data={marketingTrend} xKey="mese" series={trendTooltipSeries} />}
                    />
                    {/* Benchmark onesto: media lead degli ultimi 12 mesi */}
                    {avgLead > 0 && !hiddenSeries.has("lead") && (
                      <ReferenceLine
                        y={avgLead}
                        stroke="hsl(var(--muted-foreground))"
                        strokeOpacity={0.6}
                        strokeDasharray="6 4"
                        strokeWidth={1}
                        label={{ value: "media", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                    )}
                    <Bar dataKey="lead" hide={hiddenSeries.has("lead")} fill="url(#mktLeadGrad)" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={!mktFermo} animationDuration={700} />
                    <Bar dataKey="appuntamenti" hide={hiddenSeries.has("appuntamenti")} fill="url(#mktApptGrad)" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={!mktFermo} animationDuration={700} animationBegin={120} />
                    {/* Area sfumata sotto la linea contratti (stesso dataKey, solo fill) */}
                    <Area
                      type="monotone"
                      dataKey="contratti"
                      name="contrattiArea"
                      hide={hiddenSeries.has("contratti")}
                      stroke="transparent"
                      fill="url(#mktContrattiArea)"
                      legendType="none"
                      tooltipType="none"
                      isAnimationActive={!mktFermo}
                    />
                    <Line
                      type="monotone"
                      dataKey="contratti"
                      hide={hiddenSeries.has("contratti")}
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2.5}
                      filter={`url(#${idMkt}-ombra)`}
                      isAnimationActive={!mktFermo}
                      animationDuration={900}
                      animationBegin={250}
                      dot={{ r: 4, fill: "hsl(var(--background))", stroke: "hsl(var(--chart-2))", strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: "hsl(var(--chart-2))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                )}
              </div>
              {!trendIsEmpty && (
                <p className="mt-2 text-right text-[10px] text-muted-foreground/80">{tr("Clicca su un mese per vedere i lead del periodo")}</p>
              )}
            </aside>
            )}
          </div>
        </section>
      )}

      {/* Aree di controllo — stesso wrapper del Cruscotto */}
      {data?.kpi && (
        <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
          {/* Telefono: niente intestazione di sezione, parlano i tre tasselli. */}
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between max-sm:hidden">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr("Aree di controllo")}</p>
              <h2 className="text-lg font-semibold text-foreground">{tr("Approfondisci solo quello che ti serve ora")}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{tr("Lo stato commerciale resta sopra. Qui sotto trovi i dettagli per area.")}</p>
          </div>

          {/* Telefono: lead, pipeline e conversioni sono già nei quattro numeri in cima. */}
          <div className="border-b border-border pb-3 mb-3 max-sm:hidden">
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
            {/* Salute commerciale: pannello-vetrina → nascosto su mobile;
                resta "Azioni commerciali" (le cose da fare). */}
            <div className="hidden lg:col-span-2 lg:block">
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
            {/* Mobile: riga unica scorrevole invece della griglia a 2 col (7 tab =
                4 file troppo alte). Da sm resta a griglia (4 → 7 colonne). */}
            <TabsList className="flex h-auto w-full items-center justify-start gap-1 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 lg:grid-cols-7">
              {schede.map((tab) => {
                const Icon = TAB_ICONS[tab.id];
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="shrink-0 rounded-lg gap-1.5 text-xs max-sm:flex-1">
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="panoramica" className="mt-4">
              <TabPanoramica data={data} isLoading={isLoading} filters={filters} assignedUserIds={effectiveAssignedIds} />
            </TabsContent>
            <TabsContent value="pipeline" className="mt-4">
              <TabPipeline data={data} isLoading={isLoading} filters={filters} assignedUserIds={effectiveAssignedIds} />
            </TabsContent>
            <TabsContent value="attivita" className="mt-4">
              <TabAttivita data={data} isLoading={isLoading} filters={filters} assignedUserIds={effectiveAssignedIds} />
            </TabsContent>
            <TabsContent value="team" className="mt-4">
              <TabTeam data={data} isLoading={isLoading} filters={filters} assignedUserIds={effectiveAssignedIds} />
            </TabsContent>
            <TabsContent value="fonti" className="mt-4">
              <TabFonti data={data} isLoading={isLoading} filters={filters} assignedUserIds={effectiveAssignedIds} />
            </TabsContent>
            <TabsContent value="trend" className="mt-4">
              <TabTrend data={data} isLoading={isLoading} />
            </TabsContent>
            <TabsContent value="commerciale" className="mt-4">
              <TabCommerciale filters={filters} assignedUserIds={effectiveAssignedIds} />
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
              <p className="text-sm font-medium">{tr("Errore nel caricamento dei dati")}</p>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              {tr("Riprova")}
            </Button>
          </CardContent>
        </Card>
      )}
    
      <ObiettiviVenditoriDialog
        aperto={obiettiviAperti}
        onCambiaApertura={setObiettiviAperti}
        venditori={(data?.sales_performance ?? []).map((v) => ({ id: v.user_id, nome: v.name }))}
      />
</div>
  );
}

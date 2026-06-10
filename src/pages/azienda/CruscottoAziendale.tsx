import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCruscottoData } from "@/hooks/useCruscottoData";
import { usePermissions } from "@/hooks/usePermissions";
import { CruscottoFilters } from "@/components/cruscotto/CruscottoFilters";
import { AlertPanel } from "@/components/cruscotto/AlertPanel";
import { TodayFocus } from "@/components/cruscotto/TodayFocus";
import { CashFlowForecast } from "@/components/cruscotto/CashFlowForecast";
import { FinanzaCashFlow } from "@/components/cruscotto/FinanzaCashFlow";
import { MarketingControl } from "@/components/cruscotto/MarketingControl";
import { SalesControl } from "@/components/cruscotto/SalesControl";
import { PipelineForecast } from "@/components/cruscotto/PipelineForecast";
import { OperationsDelivery } from "@/components/cruscotto/OperationsDelivery";
import { HRPerformance } from "@/components/cruscotto/HRPerformance";
import { CruscottoTrend } from "@/components/cruscotto/CruscottoTrend";
import { EmptyStateGuide } from "@/components/cruscotto/EmptyStateGuide";
import { SectionErrorBoundary } from "@/components/cruscotto/SectionErrorBoundary";
import { SilvioCustomerLTVPanel } from "@/components/silvio/SilvioCustomerLTVPanel";
import { DrilldownDrawer, type DrilldownType } from "@/components/cruscotto/DrilldownDrawer";
import { PuntoDiPareggio } from "@/components/cruscotto/PuntoDiPareggio";
import { TargetProgressBar } from "@/components/cruscotto/TargetProgressBar";
import { PrimaNotaScadenzarioWidget } from "@/components/cruscotto/PrimaNotaScadenzarioWidget";
import { BillingKPIWidget } from "@/components/cruscotto/BillingKPIWidget";
import { ClienteSituazioneWidget } from "@/components/cruscotto/ClienteSituazioneWidget";
import { MarginalitaWidget } from "@/components/cruscotto/MarginalitaWidget";
import { SedeFilterBar } from "@/components/sedi/SedeFilterBar";
import { SedeIncidenzaTable } from "@/components/sedi/SedeIncidenzaTable";
import { SedeIncidenceChart } from "@/components/sedi/SedeIncidenceChart";
import { useSediAnalytics } from "@/hooks/useSediAnalytics";
import { useSedeFilter } from "@/store/sedeFilterStore";
import { SemaforoBar } from "@/components/cruscotto/SemaforoBar";
import { SaluteAziendale } from "@/components/cruscotto/SaluteAziendale";
import { AzioniUrgenti } from "@/components/cruscotto/AzioniUrgenti";
import { DashboardSelectorBar } from "@/components/dashboard/DashboardSelectorBar";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { AlertCircle, AlertTriangle, ArrowUpRight, Download, Euro, LayoutDashboard, RefreshCw, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardBillingKPI } from "@/hooks/billing/useDashboardBillingKPI";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyCompact } from "@/lib/formatters";
import { safeNumber } from "@/lib/numberUtils";
import { cn } from "@/lib/utils";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

type ExecutiveTone = "green" | "orange" | "red" | "blue";

function eur(value: number) {
  return formatCurrencyCompact(safeNumber(value));
}

function pct(value: number) {
  return `${safeNumber(value).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
}

export default function CruscottoAziendale() {
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const {
    marketing, operations, finance, weeklyAgenda, companyTargets,
    todayData, cashFlowForecast,
    todayDateFrom, todayDateTo, updateTodayDateRange,
    isLoading, error, filters, updateFilters,
  } = useCruscottoData();
  const [drilldown, setDrilldown] = useState<DrilldownType>(null);
  // P3.3 — persistenza tab attiva tra navigazioni (sessione corrente).
  const [cruscottoTab, setCruscottoTab] = useState<string>(() => {
    if (typeof window === "undefined") return "sintesi";
    return window.sessionStorage.getItem("cruscotto-aziendale-tab") || "sintesi";
  });
  const handleTabChange = useCallback((value: string) => {
    setCruscottoTab(value);
    if (typeof window !== "undefined") window.sessionStorage.setItem("cruscotto-aziendale-tab", value);
  }, []);
  const { isNative } = useBillingMode();
  const effectiveCompanyId = useEffectiveCompanyId();
  const { data: billingKPI } = useDashboardBillingKPI(effectiveCompanyId, isNative);

  const { data: executiveTrend = [] } = useQuery({
    queryKey: ["cruscotto-executive-trend-12m", effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const from = new Date();
      from.setMonth(from.getMonth() - 11);
      from.setDate(1);
      from.setHours(0, 0, 0, 0);

      const [ordersRes, collectedRes, costsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("created_at, total_amount")
          .eq("company_id", effectiveCompanyId)
          .gte("created_at", from.toISOString()),
        supabase
          .from("order_installments")
          .select("amount, paid_date, order:orders!inner(company_id)")
          .eq("order.company_id", effectiveCompanyId)
          .eq("is_paid", true)
          .gte("paid_date", from.toISOString().slice(0, 10)),
        supabase
          .from("company_costs")
          .select("amount, paid_date")
          .eq("company_id", effectiveCompanyId)
          .eq("is_paid", true)
          .gte("paid_date", from.toISOString().slice(0, 10)),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (collectedRes.error) throw collectedRes.error;
      if (costsRes.error) throw costsRes.error;

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
          venduto: 0,
          incassato: 0,
          cassa: 0,
        };
      });
      const byKey = new Map(months.map((month) => [month.key, month]));

      (ordersRes.data || []).forEach((row) => {
        if (!row.created_at) return;
        const date = new Date(row.created_at);
        if (Number.isNaN(date.getTime())) return;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const month = byKey.get(key);
        if (!month) return;
        month.venduto += safeNumber(row.total_amount);
      });

      (collectedRes.data || []).forEach((row) => {
        if (!row.paid_date) return;
        const date = new Date(row.paid_date);
        if (Number.isNaN(date.getTime())) return;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const month = byKey.get(key);
        if (!month) return;
        const amount = safeNumber(row.amount);
        month.incassato += amount;
        month.cassa += amount;
      });

      (costsRes.data || []).forEach((row) => {
        if (!row.paid_date) return;
        const date = new Date(row.paid_date);
        if (Number.isNaN(date.getTime())) return;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const month = byKey.get(key);
        if (!month) return;
        month.cassa -= safeNumber(row.amount);
      });

      return months;
    },
    enabled: !!effectiveCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  const hasOrders = operations.activeOrders > 0 || finance.revenueThisMonth > 0;
  const hasLeads = (marketing?.kpi?.leads_total ?? 0) > 0;
  const hasCosts = finance.supplierDebt > 0 || finance.thisMonthOutflow > 0;
  const isDataEmpty = !hasOrders && !hasLeads && !hasCosts;

  const executiveState = useMemo(() => {
    const overdueAmount = Math.max(
      safeNumber(operations.overdueAmount),
      safeNumber(todayData?.overdueAmount),
      safeNumber(billingKPI?.scaduto),
    );
    const overdueCount = Math.max(
      safeNumber(operations.overduePayments),
      safeNumber(todayData?.overdueCount),
      safeNumber(billingKPI?.fatture_scadute_count),
    );

    if (overdueAmount > 0 || overdueCount > 0) {
      return {
        tone: "red" as ExecutiveTone,
        title: "Incassi da sbloccare",
        detail: `${eur(overdueAmount)} scaduti o in ritardo. Prima azione: sollecita clienti e aggiorna gli incassi.`,
        route: "/azienda/documenti/incassi",
        cta: "Apri incassi",
      };
    }
    if (finance.cashFlowNet < 0) {
      return {
        tone: "orange" as ExecutiveTone,
        title: "Cassa da proteggere",
        detail: `${eur(finance.cashFlowNet)} di saldo mese. Prima azione: rinvia uscite non urgenti o accelera incassi.`,
        route: "/azienda/previsionale",
        cta: "Vedi previsionale",
      };
    }
    if (operations.lateOrders > 0) {
      return {
        tone: "orange" as ExecutiveTone,
        title: "Commesse in ritardo",
        detail: `${operations.lateOrders} commesse oltre data prevista. Prima azione: aggiorna pianificazione e cliente.`,
        route: "/azienda/ordini",
        cta: "Apri commesse",
      };
    }
    if (finance.marginThisMonth < 10 && finance.revenueThisMonth > 0) {
      return {
        tone: "orange" as ExecutiveTone,
        title: "Margine sotto target",
        detail: `Margine medio ${pct(finance.marginThisMonth)}. Prima azione: controlla anomalie, acquisti e costi non assegnati.`,
        route: "/azienda/ordini?tab=marginalita",
        cta: "Vedi marginalità",
      };
    }
    return {
      tone: "green" as ExecutiveTone,
      title: "Azienda sotto controllo",
      detail: "Nessuna urgenza critica: monitora cassa, margine e avanzamento commesse.",
      route: "/azienda/ordini",
      cta: "Vedi commesse",
    };
  }, [billingKPI, finance.cashFlowNet, finance.marginThisMonth, finance.revenueThisMonth, operations.lateOrders, operations.overdueAmount, operations.overduePayments, todayData]);

  // P4 — i KPI sono ora cliccabili e aprono il `DrilldownDrawer` quando
  // hanno un `drilldown` definito (prima il drawer era montato ma mai aperto).
  const executiveKpis = useMemo(() => [
    {
      label: "Venduto periodo",
      value: eur(finance.revenueThisMonth),
      hint: `vs precedente ${eur(finance.revenuePrevMonth)}`,
      icon: Euro,
      tone: "blue" as ExecutiveTone,
      drilldown: "revenue" as DrilldownType,
    },
    {
      // P2.5 — il valore è previsionale (entrate attese del mese - costi
      // pianificati). Il vecchio nome "Cassa netta mese" suggeriva un dato
      // consuntivo a rendiconto.
      label: "Saldo previsto mese",
      value: `${finance.cashFlowNet >= 0 ? "+" : ""}${eur(finance.cashFlowNet)}`,
      hint: `attesi ${eur(finance.thisMonthIncome)} · pianificati ${eur(finance.thisMonthOutflow)}`,
      icon: Wallet,
      tone: finance.cashFlowNet >= 0 ? "green" as ExecutiveTone : "red" as ExecutiveTone,
      drilldown: null as DrilldownType,
    },
    {
      label: "Da incassare",
      value: eur(finance.pendingRevenue),
      hint: operations.overdueAmount > 0 ? `${eur(operations.overdueAmount)} scaduti` : "nessuno scaduto operativo",
      icon: AlertTriangle,
      tone: operations.overdueAmount > 0 ? "red" as ExecutiveTone : "orange" as ExecutiveTone,
      drilldown: "late-orders" as DrilldownType,
    },
    {
      label: "Margine medio",
      value: pct(finance.marginThisMonth),
      hint: `mese precedente ${pct(finance.marginPrevMonth)}`,
      icon: TrendingUp,
      tone: finance.marginThisMonth >= 15 ? "green" as ExecutiveTone : finance.marginThisMonth >= 0 ? "orange" as ExecutiveTone : "red" as ExecutiveTone,
      drilldown: "margin" as DrilldownType,
    },
  ], [finance, operations.overdueAmount]);

  const { sediSelezionate, periodo } = useSedeFilter();
  const { data: sediData } = useSediAnalytics({ da: periodo.da, a: periodo.a });
  const sediVisibili = (sediData?.sedi ?? []).filter(
    (s) => sediSelezionate.length === 0 || sediSelezionate.includes(s.sede_id)
  );

  // ── Sezioni visibili in base ai permessi ──────────────────────────
  // Admin vede tutto, staff vede solo le sezioni per cui ha i permessi
  const showFinanza     = perms.isAdmin || perms.canViewPrimaNota || perms.canViewBilling || perms.canViewCosts || perms.canViewTesoreria;
  const showOperazioni  = perms.isAdmin || perms.canViewDashboard || perms.canViewOrders;
  const showCommerciale = perms.isAdmin || perms.canViewMarketingDashboard || perms.canViewMarketing;
  const showHR          = perms.isAdmin || perms.canViewPersone || perms.canViewEmployees;

  const todayStr = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const todayCap = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);

  return (
    <div className="space-y-3 sm:space-y-4">
      <DashboardSelectorBar title="Cruscotto Aziendale" />

      <DashboardPageHeader
        title="Cruscotto Aziendale"
        subtitle={`Centro di comando operativo, economico e commerciale — ${todayCap}`}
        icon={LayoutDashboard}
        toolbar={<CruscottoFilters filters={filters} onUpdate={updateFilters} compact />}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => window.print()}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Stampa / PDF</span>
          </Button>
        }
        className="print:mb-4"
      />

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span>Errore nel caricamento dei dati. Riprova tra qualche secondo.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start sm:self-auto gap-1.5 border-destructive/30 bg-background text-destructive hover:bg-destructive/10"
                onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.cruscotto.all })}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Riprova
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty State Guide */}
      {!isLoading && isDataEmpty && (
        <EmptyStateGuide hasOrders={hasOrders} hasLeads={hasLeads} hasCosts={hasCosts} />
      )}

      {!isDataEmpty && (
        <SectionErrorBoundary sectionName="Executive Summary">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:border-slate-200">
            <div className="grid gap-0 xl:grid-cols-[minmax(340px,0.58fr)_minmax(540px,1fr)]">
              <div className="bg-[#173b67] p-5 text-white sm:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
                      {executiveState.tone === "green" ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">Quadro direzionale</p>
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
                    const clickable = !!item.drilldown;
                    const cardClass = cn(
                      "rounded-xl border border-white/12 bg-white/9 p-4 text-left transition-colors",
                      clickable && "cursor-pointer hover:border-orange-300/40 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-orange-300/40",
                    );
                    const inner = (
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
                    );
                    return clickable ? (
                      <button
                        key={item.label}
                        type="button"
                        className={cardClass}
                        onClick={() => setDrilldown(item.drilldown)}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div key={item.label} className={cardClass}>{inner}</div>
                    );
                  })}
                </div>
              </div>

              <aside className="border-t border-slate-200 bg-gradient-to-br from-white to-orange-50/50 p-5 xl:border-l xl:border-t-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Andamento 12 mesi</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">Venduto, incassato e cassa</h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">Storico fisso · indipendente dai filtri periodo</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-blue-500" /> Venduto</span>
                    <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-orange-500" /> Incassato</span>
                    <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Cassa</span>
                  </div>
                </div>

                <div className="mt-4 h-[260px] rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={executiveTrend} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cruVendutoGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity={0.55} />
                        </linearGradient>
                        <linearGradient id="cruIncassatoGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f97316" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#f97316" stopOpacity={0.55} />
                        </linearGradient>
                        <linearGradient id="cruCassaArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#059669" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#edf2f7" />
                      <XAxis dataKey="mese" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" tickMargin={8} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={10}
                        stroke="#94a3b8"
                        tickMargin={6}
                        tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                        }}
                        formatter={(value, name) =>
                          name === "cassaArea"
                            ? [null, null]
                            : [
                                Number(value).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
                                name === "venduto" ? "Venduto" : name === "incassato" ? "Incassato" : "Cassa netta",
                              ]
                        }
                        labelFormatter={(label) => `Mese: ${label}`}
                      />
                      <Bar dataKey="venduto" fill="url(#cruVendutoGrad)" radius={[6, 6, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="incassato" fill="url(#cruIncassatoGrad)" radius={[6, 6, 0, 0]} maxBarSize={22} />
                      {/* Area sfumata sotto la linea cassa (stesso dataKey, solo fill) */}
                      <Area
                        type="monotone"
                        dataKey="cassa"
                        name="cassaArea"
                        stroke="transparent"
                        fill="url(#cruCassaArea)"
                        legendType="none"
                        tooltipType="none"
                      />
                      <Line
                        type="monotone"
                        dataKey="cassa"
                        stroke="#059669"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "#ffffff", stroke: "#059669", strokeWidth: 2 }}
                        activeDot={{ r: 5, fill: "#059669", stroke: "#ffffff", strokeWidth: 2 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </aside>
            </div>
          </section>
        </SectionErrorBoundary>
      )}

      {!isDataEmpty && (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 print:border-slate-200">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aree di controllo</p>
              <h2 className="text-lg font-semibold text-slate-950">Approfondisci solo quello che ti serve ora</h2>
            </div>
            <p className="text-sm text-slate-500">La sintesi resta sopra. Qui sotto trovi i dettagli separati per area.</p>
          </div>

          <Tabs value={cruscottoTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-5">
              <TabsTrigger value="sintesi" className="rounded-lg">Sintesi</TabsTrigger>
              <TabsTrigger value="finanza" className="rounded-lg" disabled={!showFinanza}>Finanza</TabsTrigger>
              <TabsTrigger value="operations" className="rounded-lg" disabled={!showOperazioni}>Operations</TabsTrigger>
              <TabsTrigger value="vendite" className="rounded-lg" disabled={!showCommerciale}>Vendite</TabsTrigger>
              <TabsTrigger value="team" className="rounded-lg" disabled={!showHR && sediVisibili.length === 0}>Team / sedi</TabsTrigger>
            </TabsList>

            <TabsContent value="sintesi" className="mt-4 space-y-4">
              <SectionErrorBoundary sectionName="Semaforo">
                <SemaforoBar
                  cashFlowNet={finance.cashFlowNet}
                  thisMonthIncome={finance.thisMonthIncome}
                  thisMonthOutflow={finance.thisMonthOutflow}
                  activeOrders={operations.activeOrders}
                  lateOrders={operations.lateOrders}
                  pendingRevenue={finance.pendingRevenue}
                  overdueAmount={operations.overdueAmount}
                  overduePayments={operations.overduePayments}
                  revenueThisMonth={finance.revenueThisMonth}
                  revenuePrevMonth={finance.revenuePrevMonth}
                />
              </SectionErrorBoundary>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <div className="lg:col-span-2">
                  <SectionErrorBoundary sectionName="Salute Aziendale">
                    <SaluteAziendale
                      revenueThisMonth={finance.revenueThisMonth}
                      revenuePrevMonth={finance.revenuePrevMonth}
                      marginThisMonth={finance.marginThisMonth}
                      cashFlowNet={finance.cashFlowNet}
                      thisMonthIncome={finance.thisMonthIncome}
                      thisMonthOutflow={finance.thisMonthOutflow}
                      activeOrders={operations.activeOrders}
                      lateOrders={operations.lateOrders}
                      overduePayments={operations.overduePayments}
                      overdueAmount={operations.overdueAmount}
                      pendingRevenue={finance.pendingRevenue}
                      supplierDebt={finance.supplierDebt}
                      isLoading={isLoading}
                    />
                  </SectionErrorBoundary>
                </div>
                <div className="lg:col-span-3">
                  <SectionErrorBoundary sectionName="Azioni Urgenti">
                    <AzioniUrgenti
                      overduePayments={operations.overduePayments}
                      overdueAmount={operations.overdueAmount}
                      lateOrders={operations.lateOrders}
                      cashFlowNet={finance.cashFlowNet}
                      staleLeads={marketing?.alerts?.stale_leads}
                      fattureBozza={billingKPI?.fatture_in_bozza}
                      proformaAperti={billingKPI?.proforma_aperti}
                      fattureScadute={billingKPI?.fatture_scadute_count}
                      fattureScaduteAmount={billingKPI?.scaduto}
                      suppliersDueAmount={todayData?.suppliersDueAmount}
                    />
                  </SectionErrorBoundary>
                </div>
              </div>

              {companyTargets?.monthly_revenue_target && (
                <SectionErrorBoundary sectionName="Target Mensile">
                  <TargetProgressBar
                    current={finance.revenueThisMonth}
                    target={companyTargets.monthly_revenue_target}
                    label="Target Fatturato Mensile"
                  />
                </SectionErrorBoundary>
              )}

              <SectionErrorBoundary sectionName="Alert Panel">
                <AlertPanel
                  marketingAlerts={marketing?.alerts}
                  operations={operations}
                  finance={finance}
                  todayData={todayData}
                  billingKPI={billingKPI}
                  isLoading={isLoading}
                />
              </SectionErrorBoundary>
            </TabsContent>

            <TabsContent value="finanza" className="mt-4 space-y-4">
              {showFinanza && (
                <>
                  <SectionErrorBoundary sectionName="Fatturazione KPI">
                    <BillingKPIWidget />
                  </SectionErrorBoundary>
                  <SectionErrorBoundary sectionName="Finanza">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <CashFlowForecast finance={finance} cashFlowForecast={cashFlowForecast} isLoading={isLoading} />
                      <FinanzaCashFlow finance={finance} isLoading={isLoading} />
                    </div>
                    <div className="mt-4">
                      <PrimaNotaScadenzarioWidget />
                    </div>
                  </SectionErrorBoundary>
                  <SectionErrorBoundary sectionName="Top Clienti">
                    <ClienteSituazioneWidget />
                  </SectionErrorBoundary>
                  <SectionErrorBoundary sectionName="Punto di Pareggio">
                    <PuntoDiPareggio />
                  </SectionErrorBoundary>
                </>
              )}
            </TabsContent>

            <TabsContent value="operations" className="mt-4 space-y-4">
              {showOperazioni && (
                <>
                  <SectionErrorBoundary sectionName="Focus Oggi">
                    <TodayFocus todayData={todayData} isLoading={isLoading} dateFrom={todayDateFrom} dateTo={todayDateTo} onDateRangeChange={updateTodayDateRange} />
                  </SectionErrorBoundary>
                  <SectionErrorBoundary sectionName="Operazioni">
                    <OperationsDelivery operations={operations} weeklyAgenda={weeklyAgenda} isLoading={isLoading} />
                  </SectionErrorBoundary>
                  <SectionErrorBoundary sectionName="Marginalità Cantieri">
                    <MarginalitaWidget />
                  </SectionErrorBoundary>
                </>
              )}
            </TabsContent>

            <TabsContent value="vendite" className="mt-4 space-y-4">
              {showCommerciale && (
                <>
                  <SectionErrorBoundary sectionName="Vendite">
                    <div className="space-y-4">
                      <SalesControl sales={marketing?.sales_performance} kpi={marketing?.kpi} isLoading={isLoading} />
                      <PipelineForecast kpi={marketing?.kpi} funnel={marketing?.funnel} isLoading={isLoading} />
                    </div>
                  </SectionErrorBoundary>
                  <SectionErrorBoundary sectionName="Customer LTV AI">
                    <SilvioCustomerLTVPanel />
                  </SectionErrorBoundary>
                  <SectionErrorBoundary sectionName="Marketing">
                    <MarketingControl sources={marketing?.sources} funnel={marketing?.funnel} isLoading={isLoading} />
                  </SectionErrorBoundary>
                </>
              )}
            </TabsContent>

            <TabsContent value="team" className="mt-4 space-y-4">
              {showHR && (
                <SectionErrorBoundary sectionName="HR & Trend">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <HRPerformance sales={marketing?.sales_performance} isLoading={isLoading} />
                    <CruscottoTrend trend={marketing?.trend} isLoading={isLoading} />
                  </div>
                </SectionErrorBoundary>
              )}

              {showFinanza && sediVisibili.length > 0 && (
                <SectionErrorBoundary sectionName="Analytics per Sede">
                  <div className="space-y-4 rounded-lg border bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-semibold text-[#1E3A5F]">P&amp;L per Sede</h2>
                      <SedeFilterBar />
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                      <div className="lg:col-span-1">
                        <SedeIncidenceChart
                          sedi={sediVisibili}
                          metric="ricavi"
                          title="Incidenza Ricavi per Sede"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <SedeIncidenzaTable />
                      </div>
                    </div>
                  </div>
                </SectionErrorBoundary>
              )}
            </TabsContent>
          </Tabs>
        </section>
      )}

      {/* Drill-down Drawer */}
      <DrilldownDrawer
        type={drilldown}
        onClose={() => setDrilldown(null)}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
      />
    </div>
  );
}

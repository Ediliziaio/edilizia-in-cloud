import { useState } from "react";
import { useCruscottoData } from "@/hooks/useCruscottoData";
import { usePermissions } from "@/hooks/usePermissions";
import { CruscottoFilters } from "@/components/cruscotto/CruscottoFilters";
import { CruscottoHero } from "@/components/cruscotto/CruscottoHero";
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
import { DashboardTabBar } from "@/components/dashboard/DashboardTabBar";
import { AlertCircle, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useDashboardBillingKPI } from "@/hooks/billing/useDashboardBillingKPI";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export default function CruscottoAziendale() {
  const perms = usePermissions();
  const {
    marketing, operations, finance, weeklyAgenda, invoiceStats, companyTargets,
    todayData, cashFlowForecast,
    todayDateFrom, todayDateTo, updateTodayDateRange,
    isLoading, error, filters, updateFilters,
  } = useCruscottoData();
  const [drilldown, setDrilldown] = useState<DrilldownType>(null);
  const { isNative } = useBillingMode();
  const effectiveCompanyId = useEffectiveCompanyId();
  const { data: billingKPI } = useDashboardBillingKPI(effectiveCompanyId, isNative);

  const hasOrders = operations.activeOrders > 0 || finance.revenueThisMonth > 0;
  const hasLeads = (marketing?.kpi?.leads_total ?? 0) > 0;
  const hasCosts = finance.supplierDebt > 0 || finance.thisMonthOutflow > 0;
  const isDataEmpty = !hasOrders && !hasLeads && !hasCosts;

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
      {/* Tab di navigazione tra dashboard */}
      <DashboardTabBar />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 print:mb-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Cruscotto Aziendale</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Centro di comando — {todayCap}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <CruscottoFilters filters={filters} onUpdate={updateFilters} />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => window.print()}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Stampa / PDF</span>
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Errore nel caricamento dei dati. Riprova tra qualche secondo.</AlertDescription>
        </Alert>
      )}

      {/* Empty State Guide */}
      {!isLoading && isDataEmpty && (
        <EmptyStateGuide hasOrders={hasOrders} hasLeads={hasLeads} hasCosts={hasCosts} />
      )}

      {/* ═══════════════════════════════════════════════════════
           LIVELLO 1: SEMAFORO — Cassa 🟢 | Lavoro 🟢 | Incassi 🟢
           L'imprenditore capisce in 1 secondo lo stato dell'azienda
           ═══════════════════════════════════════════════════════ */}
      {!isDataEmpty && (
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
      )}

      {/* ═══════════════════════════════════════════════════════
           LIVELLO 2: SALUTE AZIENDALE — Score 0-100 con gauge
           + LIVELLO 3: AZIONI URGENTI — "3 cose da fare OGGI"
           ═══════════════════════════════════════════════════════ */}
      {!isDataEmpty && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Gauge salute — 2 colonne */}
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

          {/* Azioni urgenti — 3 colonne */}
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
      )}

      {/* Target progress bar */}
      {companyTargets?.monthly_revenue_target && (
        <SectionErrorBoundary sectionName="Target Mensile">
          <TargetProgressBar
            current={finance.revenueThisMonth}
            target={companyTargets.monthly_revenue_target}
            label="Target Fatturato Mensile"
          />
        </SectionErrorBoundary>
      )}

      {/* SEZIONE: HERO — 4 KPI grandi */}
      <SectionErrorBoundary sectionName="Hero KPI">
        <CruscottoHero
          finance={finance}
          operations={operations}
          kpi={marketing?.kpi}
          monthRevenue={cashFlowForecast?.monthRevenue ?? finance.revenueThisMonth}
          quarterRevenue={cashFlowForecast?.quarterRevenue ?? 0}
          ytdRevenue={cashFlowForecast?.ytdRevenue ?? 0}
          isLoading={isLoading}
        />
      </SectionErrorBoundary>

      {/* KPI FATTURAZIONE NATIVA */}
      {showFinanza && (
        <SectionErrorBoundary sectionName="Fatturazione KPI">
          <BillingKPIWidget />
        </SectionErrorBoundary>
      )}

      {/* ALERT PANEL */}
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

      {/* FOCUS OGGI */}
      <SectionErrorBoundary sectionName="Focus Oggi">
        <TodayFocus todayData={todayData} isLoading={isLoading} dateFrom={todayDateFrom} dateTo={todayDateTo} onDateRangeChange={updateTodayDateRange} />
      </SectionErrorBoundary>

      {/* ── Multi-Sede: P&L e Incidenza ────────────────────── */}
      {showFinanza && sediVisibili.length > 0 && (
        <SectionErrorBoundary sectionName="Analytics per Sede">
          <div className="space-y-4 rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-[#1E3A5F]">P&amp;L per Sede</h2>
              <SedeFilterBar />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

      {/* SEZIONE 4: FINANZA & CASH FLOW */}
      {showFinanza && (
        <SectionErrorBoundary sectionName="Finanza">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <CashFlowForecast finance={finance} cashFlowForecast={cashFlowForecast} isLoading={isLoading} />
            <FinanzaCashFlow finance={finance} isLoading={isLoading} />
          </div>
          <div className="mt-4">
            <PrimaNotaScadenzarioWidget />
          </div>
        </SectionErrorBoundary>
      )}

      {/* SEZIONE 4b: SITUAZIONE TOP CLIENTI */}
      {showFinanza && (
        <SectionErrorBoundary sectionName="Top Clienti">
          <ClienteSituazioneWidget />
        </SectionErrorBoundary>
      )}

      {/* SEZIONE 4c: PUNTO DI PAREGGIO */}
      {showFinanza && (
        <SectionErrorBoundary sectionName="Punto di Pareggio">
          <PuntoDiPareggio />
        </SectionErrorBoundary>
      )}

      {/* SEZIONE 5: PERFORMANCE COMMERCIALE */}
      {showCommerciale && (
        <SectionErrorBoundary sectionName="Vendite">
          <div className="space-y-4">
            <SalesControl sales={marketing?.sales_performance} kpi={marketing?.kpi} isLoading={isLoading} />
            <PipelineForecast kpi={marketing?.kpi} funnel={marketing?.funnel} isLoading={isLoading} />
          </div>
        </SectionErrorBoundary>
      )}

      {/* SEZIONE 6: OPERAZIONI */}
      {showOperazioni && (
        <SectionErrorBoundary sectionName="Operazioni">
          <OperationsDelivery operations={operations} weeklyAgenda={weeklyAgenda} isLoading={isLoading} />
        </SectionErrorBoundary>
      )}

      {/* SEZIONE 6b: MARGINALITÀ CANTIERI */}
      {showOperazioni && (
        <SectionErrorBoundary sectionName="Marginalità Cantieri">
          <MarginalitaWidget />
        </SectionErrorBoundary>
      )}

      {/* SEZIONE 7: PERFORMANCE TEAM & TREND */}
      {showHR && (
        <SectionErrorBoundary sectionName="HR & Trend">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <HRPerformance sales={marketing?.sales_performance} isLoading={isLoading} />
            <CruscottoTrend trend={marketing?.trend} isLoading={isLoading} />
          </div>
        </SectionErrorBoundary>
      )}

      {/* SEZIONE 8: ANALISI FONTI & MARKETING */}
      {showCommerciale && (
        <SectionErrorBoundary sectionName="Marketing">
          <MarketingControl sources={marketing?.sources} funnel={marketing?.funnel} isLoading={isLoading} />
        </SectionErrorBoundary>
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

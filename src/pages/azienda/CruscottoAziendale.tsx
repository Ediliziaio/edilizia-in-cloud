import { useState } from "react";
import { useCruscottoData } from "@/hooks/useCruscottoData";
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
import { TargetProgressBar } from "@/components/cruscotto/TargetProgressBar";
import { PrimaNotaScadenzarioWidget } from "@/components/cruscotto/PrimaNotaScadenzarioWidget";
import { AlertCircle, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function CruscottoAziendale() {
  const {
    marketing, operations, finance, weeklyAgenda, invoiceStats, companyTargets,
    todayData, cashFlowForecast,
    todayDateFrom, todayDateTo, updateTodayDateRange,
    isLoading, error, filters, updateFilters,
  } = useCruscottoData();
  const [drilldown, setDrilldown] = useState<DrilldownType>(null);

  const hasOrders = operations.activeOrders > 0 || finance.revenueThisMonth > 0;
  const hasLeads = (marketing?.kpi?.leads_total ?? 0) > 0;
  const hasCosts = finance.supplierDebt > 0 || finance.thisMonthOutflow > 0;
  const isDataEmpty = !hasOrders && !hasLeads && !hasCosts;

  const todayStr = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const todayCap = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between print:mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cruscotto Aziendale</h1>
          <p className="text-sm text-muted-foreground">Centro di comando — {todayCap}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="print:hidden">
            <CruscottoFilters filters={filters} onUpdate={updateFilters} />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 print:hidden"
            onClick={() => window.print()}
          >
            <Download className="h-4 w-4" />
            Stampa / PDF
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

      {/* SEZIONE 1: HERO — 4 KPI grandi */}
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

      {/* SEZIONE 2: ALERT PANEL */}
      <SectionErrorBoundary sectionName="Alert Panel">
        <AlertPanel
          marketingAlerts={marketing?.alerts}
          operations={operations}
          finance={finance}
          todayData={todayData}
          isLoading={isLoading}
        />
      </SectionErrorBoundary>

      {/* SEZIONE 3: FOCUS OGGI */}
      <SectionErrorBoundary sectionName="Focus Oggi">
        <TodayFocus todayData={todayData} isLoading={isLoading} dateFrom={todayDateFrom} dateTo={todayDateTo} onDateRangeChange={updateTodayDateRange} />
      </SectionErrorBoundary>

      {/* SEZIONE 4: FINANZA & CASH FLOW */}
      <SectionErrorBoundary sectionName="Finanza">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <CashFlowForecast finance={finance} cashFlowForecast={cashFlowForecast} isLoading={isLoading} />
          <FinanzaCashFlow finance={finance} isLoading={isLoading} />
        </div>
        <div className="mt-4">
          <PrimaNotaScadenzarioWidget />
        </div>
      </SectionErrorBoundary>

      {/* SEZIONE 5: PERFORMANCE COMMERCIALE */}
      <SectionErrorBoundary sectionName="Vendite">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SalesControl sales={marketing?.sales_performance} kpi={marketing?.kpi} isLoading={isLoading} />
          <PipelineForecast kpi={marketing?.kpi} funnel={marketing?.funnel} isLoading={isLoading} />
        </div>
      </SectionErrorBoundary>

      {/* SEZIONE 6: OPERAZIONI */}
      <SectionErrorBoundary sectionName="Operazioni">
        <OperationsDelivery operations={operations} weeklyAgenda={weeklyAgenda} isLoading={isLoading} />
      </SectionErrorBoundary>

      {/* SEZIONE 7: PERFORMANCE TEAM & TREND */}
      <SectionErrorBoundary sectionName="HR & Trend">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <HRPerformance sales={marketing?.sales_performance} isLoading={isLoading} />
          <CruscottoTrend trend={marketing?.trend} isLoading={isLoading} />
        </div>
      </SectionErrorBoundary>

      {/* SEZIONE 8: ANALISI FONTI & MARKETING */}
      <SectionErrorBoundary sectionName="Marketing">
        <MarketingControl sources={marketing?.sources} funnel={marketing?.funnel} isLoading={isLoading} />
      </SectionErrorBoundary>

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

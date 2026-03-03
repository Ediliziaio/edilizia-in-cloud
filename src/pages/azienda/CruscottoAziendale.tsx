import { useCruscottoData } from "@/hooks/useCruscottoData";
import { CruscottoFilters } from "@/components/cruscotto/CruscottoFilters";
import { CompanyHealthScore } from "@/components/cruscotto/CompanyHealthScore";
import { ExecutiveSummary } from "@/components/cruscotto/ExecutiveSummary";
import { CruscottoAlerts } from "@/components/cruscotto/CruscottoAlerts";
import { ExecutiveOverview } from "@/components/cruscotto/ExecutiveOverview";
import { MarketingControl } from "@/components/cruscotto/MarketingControl";
import { SalesControl } from "@/components/cruscotto/SalesControl";
import { PipelineForecast } from "@/components/cruscotto/PipelineForecast";
import { OperationsDelivery } from "@/components/cruscotto/OperationsDelivery";
import { FinanzaCashFlow } from "@/components/cruscotto/FinanzaCashFlow";
import { HRPerformance } from "@/components/cruscotto/HRPerformance";
import { CruscottoTrend } from "@/components/cruscotto/CruscottoTrend";
import { QuickActions } from "@/components/cruscotto/QuickActions";
import { EmptyStateGuide } from "@/components/cruscotto/EmptyStateGuide";
import { WeeklyAgenda } from "@/components/cruscotto/WeeklyAgenda";
import { DailyPriorities } from "@/components/cruscotto/DailyPriorities";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function CruscottoAziendale() {
  const { marketing, operations, finance, weeklyAgenda, isLoading, error, filters, updateFilters } = useCruscottoData();

  const hasOrders = operations.activeOrders > 0 || finance.revenueThisMonth > 0;
  const hasLeads = (marketing?.kpi?.leads_total ?? 0) > 0;
  const hasCosts = finance.supplierDebt > 0 || finance.thisMonthOutflow > 0;
  const isDataEmpty = !hasOrders && !hasLeads && !hasCosts;

  if (isLoading && !marketing) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cruscotto Aziendale</h1>
          <p className="text-sm text-muted-foreground">Centro di controllo unificato — Gestione Interna + Marketing & Vendite</p>
        </div>
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cruscotto Aziendale</h1>
          <p className="text-sm text-muted-foreground">Centro di controllo unificato — Gestione Interna + Marketing & Vendite</p>
        </div>
        <QuickActions />
      </div>

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Errore nel caricamento dei dati: {error.message}</AlertDescription>
        </Alert>
      )}

      {/* Empty State Guide */}
      {!isLoading && isDataEmpty && (
        <EmptyStateGuide hasOrders={hasOrders} hasLeads={hasLeads} hasCosts={hasCosts} />
      )}

      {/* Global Filters */}
      <CruscottoFilters filters={filters} onUpdate={updateFilters} />

      {/* === ABOVE THE FOLD: CEO Priority === */}

      {/* Daily Priorities + Weekly Agenda */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DailyPriorities
          operations={operations}
          finance={finance}
          marketingAlerts={marketing?.alerts}
          isLoading={isLoading}
        />
        <WeeklyAgenda
          data={weeklyAgenda}
          isLoading={isLoading}
        />
      </div>

      {/* Health Score + Executive Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4">
        <CompanyHealthScore
          kpi={marketing?.kpi}
          finance={finance}
          operations={operations}
          isLoading={isLoading}
        />
        <ExecutiveSummary
          kpi={marketing?.kpi}
          kpiPrev={marketing?.kpi_prev}
          finance={finance}
          operations={operations}
          isLoading={isLoading}
        />
      </div>

      {/* Alerts */}
      <CruscottoAlerts
        marketingAlerts={marketing?.alerts}
        operations={operations}
        finance={finance}
        isLoading={isLoading}
      />

      {/* Executive Overview KPIs */}
      <ExecutiveOverview
        kpi={marketing?.kpi}
        kpiPrev={marketing?.kpi_prev}
        finance={finance}
        isLoading={isLoading}
      />

      {/* === BELOW THE FOLD === */}

      {/* Finance + Operations */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <FinanzaCashFlow
          finance={finance}
          isLoading={isLoading}
        />
        <OperationsDelivery
          operations={operations}
          isLoading={isLoading}
        />
      </div>

      {/* Marketing + Sales */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <MarketingControl
          sources={marketing?.sources}
          funnel={marketing?.funnel}
          isLoading={isLoading}
        />
        <SalesControl
          sales={marketing?.sales_performance}
          kpi={marketing?.kpi}
          isLoading={isLoading}
        />
      </div>

      {/* Pipeline & Forecast + HR */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <PipelineForecast
          kpi={marketing?.kpi}
          funnel={marketing?.funnel}
          isLoading={isLoading}
        />
        <HRPerformance
          sales={marketing?.sales_performance}
          isLoading={isLoading}
        />
      </div>

      {/* Trend */}
      <CruscottoTrend
        trend={marketing?.trend}
        isLoading={isLoading}
      />
    </div>
  );
}

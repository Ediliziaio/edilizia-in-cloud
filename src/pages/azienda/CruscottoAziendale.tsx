import { memo, lazy, Suspense } from "react";
import { useCruscottoData } from "@/hooks/useCruscottoData";
import { CruscottoFilters } from "@/components/cruscotto/CruscottoFilters";
import { CruscottoAlerts } from "@/components/cruscotto/CruscottoAlerts";
import { ExecutiveOverview } from "@/components/cruscotto/ExecutiveOverview";
import { MarketingControl } from "@/components/cruscotto/MarketingControl";
import { SalesControl } from "@/components/cruscotto/SalesControl";
import { PipelineForecast } from "@/components/cruscotto/PipelineForecast";
import { OperationsDelivery } from "@/components/cruscotto/OperationsDelivery";
import { FinanzaCashFlow } from "@/components/cruscotto/FinanzaCashFlow";
import { HRPerformance } from "@/components/cruscotto/HRPerformance";
import { CruscottoTrend } from "@/components/cruscotto/CruscottoTrend";
import { Loader2 } from "lucide-react";

function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function CruscottoAziendale() {
  const { marketing, operations, finance, isLoading, error, filters, updateFilters } = useCruscottoData();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cruscotto Aziendale</h1>
        <p className="text-sm text-muted-foreground">Centro di controllo unificato — Gestione Interna + Marketing & Vendite</p>
      </div>

      {/* Global Filters */}
      <CruscottoFilters filters={filters} onUpdate={updateFilters} />

      {/* Alerts */}
      <CruscottoAlerts
        marketingAlerts={marketing?.alerts}
        operations={operations}
        finance={finance}
        isLoading={isLoading}
      />

      {/* Executive Overview */}
      <ExecutiveOverview
        kpi={marketing?.kpi}
        kpiPrev={marketing?.kpi_prev}
        finance={finance}
        isLoading={isLoading}
      />

      {/* Marketing + Sales row */}
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

      {/* Pipeline & Forecast + Operations */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <PipelineForecast
          kpi={marketing?.kpi}
          funnel={marketing?.funnel}
          isLoading={isLoading}
        />
        <OperationsDelivery
          operations={operations}
          isLoading={isLoading}
        />
      </div>

      {/* Finance + HR */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <FinanzaCashFlow
          finance={finance}
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

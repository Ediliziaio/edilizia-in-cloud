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
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function CruscottoAziendale() {
  const { marketing, operations, finance, isLoading, error, filters, updateFilters } = useCruscottoData();

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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cruscotto Aziendale</h1>
        <p className="text-sm text-muted-foreground">Centro di controllo unificato — Gestione Interna + Marketing & Vendite</p>
      </div>

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Errore nel caricamento dei dati: {error.message}</AlertDescription>
        </Alert>
      )}

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

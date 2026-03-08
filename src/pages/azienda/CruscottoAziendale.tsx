import { useCruscottoData } from "@/hooks/useCruscottoData";
import { CruscottoFilters } from "@/components/cruscotto/CruscottoFilters";
import { CompanyHealthScore } from "@/components/cruscotto/CompanyHealthScore";
import { CruscottoAlerts } from "@/components/cruscotto/CruscottoAlerts";
import { ExecutiveOverview } from "@/components/cruscotto/ExecutiveOverview";
import { MarketingControl } from "@/components/cruscotto/MarketingControl";
import { SalesControl } from "@/components/cruscotto/SalesControl";
import { PipelineForecast } from "@/components/cruscotto/PipelineForecast";
import { OperationsDelivery } from "@/components/cruscotto/OperationsDelivery";
import { FinanzaCashFlow } from "@/components/cruscotto/FinanzaCashFlow";
import { HRPerformance } from "@/components/cruscotto/HRPerformance";
import { CruscottoTrend } from "@/components/cruscotto/CruscottoTrend";
import { EmptyStateGuide } from "@/components/cruscotto/EmptyStateGuide";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Landmark, Megaphone, Handshake, Settings2 } from "lucide-react";
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
          <p className="text-sm text-muted-foreground">Centro di controllo unificato</p>
        </div>
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cruscotto Aziendale</h1>
        <p className="text-sm text-muted-foreground">Centro di controllo unificato</p>
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

      {/* Health Score — full width */}
      <CompanyHealthScore
        kpi={marketing?.kpi}
        finance={finance}
        operations={operations}
        isLoading={isLoading}
      />

      {/* Executive Overview KPIs */}
      <ExecutiveOverview
        kpi={marketing?.kpi}
        kpiPrev={marketing?.kpi_prev}
        finance={finance}
        operations={operations}
        isLoading={isLoading}
      />

      {/* Alerts */}
      <CruscottoAlerts
        marketingAlerts={marketing?.alerts}
        operations={operations}
        finance={finance}
        isLoading={isLoading}
      />

      {/* Tabbed detail sections */}
      <Tabs defaultValue="finanza" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="finanza" className="gap-1.5">
            <Landmark className="h-4 w-4" />
            Finanza
          </TabsTrigger>
          <TabsTrigger value="marketing" className="gap-1.5">
            <Megaphone className="h-4 w-4" />
            Marketing
          </TabsTrigger>
          <TabsTrigger value="vendite" className="gap-1.5">
            <Handshake className="h-4 w-4" />
            Vendite
          </TabsTrigger>
          <TabsTrigger value="operazioni" className="gap-1.5">
            <Settings2 className="h-4 w-4" />
            Operazioni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="finanza">
          <FinanzaCashFlow finance={finance} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="marketing">
          <MarketingControl sources={marketing?.sources} funnel={marketing?.funnel} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="vendite">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <SalesControl sales={marketing?.sales_performance} kpi={marketing?.kpi} isLoading={isLoading} />
            <PipelineForecast kpi={marketing?.kpi} funnel={marketing?.funnel} isLoading={isLoading} />
          </div>
          <div className="mt-6">
            <HRPerformance sales={marketing?.sales_performance} isLoading={isLoading} />
          </div>
        </TabsContent>

        <TabsContent value="operazioni">
          <OperationsDelivery operations={operations} weeklyAgenda={weeklyAgenda} isLoading={isLoading} />
        </TabsContent>
      </Tabs>

      {/* Trend */}
      <CruscottoTrend trend={marketing?.trend} isLoading={isLoading} />
    </div>
  );
}

import { useState } from "react";
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
import { SectionErrorBoundary } from "@/components/cruscotto/SectionErrorBoundary";
import { DrilldownDrawer, type DrilldownType } from "@/components/cruscotto/DrilldownDrawer";
import { TargetProgressBar } from "@/components/cruscotto/TargetProgressBar";
import { PrimaNotaScadenzarioWidget } from "@/components/cruscotto/PrimaNotaScadenzarioWidget";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Landmark, Megaphone, Handshake, Settings2, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function CruscottoAziendale() {
  const { marketing, operations, finance, weeklyAgenda, invoiceStats, companyTargets, isLoading, error, filters, updateFilters } = useCruscottoData();
  const [drilldown, setDrilldown] = useState<DrilldownType>(null);

  const hasOrders = operations.activeOrders > 0 || finance.revenueThisMonth > 0;
  const hasLeads = (marketing?.kpi?.leads_total ?? 0) > 0;
  const hasCosts = finance.supplierDebt > 0 || finance.thisMonthOutflow > 0;
  const isDataEmpty = !hasOrders && !hasLeads && !hasCosts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between print:mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cruscotto Aziendale</h1>
          <p className="text-sm text-muted-foreground">Centro di controllo unificato</p>
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
      <div className="print:hidden">
        <CruscottoFilters filters={filters} onUpdate={updateFilters} />
      </div>

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

      {/* Health Score — full width */}
      <SectionErrorBoundary sectionName="Health Score">
        <CompanyHealthScore
          kpi={marketing?.kpi}
          finance={finance}
          operations={operations}
          isLoading={isLoading}
        />
      </SectionErrorBoundary>

      {/* Executive Overview KPIs */}
      <SectionErrorBoundary sectionName="KPI Executive">
        <ExecutiveOverview
          kpi={marketing?.kpi}
          kpiPrev={marketing?.kpi_prev}
          finance={finance}
          operations={operations}
          isLoading={isLoading}
          onDrilldown={(type: string) => setDrilldown(type as DrilldownType)}
        />
      </SectionErrorBoundary>

      {/* Alerts */}
      <SectionErrorBoundary sectionName="Alerts">
        <CruscottoAlerts
          marketingAlerts={marketing?.alerts}
          operations={operations}
          finance={finance}
          isLoading={isLoading}
          companyTargets={companyTargets}
          invoiceStats={invoiceStats}
        />
      </SectionErrorBoundary>

      {/* Tabbed detail sections */}
      <Tabs defaultValue="finanza" className="w-full print:hidden">
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
          <SectionErrorBoundary sectionName="Finanza">
            <div className="space-y-6">
              <FinanzaCashFlow finance={finance} isLoading={isLoading} />
              <PrimaNotaScadenzarioWidget />
            </div>
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="marketing">
          <SectionErrorBoundary sectionName="Marketing">
            <MarketingControl sources={marketing?.sources} funnel={marketing?.funnel} isLoading={isLoading} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="vendite">
          <SectionErrorBoundary sectionName="Vendite">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <SalesControl sales={marketing?.sales_performance} kpi={marketing?.kpi} isLoading={isLoading} />
              <PipelineForecast kpi={marketing?.kpi} funnel={marketing?.funnel} isLoading={isLoading} />
            </div>
            <div className="mt-6">
              <HRPerformance sales={marketing?.sales_performance} isLoading={isLoading} />
            </div>
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="operazioni">
          <SectionErrorBoundary sectionName="Operazioni">
            <OperationsDelivery operations={operations} weeklyAgenda={weeklyAgenda} isLoading={isLoading} />
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>

      {/* Trend */}
      <SectionErrorBoundary sectionName="Trend">
        <CruscottoTrend trend={marketing?.trend} isLoading={isLoading} />
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

import { LayoutDashboard, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMarketingDashboard } from "@/hooks/useMarketingDashboard";
import { SalesTargetsDialog } from "@/components/marketing/dashboard/SalesTargetsDialog";
import { DashboardFilters } from "@/components/marketing/dashboard/DashboardFilters";
import { DashboardStrategicKPI } from "@/components/marketing/dashboard/DashboardStrategicKPI";
import { DashboardKPICards } from "@/components/marketing/dashboard/DashboardKPICards";
import { DashboardAlerts } from "@/components/marketing/dashboard/DashboardAlerts";
import { DashboardInsights } from "@/components/marketing/dashboard/DashboardInsights";
import { DashboardFunnel } from "@/components/marketing/dashboard/DashboardFunnel";
import { DashboardSalesTable } from "@/components/marketing/dashboard/DashboardSalesTable";
import { DashboardCallCenter } from "@/components/marketing/dashboard/DashboardCallCenter";
import { DashboardSourcesTable } from "@/components/marketing/dashboard/DashboardSourcesTable";
import { DashboardForecast } from "@/components/marketing/dashboard/DashboardForecast";
import { DashboardTrendChart } from "@/components/marketing/dashboard/DashboardTrendChart";
import { exportToCSV } from "@/lib/csvExport";

export default function MarketingDashboard() {
  const { data, isLoading, refetch, filters, updateFilters, permissions } = useMarketingDashboard();

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
      { metrica: "Pipeline Attiva", valore: String(kpi.pipeline_active_value) },
      { metrica: "Forecast 30gg", valore: String(kpi.forecast_30d) },
      { metrica: "Lead→App.", valore: `${kpi.lead_to_appointment_rate}%` },
      { metrica: "App.→Contratto", valore: `${kpi.appointment_to_contract_rate}%` },
      { metrica: "Lead→Contratto", valore: `${kpi.lead_to_contract_rate}%` },
      ...(kpi.total_spend > 0 ? [
        { metrica: "Spesa Campagne", valore: String(kpi.total_spend) },
        { metrica: "CPL", valore: String(kpi.cpl) },
        { metrica: "CPA", valore: String(kpi.cpa) },
      ] : []),
      ...(kpi.calls_total > 0 ? [
        { metrica: "Chiamate Totali", valore: String(kpi.calls_total) },
        { metrica: "Chiamate Risposte", valore: String(kpi.calls_answered) },
        { metrica: "Tasso Contatto", valore: `${kpi.contact_rate}%` },
      ] : []),
    ];
    exportToCSV(rows, [{ key: "metrica", label: "Metrica" }, { key: "valore", label: "Valore" }], "dashboard-marketing-kpi.csv");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6" />
            Dashboard Marketing & Vendite
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cruscotto decisionale</p>
        </div>
        <div className="flex items-center gap-2">
          {permissions.isAdmin && <SalesTargetsDialog />}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Aggiorna
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportKPI} disabled={!data?.kpi}>
            <Download className="h-4 w-4 mr-1.5" />
            Esporta
          </Button>
        </div>
      </div>

      {/* Filters */}
      <DashboardFilters filters={filters} onUpdate={updateFilters} hideUserFilter={permissions.onlyAssigned} />

      {/* 1. KPI Strategici (6 grandi) */}
      <DashboardStrategicKPI kpi={data?.kpi} kpiPrev={data?.kpi_prev} isLoading={isLoading} />

      {/* KPI Secondari */}
      <DashboardKPICards kpi={data?.kpi} kpiPrev={data?.kpi_prev} isLoading={isLoading} />

      {/* 2. Alert Operativi */}
      <DashboardAlerts alerts={data?.alerts} isLoading={isLoading} />

      {/* 3. Sintesi Strategica */}
      <DashboardInsights
        kpi={data?.kpi}
        kpiPrev={data?.kpi_prev}
        sales={data?.sales_performance}
        sources={data?.sources}
        alerts={data?.alerts}
        isLoading={isLoading}
      />

      {/* 4. Funnel + Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardFunnel funnel={data?.funnel} isLoading={isLoading} />
        <DashboardForecast kpi={data?.kpi} isLoading={isLoading} />
      </div>

      {/* 5. Performance Commerciali */}
      <DashboardSalesTable sales={data?.sales_performance} isLoading={isLoading} />

      {/* 6. Call Center */}
      <DashboardCallCenter callCenter={data?.call_center} isLoading={isLoading} />

      {/* 7. Analisi Fonti + ROI */}
      <DashboardSourcesTable sources={data?.sources} isLoading={isLoading} />

      {/* 8. Trend Temporale */}
      <DashboardTrendChart trend={data?.trend} isLoading={isLoading} />
    </div>
  );
}

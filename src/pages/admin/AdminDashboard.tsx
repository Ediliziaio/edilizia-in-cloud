import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useAdminDashboardData } from "@/hooks/useAdminDashboardData";
import { useAdminRevenueData } from "@/hooks/useAdminRevenueData";
import { AdminStatCards } from "@/components/admin/dashboard/AdminStatCards";
import { AdminRevenueKPIs } from "@/components/admin/dashboard/AdminRevenueKPIs";
import { AdminMrrChart } from "@/components/admin/dashboard/AdminMrrChart";
import { AdminMrrMovements } from "@/components/admin/dashboard/AdminMrrMovements";
import { AdminRevenueBySector } from "@/components/admin/dashboard/AdminRevenueBySector";
import { AdminHealthSummary } from "@/components/admin/dashboard/AdminHealthSummary";
import { AdminTrialIntelligence } from "@/components/admin/dashboard/AdminTrialIntelligence";
import { AdminRecentCompanies } from "@/components/admin/dashboard/AdminRecentCompanies";
import { AdminRecentActivity } from "@/components/admin/dashboard/AdminRecentActivity";
import { AdminDunning } from "@/components/admin/dashboard/AdminDunning";
import { AdminFeatureUsage } from "@/components/admin/dashboard/AdminFeatureUsage";
import { AdminSystemHealth } from "@/components/admin/dashboard/AdminSystemHealth";
import { AdminCohortAnalysis } from "@/components/admin/dashboard/AdminCohortAnalysis";
import { AdminRevenueForecast } from "@/components/admin/dashboard/AdminRevenueForecast";
import { AdminUpsellAlerts } from "@/components/admin/dashboard/AdminUpsellAlerts";
import { DashboardDateFilter, getDefaultDateRange, type DateRange } from "@/components/admin/dashboard/DashboardDateFilter";
import { DashboardExport } from "@/components/admin/dashboard/DashboardExport";
import {
  useDashboardLayout,
  SortableWidget,
  WidgetConfigurator,
} from "@/components/admin/dashboard/DashboardWidgetLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";

export default function AdminDashboard() {
  const { permissions } = useSuperAdminPermissions();
  const { data: dashboardData, isLoading, isError, refetch } = useAdminDashboardData();
  const { data: revenueData, isLoading: revenueLoading } = useAdminRevenueData();
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const { widgets, toggleVisibility, reorder, resetLayout } = useDashboardLayout();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  if (!permissions.can_view_platform_stats) return <AccessDenied />;

  const stats = dashboardData?.stats ?? { totalCompanies: 0, totalOrders: 0, totalOrdersValue: 0, totalCustomers: 0, openSupportConversations: 0 };
  const mrrStats = dashboardData?.mrrStats ?? { mrr: 0, trialCount: 0, trialExpiringSoon: 0, churnRate: 0, activeCount: 0, expiredCount: 0 };
  const mrrChartData = dashboardData?.mrrChartData ?? [];
  const recentCompanies = dashboardData?.recentCompanies ?? [];
  const recentActivity = dashboardData?.recentActivity ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errore di caricamento</AlertTitle>
          <AlertDescription className="mt-2">
            Impossibile caricare i dati della dashboard.
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const topAtRisk = (revenueData?.healthScores || [])
    .filter((h) => h.health === "at_risk" || h.health === "critical")
    .sort((a, b) => a.score - b.score);

  const visibleWidgets = widgets.filter((w) => w.visible);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorder(String(active.id), String(over.id));
    }
  }

  // Widget renderer
  function renderWidget(widgetId: string) {
    switch (widgetId) {
      case "stat-cards":
        return <AdminStatCards stats={stats} />;
      case "revenue-kpis":
        return revenueData ? (
          <AdminRevenueKPIs mrr={revenueData.currentMrr} arr={revenueData.arr} nrr={revenueData.nrr} avgLtv={revenueData.avgLtv} />
        ) : null;
      case "mrr-chart":
        return <AdminMrrChart data={mrrChartData} currentMrr={mrrStats.mrr} />;
      case "mrr-movements":
        return revenueData ? <AdminMrrMovements data={revenueData.mrrMovements} /> : null;
      case "revenue-sector":
        return revenueData ? <AdminRevenueBySector data={revenueData.revenueBySector} /> : null;
      case "health-summary":
        return revenueData ? <AdminHealthSummary healthSummary={revenueData.healthSummary} topAtRisk={topAtRisk} /> : null;
      case "trial-intelligence":
        return revenueData ? <AdminTrialIntelligence data={revenueData.trialActivation} /> : null;
      case "revenue-forecast":
        return revenueData ? (
          <AdminRevenueForecast
            currentMrr={revenueData.currentMrr}
            forecast={revenueData.forecast}
            avgMonthlyGrowth={revenueData.avgMonthlyGrowth}
            avgMonthlyChurnMrr={revenueData.avgMonthlyChurnMrr}
          />
        ) : null;
      case "cohort-analysis":
        return revenueData ? <AdminCohortAnalysis data={revenueData.cohortData} /> : null;
      case "upsell-alerts":
        return revenueData ? <AdminUpsellAlerts alerts={revenueData.upsellAlerts} /> : null;
      case "dunning":
        return revenueData ? <AdminDunning healthScores={revenueData.healthScores} /> : null;
      case "feature-usage":
        return <AdminFeatureUsage />;
      case "system-health":
        return <AdminSystemHealth />;
      case "recent-companies":
        return <AdminRecentCompanies companies={recentCompanies} />;
      case "recent-activity":
        return <AdminRecentActivity activities={recentActivity} />;
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Super Admin</h1>
          <p className="text-muted-foreground">Panoramica globale della piattaforma</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DashboardDateFilter value={dateRange} onChange={setDateRange} />
          <DashboardExport
            data={{
              stats,
              mrrStats,
              revenueData: revenueData
                ? {
                    currentMrr: revenueData.currentMrr,
                    arr: revenueData.arr,
                    nrr: revenueData.nrr,
                    avgLtv: revenueData.avgLtv,
                    healthSummary: revenueData.healthSummary,
                  }
                : null,
            }}
          />
          <WidgetConfigurator widgets={widgets} onToggle={toggleVisibility} onReset={resetLayout} />
          <Button asChild size="sm">
            <Link to="/admin/aziende/nuova">
              <Plus className="h-4 w-4 mr-2" /> Nuova Azienda
            </Link>
          </Button>
        </div>
      </div>

      {/* Draggable Widget Grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid gap-6 lg:grid-cols-2">
            {visibleWidgets.map((widget) => {
              const content = renderWidget(widget.id);
              if (!content) return null;
              return (
                <SortableWidget key={widget.id} id={widget.id} span={widget.span}>
                  {content}
                </SortableWidget>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

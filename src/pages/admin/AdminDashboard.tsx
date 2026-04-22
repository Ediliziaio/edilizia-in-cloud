import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle } from "lucide-react";
import { useAdminDashboardData } from "@/hooks/useAdminDashboardData";
import { useAdminRevenueData } from "@/hooks/useAdminRevenueData";
import { useAuth } from "@/contexts/AuthContext";
import { AdminStatCards } from "@/components/admin/dashboard/AdminStatCards";
import { AdminRevenueKPIs } from "@/components/admin/dashboard/AdminRevenueKPIs";
import { AdminMrrChart } from "@/components/admin/dashboard/AdminMrrChart";
import { AdminMrrMovements } from "@/components/admin/dashboard/AdminMrrMovements";
import { AdminRevenueBySector } from "@/components/admin/dashboard/AdminRevenueBySector";
import { AdminHealthSummary } from "@/components/admin/dashboard/AdminHealthSummary";
import { AdminTrialIntelligence } from "@/components/admin/dashboard/AdminTrialIntelligence";
import { AdminDunning } from "@/components/admin/dashboard/AdminDunning";
import { AdminFeatureUsage } from "@/components/admin/dashboard/AdminFeatureUsage";
import { AdminSystemHealth, IntegrationHealthSection } from "@/components/admin/dashboard/AdminSystemHealth";
import { AdminNpsSection } from "@/components/admin/dashboard/AdminNpsSection";
import { AdminAddonsSummary } from "@/components/admin/dashboard/AdminAddonsSummary";
import { AdminCohortAnalysis } from "@/components/admin/dashboard/AdminCohortAnalysis";
import { AdminRevenueForecast } from "@/components/admin/dashboard/AdminRevenueForecast";
import { AdminUpsellAlerts } from "@/components/admin/dashboard/AdminUpsellAlerts";
import { AdminChurnAlerts } from "@/components/admin/dashboard/AdminChurnAlerts";
import { RevenueForecastWidget } from "@/components/admin/dashboard/RevenueForecastWidget";
import { MrrReconciliationCard } from "@/components/admin/dashboard/MrrReconciliationCard";
import { SaasMetricsGrid } from "@/components/admin/dashboard/SaasMetricsGrid";
import { CohortRevenueChart } from "@/components/admin/dashboard/CohortRevenueChart";
import { AdminScaleCommandCenter } from "@/components/admin/dashboard/AdminScaleCommandCenter";
import { DashboardHeader } from "@/components/admin/dashboard/DashboardHeader";
import { DashboardSkeleton } from "@/components/admin/dashboard/DashboardSkeleton";
import { DashboardExport } from "@/components/admin/dashboard/DashboardExport";
import { AdminPulseBar } from "@/components/admin/dashboard/AdminPulseBar";
import { AdminGrowthAnalytics } from "@/components/admin/dashboard/AdminGrowthAnalytics";
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
import { useIsMobile } from "@/hooks/use-mobile";

export default function AdminDashboard() {
  const { permissions } = useSuperAdminPermissions();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const {
    data: dashboardData,
    isLoading,
    isRefreshing,
    isError,
    lastUpdatedAt,
    refetch,
  } = useAdminDashboardData();
  const { data: revenueData } = useAdminRevenueData();
  const { widgets, isSaving, toggleVisibility, reorder, resetLayout, saveNow } =
    useDashboardLayout(user?.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  if (!permissions.can_view_platform_stats) return <AccessDenied />;

  const stats = dashboardData?.stats ?? {
    totalCompanies: 0,
    accessActiveCompanies: 0,
    payingCompanies: 0,
    nonPayingActiveCompanies: 0,
    freeActiveCompanies: 0,
    excludedMrr: 0,
    totalOrders: 0,
    totalOrdersValue: 0,
    totalCustomers: 0,
    openSupportConversations: 0,
    dac: 0,
    wac: 0,
    engagementRate: 0,
  };
  const mrrStats = dashboardData?.mrrStats ?? {
    mrr: 0,
    trialCount: 0,
    trialExpiringSoon: 0,
    churnRate: 0,
    activeCount: 0,
    expiredCount: 0,
  };
  const mrrChartData = dashboardData?.mrrChartData ?? [];

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errore di caricamento</AlertTitle>
          <AlertDescription className="mt-2">
            Impossibile caricare i dati della dashboard.
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => refetch()}
            >
              Riprova
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
      case "growth-analytics":
        return <AdminGrowthAnalytics />;
      case "command-center":
        return (
          <AdminScaleCommandCenter
            stats={stats}
            mrrStats={mrrStats}
            healthSummary={revenueData?.healthSummary}
            avgMonthlyGrowth={revenueData?.avgMonthlyGrowth}
            avgMonthlyChurnMrr={revenueData?.avgMonthlyChurnMrr}
          />
        );
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
        return (
          <div className="space-y-4">
            <AdminSystemHealth />
            <IntegrationHealthSection />
          </div>
        );
      case "addon-summary":
        return <AdminAddonsSummary />;
      case "revenue-forecast-v2":
        return <RevenueForecastWidget />;
      case "nps-survey":
        return <AdminNpsSection />;
      case "mrr-reconciliation":
        return <MrrReconciliationCard />;
      case "saas-metrics":
        return <SaasMetricsGrid />;
      case "cohort-revenue":
        return <CohortRevenueChart />;
      case "churn-alerts":
        return <AdminChurnAlerts />;
      default:
        return null;
    }
  }

  const widgetGrid = (
    <div className="grid gap-3 md:gap-6 grid-cols-2">
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
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header with controls */}
      <div className="space-y-3">
        <DashboardHeader
          title="Dashboard Super Admin"
          subtitle="Panoramica globale della piattaforma"
          lastUpdatedAt={lastUpdatedAt}
          isRefreshing={isRefreshing}
          onRefresh={refetch}
        >
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
          <WidgetConfigurator
            widgets={widgets}
            isSaving={isSaving}
            onToggle={toggleVisibility}
            onReset={resetLayout}
            onSave={saveNow}
          />
          <Button asChild size="sm">
            <Link to="/admin/aziende/nuova">
              <Plus className="h-4 w-4 mr-2" /> Nuova Azienda
            </Link>
          </Button>
        </DashboardHeader>
        <AdminPulseBar />
      </div>

      {/* Widget Grid — drag disabled on mobile */}
      {isMobile ? (
        widgetGrid
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
            {widgetGrid}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

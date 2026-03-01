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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";

export default function AdminDashboard() {
  const { permissions } = useSuperAdminPermissions();
  const { data: dashboardData, isLoading, isError, refetch } = useAdminDashboardData();
  const { data: revenueData, isLoading: revenueLoading } = useAdminRevenueData();

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
              <RefreshCw className="h-4 w-4 mr-2" />
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Super Admin</h1>
          <p className="text-muted-foreground">Panoramica globale della piattaforma</p>
        </div>
        <Button asChild>
          <Link to="/admin/aziende/nuova">
            <Plus className="h-4 w-4 mr-2" />
            Nuova Azienda
          </Link>
        </Button>
      </div>

      <AdminStatCards stats={stats} />

      {/* Revenue Intelligence KPIs */}
      {revenueData && (
        <AdminRevenueKPIs
          mrr={revenueData.currentMrr}
          arr={revenueData.arr}
          nrr={revenueData.nrr}
          avgLtv={revenueData.avgLtv}
        />
      )}

      {/* MRR Chart + MRR Movements */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AdminMrrChart data={mrrChartData} currentMrr={mrrStats.mrr} />
        {revenueData && <AdminMrrMovements data={revenueData.mrrMovements} />}
      </div>

      {/* Revenue by Sector + Health Scores */}
      <div className="grid gap-6 lg:grid-cols-2">
        {revenueData && <AdminRevenueBySector data={revenueData.revenueBySector} />}
        {revenueData && (
          <AdminHealthSummary
            healthSummary={revenueData.healthSummary}
            topAtRisk={topAtRisk}
          />
        )}
      </div>

      {/* Trial Intelligence — full width section */}
      {revenueData && <AdminTrialIntelligence data={revenueData.trialActivation} />}

      {/* Dunning + Feature Usage + System Health */}
      <div className="grid gap-6 lg:grid-cols-3">
        {revenueData && (
          <AdminDunning healthScores={revenueData.healthScores} currentMrr={revenueData.currentMrr} />
        )}
        <AdminFeatureUsage />
        <AdminSystemHealth />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminRecentCompanies companies={recentCompanies} />
        <AdminRecentActivity activities={recentActivity} />
      </div>
    </div>
  );
}

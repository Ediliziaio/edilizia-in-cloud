import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { useAdminDashboardData } from "@/hooks/useAdminDashboardData";
import { AdminStatCards } from "@/components/admin/dashboard/AdminStatCards";
import { AdminMrrStats } from "@/components/admin/dashboard/AdminMrrStats";
import { AdminRecentCompanies } from "@/components/admin/dashboard/AdminRecentCompanies";
import { AdminRecentActivity } from "@/components/admin/dashboard/AdminRecentActivity";
import { AdminQuickActions } from "@/components/admin/dashboard/AdminQuickActions";

export default function AdminDashboard() {
  const { data: dashboardData, isLoading } = useAdminDashboardData();

  const stats = dashboardData?.stats ?? { totalCompanies: 0, totalOrders: 0, totalOrdersValue: 0, totalCustomers: 0, openTickets: 0 };
  const mrrStats = dashboardData?.mrrStats ?? { mrr: 0, trialCount: 0, trialExpiringSoon: 0, churnRate: 0 };
  const recentCompanies = dashboardData?.recentCompanies ?? [];
  const recentActivity = dashboardData?.recentActivity ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
      <AdminMrrStats mrrStats={mrrStats} />

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminRecentCompanies companies={recentCompanies} />
        <AdminRecentActivity activities={recentActivity} />
      </div>

      <AdminQuickActions />
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { HardHat, Users, Building2, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface LaborStats {
  totalEmployees: number;
  totalExternalTeams: number;
  monthlyInternalCost: number;
  monthlyExternalCost: number;
  averageMargin: number;
  ordersWithLabor: number;
}

export function LaborCostsStats() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: stats, isLoading } = useQuery({
    queryKey: ["labor-stats", companyId],
    queryFn: async () => {
      // Fetch employees count
      const { count: employeesCount } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("is_active", true);

      // Fetch external teams count
      const { count: teamsCount } = await supabase
        .from("external_teams")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("is_active", true);

      // Get current month date range
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

      // Fetch this month's internal labor costs (from order_employees via orders)
      const { data: orderEmployeesData } = await supabase
        .from("order_employees")
        .select(`
          total_cost,
          created_at,
          order:orders!inner(company_id)
        `)
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);

      const monthlyInternalCost = orderEmployeesData
        ?.filter((item: any) => item.order?.company_id === companyId)
        .reduce((sum: number, item: any) => sum + Number(item.total_cost || 0), 0) || 0;

      // Fetch this month's external team costs
      const { data: orderTeamsData } = await supabase
        .from("order_external_teams")
        .select(`
          total_cost,
          created_at,
          order:orders!inner(company_id)
        `)
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);

      const monthlyExternalCost = orderTeamsData
        ?.filter((item: any) => item.order?.company_id === companyId)
        .reduce((sum: number, item: any) => sum + Number(item.total_cost || 0), 0) || 0;

      // Calculate average margin for orders with labor costs
      const { data: ordersWithLaborData } = await supabase
        .from("orders")
        .select(`
          id,
          total_amount,
          order_items(purchase_price, quantity),
          order_employees(total_cost),
          order_external_teams(total_cost)
        `)
        .eq("company_id", companyId!);

      let totalMarginPercent = 0;
      let ordersWithLaborCount = 0;

      ordersWithLaborData?.forEach((order: any) => {
        const laborCost = 
          (order.order_employees?.reduce((s: number, e: any) => s + Number(e.total_cost || 0), 0) || 0) +
          (order.order_external_teams?.reduce((s: number, t: any) => s + Number(t.total_cost || 0), 0) || 0);

        if (laborCost > 0) {
          const articleCost = order.order_items?.reduce(
            (s: number, i: any) => s + (Number(i.purchase_price || 0) * Number(i.quantity || 1)), 
            0
          ) || 0;

          const totalCost = laborCost + articleCost;
          const margin = ((Number(order.total_amount) - totalCost) / Number(order.total_amount)) * 100;
          
          totalMarginPercent += margin;
          ordersWithLaborCount++;
        }
      });

      const averageMargin = ordersWithLaborCount > 0 
        ? totalMarginPercent / ordersWithLaborCount 
        : 0;

      return {
        totalEmployees: employeesCount || 0,
        totalExternalTeams: teamsCount || 0,
        monthlyInternalCost,
        monthlyExternalCost,
        averageMargin,
        ordersWithLabor: ordersWithLaborCount,
      } as LaborStats;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-primary" />
            Costi Manodopera
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const totalMonthlyCost = stats.monthlyInternalCost + stats.monthlyExternalCost;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-primary" />
              Costi Manodopera
            </CardTitle>
            <CardDescription>Statistiche del mese corrente</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/azienda/dipendenti">Gestisci</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Personnel Summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{stats.totalEmployees} dipendenti</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{stats.totalExternalTeams} squadre</span>
            </div>
          </div>
        </div>

        {/* Monthly Costs */}
        <div className="space-y-2">
          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
            <span className="text-sm">Dipendenti Interni</span>
            <span className="font-medium">{formatCurrency(stats.monthlyInternalCost)}</span>
          </div>
          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
            <span className="text-sm">Squadre Esterne</span>
            <span className="font-medium">{formatCurrency(stats.monthlyExternalCost)}</span>
          </div>
          <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10 border border-primary/20">
            <span className="font-medium">Totale Mese</span>
            <span className="text-lg font-bold text-primary">
              {formatCurrency(totalMonthlyCost)}
            </span>
          </div>
        </div>

        {/* Margin Info */}
        {stats.ordersWithLabor > 0 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Margine medio</span>
            </div>
            <Badge 
              variant={stats.averageMargin >= 20 ? "default" : "secondary"}
              className={stats.averageMargin >= 20 ? "bg-green-600" : ""}
            >
              {stats.averageMargin.toFixed(1)}%
            </Badge>
          </div>
        )}

        {stats.ordersWithLabor === 0 && totalMonthlyCost === 0 && (
          <p className="text-center text-sm text-muted-foreground py-2">
            Nessun costo manodopera registrato questo mese
          </p>
        )}
      </CardContent>
    </Card>
  );
}

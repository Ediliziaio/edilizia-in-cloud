import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { HardHat, Users, Building2, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
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

interface LaborCostsStatsProps {
  dateRange?: { from: Date; to: Date };
}

export function LaborCostsStats({ dateRange }: LaborCostsStatsProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ["labor-stats", companyId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      // Use dateRange if provided, otherwise default to current month
      const monthStart = dateRange ? dateRange.from.toISOString() : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const monthEnd = dateRange ? dateRange.to.toISOString() : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString();

      const [employeesRes, teamsRes, ordersWithLaborRes] = await Promise.all([
        // Count active employees
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("is_active", true),
        // Count active external teams
        supabase
          .from("external_teams")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("is_active", true),
        // Get all orders with labor data for this company
        supabase
          .from("orders")
          .select(`
            id,
            total_amount,
            order_items(purchase_price, quantity),
            order_employees(total_cost, created_at),
            order_external_teams(total_cost, created_at)
          `)
          .eq("company_id", companyId!),
      ]);

      // Calculate monthly costs from orders data
      let monthlyInternalCost = 0;
      let monthlyExternalCost = 0;
      let totalMarginPercent = 0;
      let ordersWithLaborCount = 0;

      ordersWithLaborRes.data?.forEach((order) => {
        // Monthly internal costs
        order.order_employees?.forEach((emp: { total_cost: number; created_at: string }) => {
          const createdAt = new Date(emp.created_at);
          if (createdAt >= new Date(monthStart) && createdAt <= new Date(monthEnd)) {
            monthlyInternalCost += Number(emp.total_cost || 0);
          }
        });

        // Monthly external costs
        order.order_external_teams?.forEach((team: { total_cost: number; created_at: string }) => {
          const createdAt = new Date(team.created_at);
          if (createdAt >= new Date(monthStart) && createdAt <= new Date(monthEnd)) {
            monthlyExternalCost += Number(team.total_cost || 0);
          }
        });

        // Calculate margin for orders with labor
        const laborCost = 
          (order.order_employees?.reduce((s: number, e: { total_cost: number }) => s + Number(e.total_cost || 0), 0) || 0) +
          (order.order_external_teams?.reduce((s: number, t: { total_cost: number }) => s + Number(t.total_cost || 0), 0) || 0);

        if (laborCost > 0) {
          const articleCost = order.order_items?.reduce(
            (s: number, i: { purchase_price: number | null; quantity: number | null }) => 
              s + (Number(i.purchase_price || 0) * Number(i.quantity || 1)), 
            0
          ) || 0;

          const totalCost = laborCost + articleCost;
          const orderTotal = Number(order.total_amount);
          if (orderTotal > 0) {
            const margin = ((orderTotal - totalCost) / orderTotal) * 100;
            totalMarginPercent += margin;
            ordersWithLaborCount++;
          }
        }
      });

      const averageMargin = ordersWithLaborCount > 0 
        ? totalMarginPercent / ordersWithLaborCount 
        : 0;

      return {
        totalEmployees: employeesRes.count || 0,
        totalExternalTeams: teamsRes.count || 0,
        monthlyInternalCost,
        monthlyExternalCost,
        averageMargin,
        ordersWithLabor: ordersWithLaborCount,
      } as LaborStats;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minuti
  });

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-primary" />
            Costi Manodopera
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-destructive">
            Errore nel caricamento dei dati
          </p>
        </CardContent>
      </Card>
    );
  }

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
            <Link to="/azienda/impostazioni">Gestisci</Link>
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

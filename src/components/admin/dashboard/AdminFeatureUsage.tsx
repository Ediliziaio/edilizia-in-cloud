import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Loader2 } from "lucide-react";

interface FeatureUsageResult {
  total_companies: number;
  orders: number;
  calendar: number;
  employees: number;
  marketing: number;
}

export function AdminFeatureUsage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-feature-usage"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_feature_usage_stats");
      if (error) throw error;
      const result = data as unknown as FeatureUsageResult;
      const modules = [
        { module: "orders", label: "Ordini", activeCompanies: result.orders },
        { module: "calendar", label: "Calendario", activeCompanies: result.calendar },
        { module: "employees", label: "Dipendenti", activeCompanies: result.employees },
        { module: "marketing", label: "Email Marketing", activeCompanies: result.marketing },
      ];
      return { modules, totalCompanies: result.total_companies };
    },
    staleTime: 10 * 60 * 1000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Utilizzo Funzionalità
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {data?.modules.map((m) => {
              const pct = data.totalCompanies > 0 ? Math.round((m.activeCompanies / data.totalCompanies) * 100) : 0;
              return (
                <div key={m.module} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{m.label}</span>
                    <span className="text-muted-foreground">{m.activeCompanies}/{data.totalCompanies} ({pct}%)</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

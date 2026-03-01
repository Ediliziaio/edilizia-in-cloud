import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Loader2 } from "lucide-react";

interface ModuleUsage {
  module: string;
  label: string;
  activeCompanies: number;
}

export function AdminFeatureUsage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-feature-usage"],
    queryFn: async () => {
      const [companiesRes, ordersRes, appointmentsRes, employeesRes, campaignsRes] = await Promise.all([
        supabase.from("companies").select("id").limit(1000),
        supabase.from("orders").select("company_id").limit(1000),
        supabase.from("appointments").select("company_id").limit(1000),
        supabase.from("employees").select("company_id").limit(1000),
        supabase.from("email_campaigns").select("company_id").limit(1000),
      ]);

      const totalCompanies = (companiesRes.data || []).length;
      
      const uniqueCompanies = (data: any[]) => new Set(data.map((r) => r.company_id)).size;

      const modules: ModuleUsage[] = [
        { module: "orders", label: "Ordini", activeCompanies: uniqueCompanies(ordersRes.data || []) },
        { module: "calendar", label: "Calendario", activeCompanies: uniqueCompanies(appointmentsRes.data || []) },
        { module: "employees", label: "Dipendenti", activeCompanies: uniqueCompanies(employeesRes.data || []) },
        { module: "marketing", label: "Email Marketing", activeCompanies: uniqueCompanies(campaignsRes.data || []) },
      ];

      return { modules, totalCompanies };
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

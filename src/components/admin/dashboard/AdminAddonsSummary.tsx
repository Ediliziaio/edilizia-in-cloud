import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gem } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";

export function AdminAddonsSummary() {
  const { data } = useQuery({
    queryKey: ["admin-addon-summary"],
    queryFn: async () => {
      const { data: wlCompanies, error } = await supabase
        .from("companies")
        .select("id, name, white_label_monthly_price")
        .eq("white_label_enabled", true);
      if (error) throw error;
      const totalWlRevenue = (wlCompanies || []).reduce((sum, c: any) => sum + (c.white_label_monthly_price ?? 0), 0);
      return {
        wlCount: wlCompanies?.length ?? 0,
        wlRevenue: totalWlRevenue,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gem className="h-4 w-4 text-amber-500" /> Addon Attivi
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">White Label</span>
            <div className="text-right">
              <span className="font-semibold">{data?.wlCount ?? 0} aziende</span>
              <span className="text-muted-foreground ml-2">→ {formatCurrency(data?.wlRevenue ?? 0)}/mese</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

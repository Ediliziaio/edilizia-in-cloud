import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, ArrowUpRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarginalitaRow {
  id: string;
  order_code: string | null;
  description: string;
  preventivo_totale: number;
  consuntivo: number;
  margine: number;
  margine_perc: number;
}

function margineColor(perc: number) {
  if (perc >= 25) return "text-green-600";
  if (perc >= 10) return "text-amber-600";
  return "text-red-600";
}

function margineBarClass(perc: number) {
  if (perc >= 25) return "bg-green-500";
  if (perc >= 10) return "bg-amber-500";
  return "bg-red-500";
}

export function MarginalitaWidget() {
  const companyId = useEffectiveCompanyId();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["marginalita-widget", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ordine_marginalita")
        .select("id, order_code, description, preventivo_totale, consuntivo, margine, margine_perc")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as MarginalitaRow[];
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  // KPI summary
  const totPreventivo = rows.reduce((s, r) => s + r.preventivo_totale, 0);
  const totMargine = rows.reduce((s, r) => s + r.margine, 0);
  const avgPerc = totPreventivo > 0 ? (totMargine / totPreventivo) * 100 : 0;
  const inPerdita = rows.filter((r) => r.margine_perc < 0).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {avgPerc >= 15 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
            Marginalità Cantieri
          </CardTitle>
          <div className="flex items-center gap-3 mt-0.5">
            <span className={cn("text-sm font-semibold", margineColor(avgPerc))}>
              Media: {avgPerc.toFixed(1)}%
            </span>
            {inPerdita > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" />
                {inPerdita} in perdita
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild className="shrink-0">
          <Link to="/azienda/marginalita">
            Vedi tutti <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {rows.map((row) => (
          <Link key={row.id} to={`/azienda/ordini/${row.id}`} className="block group">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium group-hover:text-primary transition-colors truncate block">
                  {row.order_code ? `#${row.order_code}` : row.description.slice(0, 30)}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{formatCurrency(row.margine)}</span>
                <Badge
                  className={cn(
                    "text-xs font-bold min-w-[48px] justify-center",
                    row.margine_perc >= 25 && "bg-green-100 text-green-800 border-green-200 border",
                    row.margine_perc >= 10 && row.margine_perc < 25 && "bg-amber-100 text-amber-800 border-amber-200 border",
                    row.margine_perc < 10 && "bg-red-100 text-red-800 border-red-200 border",
                  )}
                >
                  {row.margine_perc >= 0 ? "+" : ""}{row.margine_perc.toFixed(1)}%
                </Badge>
              </div>
            </div>
            <Progress
              value={Math.min(Math.max(row.margine_perc, 0), 100)}
              className="h-1.5"
              indicatorClassName={margineBarClass(row.margine_perc)}
            />
          </Link>
        ))}

        {/* Summary totals */}
        <div className="border-t pt-2 flex justify-between text-sm">
          <span className="text-muted-foreground">Totale preventivo</span>
          <span className="font-medium">{formatCurrency(totPreventivo)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Margine totale</span>
          <span className={cn("font-semibold", margineColor(avgPerc))}>
            {formatCurrency(totMargine)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import {
  computeScostamenti,
  summarizeScostamenti,
  type OrdineMarginalitaRow,
} from "@/lib/commesse/scostamenti";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, ArrowUpRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Quota di portafoglio analizzata dal widget. La pagina completa
 * (`/azienda/marginalita`) ne carica fino a 1000: qui basta un campione ampio
 * per KPI affidabili sul cruscotto, evitando di mostrare solo gli ordini recenti.
 */
const WIDGET_FETCH_LIMIT = 200;

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
        .select(
          "id, order_code, description, cliente_nome, preventivo_contratto, preventivo_totale, variazioni_approvate, costo_acquisti, costo_errori, consuntivo, margine, margine_perc",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(WIDGET_FETCH_LIMIT);
      if (error) throw error;
      return (data || []) as OrdineMarginalitaRow[];
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  // KPI calcolati sull'INTERO campione (non solo sulle righe mostrate): così il
  // conteggio "in perdita" non nasconde commesse a rischio fuori dalle prime N.
  const summary = summarizeScostamenti(rows);
  // Mostra le commesse più a rischio per prime (in perdita → margine % crescente).
  const topRows = computeScostamenti(rows).slice(0, 5);
  const avgPerc = summary.margineMedioPerc;

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

  // Niente widget-fantasma: senza commesse spieghiamo il perché invece di sparire.
  if (summary.nCommesse === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Marginalità Cantieri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nessuna commessa con dati economici nel periodo: la marginalità comparirà qui con la prima commessa.
          </p>
        </CardContent>
      </Card>
    );
  }

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
            {summary.nInPerdita > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" />
                {summary.nInPerdita} in perdita
              </span>
            )}
            {(summary.nConSforamento > 0 || summary.nConErrori > 0) && (
              <span className="text-xs text-muted-foreground">
                {summary.nConSforamento > 0 && `${summary.nConSforamento} sforamenti`}
                {summary.nConSforamento > 0 && summary.nConErrori > 0 && " · "}
                {summary.nConErrori > 0 && `${summary.nConErrori} con errori`}
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
        {topRows.map((row) => {
          const causa = row.cause[0];
          return (
          <Link key={row.id} to={`/azienda/ordini/${row.id}`} className="block group">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium group-hover:text-primary transition-colors truncate block">
                  {row.orderCode ? `#${row.orderCode}` : row.description.slice(0, 30)}
                </span>
                {causa && (
                  <span
                    className={cn(
                      "text-[11px] truncate flex items-center gap-1",
                      causa.gravita === "alta" ? "text-red-600/90" : "text-amber-600/90",
                    )}
                  >
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {causa.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{formatCurrency(row.margine)}</span>
                <Badge
                  className={cn(
                    "text-xs font-bold min-w-[48px] justify-center",
                    row.marginePerc >= 25 && "bg-green-100 text-green-800 border-green-200 border",
                    row.marginePerc >= 10 && row.marginePerc < 25 && "bg-amber-100 text-amber-800 border-amber-200 border",
                    row.marginePerc < 10 && "bg-red-100 text-red-800 border-red-200 border",
                  )}
                >
                  {row.marginePerc >= 0 ? "+" : ""}{row.marginePerc.toFixed(1)}%
                </Badge>
              </div>
            </div>
            <Progress
              value={Math.min(Math.max(row.marginePerc, 0), 100)}
              className="h-1.5"
              indicatorClassName={margineBarClass(row.marginePerc)}
            />
          </Link>
          );
        })}

        {/* Summary totals */}
        <div className="border-t pt-2 flex justify-between text-sm">
          <span className="text-muted-foreground">Totale preventivo</span>
          <span className="font-medium">{formatCurrency(summary.preventivoTotale)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Margine totale</span>
          <span className={cn("font-semibold", margineColor(avgPerc))}>
            {formatCurrency(summary.margineTotale)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

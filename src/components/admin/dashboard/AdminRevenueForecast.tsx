import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface ForecastPoint {
  months: number;
  mrr: number;
  arr: number;
}

interface Props {
  currentMrr: number;
  forecast: ForecastPoint[];
  avgMonthlyGrowth: number;
  avgMonthlyChurnMrr: number;
}

export function AdminRevenueForecast({ currentMrr, forecast, avgMonthlyGrowth, avgMonthlyChurnMrr }: Props) {
  const growthPct = currentMrr > 0 ? Math.round((avgMonthlyGrowth / currentMrr) * 100) : 0;
  const isGrowing = avgMonthlyGrowth > 0;
  const isFlat = avgMonthlyGrowth === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          Revenue Forecast
          {isGrowing ? (
            <Badge variant="default" className="text-[10px] gap-1">
              <TrendingUp className="h-3 w-3" /> +{growthPct}%/mese
            </Badge>
          ) : isFlat ? (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Minus className="h-3 w-3" /> Stabile
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px] gap-1">
              <TrendingDown className="h-3 w-3" /> {growthPct}%/mese
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Proiezione MRR basata sulla crescita media degli ultimi 6 mesi
          {avgMonthlyChurnMrr > 0 && ` · Churn medio: ${formatCurrency(avgMonthlyChurnMrr)}/mese`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* Current */}
          <div className="rounded-lg border p-4 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Attuale</p>
            <p className="text-xl font-bold">{formatCurrency(currentMrr)}</p>
            <p className="text-xs text-muted-foreground">MRR</p>
          </div>

          {forecast.map((f) => {
            const delta = f.mrr - currentMrr;
            const deltaPct = currentMrr > 0 ? Math.round((delta / currentMrr) * 100) : 0;
            return (
              <div key={f.months} className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground mb-1">+{f.months} mesi</p>
                <p className="text-xl font-bold">{formatCurrency(f.mrr)}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    ARR: {formatCurrency(f.arr)}
                  </p>
                  <Badge
                    variant={delta >= 0 ? "default" : "destructive"}
                    className="text-[10px]"
                  >
                    {delta >= 0 ? "+" : ""}{deltaPct}%
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

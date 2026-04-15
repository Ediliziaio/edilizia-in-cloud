import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Cell,
} from "recharts";

interface RevenuePoint {
  month: string; // "Jan", "Feb", ...
  revenue: number;
}

interface Props {
  data: RevenuePoint[];
  totalYTD: number;
}

// English 3-letter month abbreviations used by Postgres TO_CHAR('Mon') → Italian labels
const MONTH_IT: Record<string, string> = {
  Jan: "Gen", Feb: "Feb", Mar: "Mar", Apr: "Apr", May: "Mag", Jun: "Giu",
  Jul: "Lug", Aug: "Ago", Sep: "Set", Oct: "Ott", Nov: "Nov", Dec: "Dic",
};
const MONTH_IT_FULL: Record<string, string> = {
  Jan: "Gennaio", Feb: "Febbraio", Mar: "Marzo", Apr: "Aprile", May: "Maggio", Jun: "Giugno",
  Jul: "Luglio", Aug: "Agosto", Sep: "Settembre", Oct: "Ottobre", Nov: "Novembre", Dec: "Dicembre",
};

type ViewMode = "monthly" | "cumulative";

function YTDTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: { fullMonth: string; revenue: number; cumulative: number; avgSoFar: number; prevMonth: number | null } }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const delta = p.prevMonth !== null && p.prevMonth > 0
    ? ((p.revenue - p.prevMonth) / p.prevMonth) * 100
    : null;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-sm min-w-[180px]">
      <p className="font-semibold text-foreground mb-2">{p.fullMonth}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">Fatturato</span>
          <span className="font-bold tabular-nums text-foreground">{formatCurrency(p.revenue)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">Cumulato</span>
          <span className="font-medium tabular-nums text-primary">{formatCurrency(p.cumulative)}</span>
        </div>
        {delta !== null && (
          <div className="flex items-center justify-between gap-4 pt-1 border-t">
            <span className="text-xs text-muted-foreground">vs mese prec.</span>
            <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
              delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
            }`}>
              {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(delta).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function YTDRevenueWidget({ data, totalYTD }: Props) {
  const [view, setView] = useState<ViewMode>("monthly");

  const chartData = useMemo(() => {
    let running = 0;
    return data.map((d, i) => {
      running += d.revenue;
      return {
        month: MONTH_IT[d.month] ?? d.month,
        fullMonth: MONTH_IT_FULL[d.month] ?? d.month,
        revenue: d.revenue,
        cumulative: running,
        avgSoFar: running / (i + 1),
        prevMonth: i > 0 ? data[i - 1].revenue : null,
      };
    });
  }, [data]);

  const monthlyAvg = useMemo(() => {
    if (chartData.length === 0) return 0;
    return totalYTD / chartData.length;
  }, [chartData.length, totalYTD]);

  const bestMonth = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData.reduce((a, b) => (b.revenue > a.revenue ? b : a), chartData[0]);
  }, [chartData]);

  const worstMonth = useMemo(() => {
    if (chartData.length === 0) return null;
    const nonZero = chartData.filter((d) => d.revenue > 0);
    if (nonZero.length === 0) return null;
    return nonZero.reduce((a, b) => (b.revenue < a.revenue ? b : a), nonZero[0]);
  }, [chartData]);

  const lastMonth = chartData[chartData.length - 1];
  const prevMonth = chartData[chartData.length - 2];
  const momDelta = lastMonth && prevMonth && prevMonth.revenue > 0
    ? ((lastMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
    : null;

  if (chartData.length === 0) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Fatturato Anno Corrente
          </CardTitle>
          <CardDescription>Non ci sono ancora ordini per questo anno</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
            Crea il tuo primo ordine per iniziare a tracciare l'andamento
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Fatturato Anno Corrente
            </CardTitle>
            <div className="flex items-baseline gap-3 flex-wrap">
              <p className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums">
                {formatCurrency(totalYTD)}
              </p>
              {momDelta !== null && (
                <Badge variant={momDelta >= 0 ? "default" : "destructive"} className="text-xs gap-1 shrink-0">
                  {momDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(momDelta).toFixed(1)}% vs {prevMonth?.month}
                </Badge>
              )}
            </div>
            <CardDescription>
              Media mensile {formatCurrency(monthlyAvg)}
              {bestMonth && ` · Miglior mese: ${bestMonth.month} (${formatCurrencyCompact(bestMonth.revenue)})`}
            </CardDescription>
          </div>
          <div className="flex gap-1 shrink-0 bg-muted/50 p-1 rounded-md">
            <Button
              variant={view === "monthly" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setView("monthly")}
            >
              Mensile
            </Button>
            <Button
              variant={view === "cumulative" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setView("cumulative")}
            >
              Cumulato
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[220px] sm:h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ytdArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="ytdBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={formatCurrencyCompact}
                tickLine={false}
                axisLine={false}
                width={55}
              />
              <RechartsTooltip content={<YTDTooltip />} cursor={{ fill: "hsl(var(--primary) / 0.06)" }} />
              {view === "monthly" && monthlyAvg > 0 && (
                <ReferenceLine
                  y={monthlyAvg}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  label={{
                    value: `Media ${formatCurrencyCompact(monthlyAvg)}`,
                    position: "right",
                    fontSize: 10,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                />
              )}
              {view === "monthly" ? (
                <Bar dataKey="revenue" fill="url(#ytdBar)" radius={[4, 4, 0, 0]} barSize={28}>
                  {chartData.map((entry, idx) => {
                    const isBest = bestMonth && entry.month === bestMonth.month;
                    const isWorst = worstMonth && entry.month === worstMonth.month && entry.revenue < monthlyAvg;
                    return (
                      <Cell
                        key={idx}
                        fill={isBest
                          ? "hsl(142 76% 36%)"
                          : isWorst
                          ? "hsl(0 84% 60%)"
                          : "url(#ytdBar)"}
                      />
                    );
                  })}
                </Bar>
              ) : (
                <>
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    fill="url(#ytdArea)"
                    dot={{ r: 3, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={false}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

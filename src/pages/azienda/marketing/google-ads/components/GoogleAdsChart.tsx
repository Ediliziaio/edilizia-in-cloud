/**
 * Grafico a linee con trend giornaliero di Spesa e Conversioni.
 * Usa Recharts (già presente nel progetto).
 * Due assi Y: sinistro per spesa (€), destro per conversioni.
 *
 * @param stats - Righe raw ordinate per data ascending
 * @param isLoading - Stato di caricamento
 */
import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateShort, formatCurrency, formatNumber } from "@/lib/google-ads/formatters";
import type { GoogleAdsStatRow } from "@/types/google-ads";

interface GoogleAdsChartProps {
  stats: GoogleAdsStatRow[];
  isLoading: boolean;
}

interface ChartPoint {
  date: string;
  spesa: number;
  conversioni: number;
}

function buildChartData(stats: GoogleAdsStatRow[]): ChartPoint[] {
  // Aggrega per giorno (più campagne possono avere stessa data)
  const map = new Map<string, ChartPoint>();
  for (const row of stats) {
    const d = row.date;
    const existing = map.get(d);
    if (existing) {
      existing.spesa += row.spend ?? 0;
      existing.conversioni += row.conversions ?? 0;
    } else {
      map.set(d, { date: d, spesa: row.spend ?? 0, conversioni: row.conversions ?? 0 });
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ ...v, date: formatDateShort(v.date) }));
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-semibold text-muted-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === "Spesa Giornaliera"
            ? formatCurrency(p.value)
            : `${formatNumber(p.value)} conv.`}
        </p>
      ))}
    </div>
  );
}

export function GoogleAdsChart({ stats, isLoading }: GoogleAdsChartProps) {
  const chartData = useMemo(() => buildChartData(stats), [stats]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Andamento Spesa & Conversioni</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-48 gap-2 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nessun dato disponibile per il periodo selezionato.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Andamento Spesa & Conversioni</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="spesa"
              orientation="left"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `€${v.toLocaleString("it-IT")}`}
              width={64}
            />
            <YAxis
              yAxisId="conv"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => value}
            />
            <Line
              yAxisId="spesa"
              type="monotone"
              dataKey="spesa"
              name="Spesa Giornaliera"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="conv"
              type="monotone"
              dataKey="conversioni"
              name="Conversioni"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

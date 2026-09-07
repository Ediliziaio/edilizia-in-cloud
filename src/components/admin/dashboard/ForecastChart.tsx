import { memo } from "react";
import {
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  ComposedChart,
  type TooltipProps,
} from "recharts";
import type { ChartDataPoint } from "@/lib/forecastUtils";

interface ForecastChartProps {
  data: ChartDataPoint[];
}

const currencyFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0, useGrouping: "always" });

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border bg-background shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">Mese: {label}</p>
      {payload.map((entry: any) => {
        if (entry.name === "confidenceLow" || entry.name === "confidenceHigh")
          return null;
        return (
          <p key={entry.name} style={{ color: entry.color }} className="text-xs">
            {entry.name === "mrr" ? "MRR storico" : "Proiezione"}:{" "}
            {currencyFormatter.format(Number(entry.value))}
          </p>
        );
      })}
    </div>
  );
}

function ForecastChartImpl({ data }: ForecastChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) =>
            v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`
          }
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        {/* Area confidence interval */}
        <Area
          type="monotone"
          dataKey="confidenceHigh"
          stroke="none"
          fill="#9ca3af"
          fillOpacity={0.15}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="confidenceLow"
          stroke="none"
          fill="#ffffff"
          fillOpacity={1}
          connectNulls
        />
        {/* Linea dati storici */}
        <Line
          type="monotone"
          dataKey="mrr"
          stroke="#1e3a5f"
          strokeWidth={2}
          dot={{ r: 3, fill: "#1e3a5f" }}
          activeDot={{ r: 5 }}
          connectNulls={false}
          name="mrr"
        />
        {/* Linea proiezione tratteggiata */}
        <Line
          type="monotone"
          dataKey="forecast"
          stroke="#f97316"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={{ r: 4, fill: "#f97316", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls={false}
          name="forecast"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const ForecastChart = memo(ForecastChartImpl);

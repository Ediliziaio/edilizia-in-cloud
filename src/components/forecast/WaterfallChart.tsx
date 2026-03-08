import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

interface WaterfallDataPoint {
  week: string;
  income: number;
  expenses: number;
  net: number;
  cumulative: number;
}

interface WaterfallChartProps {
  data: WaterfallDataPoint[];
}

export function WaterfallChart({ data }: WaterfallChartProps) {
  if (data.length < 2) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Variazione Settimanale Cash Flow</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
              />
              <RechartsTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as WaterfallDataPoint;
                  return (
                    <div className="rounded-lg border bg-card p-3 shadow-md text-xs space-y-1">
                      <p className="font-medium text-foreground">{label}</p>
                      <p className="text-emerald-600">Entrate: {formatCurrency(d.income)}</p>
                      <p className="text-red-600">Uscite: {formatCurrency(d.expenses)}</p>
                      <p className={d.net >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                        Variazione: {d.net >= 0 ? "+" : ""}{formatCurrency(d.net)}
                      </p>
                      <p className="text-muted-foreground pt-1 border-t">
                        Saldo cumulativo: {formatCurrency(d.cumulative)}
                      </p>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Bar dataKey="net" name="Variazione" radius={[3, 3, 0, 0]} barSize={20}>
                {data.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.net >= 0 ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)"}
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="cumulative"
                name="Saldo Cumulativo"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(var(--primary))" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

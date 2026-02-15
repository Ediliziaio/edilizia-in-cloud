import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";

interface ForecastChartProps {
  chartData: any[];
}

export function ForecastChart({ chartData }: ForecastChartProps) {
  return (
    <Card className="print:break-before-page">
      <CardHeader>
        <CardTitle>Timeline Flusso di Cassa</CardTitle>
        <CardDescription>Previsione entrate e uscite per i prossimi 6 mesi con netto cumulativo</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="month"
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend />
              <Bar dataKey="Entrate" fill="hsl(142.1 76.2% 36.3%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Squadre Esterne" stackId="expenses" fill="hsl(0 84.2% 60.2%)" />
              <Bar dataKey="Provvigioni" stackId="expenses" fill="hsl(262 83.3% 57.8%)" />
              <Bar dataKey="Fornitori" stackId="expenses" fill="hsl(230 80% 55%)" />
              <Bar dataKey="Costi Fissi" stackId="expenses" fill="hsl(20 90% 55%)" />
              <Bar dataKey="Costi Variabili" stackId="expenses" fill="hsl(40 90% 55%)" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="Cumulativo"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ fill: "hsl(var(--primary))", r: 5 }}
                name="Netto Cumulativo"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

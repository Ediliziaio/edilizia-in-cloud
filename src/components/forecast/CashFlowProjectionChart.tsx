import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { CashFlowProjectionDay } from "@/hooks/useCashFlowRealData";
import { useNavigate } from "react-router-dom";

interface CashFlowProjectionChartProps {
  projection: CashFlowProjectionDay[];
  currentBalance: number;
  hasBanking: boolean;
}

const RANGES = [
  { label: "30 gg", days: 30 },
  { label: "60 gg", days: 60 },
  { label: "90 gg", days: 90 },
];

export function CashFlowProjectionChart({ projection, currentBalance, hasBanking }: CashFlowProjectionChartProps) {
  const navigate = useNavigate();
  const [range, setRange] = useState(30);

  if (!hasBanking) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="text-sm font-medium text-foreground">Nessun conto bancario collegato</p>
          <p className="text-xs text-muted-foreground">
            Collega il conto bancario per attivare il forecast preciso con dati reali.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/azienda/tesoreria")}>
            Vai a Tesoreria
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = projection.slice(0, range).map((d) => ({
    ...d,
    dateLabel: format(new Date(d.date), "dd/MM", { locale: it }),
    balanceK: Math.round(d.balance),
  }));

  const minBalance = Math.min(...data.map((d) => d.balanceK));
  const maxBalance = Math.max(...data.map((d) => d.balanceK));
  const hasNegative = minBalance < 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Proiezione Saldo Cassa
          </CardTitle>
          <div className="flex gap-1">
            {RANGES.map(({ label, days }) => (
              <Button
                key={days}
                size="sm"
                variant={range === days ? "default" : "outline"}
                className="h-7 px-3 text-xs"
                onClick={() => setRange(days)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        {hasNegative && (
          <p className="text-xs text-destructive flex items-center gap-1 mt-1">
            <AlertTriangle className="h-3 w-3" /> Il saldo previsto scende sotto zero in questo periodo
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 10 }}
              interval={range === 30 ? 4 : range === 60 ? 9 : 14}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => {
                // Sotto i 1.000€ la formattazione "k" mostrava €0k su tutte le
                // tacche: passa a valore intero quando la scala è piccola.
                const abs = Math.abs(v);
                if (abs >= 1000) return `€${(v / 1000).toFixed(0)}k`;
                return `€${Math.round(v)}`;
              }}
              domain={[Math.min(minBalance * 1.1, -100), maxBalance * 1.1]}
            />
            <Tooltip
              formatter={(value: number) => [`€${value.toLocaleString("it-IT")}`, "Saldo"]}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
              }}
            />
            {hasNegative && <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 2" />}
            <Line
              type="monotone"
              dataKey="balanceK"
              name="Saldo"
              stroke="hsl(var(--primary))"
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

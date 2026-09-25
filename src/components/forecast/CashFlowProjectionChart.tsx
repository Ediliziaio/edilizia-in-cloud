import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { CashFlowProjectionDay } from "@/hooks/useCashFlowRealData";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();
  const [range, setRange] = useState(30);

  if (!hasBanking) {
    return (
      // Mobile: una riga col bottone, senza icona e spiegazione.
      <Card>
        <CardContent className="py-10 text-center space-y-3 max-sm:flex max-sm:items-center max-sm:justify-between max-sm:gap-2 max-sm:space-y-0 max-sm:p-3 max-sm:text-left">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto max-sm:hidden" />
          <p className="text-sm font-medium text-foreground max-sm:text-xs">Nessun conto bancario collegato</p>
          <p className="text-xs text-muted-foreground max-sm:hidden">
            Collega il conto bancario per attivare il forecast preciso con dati reali.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/azienda/tesoreria")} className="tap-compact max-sm:h-8 max-sm:shrink-0 max-sm:text-xs">
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
      {/* Mobile: intestazione stretta, titolo corto, grafico più basso. */}
      <CardHeader className="max-sm:p-3 max-sm:pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 max-sm:text-sm">
            <TrendingUp className="h-4 w-4 max-sm:hidden" />
            <span className="max-sm:hidden">Proiezione Saldo Cassa</span><span className="sm:hidden">Saldo previsto</span>
          </CardTitle>
          <div className="flex gap-1">
            {RANGES.map(({ label, days }) => (
              <Button
                key={days}
                size="sm"
                variant={range === days ? "default" : "outline"}
                className="tap-compact h-7 px-3 text-xs max-sm:px-2"
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
      <CardContent className="max-sm:px-1 max-sm:pb-2">
        <ResponsiveContainer width="100%" height={isMobile ? 180 : 280}>
          <LineChart data={data}>
            {/* Assi e tooltip nello stile di famiglia (v. grafico Commesse). */}
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              stroke="#64748b"
              interval={range === 30 ? 4 : range === 60 ? 9 : 14}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={10}
              stroke="#94a3b8"
              tickFormatter={(v) => {
                // Sotto i 1.000€ la formattazione "k" mostrava 0k su tutte le
                // tacche: passa a valore intero quando la scala è piccola.
                const abs = Math.abs(v);
                if (abs >= 1000) return `${(v / 1000).toFixed(0)}k`;
                return `${Math.round(v)}`;
              }}
              domain={[Math.min(minBalance * 1.1, -100), maxBalance * 1.1]}
            />
            <Tooltip
              cursor={{ stroke: "rgba(15, 23, 42, 0.15)" }}
              formatter={(value: number) => [value.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }), "Saldo"]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
              }}
            />
            {hasNegative && <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 2" />}
            <Line
              type="monotone"
              dataKey="balanceK"
              name="Saldo"
              stroke="#2563eb"
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

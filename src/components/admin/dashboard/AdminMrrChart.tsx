import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp } from "lucide-react";

interface MrrChartData {
  month: string;
  mrr: number;
}

interface Props {
  data: MrrChartData[];
  currentMrr: number;
}

export function AdminMrrChart({ data, currentMrr }: Props) {
  const arr = currentMrr * 12;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base">MRR Trend</CardTitle>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">MRR: </span>
              <span className="font-semibold">{formatCurrency(currentMrr)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">ARR: </span>
              <span className="font-semibold">{formatCurrency(arr)}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `€${v}`} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), "MRR"]}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Area type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" fill="url(#mrrGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
            Dati insufficienti per il grafico
          </div>
        )}
      </CardContent>
    </Card>
  );
}

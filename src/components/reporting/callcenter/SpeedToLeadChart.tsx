import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { SpeedBucket } from "@/hooks/useCallCenterReport";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const BUCKET_COLORS: Record<number, string> = {
  1: "hsl(142, 71%, 45%)",  // green - 0-5 min
  2: "hsl(142, 60%, 55%)",  // light green - 5-30 min
  3: "hsl(48, 96%, 53%)",   // yellow - 30-60 min
  4: "hsl(38, 92%, 50%)",   // orange - 1-4 ore
  5: "hsl(0, 84%, 60%)",    // red - 4-24 ore
  6: "hsl(0, 72%, 50%)",    // dark red - >24 ore
  7: "hsl(220, 14%, 60%)",  // gray - non chiamato
};

const BUCKET_EMOJI: Record<number, string> = {
  1: "⚡", 2: "✅", 3: "🟡", 4: "🟠", 5: "🔴", 6: "❌", 7: "⬜",
};

interface Props {
  data: SpeedBucket[];
  isLoading: boolean;
}

export function SpeedToLeadChart({ data, isLoading }: Props) {
  const t = useT();
  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
    );
  }

  const chartData = data.map(d => ({
    ...d,
    label: `${BUCKET_EMOJI[d.bucket_ordine] ?? ""} ${d.bucket}`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Distribuzione Speed to Lead")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("Tempo di risposta ai nuovi lead")}</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">{t("Nessun dato disponibile")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid strokeDasharray="4 6" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: number) => [`${value}%`, t("Percentuale")]}
                labelFormatter={(label: string) => label}
                cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }}
              />
              <Bar dataKey="pct" radius={[0, 6, 6, 0]} maxBarSize={28} fillOpacity={0.9}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={BUCKET_COLORS[entry.bucket_ordine] ?? "hsl(var(--primary))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Summary stats */}
        {data.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
            {data.filter(d => [1, 2, 3].includes(d.bucket_ordine)).map(d => (
              <div key={d.bucket_ordine} className="text-center">
                <p className="text-xs text-muted-foreground">{d.bucket}</p>
                <p className="text-lg font-semibold">{t("{nr_lead} lead", { nr_lead: d.nr_lead ?? 0 })}</p>
                <p className="text-xs text-muted-foreground">{d.pct}%</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

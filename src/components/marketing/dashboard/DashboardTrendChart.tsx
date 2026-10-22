import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { TrendPoint } from "@/hooks/useMarketingDashboard";
import { format, parseISO, isValid, startOfISOWeek } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  trend: TrendPoint[] | undefined;
  isLoading: boolean;
}

function safeDateLabel(day: string): string {
  try {
    const parsed = parseISO(day);
    if (!isValid(parsed)) return day;
    return format(parsed, "dd MMM", { locale: it });
  } catch {
    return day;
  }
}

export const DashboardTrendChart = memo(function DashboardTrendChart({ trend, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Trend Temporale</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-[250px] w-full" /></CardContent>
      </Card>
    );
  }

  // oltre sei settimane i giorni sono troppi per leggerli: si somma per settimana
  const perSettimana = (trend?.length ?? 0) > 45;
  const data = perSettimana
    ? Object.values((trend || []).reduce<Record<string, { day: string; leads: number; appointments: number; won: number }>>((acc, t) => {
        const d = parseISO(t.day);
        const k = isValid(d) ? format(startOfISOWeek(d), "yyyy-MM-dd") : t.day;
        acc[k] ??= { day: k, leads: 0, appointments: 0, won: 0 };
        acc[k].leads += t.leads; acc[k].appointments += t.appointments; acc[k].won += t.won;
        return acc;
      }, {})).map((t) => ({ ...t, label: `sett. ${safeDateLabel(t.day)}` }))
    : (trend || []).map(t => ({ ...t, label: safeDateLabel(t.day) }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Andamento del periodo</CardTitle>
        <p className="text-xs text-muted-foreground">{perSettimana ? "Per settimana" : "Giorno per giorno"} · vendite = preventivi firmati e opportunità vinte</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nessun dato nel periodo</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="leads" name="Lead" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="appointments" name="Appuntamenti" stroke="hsl(210, 70%, 55%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="won" name="Vendite" stroke="hsl(142, 60%, 45%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
});

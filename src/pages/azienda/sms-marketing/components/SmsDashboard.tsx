/**
 * Dashboard SMS con 4 KPI card, grafico trend 6 mesi e top 3 campagne.
 * Skeleton loader durante il caricamento.
 */
import { useMemo } from "react";
import { MessageSquare, Send, CheckCircle2, Euro } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSmsDashboard } from "@/hooks/useSmsDashboard";
import { SmsStatsBadge } from "./SmsStatsBadge";

function formatMese(key: string): string {
  try {
    return format(parseISO(`${key}-01`), "MMM yyyy", { locale: it });
  } catch {
    return key;
  }
}

export function SmsDashboard() {
  const { dashboard, isLoading } = useSmsDashboard();

  const chartData = useMemo(
    () => dashboard.trend.map((t) => ({ ...t, mese: formatMese(t.mese) })),
    [dashboard.trend]
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-20" />
            </CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const kpis = [
    { label: "Campagne inviate", value: dashboard.campagneInviate.toLocaleString("it-IT"), icon: MessageSquare, color: "text-blue-600" },
    { label: "SMS inviati", value: dashboard.smsTotali.toLocaleString("it-IT"), icon: Send, color: "text-violet-600" },
    { label: "Tasso consegna", value: `${dashboard.tassoConsegnaMedio.toFixed(1).replace(".", ",")}%`, icon: CheckCircle2, color: "text-emerald-600" },
    { label: "Costo totale", value: new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(dashboard.costoTotale), icon: Euro, color: "text-orange-600" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</span>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <div className="text-2xl font-bold tabular-nums">{kpi.value}</div>
                <div className="text-xs text-muted-foreground mt-1">Mese corrente</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Grafico trend */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Andamento ultimi 6 mesi</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.some((d) => d.invii > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mese" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip formatter={(v: number) => v.toLocaleString("it-IT")} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="invii" name="Inviati" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="consegnati" name="Consegnati" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Nessun dato disponibile per il grafico
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top campagne */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top campagne</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.topCampagne.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna campagna completata</p>
            ) : (
              dashboard.topCampagne.map((c) => (
                <div key={c.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{c.nome}</span>
                    <SmsStatsBadge stato={c.stato} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.inviati > 0
                      ? `${Math.round((c.consegnati / c.inviati) * 100)}% consegnati`
                      : "Nessun invio"
                    }
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

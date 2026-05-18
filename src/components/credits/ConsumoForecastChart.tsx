/**
 * ConsumoForecastChart — Grafico consumo crediti email + ETA esaurimento.
 *
 * Mostra:
 *   - Consumo daily ultimi 14gg (bar chart)
 *   - Linea media giornaliera
 *   - Saldo attuale + ETA esaurimento basato su burn rate
 *   - Severità (ok/warning/critical) coerente con il forecasting lib
 *
 * Sostituisce l'Alert testuale dell'originale con visualizzazione visiva.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { computeCreditForecast, formatDaysRemaining } from "@/lib/creditForecasting";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { format, subDays, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import {
  Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { TrendingDown, AlertTriangle, CheckCircle2, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Saldo attuale per calcolare ETA */
  currentBalanceEur: number;
}

export function ConsumoForecastChart({ currentBalanceEur }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Carica log consumo email ultimi 14 giorni
  const { data: log, isLoading } = useQuery({
    queryKey: ["email-credits-log-14d", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const from = subDays(new Date(), 14).toISOString();
      const { data, error } = await supabase
        .from("email_credits_log")
        .select("created_at, amount_eur, type")
        .eq("company_id", companyId)
        .gte("created_at", from)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  // Aggrega per giorno
  const chartData = useMemo(() => {
    const byDay = new Map<string, { date: string; spent: number; topup: number }>();
    // Inizializza tutti i 14 giorni a zero per avere bar coerenti
    for (let i = 13; i >= 0; i--) {
      const d = format(startOfDay(subDays(new Date(), i)), "yyyy-MM-dd");
      byDay.set(d, { date: d, spent: 0, topup: 0 });
    }
    log?.forEach((entry) => {
      const day = format(startOfDay(new Date(entry.created_at)), "yyyy-MM-dd");
      const bucket = byDay.get(day);
      if (!bucket) return;
      const amt = Math.abs(entry.amount_eur);
      if (entry.type === "deduction") bucket.spent += amt;
      else bucket.topup += amt;
    });
    return Array.from(byDay.values()).map((d) => ({
      ...d,
      label: format(new Date(d.date), "dd/MM", { locale: it }),
    }));
  }, [log]);

  // Forecast
  const forecast = useMemo(() => {
    if (!log || log.length === 0) return null;
    return computeCreditForecast(currentBalanceEur, log as never, 14);
  }, [log, currentBalanceEur]);

  const avgDaily = useMemo(() => {
    if (!chartData.length) return 0;
    const tot = chartData.reduce((s, d) => s + d.spent, 0);
    return tot / chartData.length;
  }, [chartData]);

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  // v8.6.60 — Empty state quando NESSUN consumo nei 14 giorni:
  // niente grafico vuoto con asse 0-4€ e "Autonomia stimata —". UX più pulita.
  const totalSpentLast14d = chartData.reduce((s, d) => s + d.spent, 0);
  if (totalSpentLast14d === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              Consumo Email — ultimi 14 giorni
            </span>
            <Badge className="gap-1 bg-emerald-100 text-emerald-800 text-[10px]">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Nessun consumo
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <TrendingDown className="h-10 w-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm font-medium">Nessuna email inviata negli ultimi 14 giorni</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Saldo attuale: <strong>{formatEur(currentBalanceEur)}</strong>.
              Lo storico apparirà qui appena inizierai a inviare email.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            Consumo Email — ultimi 14 giorni
          </span>
          {forecast && (
            <ForecastBadge forecast={forecast} />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* KPI top */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat
            label="Consumo medio/g"
            value={formatEur(avgDaily)}
            tone="neutral"
          />
          <Stat
            label="Saldo attuale"
            value={formatEur(currentBalanceEur)}
            tone={currentBalanceEur > 5 ? "blue" : "amber"}
          />
          <Stat
            label="Autonomia stimata"
            value={
              forecast?.daysRemaining != null
                ? formatDaysRemaining(forecast.daysRemaining)
                : "—"
            }
            tone={
              forecast?.severity === "critical"
                ? "red"
                : forecast?.severity === "warning"
                  ? "amber"
                  : "green"
            }
            sub={
              forecast?.depletionDate
                ? `Esaurim. ~${format(forecast.depletionDate, "d MMM", { locale: it })}`
                : undefined
            }
          />
        </div>

        {/* Chart */}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v.toFixed(0)}`} />
              <Tooltip
                formatter={(v: number) => formatEur(v)}
                labelFormatter={(l) => `Giorno ${l}`}
                contentStyle={{ fontSize: "12px", borderRadius: "8px" }}
              />
              <ReferenceLine
                y={avgDaily}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={{ value: "Media", fontSize: 10, fill: "#ef4444", position: "right" }}
              />
              <Bar dataKey="spent" fill="#fb923c" name="Consumo €" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Footer info */}
        {forecast && forecast.daysAnalyzed > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Analisi su {forecast.daysAnalyzed}g · Burn rate medio{" "}
            <strong>{formatEur(forecast.dailyBurnRate)}/giorno</strong>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ForecastBadge({ forecast }: { forecast: ReturnType<typeof computeCreditForecast> }) {
  if (forecast.severity === "critical") {
    return (
      <Badge variant="destructive" className="gap-1 text-[10px]">
        <AlertTriangle className="h-2.5 w-2.5" />
        Critico
      </Badge>
    );
  }
  if (forecast.severity === "warning") {
    return (
      <Badge className="gap-1 bg-amber-100 text-amber-800 text-[10px]">
        <Calendar className="h-2.5 w-2.5" />
        Attenzione
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-emerald-100 text-emerald-800 text-[10px]">
      <CheckCircle2 className="h-2.5 w-2.5" />
      OK
    </Badge>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "neutral" | "blue" | "amber" | "red" | "green";
}) {
  const palette: Record<typeof tone, string> = {
    neutral: "bg-muted/40",
    blue:    "bg-blue-50",
    amber:   "bg-amber-50",
    red:     "bg-rose-50",
    green:   "bg-emerald-50",
  };
  return (
    <div className={cn("rounded-lg p-2.5", palette[tone])}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

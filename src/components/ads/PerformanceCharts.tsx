/**
 * PerformanceCharts — visualizzazione metriche campagna Meta.
 *
 * Grafici (recharts):
 *   • Line spend nel tempo (€/giorno)
 *   • Bar lead per giorno
 *   • Line CPL trend con riferimento target
 *   • Funnel impressions → clicks → leads
 *
 * Empty state se nessun dato (campagna nuova / non ancora sincronizzata).
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, TrendingUp, Users, Target, Euro } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import { useMemo } from "react";
import type { MetaInsightDay, MetaInsightsSummary } from "@/hooks/useMetaInsights";

interface Props {
  insights: MetaInsightDay[];
  summary: MetaInsightsSummary;
  isLoading: boolean;
  isSyncing: boolean;
  onSync: () => void;
  targetCplCents?: number;
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0, useGrouping: "always" }).format(cents / 100);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function PerformanceCharts({
  insights,
  summary,
  isLoading,
  isSyncing,
  onSync,
  targetCplCents,
}: Props) {
  const chartData = useMemo(
    () =>
      insights.map((d) => ({
        date: formatDate(d.date_start),
        dateRaw: d.date_start,
        spend: d.spend_cents / 100,
        leads: d.leads,
        cpl: d.leads > 0 ? d.spend_cents / d.leads / 100 : 0,
        impressions: d.impressions,
        clicks: d.clicks,
      })),
    [insights],
  );

  // Funnel data per visualizzazione
  const funnelData = useMemo(
    () => [
      { stage: "Impressioni", value: summary.total_impressions, fill: "#3b82f6" },
      { stage: "Click", value: summary.total_clicks, fill: "#f97316" },
      { stage: "Lead", value: summary.total_leads, fill: "#10b981" },
    ],
    [summary],
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento dati performance...
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) {
    return (
      <Card className="border-dashed bg-white/60">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <TrendingUp className="h-6 w-6" />
          </div>
          <p className="text-lg font-bold text-slate-950">Nessun dato performance ancora</p>
          <p className="max-w-md text-sm text-slate-600">
            I dati arriveranno dopo che la campagna sarà pubblicata su Meta e avrà accumulato qualche giorno di spesa.
          </p>
          <Button onClick={onSync} disabled={isSyncing} variant="outline" size="sm">
            {isSyncing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Forza sync ora
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI bar */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiSmall
            icon={Euro}
            label="Spesa totale"
            value={formatEuro(summary.total_spend_cents)}
            detail={`${summary.days_count} giorni`}
            tone="blue"
          />
          <KpiSmall
            icon={Users}
            label="Lead totali"
            value={String(summary.total_leads)}
            detail={`CTR ${(summary.avg_ctr * 100).toFixed(2)}%`}
            tone="orange"
          />
          <KpiSmall
            icon={Target}
            label="Costo medio per lead"
            value={summary.avg_cpl_cents ? formatEuro(summary.avg_cpl_cents) : "—"}
            detail={
              targetCplCents
                ? `Target ${formatEuro(targetCplCents)}`
                : "Nessun target impostato"
            }
            tone={
              targetCplCents && summary.avg_cpl_cents > 0
                ? summary.avg_cpl_cents <= targetCplCents
                  ? "green"
                  : "red"
                : "green"
            }
          />
          <KpiSmall
            icon={TrendingUp}
            label="Impressioni"
            value={summary.total_impressions.toLocaleString("it-IT")}
            detail={`${summary.total_clicks.toLocaleString("it-IT")} click`}
            tone="violet"
          />
        </CardContent>
      </Card>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Dati ultimi {summary.days_count} giorni · ultimo update: dati cache
        </p>
        <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {isSyncing ? "Sync in corso..." : "Aggiorna ora"}
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* SPEND nel tempo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Spesa giornaliera</CardTitle>
            <CardDescription>Andamento spend nel tempo</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <RechartsTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number) => [`${value.toFixed(2)} €`, "Spesa"]}
                />
                <Line
                  type="monotone"
                  dataKey="spend"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* LEAD per giorno */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lead giornalieri</CardTitle>
            <CardDescription>Conversioni acquisite per giornata</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="leads" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* CPL trend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">CPL trend</CardTitle>
            <CardDescription>
              Costo per lead nel tempo
              {targetCplCents && (
                <>
                  {" "}
                  · Target{" "}
                  <Badge
                    variant="outline"
                    className="ml-1 border-emerald-200 bg-emerald-50 text-emerald-700"
                  >
                    {formatEuro(targetCplCents)}
                  </Badge>
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <RechartsTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number) => [`${value.toFixed(2)} €`, "CPL"]}
                />
                {targetCplCents && (
                  <ReferenceLine
                    y={targetCplCents / 100}
                    stroke="#10b981"
                    strokeDasharray="5 5"
                    label={{ value: "Target", fontSize: 10, fill: "#10b981" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="cpl"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Funnel impressions → click → lead */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Funnel conversione</CardTitle>
            <CardDescription>Dal display alla richiesta preventivo</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis dataKey="stage" type="category" tick={{ fontSize: 12 }} stroke="#475569" width={90} />
                <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {funnelData.map((entry, i) => (
                    <Bar key={i} dataKey="value" fill={entry.fill} />
                  ))}
                </Bar>
                <Legend />
              </BarChart>
            </ResponsiveContainer>
            {summary.total_impressions > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div>
                  CTR:{" "}
                  <strong className="text-slate-950">
                    {((summary.total_clicks / summary.total_impressions) * 100).toFixed(2)}%
                  </strong>
                </div>
                <div>
                  Conv. rate:{" "}
                  <strong className="text-slate-950">
                    {summary.total_clicks > 0
                      ? ((summary.total_leads / summary.total_clicks) * 100).toFixed(2)
                      : "0.00"}
                    %
                  </strong>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiSmall({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "orange" | "green" | "violet" | "red";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    orange: "bg-orange-50 text-orange-700",
    green: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="truncate text-lg font-bold tracking-tight text-slate-950">{value}</p>
        <p className="truncate text-[11px] text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

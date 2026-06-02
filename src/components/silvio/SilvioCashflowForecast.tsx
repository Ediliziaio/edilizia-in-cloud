/**
 * SilvioCashflowForecast — Forecast cassa predittivo 90gg (13 settimane)
 *
 * Visualizza l'output di silvio_cashflow_forecast_90d:
 *   - KPI summary (saldo oggi, saldo previsto fine periodo, settimane critiche)
 *   - Tabella settimanale con bar chart inline e badge status
 *   - Pattern detection (ritardo medio pagamenti)
 *
 * Permessi: visibile a super_admin e company_admin.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
  Wallet, Clock, Sparkles, ArrowDownUp, Radar, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { detectCashAnomalies, fmtDate } from "@/lib/finance/cashflowAnalysis";
import type { ForecastResult, AnomalySeverity } from "@/lib/finance/cashflowAnalysis";

interface Props {
  weeks?: number;
  applyDelay?: boolean;
  compact?: boolean;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  warning: { label: "Attenzione", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  critical: { label: "Critico", cls: "bg-rose-100 text-rose-700 border-rose-300" },
};

const ANOMALY_SEVERITY_CLS: Record<AnomalySeverity, string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
};

export function SilvioCashflowForecast({
  weeks = 13,
  applyDelay = true,
  compact = false,
}: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data, isLoading, isFetching, refetch, error } = useQuery<ForecastResult | null>({
    queryKey: ["silvio_cashflow_forecast", companyId, weeks, applyDelay],
    queryFn: async () => {
      if (!companyId) return null;
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        "silvio_cashflow_forecast_90d" as never,
        {
          p_company_id: companyId,
          p_weeks: weeks,
          p_apply_delay: applyDelay,
        } as never,
      );
      if (rpcErr) throw rpcErr;
      return (rpcData ?? null) as unknown as ForecastResult | null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const maxAbsBar = useMemo(() => {
    if (!data?.weeks?.length) return 1;
    return Math.max(
      ...data.weeks.map((w) =>
        Math.max(Math.abs(w.incassi_eur), Math.abs(w.uscite_eur)),
      ),
      1,
    );
  }, [data]);

  const anomalies = useMemo(
    () => (data ? detectCashAnomalies(data) : []),
    [data],
  );

  if (!companyId) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Errore caricamento forecast</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Forecast non disponibile."}
          <Button size="sm" variant="outline" className="ml-2" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const hasCritical = data.critical_weeks_count > 0;
  const hasWarning = data.warning_weeks_count > 0;
  const overallStatus = hasCritical ? "critical" : hasWarning ? "warning" : "ok";
  const visibleAnomalies = compact
    ? anomalies.filter((a) => a.severity !== "info")
    : anomalies;

  return (
    <Card className={cn(
      "border-l-4",
      overallStatus === "critical" && "border-l-rose-500",
      overallStatus === "warning" && "border-l-amber-500",
      overallStatus === "ok" && "border-l-emerald-500",
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-violet-600" />
              Forecast Cassa Predittivo {data.orizzonte_settimane * 7}gg
              <Badge variant="outline" className={STATUS_BADGE[overallStatus].cls}>
                {STATUS_BADGE[overallStatus].label}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              AI Silvio · Pattern detection ritardo medio:{" "}
              <span className="font-mono">
                {data.delay_pattern?.avg_delay_days_global ?? 0}gg
              </span>
              {" · "}
              Aggiornato {new Date(data.aggiornato_al).toLocaleString("it-IT", {
                day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
              })}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Ricalcola forecast"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Wallet className="h-3 w-3" /> Saldo oggi
            </div>
            <div className="font-mono font-semibold text-base">
              {formatCurrency(data.saldo_oggi_eur)}
            </div>
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3 text-emerald-600" /> Incassi previsti
            </div>
            <div className="font-mono font-semibold text-base text-emerald-700">
              {formatCurrency(data.totale_incassi_previsti_eur)}
            </div>
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <TrendingDown className="h-3 w-3 text-rose-600" /> Uscite previste
            </div>
            <div className="font-mono font-semibold text-base text-rose-700">
              {formatCurrency(data.totale_uscite_previste_eur)}
            </div>
          </div>
          <div className={cn(
            "rounded-lg border p-3",
            data.saldo_atteso_fine_periodo_eur < 0
              ? "bg-rose-50 border-rose-300"
              : data.saldo_atteso_fine_periodo_eur < data.saldo_oggi_eur * 0.1
                ? "bg-amber-50 border-amber-300"
                : "bg-emerald-50 border-emerald-300",
          )}>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <ArrowDownUp className="h-3 w-3" /> Saldo fine periodo
            </div>
            <div className={cn(
              "font-mono font-semibold text-base",
              data.saldo_atteso_fine_periodo_eur < 0 && "text-rose-700",
            )}>
              {formatCurrency(data.saldo_atteso_fine_periodo_eur)}
            </div>
          </div>
        </div>

        {/* Critical alert banner */}
        {hasCritical && (
          <Alert variant="destructive" className="border-rose-300 bg-rose-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">
              Cassa critica prevista in {data.critical_weeks_count} settiman
              {data.critical_weeks_count > 1 ? "e" : "a"}
            </AlertTitle>
            <AlertDescription className="text-xs">
              Saldo minimo previsto: <strong>{formatCurrency(data.saldo_minimo_eur)}</strong>
              {" "}nella settimana del{" "}
              <strong>{fmtDate(data.settimana_critica)}</strong>.
              {" "}Anticipa incassi e rinvia uscite non urgenti per evitare scoperto.
            </AlertDescription>
          </Alert>
        )}

        {/* Anomalie di cassa — segnali azionabili derivati dal forecast */}
        {visibleAnomalies.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Radar className="h-3.5 w-3.5" />
              Anomalie di cassa
              <Badge variant="outline" className="ml-0.5 px-1.5 py-0 text-[10px]">
                {visibleAnomalies.length}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleAnomalies.map((a) => {
                const Icon = a.icon;
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "flex gap-2 rounded-lg border p-2.5",
                      ANOMALY_SEVERITY_CLS[a.severity],
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">{a.title}</div>
                      <div className="mt-0.5 text-[11px] opacity-80">{a.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : !compact ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-xs text-emerald-800">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Nessuna anomalia di cassa rilevata nelle prossime {data.orizzonte_settimane} settimane.
          </div>
        ) : null}

        {/* Weekly table with bars */}
        {!compact && (
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wide text-muted-foreground px-2 pb-1 border-b">
              <div className="col-span-2">Settimana</div>
              <div className="col-span-3 text-right">Incassi</div>
              <div className="col-span-3 text-right">Uscite</div>
              <div className="col-span-3 text-right">Saldo cumulato</div>
              <div className="col-span-1 text-center">Stato</div>
            </div>
            {data.weeks.map((w) => {
              const inWidth = (Math.abs(w.incassi_eur) / maxAbsBar) * 100;
              const outWidth = (Math.abs(w.uscite_eur) / maxAbsBar) * 100;
              return (
                <div
                  key={w.week_index}
                  className={cn(
                    "grid grid-cols-12 gap-2 items-center px-2 py-1.5 rounded text-xs hover:bg-muted/40",
                    w.status === "critical" && "bg-rose-50/50",
                    w.status === "warning" && "bg-amber-50/30",
                  )}
                >
                  <div className="col-span-2 font-medium">
                    <span className="text-muted-foreground">S{w.week_index}</span>{" "}
                    <span>{fmtDate(w.week_start)}</span>
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-2">
                    <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-emerald-400"
                        style={{ width: `${inWidth}%`, marginLeft: `${100 - inWidth}%` }}
                      />
                    </div>
                    <span className="font-mono w-20 text-right">
                      {w.incassi_eur > 0 ? formatCurrency(w.incassi_eur) : "—"}
                    </span>
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-2">
                    <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-rose-400"
                        style={{ width: `${outWidth}%`, marginLeft: `${100 - outWidth}%` }}
                      />
                    </div>
                    <span className="font-mono w-20 text-right text-rose-700">
                      {w.uscite_eur > 0 ? formatCurrency(w.uscite_eur) : "—"}
                    </span>
                  </div>
                  <div className={cn(
                    "col-span-3 font-mono text-right",
                    w.saldo_atteso_eur < 0 && "text-rose-700 font-semibold",
                  )}>
                    {formatCurrency(w.saldo_atteso_eur)}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] px-1.5 py-0", STATUS_BADGE[w.status].cls)}
                    >
                      {w.status === "ok" ? "OK" : w.status === "warning" ? "!" : "!!"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground border-t pt-2">
          <Clock className="h-3 w-3" />
          <span>
            Calcolo: saldo banche + rate non pagate (con ritardo storico applicato)
            − stipendi netti settimanali ({formatCurrency(data.costo_personale_mensile_netto_eur / 4.33)}/sett.)
            − fatture passive (60gg).
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

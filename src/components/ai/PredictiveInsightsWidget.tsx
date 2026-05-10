/**
 * PredictiveInsightsWidget — GAP 10 (Dashboard predictive insights)
 *
 * Card unificata che mostra le 2 previsioni AI principali:
 *   - Cashflow forecast 90gg (scenario realistic, ultimo snapshot)
 *   - Pipeline forecast (totale + weighted + 30/60/90gg)
 *
 * Source: cashflow_forecast_snapshots + pipeline_forecasts (popolati da
 * cron daily ai-cashflow-forecast-builder + ai-pipeline-forecaster).
 *
 * CTA: "Approfondisci con CFO" / "Approfondisci con Sales" → AssistenteAI
 * con persona pre-selezionata.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, ArrowRight, Calendar, Coins, Sparkles, TrendingUp, TrendingDown, Wallet,
} from "lucide-react";
import { Sparkline } from "@/components/admin/ai-shared/Sparkline";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface DailyBalancePoint {
  date: string;
  balance_eur: number;
}

interface CashflowSnapshot {
  forecast_date: string;
  scenario: string;
  starting_balance_eur: number | null;
  min_balance_eur: number | null;
  min_balance_date: string | null;
  max_balance_eur: number | null;
  risk_days_count: number | null;
  first_risk_date: string | null;
  daily_balances: DailyBalancePoint[];
}

interface PipelineSnapshot {
  forecast_date: string;
  pipeline_total_eur: number | null;
  pipeline_weighted_eur: number | null;
  forecast_30d_eur: number | null;
  forecast_60d_eur: number | null;
  forecast_90d_eur: number | null;
  quotes_in_pipeline_count: number | null;
  ai_insights: string | null;
}

const eur = (n: number | null | undefined) =>
  n == null ? "—" : `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const dateShort = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
};

export function PredictiveInsightsWidget() {
  const { effectiveCompany } = useAuth();

  const { data: cashflow, isLoading: loadingCash } = useQuery({
    queryKey: ["predictive-cashflow", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 60 * 60 * 1000, // 1 ora
    queryFn: async (): Promise<CashflowSnapshot | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cashflow_forecast_snapshots")
        .select("forecast_date, scenario, starting_balance_eur, min_balance_eur, min_balance_date, max_balance_eur, risk_days_count, first_risk_date, daily_balances")
        .eq("company_id", effectiveCompany!.id)
        .eq("scenario", "realistic")
        .order("forecast_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as CashflowSnapshot | null;
    },
  });

  const { data: pipeline, isLoading: loadingPipe } = useQuery({
    queryKey: ["predictive-pipeline", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<PipelineSnapshot | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pipeline_forecasts")
        .select("forecast_date, pipeline_total_eur, pipeline_weighted_eur, forecast_30d_eur, forecast_60d_eur, forecast_90d_eur, quotes_in_pipeline_count, ai_insights")
        .eq("company_id", effectiveCompany!.id)
        .order("forecast_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as PipelineSnapshot | null;
    },
  });

  // Hide totally if both snapshots missing (no data yet, cron non eseguito)
  if (!loadingCash && !loadingPipe && !cashflow && !pipeline) {
    return null;
  }

  return (
    <Card className="border-violet-200 dark:border-violet-900 overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 py-2 bg-gradient-to-r from-violet-50 via-purple-50 to-indigo-50 dark:from-violet-950/30 dark:via-purple-950/30 dark:to-indigo-950/30 border-b border-violet-200 dark:border-violet-900 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <span className="text-sm font-semibold">Previsioni AI a 90 giorni</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            Aggiornato ogni notte
          </span>
        </div>

        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
          {/* CASHFLOW SECTION */}
          <div className="p-4 space-y-3">
            {loadingCash ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : cashflow ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Cashflow 90gg
                    </span>
                  </div>
                  {cashflow.risk_days_count && cashflow.risk_days_count > 0 ? (
                    <Badge variant="destructive" className="text-[10px]">
                      ⚠ {cashflow.risk_days_count} giorni a rischio
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                      Liquidità ok
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Saldo oggi</p>
                    <p className="font-mono font-medium text-sm tabular-nums">{eur(cashflow.starting_balance_eur)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Min previsto</p>
                    <p className={cn(
                      "font-mono font-medium text-sm tabular-nums",
                      (cashflow.min_balance_eur ?? 0) < 0 ? "text-rose-600" : "text-emerald-600",
                    )}>
                      {eur(cashflow.min_balance_eur)}
                    </p>
                    {cashflow.min_balance_date && (
                      <p className="text-[10px] text-muted-foreground">il {dateShort(cashflow.min_balance_date)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground">Max previsto</p>
                    <p className="font-mono font-medium text-sm tabular-nums text-emerald-600">{eur(cashflow.max_balance_eur)}</p>
                  </div>
                </div>

                {/* Sparkline trend balance */}
                {cashflow.daily_balances && cashflow.daily_balances.length > 1 && (
                  <div className="pt-1">
                    <Sparkline
                      data={cashflow.daily_balances.map((d) => ({ date: d.date, value: d.balance_eur }))}
                      width={280}
                      height={40}
                      trendDirection="higher-is-better"
                      formatValue={eur}
                    />
                  </div>
                )}

                {cashflow.first_risk_date && (
                  <div className="rounded-md bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 p-2 flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-rose-600 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-rose-700 dark:text-rose-300">
                      Primo giorno a rischio: <strong>{dateShort(cashflow.first_risk_date)}</strong>
                    </p>
                  </div>
                )}

                <Link
                  to="/azienda/assistente-ai?persona=cfo&q=Spiega%20il%20cashflow%20forecast%20a%2090gg%20e%20suggerisci%20azioni%20correttive"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Calendar className="h-3 w-3" />
                  Approfondisci con CFO
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </>
            ) : (
              <div className="text-xs text-muted-foreground py-4 text-center">
                <Wallet className="h-6 w-6 mx-auto mb-1 opacity-30" />
                Nessun forecast cashflow disponibile.
                <p className="text-[10px] mt-1">Il cron daily 23:00 lo genererà al primo run.</p>
              </div>
            )}
          </div>

          {/* PIPELINE SECTION */}
          <div className="p-4 space-y-3">
            {loadingPipe ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : pipeline ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Pipeline Sales
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {pipeline.quotes_in_pipeline_count ?? 0} quote attive
                  </Badge>
                </div>

                <div>
                  <p className="text-muted-foreground text-[10px] uppercase">Pipeline pesata</p>
                  <p className="text-2xl font-bold font-mono tabular-nums">
                    {eur(pipeline.pipeline_weighted_eur)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    su €{Number(pipeline.pipeline_total_eur ?? 0).toLocaleString("it-IT")} totali
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">30gg</p>
                    <p className="font-mono font-medium text-sm tabular-nums">{eur(pipeline.forecast_30d_eur)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">60gg</p>
                    <p className="font-mono font-medium text-sm tabular-nums">{eur(pipeline.forecast_60d_eur)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">90gg</p>
                    <p className="font-mono font-medium text-sm tabular-nums">{eur(pipeline.forecast_90d_eur)}</p>
                  </div>
                </div>

                {pipeline.ai_insights && (
                  <div className="rounded-md bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900 p-2">
                    <p className="text-[11px] text-violet-700 dark:text-violet-300 leading-snug">
                      <Sparkles className="h-3 w-3 inline mr-1" />
                      {pipeline.ai_insights.substring(0, 200)}
                      {pipeline.ai_insights.length > 200 ? "…" : ""}
                    </p>
                  </div>
                )}

                <Link
                  to="/azienda/assistente-ai?persona=direttore_vendite&q=Spiega%20il%20pipeline%20forecast%20e%20le%20opportunit%C3%A0%20a%20rischio"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <TrendingUp className="h-3 w-3" />
                  Approfondisci con Direttore Vendite
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </>
            ) : (
              <div className="text-xs text-muted-foreground py-4 text-center">
                <TrendingDown className="h-6 w-6 mx-auto mb-1 opacity-30" />
                Nessun forecast pipeline disponibile.
                <p className="text-[10px] mt-1">Il cron daily 22:00 lo genererà al primo run.</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PredictiveInsightsWidget;

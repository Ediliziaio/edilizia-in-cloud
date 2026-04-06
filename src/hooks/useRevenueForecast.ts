import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MrrDataPoint, ForecastResult } from "@/types/dashboard";
import { computeForecast, buildChartData, type ChartDataPoint } from "@/lib/forecastUtils";

interface UseRevenueForecastReturn {
  mrrHistory: MrrDataPoint[];
  forecasts: ForecastResult[];
  chartData: ChartDataPoint[];
  hasEnoughData: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useRevenueForecast(): UseRevenueForecastReturn {
  const [mrrHistory, setMrrHistory] = useState<MrrDataPoint[]>([]);
  const [forecasts, setForecasts] = useState<ForecastResult[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        // Chiama edge function admin-mrr-data
        const { data, error: fnError } = await supabase.functions.invoke<{
          data: Array<{
            year_month: string;
            mrr_eur: number;
            active_subscriptions: number;
          }>;
        }>("admin-mrr-data");

        if (fnError) {
          throw new Error("Errore nel caricamento dei dati MRR");
        }

        const rows = data?.data ?? [];
        const history: MrrDataPoint[] = rows.map((r) => ({
          yearMonth: r.year_month.substring(0, 7), // "YYYY-MM"
          mrrEur: Number(r.mrr_eur),
          activeSubscriptions: Number(r.active_subscriptions),
        }));

        if (!cancelled) {
          setMrrHistory(history);
          const computed = computeForecast(history);
          setForecasts(computed);
          setChartData(buildChartData(history, computed));
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Errore nel caricamento dati";
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasEnoughData = mrrHistory.length >= 3;

  return { mrrHistory, forecasts, chartData, hasEnoughData, isLoading, error };
}

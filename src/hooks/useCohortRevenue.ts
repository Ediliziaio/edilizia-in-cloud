import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export interface CohortRow {
  cohort_mese: string;
  mese_attivita: string;
  mesi_dalla_iscrizione: number;
  aziende_attive: number;
  eventi_totali: number;
}

export interface CohortDataPoint {
  mesi_dalla_iscrizione: number;
  [cohortLabel: string]: number;
}

function formatCohortLabel(isoDate: string): string {
  try {
    return format(new Date(isoDate), "MMM yyyy", { locale: it });
  } catch {
    return isoDate;
  }
}

export function useCohortRevenue() {
  const { data: rawData, isLoading, isError } = useQuery({
    queryKey: ["cohort-revenue"],
    queryFn: async (): Promise<CohortRow[]> => {
      const { data, error } = await supabase
        .from("cohort_revenue_view")
        .select("cohort_mese, mese_attivita, mesi_dalla_iscrizione, aziende_attive, eventi_totali")
        .order("cohort_mese", { ascending: true })
        .order("mesi_dalla_iscrizione", { ascending: true });
      if (error) {
        console.error("[useCohortRevenue]", error);
        throw new Error("Impossibile caricare i dati cohort: " + error.message);
      }
      return (data ?? []) as CohortRow[];
    },
  });

  // Trasforma i dati per Recharts
  const { chartData, cohortLabels } = (() => {
    if (!rawData || rawData.length === 0) return { chartData: [], cohortLabels: [] };

    const cohorts = [...new Set(rawData.map((r) => r.cohort_mese))];
    const maxMesi = Math.max(...rawData.map((r) => r.mesi_dalla_iscrizione), 0);

    const cohortLabels = cohorts.map(formatCohortLabel);

    const chartData: CohortDataPoint[] = [];
    for (let m = 0; m <= Math.min(maxMesi, 12); m++) {
      const point: CohortDataPoint = { mesi_dalla_iscrizione: m };
      cohorts.forEach((cohort, idx) => {
        const row = rawData.find(
          (r) => r.cohort_mese === cohort && r.mesi_dalla_iscrizione === m
        );
        const label = cohortLabels[idx];
        // Calcola retention % rispetto al mese 0
        const mese0 = rawData.find(
          (r) => r.cohort_mese === cohort && r.mesi_dalla_iscrizione === 0
        );
        const base = mese0?.aziende_attive ?? 1;
        point[label] = row ? Math.round((row.aziende_attive / base) * 100) : 0;
      });
      chartData.push(point);
    }

    return { chartData, cohortLabels };
  })();

  return { rawData: rawData ?? [], chartData, cohortLabels, isLoading, isError };
}

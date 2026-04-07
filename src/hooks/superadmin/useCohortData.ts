import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Tipi ────────────────────────────────────────────────

export interface CohortRow {
  cohort_month: string;    // es. "2024-01"
  period_number: number;   // mesi dall'acquisizione
  active_users: number;
  total_users: number;
  retention_rate: number;  // 0-100
}

export interface CohortMatrixEntry {
  cohortMonth: string;
  periods: Array<{ period: number; retention: number; active: number }>;
  totalUsers: number;
}

/** Tipo grezzo dalla view Supabase */
interface RawCohortRow {
  cohort_mese: string;
  mesi_dalla_iscrizione: number;
  aziende_attive: number;
}

// ─── Hook principale ──────────────────────────────────────

/** Carica i dati di retention cohort dalla view `cohort_revenue_view` */
export function useCohortData() {
  return useQuery({
    queryKey: ["cohort-data"],
    queryFn: async (): Promise<CohortRow[]> => {
      const { data, error } = await supabase
        .from("cohort_revenue_view")
        .select("cohort_mese, mesi_dalla_iscrizione, aziende_attive")
        .order("cohort_mese", { ascending: false })
        .order("mesi_dalla_iscrizione", { ascending: true })
        .limit(500);

      if (error) throw new Error("Impossibile caricare i dati cohort: " + error.message);

      // Calcola total_users (aziende al periodo 0) per ogni cohort
      const cohortTotals = new Map<string, number>();
      (data ?? []).forEach((r: RawCohortRow) => {
        if (r.mesi_dalla_iscrizione === 0) {
          cohortTotals.set(r.cohort_mese, r.aziende_attive);
        }
      });

      return (data ?? []).map((r: RawCohortRow) => {
        const total = cohortTotals.get(r.cohort_mese) ?? r.aziende_attive;
        return {
          cohort_month: r.cohort_mese,
          period_number: r.mesi_dalla_iscrizione,
          active_users: r.aziende_attive,
          total_users: total,
          retention_rate: total > 0 ? Math.round((r.aziende_attive / total) * 100) : 0,
        };
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minuti
  });
}

// ─── Utility trasformazione ───────────────────────────────

/** Trasforma i dati flat in struttura per heatmap */
export function toCohortMatrix(rows: CohortRow[]): CohortMatrixEntry[] {
  const map = new Map<string, CohortMatrixEntry>();

  for (const row of rows) {
    if (!map.has(row.cohort_month)) {
      map.set(row.cohort_month, {
        cohortMonth: row.cohort_month,
        periods: [],
        totalUsers: row.total_users,
      });
    }
    map.get(row.cohort_month)!.periods.push({
      period: row.period_number,
      retention: row.retention_rate,
      active: row.active_users,
    });
  }

  // Ordina per cohort più recente prima
  return Array.from(map.values()).sort((a, b) =>
    b.cohortMonth.localeCompare(a.cohortMonth)
  );
}

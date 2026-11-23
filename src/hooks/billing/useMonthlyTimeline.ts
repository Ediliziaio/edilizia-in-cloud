import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { TipoDocumento } from "@/types/fatturazione";

export interface MonthSummary {
  year: number;
  month: number;
  label: string;
  docCount: number;
  totalAmount: number;
  imponibile: number;
  iva: number;
  /** Incassato dei documenti che hanno un incasso (non bozze, note di credito, DDT…). */
  incassato: number;
  daIncassare: number;
  /** Parte del da incassare già oltre la scadenza. */
  scaduto: number;
  key: string; // "YYYY-MM"
}

const MONTH_NAMES_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const MONTH_ABBR_IT = [
  "GEN", "FEB", "MAR", "APR", "MAG", "GIU",
  "LUG", "AGO", "SET", "OTT", "NOV", "DIC",
];

/**
 * I dodici mesi di un anno, vuoti: zero documenti e zero importi.
 *
 * Serve a disegnare la striscia dei mesi SUBITO, prima che i numeri arrivino dal
 * database: la striscia è già alla sua altezza definitiva e l'elenco sotto non
 * viene spinto giù mezzo secondo dopo (23/11/2026, misurato: la pagina si
 * disegnava a 157 ms e la striscia compariva a 500 ms).
 */
export function mesiVuoti(anno: number): MonthSummary[] {
  return MONTH_NAMES_IT.map((label, i) => ({
    year: anno,
    month: i + 1,
    label,
    docCount: 0,
    totalAmount: 0,
    imponibile: 0,
    iva: 0,
    incassato: 0,
    daIncassare: 0,
    scaduto: 0,
    key: `${anno}-${String(i + 1).padStart(2, "0")}`,
  }));
}

export function useMonthlyTimeline(tipoFilter?: TipoDocumento[] | null, year?: number, opzioni?: { enabled?: boolean }) {
  const companyId = useEffectiveCompanyId();
  const targetYear = year ?? new Date().getFullYear();

  return useQuery({
    queryKey: ["billing-monthly-timeline", companyId, tipoFilter, targetYear],
    enabled: !!companyId && (opzioni?.enabled ?? true),
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_documenti_monthly_timeline" as never,
        {
          p_company_id: companyId!,
          p_tipos: tipoFilter && tipoFilter.length > 0 ? tipoFilter : null,
          p_anno: targetYear,
        } as never
      );

      if (error) throw error;

      // I dodici mesi dell'anno, gli stessi che la striscia disegna già vuoti.
      const monthMap = new Map(mesiVuoti(targetYear).map(m => [m.key, m]));

      // Merge server-side aggregation
      const rows = (typeof data === "string" ? JSON.parse(data) : data) as
        {
          year: number; month: number; doc_count: number; total_amount: number;
          imponibile?: number; iva?: number; incassato?: number; da_incassare?: number; scaduto?: number;
        }[] | null;

      for (const row of rows ?? []) {
        const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
        const month = monthMap.get(key);
        if (month) {
          month.docCount = row.doc_count;
          month.totalAmount = Number(row.total_amount);
          month.imponibile = Number(row.imponibile ?? 0);
          month.iva = Number(row.iva ?? 0);
          month.incassato = Number(row.incassato ?? 0);
          month.daIncassare = Number(row.da_incassare ?? 0);
          month.scaduto = Number(row.scaduto ?? 0);
        }
      }

      return Array.from(monthMap.values());
    },
    staleTime: 60_000,
  });
}

export { MONTH_ABBR_IT };

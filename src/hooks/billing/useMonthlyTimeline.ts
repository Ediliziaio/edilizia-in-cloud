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
  key: string; // "YYYY-MM"
}

const MONTH_NAMES_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export function useMonthlyTimeline(tipoFilter?: TipoDocumento[] | null) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["billing-monthly-timeline", companyId, tipoFilter],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_documenti_monthly_timeline" as never,
        {
          p_company_id: companyId!,
          p_tipos: tipoFilter && tipoFilter.length > 0 ? tipoFilter : null,
        } as never
      );

      if (error) throw error;

      // Build month map for the full range (-12 to +3)
      const now = new Date();
      const monthMap = new Map<string, MonthSummary>();

      for (let i = -12; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthMap.set(key, {
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          label: MONTH_NAMES_IT[d.getMonth()],
          docCount: 0,
          totalAmount: 0,
          key,
        });
      }

      // Merge server-side aggregation into the map
      const rows = (typeof data === "string" ? JSON.parse(data) : data) as
        { year: number; month: number; doc_count: number; total_amount: number }[] | null;

      for (const row of rows ?? []) {
        const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
        const month = monthMap.get(key);
        if (month) {
          month.docCount = row.doc_count;
          month.totalAmount = Number(row.total_amount);
        }
      }

      return Array.from(monthMap.values());
    },
    staleTime: 60_000,
  });
}

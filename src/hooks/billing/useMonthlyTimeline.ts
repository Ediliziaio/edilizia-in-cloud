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
      let query = supabase
        .from("documenti_fiscali" as never)
        .select("data_emissione, totale_documento, tipo")
        .eq("company_id", companyId!)
        .neq("stato", "annullata")
        .order("data_emissione", { ascending: true });

      if (tipoFilter && tipoFilter.length > 0) {
        query = query.in("tipo", tipoFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const now = new Date();
      const monthMap = new Map<string, MonthSummary>();

      // Generate 16 months: -12 to +3
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

      for (const row of (data as unknown as { data_emissione: string; totale_documento: number }[]) ?? []) {
        const d = new Date(row.data_emissione);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const month = monthMap.get(key);
        if (month) {
          month.docCount++;
          month.totalAmount += row.totale_documento ?? 0;
        }
      }

      return Array.from(monthMap.values());
    },
    staleTime: 60_000,
  });
}

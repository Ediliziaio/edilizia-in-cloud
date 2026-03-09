import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AttributionRow {
  dimension: string;
  sessions: number;
  unique_visitors: number;
  contacts_created: number;
  conversions: number;
}

type GroupBy = "source" | "medium" | "campaign" | "content";

export function useAttributionReport(
  companyId: string | undefined,
  dateFrom: Date,
  dateTo: Date,
  groupBy: GroupBy
) {
  return useQuery<AttributionRow[]>({
    queryKey: ["attribution-report", companyId, dateFrom.toISOString(), dateTo.toISOString(), groupBy],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.rpc("get_attribution_report", {
        p_company_id: companyId,
        p_date_from: dateFrom.toISOString(),
        p_date_to: dateTo.toISOString(),
        p_group_by: groupBy,
      });
      if (error) throw error;
      return (data as unknown as AttributionRow[]) || [];
    },
    enabled: !!companyId,
  });
}

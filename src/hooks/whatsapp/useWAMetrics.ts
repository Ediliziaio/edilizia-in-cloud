// MP-FINAL — Hook metriche WhatsApp per dashboard StatsBar.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface WAMetrics {
  active_numbers: number;
  messages_last_24h: number;
  errors_last_24h: number;
  total_spend_today: number;
  tool_calls_last_24h: number;
}

export function useWAMetrics() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["wa", "metrics", companyId],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<WAMetrics> => {
      const { data, error } = await supabase.rpc("get_whatsapp_metrics", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        active_numbers: Number(row?.active_numbers ?? 0),
        messages_last_24h: Number(row?.messages_last_24h ?? 0),
        errors_last_24h: Number(row?.errors_last_24h ?? 0),
        total_spend_today: Number(row?.total_spend_today ?? 0),
        tool_calls_last_24h: Number(row?.tool_calls_last_24h ?? 0),
      };
    },
  });
}

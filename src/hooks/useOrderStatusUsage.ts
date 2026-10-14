import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";

/** Quante commesse usano ogni stato: stessa identità di orders.current_status_id. */
export function useOrderStatusUsage(companyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["order-statuses-usage", companyId],
    enabled: !!companyId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const ordini = await loadCatalogPages((from, to) => supabase.from("orders")
        .select("id, current_status_id").eq("company_id", companyId!).order("id").range(from, to));
      const uso: Record<string, number> = {};
      for (const ordine of ordini) if (ordine.current_status_id) uso[ordine.current_status_id] = (uso[ordine.current_status_id] ?? 0) + 1;
      return uso;
    },
  });
}

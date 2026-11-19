import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export interface MovementBalance { quantity: number; reserved: number }
/** Anteprima di sola lettura; il servizio ricontrolla i saldi alla conferma. */
export function useMovementBalances(companyId: string | undefined, stockIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["warehouse", "movement-balances", companyId, [...new Set(stockIds)].sort().join(",")],
    enabled: enabled && !!companyId && stockIds.length > 0, staleTime: 0, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouse_stock").select("id,quantity,quantity_reserved")
        .eq("company_id", companyId!).in("id", [...new Set(stockIds)]);
      if (error) throw error;
      return (data ?? []).map(row => ({ id: row.id, quantity: Number(row.quantity), reserved: Number(row.quantity_reserved ?? 0) }));
    },
  });
}

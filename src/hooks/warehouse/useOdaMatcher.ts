/**
 * useOdaMatcher — wrapper RPC `match_scan_to_oda`.
 *
 * Chiama la cascata di match ODA → ritorna ODA pending compatibili con
 * lo stock_item scansionato (sorting: stesso supplier prima, poi
 * expected_delivery ASC). Usato in OdaReceiveSheet step 2.
 */

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OdaMatch {
  oda_id: string;
  oda_number: string;
  supplier_id: string;
  supplier_name: string;
  expected_delivery_date: string | null;
  item_line_id: string;
  item_description: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_pending: number;
  status: string;
}

export function useOdaMatcher() {
  return useMutation({
    mutationFn: async (input: {
      stockItemId: string;
      supplierId?: string;
    }): Promise<OdaMatch[]> => {
      const { data, error } = await supabase.rpc("match_scan_to_oda", {
        p_stock_item_id: input.stockItemId,
        p_supplier_id: input.supplierId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as unknown as OdaMatch[];
    },
  });
}

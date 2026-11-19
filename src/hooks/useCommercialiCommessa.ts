import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import type { CompensationMode } from "@/lib/commissions";

export interface OrderSalesperson {
  id: string;
  salesperson_id: string;
  commission_type: string;
  commission_value: number;
  commission_amount: number;
  deduction_amount: number;
  is_paid: boolean;
  paid_date: string | null;
  payment_expected_date: string | null;
  salesperson: { first_name: string; last_name: string; compensation_mode?: CompensationMode | null };
}

export function useCommercialiCommessa(orderId?: string) {
  return useQuery({
    queryKey: queryKeys.orderSalespeople.byOrder(orderId ?? ""),
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_salespeople")
        .select("*, salesperson:salespeople(first_name, last_name, compensation_mode)")
        .eq("order_id", orderId!);
      if (error) throw error;
      return ((data ?? []) as Array<Omit<OrderSalesperson, "salesperson"> & { salesperson: OrderSalesperson["salesperson"] | null }>)
        .map((row): OrderSalesperson => ({
          ...row,
          salesperson: row.salesperson ?? { first_name: "Venditore", last_name: "(rimosso)", compensation_mode: null },
        }));
    },
  });
}

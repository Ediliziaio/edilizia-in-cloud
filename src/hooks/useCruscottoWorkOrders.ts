import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { classifyWorkOrders, type WorkOrder } from "@/lib/cruscottoMetrics";

export function useCruscottoWorkOrders(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["cruscotto", "work-lifecycle-v2", companyId],
    enabled: !!companyId,
    staleTime: 120_000,
    queryFn: async () => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const [orders, statuses] = await Promise.all([
        readAllOrderRows<WorkOrder>((from, to) => supabase.from("orders")
          .select("id, current_status_id, status, fulfillment_status, work_start_date, work_end_date, expected_date, order_code, description")
          .eq("company_id", companyId).is("deleted_at", null)
          // una commessa generale è un contenitore: i lavori sono le commesse dentro
          .or("workflow_kind.neq.generale")
          .order("id").range(from, to)),
        supabase.from("order_statuses").select("id, position, is_support_phase")
          .eq("company_id", companyId).order("position"),
      ]);
      if (statuses.error) throw statuses.error;
      return classifyWorkOrders(orders, statuses.data ?? []);
    },
  });
}

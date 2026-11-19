import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PlanningPhase } from "@/lib/orders/planningSchedule";

/** Lettura leggera delle stesse fasi del Gantt, soltanto quando si apre il popup. */
export function usePlanningPhases(orderId: string, companyId: string | undefined, open: boolean) {
  return useQuery({
    queryKey: ["order-planning-phases", orderId, companyId],
    enabled: open && !!companyId,
    queryFn: async ({ signal }): Promise<PlanningPhase[]> => {
      const rows: PlanningPhase[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("order_work_phases")
          .select("id, name, start_date, end_date").eq("order_id", orderId).eq("company_id", companyId!)
          .order("position").order("id").range(offset, offset + 499).abortSignal(signal);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) return rows;
      }
    },
  });
}

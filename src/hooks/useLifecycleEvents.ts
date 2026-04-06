import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LifecycleEvent {
  id: string;
  company_id: string;
  event_type: string;
  old_status: string | null;
  new_status: string | null;
  plan_id: string | null;
  previous_plan_id: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
}

export function useLifecycleEvents(companyId: string | undefined) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["lifecycle-events", companyId],
    queryFn: async (): Promise<LifecycleEvent[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("subscription_logs")
        .select(
          "id, company_id, event_type, old_status, new_status, plan_id, previous_plan_id, notes, performed_by, created_at"
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[useLifecycleEvents]", error);
        throw new Error("Impossibile caricare gli eventi: " + error.message);
      }
      return (data ?? []) as LifecycleEvent[];
    },
    enabled: !!companyId,
  });

  return { events: data ?? [], isLoading, isError };
}

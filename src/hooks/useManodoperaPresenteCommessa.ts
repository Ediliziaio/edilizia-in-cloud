import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Having a worker/company on a job is distinct from granting an app login. */
export function useManodoperaPresenteCommessa(orderId: string) {
  return useQuery({
    queryKey: ["order-workforce-presence", orderId],
    queryFn: async () => {
      const [employees, teams] = await Promise.all([
        supabase.from("order_employees").select("id").eq("order_id", orderId).not("employee_id", "is", null).limit(1),
        supabase.from("order_external_teams").select("id").eq("order_id", orderId).not("external_team_id", "is", null).limit(1),
      ]);
      if (employees.error) throw employees.error;
      if (teams.error) throw teams.error;
      return !!(employees.data?.length || teams.data?.length);
    },
    enabled: !!orderId,
  });
}

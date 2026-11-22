import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { FishAssistanceCase } from "../../shared/fish/assistance";
export type FishAssistanceActivity = FishAssistanceCase & {
  customerName: string | null;
  problem: string | null;
  appointment: { date: string; time: string | null; status: string } | null;
};
export function useFishAssistanceActivities(enabled: boolean) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["fish-assistance-activities", companyId],
    enabled: !!companyId && enabled,
    retry: false,
    refetchInterval: 20_000,
    queryFn: async (): Promise<FishAssistanceActivity[]> => {
      const { data, error } = await supabase
        .from("ai_fish_assistance")
        .select(
          "id,company_id,agent_id,session_id,task_id,calendar_id,customer_id,customer_updated_at,identity_verified_at,ticket_id,ticket_action,appointment_id,stage,reason,created_at,updated_at",
        )
        .eq("company_id", companyId!)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data || []) as FishAssistanceCase[];
      if (!rows.length) return [];
      const ids = (key: "customer_id" | "ticket_id" | "appointment_id") => [
        ...new Set(rows.flatMap((row) => (row[key] ? [row[key]!] : []))),
      ];
      const [customers, tickets, appointments] = await Promise.all([
        ids("customer_id").length
          ? supabase
              .from("profiles")
              .select("id,first_name,last_name,business_name")
              .eq("company_id", companyId!)
              .in("id", ids("customer_id"))
          : Promise.resolve({ data: [], error: null }),
        ids("ticket_id").length
          ? supabase
              .from("tickets")
              .select("id,descrizione")
              .eq("company_id", companyId!)
              .in("id", ids("ticket_id"))
          : Promise.resolve({ data: [], error: null }),
        ids("appointment_id").length
          ? supabase
              .from("appointments")
              .select("id,appointment_date,appointment_time,status")
              .eq("company_id", companyId!)
              .in("id", ids("appointment_id"))
          : Promise.resolve({ data: [], error: null }),
      ]);
      for (const result of [customers, tickets, appointments])
        if (result.error) throw result.error;
      const names = new Map(
        (customers.data || []).map((c) => [
          c.id,
          [c.first_name, c.last_name].filter(Boolean).join(" ") ||
            c.business_name,
        ]),
      );
      const problems = new Map(
        (tickets.data || []).map((t) => [t.id, t.descrizione]),
      );
      const dates = new Map(
        (appointments.data || []).map((a) => [
          a.id,
          {
            date: a.appointment_date,
            time: a.appointment_time,
            status: a.status,
          },
        ]),
      );
      return rows.map((row) => ({
        ...row,
        customerName: names.get(row.customer_id || "") || null,
        problem: problems.get(row.ticket_id || "") || null,
        appointment: dates.get(row.appointment_id || "") || null,
      }));
    },
  });
}

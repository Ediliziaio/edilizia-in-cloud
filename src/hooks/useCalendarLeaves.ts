import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadDashboardRows } from "@/lib/attivita/dashboardTasks";
import type { ApprovedLeave } from "@/types/calendar";
interface Request {
  id: string;
  tipo: string;
  data_inizio: string;
  data_fine: string;
  ore_richieste: number | null;
  profilo?: {
    id: string;
    employee_id: string | null;
    nome: string;
    cognome: string;
  } | null;
}
interface Options {
  company?: string;
  user?: string;
  from: string;
  to: string;
  team: boolean;
  enabled: boolean;
}
export function useCalendarLeaves({
  company,
  user,
  from,
  to,
  team,
  enabled,
}: Options) {
  const ready = !!company && !!user && enabled;
  const query = useQuery({
    queryKey: ["approved-leaves", "planning-v3", company, user, team, from, to],
    enabled: ready,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!ready) throw new Error("Assenze del calendario non disponibili");
      const profileRows = await loadDashboardRows<Request>((a, b) => {
        let q = supabase
          .from("hr_richieste")
          .select(
            team
              ? "id,tipo,data_inizio,data_fine,ore_richieste,profilo:hr_profili!hr_richieste_profilo_id_fkey(id,nome,cognome,employee_id)"
              : "id,tipo,data_inizio,data_fine,ore_richieste,profilo:hr_profili!hr_richieste_profilo_id_fkey!inner(id,nome,cognome,employee_id,user_id)",
          )
          .eq("company_id", company!)
          .eq("stato", "approvata")
          .lte("data_inizio", to)
          .gte("data_fine", from);
        if (!team) q = q.eq("profilo.user_id", user!);
        return q
          .order("id")
          .range(a, b)
          .abortSignal(signal)
          .overrideTypes<Request[], { merge: false }>();
      });
      const rows = new Map(profileRows.map((r) => [r.id, r]));
      if (!team) {
        const direct = await loadDashboardRows<Request>((a, b) =>
          supabase
            .from("hr_richieste")
            .select("id,tipo,data_inizio,data_fine,ore_richieste")
            .eq("company_id", company!)
            .eq("user_id", user!)
            .eq("stato", "approvata")
            .lte("data_inizio", to)
            .gte("data_fine", from)
            .order("id")
            .range(a, b)
            .abortSignal(signal),
        );
        direct.forEach((r) => {
          if (!rows.has(r.id)) rows.set(r.id, r);
        });
      }
      return [...rows.values()].map(
        (r): ApprovedLeave => ({
          id: r.id,
          employee_id: r.profilo?.employee_id || r.profilo?.id || user!,
          type: r.tipo,
          start_date: r.data_inizio,
          end_date: r.data_fine,
          total_days: null,
          total_hours: r.ore_richieste,
          employee: r.profilo
            ? {
                id: r.profilo.employee_id || r.profilo.id,
                first_name: r.profilo.nome,
                last_name: r.profilo.cognome,
              }
            : null,
        }),
      );
    },
  });
  return { ...query, data: ready ? query.data : undefined };
}

import { queryKeys } from "@/lib/queryKeys";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { loadArchivedOrderIds, excludeArchivedOrders } from "@/lib/orders/archivedOrderScope";
import { loadDashboardRows, type DashboardTask } from "@/lib/attivita/dashboardTasks";

type PrioritaTeamTask = Pick<DashboardTask, "id" | "title" | "status" | "priority" | "due_date" | "category" | "assigned_to" | "assignee">;

const ASSEGNATARIO = "assignee:profiles!tasks_assigned_to_fkey(first_name, last_name)";
const CAMPI_PRIORITA_TEAM = `id, title, status, priority, due_date, category, assigned_to, ${ASSEGNATARIO}`;
const CAMPI_AGENDA = `id, title, notes, status, priority, due_date, category, assigned_to, created_by,
  order_id, stock_item_id, contact_id, opportunity_id, completed_at, ufficio_id, area_mia,
  order:orders!tasks_order_id_fkey(order_code), stock_item:warehouse_stock!tasks_stock_item_id_fkey(name),
  contatto:marketing_contacts!tasks_contact_id_fkey(id, first_name, last_name),
  opportunita:marketing_opportunities!tasks_opportunity_id_fkey(id, name), ${ASSEGNATARIO}`;

/** L'agenda resta personale anche per gli admin. Il team ha una query distinta. */
export function useDashboardTasks(scope?: "personal"): UseQueryResult<DashboardTask[]>;
export function useDashboardTasks(scope: "team"): UseQueryResult<PrioritaTeamTask[]>;
export function useDashboardTasks(scope: "personal" | "team" = "personal") {
  const { user, effectiveCompany } = useAuth();
  const { isAdmin, canViewTeamTasks, isLoading } = usePermissions();
  const companyId = effectiveCompany?.id;
  const seesTeam = isAdmin || canViewTeamTasks;
  const ready = !!user?.id && !!companyId && !isLoading;
  return useQuery({
    queryKey: [...queryKeys.tasks.all, "dashboard", scope, user?.id, companyId, seesTeam],
    enabled: ready && (scope === "personal" || seesTeam),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!ready || (scope === "team" && !seesTeam)) throw new Error("Non hai accesso alle attività richieste");
      const archived = await loadArchivedOrderIds(companyId!);
      return loadDashboardRows<DashboardTask | PrioritaTeamTask>((from, to) => {
        let q = supabase.from((scope === "personal" ? "tasks_personali_e_aree" : "tasks") as "tasks")
          .select(scope === "personal" ? CAMPI_AGENDA : CAMPI_PRIORITA_TEAM)
          .eq("company_id", companyId!).order("created_at", { ascending: false }).order("id").range(from, to);
        if (scope === "team") q = q.neq("status", "completata");

        return excludeArchivedOrders(q, archived, "order_id") as unknown as PromiseLike<{
          data: (DashboardTask | PrioritaTeamTask)[] | null;
          error: { message: string } | null;
        }>;
      });
    },
  });
}

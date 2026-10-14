import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { loadArchivedOrderIds, excludeArchivedOrders } from "@/lib/orders/archivedOrderScope";
import { loadDashboardRows, type DashboardTask } from "@/lib/attivita/dashboardTasks";

/** L'agenda resta personale anche per gli admin. Il team ha una query distinta. */
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
    queryFn: async () => {
      if (!ready || (scope === "team" && !seesTeam)) throw new Error("Non hai accesso alle attività richieste");
      const archived = await loadArchivedOrderIds(companyId!);
      return loadDashboardRows<DashboardTask>((from, to) => {
        let q = supabase.from("tasks").select(`id, title, notes, status, priority, due_date, category, assigned_to, created_by,
          order_id, stock_item_id, contact_id, opportunity_id, completed_at,
          order:orders!tasks_order_id_fkey(order_code), stock_item:warehouse_stock!tasks_stock_item_id_fkey(name),
          contatto:marketing_contacts!tasks_contact_id_fkey(id, first_name, last_name),
          opportunita:marketing_opportunities!tasks_opportunity_id_fkey(id, name),
          assignee:profiles!tasks_assigned_to_fkey(first_name, last_name)`)
          .eq("company_id", companyId!).order("created_at", { ascending: false }).order("id").range(from, to);
        if (scope === "personal") q = q.eq("assigned_to", user!.id);
        return excludeArchivedOrders(q, archived, "order_id") as unknown as PromiseLike<{ data: DashboardTask[] | null; error: { message: string } | null }>;
      });
    },
  });
}

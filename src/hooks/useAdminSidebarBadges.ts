import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const PLATFORM_ADMIN_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

export interface SidebarBadges {
  /** Open support tickets count */
  openTickets: number;
  /** Trial companies expiring within 3 days */
  trialsExpiring: number;
  /** Whether maintenance mode is active */
  maintenanceActive: boolean;
  /** Unread announcements draft count */
  draftAnnouncements: number;
  /** Unresolved failure alerts count */
  unresolvedAlerts: number;
  /** Total open CS tasks (status != completed) */
  openTasks: number;
  /** Overdue tasks (due_date < today, not completed) — segnala urgenza */
  overdueTasks: number;
  /** Tasks due today (not completed) */
  dueTodayTasks: number;
  /** Unread internal chat messages for the superadmin workspace */
  chatUnread: number;
}

/** Fetches badge counts for the admin sidebar nav items */
export function useAdminSidebarBadges() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["admin-sidebar-badges", user?.id],
    queryFn: async (): Promise<SidebarBadges> => {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000).toISOString();
      const todayIso = now.toISOString().slice(0, 10);
      const chatSidebarRpc = supabase.rpc as unknown as (
        fn: "get_internal_chat_sidebar_state",
        args: { p_company_id: string; p_user_id: string }
      ) => Promise<{ data: Array<{ unread_count: number | null }> | null; error: unknown }>;

      // Fail-soft: se UNA delle query ha RLS broken (es. failure_alerts con
      // policy `auth.jwt()->>role` pre-migration 000003), non vogliamo far
      // saltare l'intera sidebar. allSettled → 0 per le query rotte.
      const settled = await Promise.allSettled([
        supabase
          .from("support_conversations")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "pending", "waiting"] as never),
        supabase
          .from("companies")
          .select("id", { count: "exact", head: true })
          .eq("status", "trial")
          .lte("trial_ends_at", threeDaysFromNow)
          .gte("trial_ends_at", now.toISOString()),
        supabase
          .from("platform_settings")
          .select("value")
          .eq("key", "maintenance_mode")
          .maybeSingle(),
        supabase
          .from("platform_announcements")
          .select("id", { count: "exact", head: true })
          .eq("is_active", false),
        supabase
          .from("failure_alerts")
          .select("id", { count: "exact", head: true })
          .is("resolved_at", null),
        // CS tasks: solo aperti (non completati) per il badge "Attività"
        // Recuperiamo le righe (con due_date) per separare overdue vs dueToday
        // dal lato client — query leggera (max ~hundreds open tasks).
        supabase
          .from("cs_tasks" as never)
          .select("status, due_date")
          .neq("status", "completed")
          .limit(500),
        chatSidebarRpc("get_internal_chat_sidebar_state", {
          p_company_id: PLATFORM_ADMIN_COMPANY_ID,
          p_user_id: user!.id,
        }),
      ]);

      type SettledResult<T> = { data: T | null; error: unknown; count: number | null };
      const pick = <T,>(idx: number): SettledResult<T> => {
        const r = settled[idx];
        if (r.status === "fulfilled") return r.value as SettledResult<T>;
        return { data: null, error: r.reason, count: 0 };
      };

      const ticketsRes = pick<unknown>(0);
      const trialsRes = pick<unknown>(1);
      const maintenanceRes = pick<{ value: string }>(2);
      const announcementsRes = pick<unknown>(3);
      const alertsRes = pick<unknown>(4);
      const tasksRes = pick<Array<{ status: string; due_date: string | null }>>(5);
      const chatRes = pick<Array<{ unread_count: number | null }>>(6);

      const openTasksRows = tasksRes.data ?? [];
      const overdueTasks = openTasksRows.filter(
        (t) => t.due_date && t.due_date.slice(0, 10) < todayIso
      ).length;
      const dueTodayTasks = openTasksRows.filter(
        (t) => t.due_date && t.due_date.slice(0, 10) === todayIso
      ).length;

      return {
        openTickets: ticketsRes.count || 0,
        trialsExpiring: trialsRes.count || 0,
        maintenanceActive: maintenanceRes.data?.value === "true",
        draftAnnouncements: announcementsRes.count || 0,
        unresolvedAlerts: alertsRes.count || 0,
        openTasks: openTasksRows.length,
        overdueTasks,
        dueTodayTasks,
        chatUnread: (chatRes.data ?? []).reduce((sum, row) => sum + Number(row.unread_count ?? 0), 0),
      };
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/** Map nav item URL to badge config */
export function getBadgeForNavItem(
  url: string,
  badges: SidebarBadges | undefined
): { count?: number; dot?: boolean; variant: "default" | "warning" | "destructive" } | null {
  if (!badges) return null;

  if (url === "/admin/ticket" && badges.openTickets > 0) {
    return { count: badges.openTickets, variant: badges.openTickets > 10 ? "destructive" : "default" };
  }

  // Attività: priorità destructive se overdue > 0, warning se dueToday, default altrimenti
  // (il vecchio /admin/cs-tasks è alias retrocompat — entrambi gli URL ricevono lo stesso badge)
  if ((url === "/admin/attivita" || url === "/admin/cs-tasks") && badges.openTasks > 0) {
    return {
      count: badges.openTasks,
      variant:
        badges.overdueTasks > 0
          ? "destructive"
          : badges.dueTodayTasks > 0
          ? "warning"
          : "default",
    };
  }

  if (url === "/admin/chat" && badges.chatUnread > 0) {
    return { count: badges.chatUnread, variant: "default" };
  }

  if (url === "/admin/lifecycle" && badges.trialsExpiring > 0) {
    return { count: badges.trialsExpiring, variant: "warning" };
  }

  if (url === "/admin/annunci" && badges.draftAnnouncements > 0) {
    return { count: badges.draftAnnouncements, variant: "default" };
  }

  if (url === "/admin/failure-alerts" && badges.unresolvedAlerts > 0) {
    return { count: badges.unresolvedAlerts, variant: "destructive" };
  }

  return null;
}

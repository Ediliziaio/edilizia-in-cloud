import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SidebarBadges {
  /** Open support tickets count */
  openTickets: number;
  /** Trial companies expiring within 3 days */
  trialsExpiring: number;
  /** Whether maintenance mode is active */
  maintenanceActive: boolean;
  /** Unread announcements draft count */
  draftAnnouncements: number;
}

/** Fetches badge counts for the admin sidebar nav items */
export function useAdminSidebarBadges() {
  return useQuery({
    queryKey: ["admin-sidebar-badges"],
    queryFn: async (): Promise<SidebarBadges> => {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000).toISOString();

      const [ticketsRes, trialsRes, maintenanceRes, announcementsRes] = await Promise.all([
        supabase
          .from("support_conversations")
          .select("id", { count: "exact", head: true })
          .not("status", "in", '("resolved","closed")'),
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
          .eq("status", "draft"),
      ]);

      return {
        openTickets: ticketsRes.count || 0,
        trialsExpiring: trialsRes.count || 0,
        maintenanceActive: maintenanceRes.data?.value === "true",
        draftAnnouncements: announcementsRes.count || 0,
      };
    },
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

  if (url === "/admin/lifecycle" && badges.trialsExpiring > 0) {
    return { count: badges.trialsExpiring, variant: "warning" };
  }

  if (url === "/admin/annunci" && badges.draftAnnouncements > 0) {
    return { count: badges.draftAnnouncements, variant: "default" };
  }

  return null;
}

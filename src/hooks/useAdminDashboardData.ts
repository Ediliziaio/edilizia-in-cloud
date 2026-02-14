import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, subMonths } from "date-fns";

interface RecentActivity {
  id: string;
  type: "order" | "ticket";
  title: string;
  subtitle: string;
  created_at: string;
}

interface RecentCompany {
  id: string;
  name: string;
  email: string;
  sector: string;
  logo_url: string | null;
  created_at: string;
}

export interface AdminDashboardStats {
  totalCompanies: number;
  totalOrders: number;
  totalOrdersValue: number;
  totalCustomers: number;
  openTickets: number;
}

export interface AdminMrrStats {
  mrr: number;
  trialCount: number;
  trialExpiringSoon: number;
  churnRate: number;
}

export function useAdminDashboardData() {
  return useQuery({
    queryKey: ["admin-dashboard-data"],
    queryFn: async () => {
      const [
        companiesRes,
        ordersRes,
        customersRes,
        ticketsRes,
        ordersValueRes,
        recentCompaniesRes,
        recentOrdersRes,
        recentTicketsRes,
        allCompaniesRes,
      ] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "customer"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).neq("status", "risolto"),
        supabase.from("orders").select("total_amount"),
        supabase.from("companies").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("orders").select(`
          id,
          description,
          created_at,
          company:companies(name)
        `).order("created_at", { ascending: false }).limit(5),
        supabase.from("tickets").select(`
          id,
          subject,
          created_at,
          company:companies(name)
        `).order("created_at", { ascending: false }).limit(5),
        supabase.from("companies").select("id, status, trial_ends_at, subscription_plan_id, subscription_plans:subscription_plan_id(price_monthly)"),
      ]);

      const totalValue = ordersValueRes.data?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;

      const allCompanies = allCompaniesRes.data || [];
      const activeCompanies = allCompanies.filter((c) => c.status === "active");
      const trialCompanies = allCompanies.filter((c) => c.status === "trial");
      const expiredCompanies = allCompanies.filter((c) => c.status === "expired");

      const mrr = activeCompanies.reduce((sum, c) => {
        const plan = c.subscription_plans as { price_monthly: number } | null;
        return sum + (plan?.price_monthly || 0);
      }, 0);

      const now = new Date();
      const threeDaysFromNow = addDays(now, 3);
      const trialExpiringSoon = trialCompanies.filter((c) => {
        if (!c.trial_ends_at) return false;
        const end = new Date(c.trial_ends_at);
        return end <= threeDaysFromNow && end >= now;
      }).length;

      const totalActive = activeCompanies.length;
      const churnRate = totalActive > 0 ? ((expiredCompanies.length / (totalActive + expiredCompanies.length)) * 100) : 0;

      const activities: RecentActivity[] = [];

      recentOrdersRes.data?.forEach((order: any) => {
        activities.push({
          id: order.id,
          type: "order",
          title: order.description?.substring(0, 50) || "Nuovo ordine",
          subtitle: order.company?.name || "Azienda",
          created_at: order.created_at,
        });
      });

      recentTicketsRes.data?.forEach((ticket: any) => {
        activities.push({
          id: ticket.id,
          type: "ticket",
          title: ticket.subject,
          subtitle: ticket.company?.name || "Azienda",
          created_at: ticket.created_at,
        });
      });

      activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return {
        stats: {
          totalCompanies: companiesRes.count || 0,
          totalOrders: ordersRes.count || 0,
          totalOrdersValue: totalValue,
          totalCustomers: customersRes.count || 0,
          openTickets: ticketsRes.count || 0,
        } as AdminDashboardStats,
        mrrStats: {
          mrr,
          trialCount: trialCompanies.length,
          trialExpiringSoon,
          churnRate: Math.round(churnRate * 10) / 10,
        } as AdminMrrStats,
        recentCompanies: (recentCompaniesRes.data as RecentCompany[]) || [],
        recentActivity: activities.slice(0, 8),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

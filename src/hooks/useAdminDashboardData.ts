import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { addDays, subMonths, format } from "date-fns";
import { it } from "date-fns/locale";

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
  openSupportConversations: number;
}

export interface AdminMrrStats {
  mrr: number;
  trialCount: number;
  trialExpiringSoon: number;
  churnRate: number;
  activeCount: number;
  expiredCount: number;
}

export interface MrrChartData {
  month: string;
  mrr: number;
}

export function useAdminDashboardData() {
  return useQuery({
    queryKey: queryKeys.admin.dashboard(),
    queryFn: async () => {
      const [
        companiesRes,
        ordersAggRes,
        customersRes,
        ticketsRes,
        recentCompaniesRes,
        recentOrdersRes,
        recentTicketsRes,
        allCompaniesRes,
      ] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.rpc("get_total_orders_value"),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "customer"),
        supabase.from("support_conversations").select("id", { count: "exact", head: true }).not("status", "in", '("resolved","closed")'),
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
        supabase.from("companies").select("id, status, trial_ends_at, subscription_plan_id, created_at, subscription_plans:subscription_plan_id(price_monthly)"),
      ]);

      const aggRow = (ordersAggRes.data as any)?.[0];
      const totalOrders = Number(aggRow?.total_count) || 0;
      const totalValue = Number(aggRow?.total_value) || 0;

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

      // Build MRR trend (last 6 months)
      const mrrChartData: MrrChartData[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        const monthMrr = allCompanies.reduce((sum, c) => {
          const created = new Date(c.created_at);
          if (created > monthEnd) return sum;
          if (c.status === "active") {
            const plan = c.subscription_plans as { price_monthly: number } | null;
            return sum + (plan?.price_monthly || 0);
          }
          return sum;
        }, 0);
        mrrChartData.push({
          month: format(monthDate, "MMM yy", { locale: it }),
          mrr: monthMrr,
        });
      }

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
          totalOrders: totalOrders,
          totalOrdersValue: totalValue,
          totalCustomers: customersRes.count || 0,
          openSupportConversations: ticketsRes.count || 0,
        } as AdminDashboardStats,
        mrrStats: {
          mrr,
          trialCount: trialCompanies.length,
          trialExpiringSoon,
          churnRate: Math.round(churnRate * 10) / 10,
          activeCount: activeCompanies.length,
          expiredCount: expiredCompanies.length,
        } as AdminMrrStats,
        mrrChartData,
        recentCompanies: (recentCompaniesRes.data as RecentCompany[]) || [],
        recentActivity: activities.slice(0, 8),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

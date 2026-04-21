import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { addDays, subMonths, format } from "date-fns";
import { it } from "date-fns/locale";
import type { TotalOrdersValue } from "@/types/adminRpc";
import {
  getAdminRevenueBreakdown,
  getCompanyMonthlyRevenue,
  isRevenueEligibleCompany,
} from "@/lib/adminRevenue";

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
  accessActiveCompanies: number;
  payingCompanies: number;
  nonPayingActiveCompanies: number;
  freeActiveCompanies: number;
  excludedMrr: number;
  totalOrders: number;
  totalOrdersValue: number;
  totalCustomers: number;
  openSupportConversations: number;
  dac: number;
  wac: number;
  engagementRate: number;
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

export interface AdminDashboardData {
  stats: AdminDashboardStats;
  mrrStats: AdminMrrStats;
  mrrChartData: MrrChartData[];
  recentCompanies: RecentCompany[];
  recentActivity: RecentActivity[];
}

const CACHE_TTL_MS = 30 * 1000; // 30 secondi
const POLL_INTERVAL_MS = 60 * 1000; // 60 secondi

async function fetchDashboardData(): Promise<AdminDashboardData> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fail-soft pattern: una singola query broken non deve bloccare l'intera
  // dashboard. Usiamo allSettled e degradiamo gracefully su ogni query che
  // fallisce (rendiamo la sezione vuota invece di buttare giù tutto).
  const settled = await Promise.allSettled([
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("is_platform_admin_company", false),
    supabase.rpc("get_total_orders_value"),
    supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "customer"),
    supabase
      .from("support_conversations")
      .select("id", { count: "exact", head: true })
      .not("status", "in", '("resolved","closed")'),
    supabase
      .from("companies")
      .select("id, name, email, sector, logo_url, created_at")
      .eq("is_platform_admin_company", false)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("orders")
      .select("id, description, created_at, company:companies(name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("tickets")
      .select("id, subject, created_at, company:companies(name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("companies")
      .select(
        "id, status, trial_ends_at, subscription_plan_id, created_at, payment_method, stripe_customer_id, stripe_subscription_status, is_platform_admin_company, subscription_plans:subscription_plan_id(price_monthly, price_yearly)"
      )
      .eq("is_platform_admin_company", false)
      .limit(5000),
    supabase
      .from("audit_log")
      .select("company_id", { count: "exact", head: false })
      .gte("created_at", oneDayAgo)
      .not("company_id", "is", null)
      .limit(1000),
    supabase
      .from("audit_log")
      .select("company_id", { count: "exact", head: false })
      .gte("created_at", sevenDaysAgo)
      .not("company_id", "is", null)
      .limit(5000),
  ]);

  // Estrae il value-body di ogni allSettled (o un oggetto vuoto se rejected)
  const unwrap = <T = any>(idx: number): T => {
    const r = settled[idx];
    if (r.status === "fulfilled") return r.value as T;
    console.warn(`[AdminDashboard] query #${idx} failed:`, r.reason);
    return { data: null, error: r.reason, count: 0 } as unknown as T;
  };

  const companiesRes = unwrap<{ data: unknown; error: unknown; count: number | null }>(0);
  const ordersAggRes = unwrap<{ data: TotalOrdersValue[] | null; error: unknown }>(1);
  const customersRes = unwrap<{ data: unknown; error: unknown; count: number | null }>(2);
  const ticketsRes = unwrap<{ data: unknown; error: unknown; count: number | null }>(3);
  const recentCompaniesRes = unwrap<{ data: RecentCompany[] | null; error: unknown }>(4);
  const recentOrdersRes = unwrap<{ data: unknown[] | null; error: unknown }>(5);
  const recentTicketsRes = unwrap<{ data: unknown[] | null; error: unknown }>(6);
  const allCompaniesRes = unwrap<{ data: any[] | null; error: unknown }>(7);
  const dacRes = unwrap<{ data: { company_id: string }[] | null; error: unknown }>(8);
  const wacRes = unwrap<{ data: { company_id: string }[] | null; error: unknown }>(9);

  // Log ma NON throw — mostriamo la dashboard con i dati parziali disponibili
  if ((companiesRes as any).error) {
    console.warn(
      "[AdminDashboard] companies count query failed:",
      (companiesRes as any).error
    );
  }

  const aggRow = (ordersAggRes.data as TotalOrdersValue[] | null)?.[0];
  const totalOrders = Number(aggRow?.total_count) || 0;
  const totalValue = Number(aggRow?.total_value) || 0;

  const allCompanies = allCompaniesRes.data || [];
  const activeCompanies = allCompanies.filter((c) => c.status === "active");
  const trialCompanies = allCompanies.filter((c) => c.status === "trial");
  const expiredCompanies = allCompanies.filter((c) => c.status === "expired");
  const revenueBreakdown = getAdminRevenueBreakdown(allCompanies);
  const payingCompanies = allCompanies.filter(isRevenueEligibleCompany);

  const dacRows = dacRes.data ?? [];
  const wacRows = wacRes.data ?? [];
  const dacSet = new Set(
    dacRows.map((r: { company_id: string }) => r.company_id).filter(Boolean)
  );
  const wacSet = new Set(
    wacRows.map((r: { company_id: string }) => r.company_id).filter(Boolean)
  );
  const dac = dacSet.size;
  const wac = wacSet.size;
  const engagementRate =
    activeCompanies.length > 0
      ? Math.round((dac / activeCompanies.length) * 100)
      : 0;

  const mrr = revenueBreakdown.mrr;

  const now = new Date();
  const threeDaysFromNow = addDays(now, 3);
  const trialExpiringSoon = trialCompanies.filter((c) => {
    if (!c.trial_ends_at) return false;
    const end = new Date(c.trial_ends_at);
    return end <= threeDaysFromNow && end >= now;
  }).length;

  const totalActive = payingCompanies.length;
  const churnRate =
    totalActive > 0
      ? (expiredCompanies.length / (totalActive + expiredCompanies.length)) * 100
      : 0;

  const mrrChartData: MrrChartData[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const monthEnd = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0
    );
    const monthMrr = allCompanies.reduce((sum, c) => {
      const created = new Date(c.created_at);
      if (created > monthEnd) return sum;
      const price = getCompanyMonthlyRevenue(c);
      if (price === 0) return sum;
      if (c.status === "active" && isRevenueEligibleCompany(c)) return sum + price;
      if (c.status === "expired" || c.status === "trial") {
        const trialEnd = c.trial_ends_at ? new Date(c.trial_ends_at) : null;
        if (!trialEnd || trialEnd > monthEnd) {
          return isRevenueEligibleCompany(c) ? sum + price : sum;
        }
      }
      return sum;
    }, 0);
    mrrChartData.push({
      month: format(monthDate, "MMM yy", { locale: it }),
      mrr: monthMrr,
    });
  }

  const activities: RecentActivity[] = [];
  recentOrdersRes.data?.forEach((order) => {
    const o = order as {
      id: string;
      description: string | null;
      created_at: string;
      company: { name: string } | null;
    };
    activities.push({
      id: o.id,
      type: "order",
      title: o.description?.substring(0, 50) || "Nuovo ordine",
      subtitle: o.company?.name || "Azienda",
      created_at: o.created_at,
    });
  });
  recentTicketsRes.data?.forEach((ticket) => {
    const t = ticket as {
      id: string;
      subject: string;
      created_at: string;
      company: { name: string } | null;
    };
    activities.push({
      id: t.id,
      type: "ticket",
      title: t.subject,
      subtitle: t.company?.name || "Azienda",
      created_at: t.created_at,
    });
  });
  activities.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return {
    stats: {
      totalCompanies: companiesRes.count || 0,
      accessActiveCompanies: revenueBreakdown.accessActiveCompanies,
      payingCompanies: revenueBreakdown.payingCompanies,
      nonPayingActiveCompanies: revenueBreakdown.nonPayingActiveCompanies,
      freeActiveCompanies: revenueBreakdown.freeActiveCompanies,
      excludedMrr: revenueBreakdown.excludedMrr,
      totalOrders,
      totalOrdersValue: totalValue,
      totalCustomers: customersRes.count || 0,
      openSupportConversations: ticketsRes.count || 0,
      dac,
      wac,
      engagementRate,
    },
    mrrStats: {
      mrr,
      trialCount: trialCompanies.length,
      trialExpiringSoon,
      churnRate: Math.round(churnRate * 10) / 10,
      activeCount: revenueBreakdown.payingCompanies,
      expiredCount: expiredCompanies.length,
    },
    mrrChartData,
    recentCompanies: (recentCompaniesRes.data as RecentCompany[]) || [],
    recentActivity: activities.slice(0, 8),
  };
}

export function useAdminDashboardData() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const lastFetchRef = useRef<number>(0);
  const hasFetchedRef = useRef<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(async (force: boolean): Promise<void> => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < CACHE_TTL_MS) return;

    if (!hasFetchedRef.current) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setIsError(false);
    setError(null);

    try {
      const result = await fetchDashboardData();
      lastFetchRef.current = Date.now();
      hasFetchedRef.current = true;
      setData(result);
      setLastUpdatedAt(
        "Aggiornato alle " + new Date().toLocaleTimeString("it-IT")
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error("Errore sconosciuto");
      setIsError(true);
      setError(e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Fetch iniziale + polling ogni 60s
  useEffect(() => {
    doFetch(true);
    intervalRef.current = setInterval(() => {
      doFetch(false);
    }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [doFetch]);

  // Realtime: aggiorna quando cambiano companies o subscriptions
  useEffect(() => {
    // Channel name unico per evitare conflitti se il componente si smonta/rimonta rapidamente
    const channelId = `admin-dashboard-realtime-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "companies" },
        () => {
          doFetch(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_subscriptions" },
        () => {
          doFetch(false);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscription_plans" },
        () => {
          doFetch(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [doFetch]);

  const refetch = useCallback((): void => {
    doFetch(true);
  }, [doFetch]);

  return {
    data,
    isLoading,
    isRefreshing,
    isError,
    error,
    lastUpdatedAt,
    refetch,
  };
}

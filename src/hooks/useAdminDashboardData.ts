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
  noPaymentMethodActive: number;
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
  /** Nuove aziende registrate nel mese (linea su asse secondario del grafico). */
  nuove: number;
}

export interface AdminDashboardData {
  stats: AdminDashboardStats;
  mrrStats: AdminMrrStats;
  mrrChartData: MrrChartData[];
}

const CACHE_TTL_MS = 30 * 1000; // 30 secondi
const POLL_INTERVAL_MS = 60 * 1000; // 60 secondi
const ADMIN_QUERY_TIMEOUT_MS = 8_000;

function withDashboardTimeout<T>(label: string, promise: PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label}: timeout dopo ${ADMIN_QUERY_TIMEOUT_MS / 1000} secondi`));
    }, ADMIN_QUERY_TIMEOUT_MS);

    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function fetchDashboardData(): Promise<AdminDashboardData> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fail-soft pattern: una singola query broken non deve bloccare l'intera
  // dashboard. Usiamo allSettled e degradiamo gracefully su ogni query che
  // fallisce (rendiamo la sezione vuota invece di buttare giù tutto).
  const settled = await Promise.allSettled([
    withDashboardTimeout(
      "Conteggio aziende",
      supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("is_platform_admin_company", false)
    ),
    withDashboardTimeout("Valore ordini", supabase.rpc("get_total_orders_value")),
    withDashboardTimeout(
      "Conteggio clienti",
      supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "customer")
    ),
    withDashboardTimeout(
      "Conversazioni supporto",
      supabase
        .from("support_conversations")
        .select("id", { count: "exact", head: true })
        .not("status", "in", '("resolved","closed")')
    ),
    withDashboardTimeout(
      "Lista aziende dashboard",
      supabase
        .from("companies")
        .select(
          "id, status, trial_ends_at, subscription_plan_id, created_at, payment_method, stripe_customer_id, stripe_subscription_status, is_platform_admin_company, subscription_plans:subscription_plan_id(price_monthly, price_yearly)"
        )
        .eq("is_platform_admin_company", false)
        .limit(5000)
    ),
    withDashboardTimeout(
      // DAC (aziende attive 24h): attività reale da user_sessions via RPC.
      // Prima interrogava public.audit_log — tabella inesistente → sempre 0.
      "Attivita giornaliera",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("get_active_companies", { p_since: oneDayAgo })
    ),
    withDashboardTimeout(
      // WAC (aziende attive 7gg): stessa RPC su finestra 7 giorni.
      "Attivita settimanale",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("get_active_companies", { p_since: sevenDaysAgo })
    ),
  ]);

  // Estrae il value-body di ogni allSettled (o un oggetto vuoto se rejected)
  type SettledResult<T> = { data: T | null; error: unknown; count: number | null };
  const unwrap = <T,>(idx: number): SettledResult<T> => {
    const r = settled[idx];
    if (r.status === "fulfilled") return r.value as SettledResult<T>;
    console.warn(`[AdminDashboard] query #${idx} failed:`, r.reason);
    return { data: null, error: r.reason, count: 0 };
  };

  type CompanyRow = {
    id: string;
    status: string;
    trial_ends_at: string | null;
    subscription_plan_id: string | null;
    created_at: string;
    payment_method: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_status: string | null;
    is_platform_admin_company: boolean | null;
    subscription_plans?: { price_monthly: number | null; price_yearly: number | null } | null;
  };
  const companiesRes = unwrap<unknown>(0);
  const ordersAggRes = unwrap<TotalOrdersValue[]>(1);
  const customersRes = unwrap<unknown>(2);
  const ticketsRes = unwrap<unknown>(3);
  const allCompaniesRes = unwrap<CompanyRow[]>(4);
  const dacRes = unwrap<{ company_id: string }[]>(5);
  const wacRes = unwrap<{ company_id: string }[]>(6);

  // Log ma NON throw — mostriamo la dashboard con i dati parziali disponibili
  if (companiesRes.error) {
    console.warn(
      "[AdminDashboard] companies count query failed:",
      companiesRes.error
    );
  }

  const aggRow = ordersAggRes.data?.[0];
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

  // Aziende ATTIVE senza metodo di pagamento: col gate carta sono bloccate sui
  // tool a costo (email/AI/WhatsApp/render/firma). Metrica azionabile per il super admin.
  const noPaymentMethodActive = activeCompanies.filter((c) => {
    const m = String(c.payment_method ?? "none").toLowerCase().trim();
    return m === "" || m === "none";
  }).length;

  const mrr = revenueBreakdown.mrr;

  const now = new Date();
  const threeDaysFromNow = addDays(now, 3);
  const trialExpiringSoon = trialCompanies.filter((c) => {
    if (!c.trial_ends_at) return false;
    const end = new Date(c.trial_ends_at);
    return end <= threeDaysFromNow && end >= now;
  }).length;

  // Churn MENSILE (logo churn): aziende il cui trial/abbonamento è scaduto nel
  // mese corrente, sul totale (paganti + scaduti del mese). Più onesto del
  // precedente rapporto storico (scaduti totali / paganti+scaduti).
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const churnedThisMonth = expiredCompanies.filter((c) => {
    const end = c.trial_ends_at ? new Date(c.trial_ends_at) : null;
    return end !== null && end >= monthStart && end <= now;
  }).length;
  const churnBase = payingCompanies.length + churnedThisMonth;
  const churnRate =
    churnBase > 0 ? Math.round((churnedThisMonth / churnBase) * 1000) / 10 : 0;

  const mrrChartData: MrrChartData[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const mStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0
    );
    let nuove = 0;
    const monthMrr = allCompanies.reduce((sum, c) => {
      const created = new Date(c.created_at);
      if (created >= mStart && created <= monthEnd) nuove++;
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
      nuove,
    });
  }

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
      noPaymentMethodActive,
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
  // Unmount guard: evita "Can't perform a React state update on an unmounted
  // component" + memory leak della closure (data dashboard è pesante: companies,
  // KPI, charts). Su rapid nav admin → utente → admin si accumulavano fetch
  // pendenti che terminavano dopo unmount.
  const isMountedRef = useRef<boolean>(true);
  const inFlightRef = useRef<boolean>(false);

  const doFetch = useCallback(async (force: boolean): Promise<void> => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < CACHE_TTL_MS) return;
    // Dedup concorrente: evita query duplicate se polling + visibilitychange
    // scattano in contemporanea o se refetch() è chiamato durante una fetch.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    if (!hasFetchedRef.current) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setIsError(false);
    setError(null);

    try {
      const result = await fetchDashboardData();
      if (!isMountedRef.current) return;
      lastFetchRef.current = Date.now();
      hasFetchedRef.current = true;
      setData(result);
      setLastUpdatedAt(
        "Aggiornato alle " + new Date().toLocaleTimeString("it-IT")
      );
    } catch (err) {
      if (!isMountedRef.current) return;
      const e = err instanceof Error ? err : new Error("Errore sconosciuto");
      setIsError(true);
      setError(e);
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Fetch iniziale + polling ogni 60s — sospeso quando il tab è in background
  // per non bruciare RPC e bandwidth a vuoto. Refetch immediato quando il tab
  // torna visibile (e i dati sono stale rispetto a CACHE_TTL_MS).
  useEffect(() => {
    doFetch(true);

    const startInterval = () => {
      if (intervalRef.current !== null) return;
      intervalRef.current = setInterval(() => {
        doFetch(false);
      }, POLL_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        doFetch(false); // refetch on focus se cache scaduta
        startInterval();
      } else {
        stopInterval();
      }
    };

    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      stopInterval();
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

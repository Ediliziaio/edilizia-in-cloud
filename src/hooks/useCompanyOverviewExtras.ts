/**
 * useCompanyOverviewExtras
 * Hook per dati extra della Panoramica azienda (SuperAdmin):
 *   - Saldo email/AI credits
 *   - Ultimo login di qualsiasi membro del team
 *   - Distribuzione ordini per stato
 *   - Trend esteso (3/6/12 mesi) con cache separata per periodo
 *
 * Tenuto OUT di useCompanyDetail per evitare di gonfiare ancora quel hook
 * (già 793 righe) e per poter attivare queste query solo quando il tab
 * Panoramica è montato.
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { CompanyLastAccess } from "@/types/adminRpc";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OverviewPeriod = "3m" | "6m" | "12m";

export interface CreditsSnapshot {
  email_balance_eur: number | null;
  ai_balance_eur: number | null;
}

export interface LastActivityInfo {
  last_login_at: string | null;
  last_login_user_name: string | null;
}

export interface OrdersByStatus {
  status_name: string;
  status_color: string | null;
  count: number;
  value: number;
}

export interface MonthlyOrderPoint {
  month: string;
  count: number;
  value: number;
}

function periodToMonths(p: OverviewPeriod): number {
  return p === "3m" ? 3 : p === "12m" ? 12 : 6;
}

/** Credits snapshot — legge da email_credits, ai_credits (maybeSingle). */
export function useCompanyCreditsSnapshot(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-overview-credits", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CreditsSnapshot> => {
      const [emailRes, aiRes] = await Promise.all([
        supabase
          .from("email_credits")
          .select("balance_eur")
          .eq("company_id", companyId!)
          .maybeSingle(),
        supabase
          .from("ai_credits" as never)
          .select("balance_eur")
          .eq("company_id", companyId!)
          .maybeSingle(),
      ]);

      return {
        email_balance_eur:
          (emailRes.data as { balance_eur?: number } | null)?.balance_eur ?? null,
        ai_balance_eur:
          (aiRes.data as unknown as { balance_eur?: number } | null)?.balance_eur ?? null,
      };
    },
    staleTime: 60 * 1000,
  });
}

/** Stessa fonte e cache dell'elenco: comprende anche gli account collegati all'azienda. */
export function useCompanyLastActivity(companyId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.companiesLastAccess,
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_last_access");
      if (error) throw error;
      const map: Record<string, string | null> = {};
      ((data || []) as CompanyLastAccess[]).forEach((row) => {
        map[row.company_id] = row.last_access || null;
      });
      return map;
    },
    select: (access): LastActivityInfo => ({
      last_login_at: companyId ? access[companyId] ?? null : null,
      last_login_user_name: null,
    }),
    staleTime: 5 * 60 * 1000,
  });
}

/** Ordini per stato — per mini-breakdown nella Panoramica. */
export function useOrdersByStatus(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-overview-orders-by-status", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<OrdersByStatus[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "total_amount, current_status_id, order_statuses:current_status_id(name, color)",
        )
        .eq("company_id", companyId!)
        .limit(5000);
      if (error) throw error;
      type Row = {
        total_amount: number | null;
        current_status_id: string | null;
        order_statuses: { name: string; color: string | null } | null;
      };
      const rows = (data ?? []) as Row[];
      const buckets = new Map<string, OrdersByStatus>();
      for (const r of rows) {
        const key = r.order_statuses?.name ?? "—";
        const bucket = buckets.get(key) ?? {
          status_name: key,
          status_color: r.order_statuses?.color ?? null,
          count: 0,
          value: 0,
        };
        bucket.count += 1;
        bucket.value += r.total_amount ?? 0;
        buckets.set(key, bucket);
      }
      return Array.from(buckets.values()).sort((a, b) => b.value - a.value);
    },
    staleTime: 2 * 60 * 1000,
  });
}

/** Trend esteso: cache separata per periodo (3m/6m/12m). */
export function useMonthlyOrdersExtended(
  companyId: string | undefined,
  period: OverviewPeriod,
) {
  const months = periodToMonths(period);
  const query = useQuery({
    queryKey: ["company-overview-monthly", companyId, period],
    enabled: !!companyId,
    queryFn: async () => {
      const from = new Date();
      from.setMonth(from.getMonth() - months);
      const { data, error } = await supabase
        .from("orders")
        .select("created_at, total_amount")
        .eq("company_id", companyId!)
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const monthlyOrders = useMemo<MonthlyOrderPoint[]>(() => {
    if (!query.data) return [];
    const buckets: Record<string, { count: number; value: number }> = {};
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets[key] = { count: 0, value: 0 };
    }
    query.data.forEach((o) => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (buckets[key]) {
        buckets[key].count += 1;
        buckets[key].value += o.total_amount ?? 0;
      }
    });
    const monthNames = [
      "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
      "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
    ];
    return Object.entries(buckets).map(([key, val]) => ({
      month: monthNames[parseInt(key.split("-")[1]) - 1],
      count: val.count,
      value: Math.round(val.value),
    }));
  }, [query.data, months]);

  return {
    monthlyOrders,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

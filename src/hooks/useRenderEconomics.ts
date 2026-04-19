// ============================================================================
// useRenderEconomics — hook SuperAdmin per Render Economics dashboard
//
// Fornisce 2 query React Query:
//   - useRenderEconomicsGlobal(from, to): bundle unico via RPC
//     get_render_economics_global → totals, top/bottom companies,
//     provider_breakdown, serie giornaliera.
//   - useRenderEconomicsByCompany(from, to): lista completa aziende
//     ordinate per margine ASC (peggiori prima) via RPC
//     get_render_economics_by_company.
//
// Permessi: entrambe le RPC fanno role-check interno (super_admin). Il
// `enabled` è gestito dal chiamante con permissions.billing_read.
// ============================================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Shape RPC response ─────────────────────────────────────────────────────

export interface RenderEconomicsTotals {
  total_renders: number;
  total_cost: number;
  total_revenue: number;
  total_margin: number;
  margin_pct: number;
}

export interface RenderEconomicsCompanyRow {
  company_id: string;
  company_name: string;
  renders_count: number;
  margin_eur: number;
}

export interface RenderEconomicsProviderRow {
  provider: string;
  renders_count: number;
  cost_total: number;
  revenue_total: number;
  margin_total: number;
}

export interface RenderEconomicsDailyRow {
  day: string; // ISO date
  renders_count: number;
  cost: number;
  revenue: number;
  margin: number;
}

export interface RenderEconomicsGlobal {
  totals: RenderEconomicsTotals;
  top_5_by_volume: RenderEconomicsCompanyRow[];
  top_5_by_margin: RenderEconomicsCompanyRow[];
  bottom_5_by_margin: RenderEconomicsCompanyRow[];
  companies_with_negative_margin_count: number;
  provider_breakdown: RenderEconomicsProviderRow[];
  daily: RenderEconomicsDailyRow[];
  period: { from: string; to: string };
}

export interface RenderEconomicsByCompanyRow {
  company_id: string;
  company_name: string;
  renders_count: number;
  cost_total_eur: number;
  revenue_total_eur: number;
  margin_total_eur: number;
  margin_pct: number;
  avg_cost_per_render: number;
  avg_revenue_per_render: number;
  last_activity: string | null;
}

// ── Utility: ISO period ────────────────────────────────────────────────────

/**
 * Calcola intervallo [_from, _to] a partire dal numero di giorni. Valore
 * default: 30. Se days <= 0 restituisce ultimi 30 (safety).
 */
export function periodFromDays(days: number): { from: string; to: string } {
  const safeDays = days > 0 ? days : 30;
  const to = new Date();
  const from = new Date(to.getTime() - safeDays * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ── Hook: global bundle ────────────────────────────────────────────────────

/**
 * Un'unica RPC che ritorna totals + top/bottom + provider_breakdown + daily.
 * Evita N+1 sul dashboard Render Economics.
 */
export function useRenderEconomicsGlobal(days: number, enabled: boolean = true) {
  const { from, to } = periodFromDays(days);
  return useQuery<RenderEconomicsGlobal>({
    queryKey: ["admin-render-economics-global", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_render_economics_global", {
        _from: from,
        _to: to,
      });
      if (error) throw new Error(error.message);
      // RPC ritorna JSON singolo; può essere null se period vuoto
      if (!data) {
        return {
          totals: {
            total_renders: 0,
            total_cost: 0,
            total_revenue: 0,
            total_margin: 0,
            margin_pct: 0,
          },
          top_5_by_volume: [],
          top_5_by_margin: [],
          bottom_5_by_margin: [],
          companies_with_negative_margin_count: 0,
          provider_breakdown: [],
          daily: [],
          period: { from, to },
        };
      }
      return data as RenderEconomicsGlobal;
    },
    staleTime: 60_000,
    enabled,
  });
}

// ── Hook: list companies ordered by margin ASC ────────────────────────────

/**
 * Lista completa aziende con attività render nel periodo, ordinate per
 * margine ASC (peggiori prima — priorità azione admin).
 */
export function useRenderEconomicsByCompany(days: number, enabled: boolean = true) {
  const { from, to } = periodFromDays(days);
  return useQuery<RenderEconomicsByCompanyRow[]>({
    queryKey: ["admin-render-economics-by-company", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_render_economics_by_company", {
        _from: from,
        _to: to,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as RenderEconomicsByCompanyRow[];
    },
    staleTime: 60_000,
    enabled,
  });
}

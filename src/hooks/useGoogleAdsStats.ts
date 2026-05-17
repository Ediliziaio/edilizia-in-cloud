/**
 * Hook per caricare e aggregare le statistiche Google Ads dal DB.
 * Filtra sempre per company_id (multi-tenant) e intervallo di date.
 */
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calcCTR, calcCPC } from "@/lib/google-ads/formatters";
import type {
  GoogleAdsStatRow,
  GoogleAdsKPIs,
  GoogleAdsDateRange,
  GoogleAdsCampaign,
} from "@/types/google-ads";

/** Calcola i KPI aggregati da un array di righe */
function calculateKPIs(rows: GoogleAdsStatRow[]): GoogleAdsKPIs {
  const totalImpressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const totalClicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalSpend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);
  const totalConversions = rows.reduce((s, r) => s + (r.conversions ?? 0), 0);
  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    avgCTR: calcCTR(totalClicks, totalImpressions),
    avgCPC: calcCPC(totalSpend, totalClicks),
  };
}

/** Aggrega le righe per campagna */
function aggregateByCampaign(rows: GoogleAdsStatRow[]): GoogleAdsCampaign[] {
  const map = new Map<string, GoogleAdsCampaign>();
  for (const row of rows) {
    const key = row.campaign_id ?? "__no_campaign__";
    const existing = map.get(key);
    if (existing) {
      existing.impressions += row.impressions ?? 0;
      existing.clicks += row.clicks ?? 0;
      existing.spend += row.spend ?? 0;
      existing.conversions += row.conversions ?? 0;
    } else {
      map.set(key, {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name ?? "Campagna senza nome",
        impressions: row.impressions ?? 0,
        clicks: row.clicks ?? 0,
        spend: row.spend ?? 0,
        conversions: row.conversions ?? 0,
        ctr: 0,
        cpc: 0,
      });
    }
  }
  return Array.from(map.values()).map((c) => ({
    ...c,
    ctr: calcCTR(c.clicks, c.impressions),
    cpc: calcCPC(c.spend, c.clicks),
  }));
}

export interface UseGoogleAdsStatsReturn {
  stats: GoogleAdsStatRow[];
  kpis: GoogleAdsKPIs;
  campaigns: GoogleAdsCampaign[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  dateRange: GoogleAdsDateRange;
  setDateRange: (range: GoogleAdsDateRange) => void;
}

export function useGoogleAdsStats(): UseGoogleAdsStatsReturn {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [dateRange, setDateRange] = useState<GoogleAdsDateRange>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  const fromStr = dateRange.from.toISOString().slice(0, 10);
  const toStr = dateRange.to.toISOString().slice(0, 10);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["google-ads-stats", companyId, fromStr, toStr],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: rows, error: queryError } = await supabase
        .from("google_ads_stats")
        .select(
          "id, company_id, date, campaign_id, campaign_name, impressions, clicks, spend, conversions, created_at, updated_at"
        )
        .eq("company_id", companyId)
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date", { ascending: false });

      if (queryError) {
        console.error("[GoogleAds] useGoogleAdsStats:", queryError);
        throw new Error("Impossibile caricare i dati. Riprova tra qualche secondo.");
      }
      return (rows ?? []) as GoogleAdsStatRow[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // S2-02: stabilize `stats` via useMemo (era nuovo array ad ogni render)
  const stats = useMemo(() => data ?? [], [data]);
  const kpis = useMemo(() => calculateKPIs(stats), [stats]);
  const campaigns = useMemo(() => aggregateByCampaign(stats), [stats]);

  const errorMessage = error instanceof Error ? error.message : null;

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    stats,
    kpis,
    campaigns,
    isLoading,
    error: errorMessage,
    refetch: handleRefetch,
    dateRange,
    setDateRange,
  };
}

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

const FULL_STATS_SELECT =
  "id, company_id, date, campaign_id, campaign_name, impressions, clicks, spend, conversions, conversion_value, search_impression_share, created_at, updated_at";

const FALLBACK_STATS_SELECT =
  "id, company_id, date, campaign_id, campaign_name, impressions, clicks, spend, conversions, created_at, updated_at";

function calcCPA(spend: number, conversions: number): number {
  return conversions > 0 ? spend / conversions : 0;
}

function calcROAS(conversionValue: number, spend: number): number {
  return spend > 0 ? conversionValue / spend : 0;
}

function weightedSearchImpressionShare(rows: GoogleAdsStatRow[]): number | null {
  let weightedValue = 0;
  let weight = 0;

  for (const row of rows) {
    if (row.search_impression_share === null || row.search_impression_share === undefined) {
      continue;
    }
    const rowWeight = row.impressions > 0 ? row.impressions : 1;
    weightedValue += row.search_impression_share * rowWeight;
    weight += rowWeight;
  }

  return weight > 0 ? weightedValue / weight : null;
}

function isMissingGoogleStatsColumn(error: unknown): boolean {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const details =
    typeof error === "object" && error !== null && "details" in error
      ? String((error as { details?: unknown }).details ?? "")
      : "";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  return (
    code === "42703" ||
    /column .*conversion_value/i.test(message) ||
    /column .*search_impression_share/i.test(message) ||
    /conversion_value/i.test(details) ||
    /search_impression_share/i.test(details) ||
    /schema cache/i.test(message)
  );
}

function withOptionalMetricDefaults(rows: GoogleAdsStatRow[]): GoogleAdsStatRow[] {
  return rows.map((row) => ({
    ...row,
    conversion_value: row.conversion_value ?? 0,
    search_impression_share: row.search_impression_share ?? null,
  }));
}

/** Calcola i KPI aggregati da un array di righe */
function calculateKPIs(rows: GoogleAdsStatRow[]): GoogleAdsKPIs {
  const totalImpressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const totalClicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalSpend = rows.reduce((s, r) => s + (r.spend ?? 0), 0);
  const totalConversions = rows.reduce((s, r) => s + (r.conversions ?? 0), 0);
  const totalConversionValue = rows.reduce((s, r) => s + (r.conversion_value ?? 0), 0);
  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    totalConversionValue,
    avgCTR: calcCTR(totalClicks, totalImpressions),
    avgCPC: calcCPC(totalSpend, totalClicks),
    avgCPA: calcCPA(totalSpend, totalConversions),
    roas: calcROAS(totalConversionValue, totalSpend),
    avgSearchImpressionShare: weightedSearchImpressionShare(rows),
  };
}

/** Aggrega le righe per campagna */
function aggregateByCampaign(rows: GoogleAdsStatRow[]): GoogleAdsCampaign[] {
  const map = new Map<string, GoogleAdsCampaign>();
  const impressionShareWeights = new Map<string, { value: number; weight: number }>();

  for (const row of rows) {
    const key = row.campaign_id ?? "__no_campaign__";
    const existing = map.get(key);
    if (existing) {
      existing.impressions += row.impressions ?? 0;
      existing.clicks += row.clicks ?? 0;
      existing.spend += row.spend ?? 0;
      existing.conversions += row.conversions ?? 0;
      existing.conversion_value += row.conversion_value ?? 0;
    } else {
      map.set(key, {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name ?? "Campagna senza nome",
        impressions: row.impressions ?? 0,
        clicks: row.clicks ?? 0,
        spend: row.spend ?? 0,
        conversions: row.conversions ?? 0,
        conversion_value: row.conversion_value ?? 0,
        ctr: 0,
        cpc: 0,
        cost_per_conversion: 0,
        roas: 0,
        search_impression_share: null,
      });
    }

    if (row.search_impression_share !== null && row.search_impression_share !== undefined) {
      const rowWeight = row.impressions > 0 ? row.impressions : 1;
      const weighted = impressionShareWeights.get(key) ?? { value: 0, weight: 0 };
      weighted.value += row.search_impression_share * rowWeight;
      weighted.weight += rowWeight;
      impressionShareWeights.set(key, weighted);
    }
  }

  return Array.from(map.values()).map((c) => ({
    ...c,
    ctr: calcCTR(c.clicks, c.impressions),
    cpc: calcCPC(c.spend, c.clicks),
    cost_per_conversion: calcCPA(c.spend, c.conversions),
    roas: calcROAS(c.conversion_value, c.spend),
    search_impression_share: (() => {
      const weighted = impressionShareWeights.get(c.campaign_id ?? "__no_campaign__");
      return weighted && weighted.weight > 0 ? weighted.value / weighted.weight : null;
    })(),
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

      const baseQuery = () =>
        supabase
          .from("google_ads_stats")
          .select(FULL_STATS_SELECT)
          .eq("company_id", companyId)
          .gte("date", fromStr)
          .lte("date", toStr)
          .order("date", { ascending: false });

      let { data: rows, error: queryError } = await baseQuery();

      if (queryError && isMissingGoogleStatsColumn(queryError)) {
        const fallback = await supabase
          .from("google_ads_stats")
          .select(FALLBACK_STATS_SELECT)
          .eq("company_id", companyId)
          .gte("date", fromStr)
          .lte("date", toStr)
          .order("date", { ascending: false });

        rows = fallback.data;
        queryError = fallback.error;
      }

      if (queryError) {
        console.error("[GoogleAds] useGoogleAdsStats:", queryError);
        throw new Error("Impossibile caricare i dati. Riprova tra qualche secondo.");
      }

      return withOptionalMetricDefaults((rows ?? []) as GoogleAdsStatRow[]);
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

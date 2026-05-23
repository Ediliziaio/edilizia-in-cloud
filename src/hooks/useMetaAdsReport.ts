import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import {
  normalizeInsights,
  computeKPIs,
  computeDailySeries,
  type KPISummary,
  type DailyPoint,
} from "@/lib/metaInsightsNormalizer";
import { format, subDays } from "date-fns";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const ALL_META_ACCOUNTS = "__all_meta_accounts__";
export const ALL_META_ACCOUNTS_LABEL = "Tutti gli account BM";

export type ReportLevel = "campaign" | "adset" | "ad";
export type SortDirection = "asc" | "desc";

export interface DateRange {
  from: Date;
  to: Date;
}

export interface AdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
}

export interface ReportFilters {
  search: string;
  status: "all" | "ACTIVE" | "PAUSED";
  objective: string;
  minSpend: number | null;
  maxSpend: number | null;
  onlyWithLeads: boolean;
}

const DEFAULT_FILTERS: ReportFilters = {
  search: "",
  status: "all",
  objective: "",
  minSpend: null,
  maxSpend: null,
  onlyWithLeads: false,
};

const DEFAULT_COLUMNS = [
  "campaign_name", "account_name", "status", "clicks", "spend", "revenue", "roi",
  "cpc", "cpm", "ctr", "frequency", "leads", "cpl", "impressions",
];

const REQUIRED_VISIBLE_COLUMNS = ["campaign_name", "account_name", "cpm", "frequency"];

function withRequiredVisibleColumns(columns: string[]): string[] {
  const merged = new Set([...columns, ...REQUIRED_VISIBLE_COLUMNS]);
  const orderedDefaults = DEFAULT_COLUMNS.filter((column) => merged.has(column));
  const customColumns = columns.filter((column) => !DEFAULT_COLUMNS.includes(column));
  return [...orderedDefaults, ...customColumns];
}

export function useMetaAdsReport() {
  const { effectiveCompany, user } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const userId = user?.id;
  const queryClient = useQueryClient();

  // State
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 14),
    to: new Date(),
  });
  const [selectedAccountId, setSelectedAccountId] = useState<string>(ALL_META_ACCOUNTS);
  const [level, setLevel] = useState<ReportLevel>("campaign");
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [sortColumn, setSortColumn] = useState("spend");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [visibleColumns, setVisibleColumnsState] = useState<string[]>(
    withRequiredVisibleColumns(DEFAULT_COLUMNS),
  );
  const setVisibleColumns = useCallback((columns: string[]) => {
    setVisibleColumnsState(withRequiredVisibleColumns(columns));
  }, []);

  // Get integration
  const { data: integration } = useQuery({
    queryKey: queryKeys.metaAds.integration(companyId),
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", companyId)
        .eq("provider", "meta")
        .eq("status", "connected")
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });

  const integrationId = integration?.id;

  // Helper: call proxy
  const callProxy = useCallback(
    async (action: string, params: Record<string, any> = {}) => {
      if (!companyId || !integrationId) throw new Error("Non connesso a Meta");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetchWithTimeout(
        `${SUPABASE_URL}/functions/v1/meta-api-proxy`,
        {
          method: "POST",
          timeoutMs: 30_000,
          context: `meta-ads.${action}`,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            company_id: companyId,
            integration_id: integrationId,
            ...params,
          }),
        }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      return result;
    },
    [companyId, integrationId]
  );

  // Fetch ad accounts
  const {
    data: adAccounts = [],
    isLoading: isLoadingAccounts,
  } = useQuery({
    queryKey: queryKeys.metaAds.adAccounts(companyId, integrationId),
    queryFn: async () => {
      const result = await callProxy("get-ad-accounts");
      return (result.accounts || []) as AdAccount[];
    },
    enabled: !!companyId && !!integrationId,
    staleTime: 5 * 60 * 1000,
  });

  // Default: tutto il Business Manager, così non si perdono sponsorizzate su account diversi.
  useEffect(() => {
    if (adAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(ALL_META_ACCOUNTS);
    }
  }, [adAccounts, selectedAccountId]);

  const effectiveAdAccountIds = useMemo(() => {
    if (selectedAccountId === ALL_META_ACCOUNTS) return adAccounts.map((account) => account.id);
    return selectedAccountId ? [selectedAccountId] : [];
  }, [adAccounts, selectedAccountId]);
  const adAccountQueryKey = effectiveAdAccountIds.join(",");

  const dateStart = format(dateRange.from, "yyyy-MM-dd");
  const dateEnd = format(dateRange.to, "yyyy-MM-dd");

  // Fetch campaign insights (aggregate)
  const {
    data: rawInsights = [],
    isLoading: isLoadingInsights,
    error: insightsError,
  } = useQuery({
    queryKey: queryKeys.metaAds.insights(companyId, adAccountQueryKey, dateStart, dateEnd, level),
    queryFn: async () => {
      const results = await Promise.allSettled(
        effectiveAdAccountIds.map(async (accountId) => {
          const account = adAccounts.find((item) => item.id === accountId);
          const result = await callProxy("get-campaign-insights", {
            ad_account_id: accountId,
            date_start: dateStart,
            date_end: dateEnd,
            level,
          });
          return ((result.insights || []) as any[]).map((row) => ({
            ...row,
            account_id: accountId,
            account_name: account?.name || accountId,
          }));
        }),
      );
      const fulfilled = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
      if (fulfilled.length === 0) {
        const rejected = results.find((result) => result.status === "rejected");
        if (rejected?.status === "rejected") throw rejected.reason;
      }
      return fulfilled;
    },
    enabled: !!companyId && !!integrationId && effectiveAdAccountIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch daily series for trend charts
  const { data: rawDailyInsights = [] } = useQuery({
    queryKey: queryKeys.metaAds.insightsDaily(companyId, adAccountQueryKey, dateStart, dateEnd),
    queryFn: async () => {
      const results = await Promise.allSettled(
        effectiveAdAccountIds.map(async (accountId) => {
          const result = await callProxy("get-campaign-insights", {
            ad_account_id: accountId,
            date_start: dateStart,
            date_end: dateEnd,
            level: "account",
            time_increment: "1",
          });
          return result.insights || [];
        }),
      );
      const fulfilled = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
      if (fulfilled.length === 0) {
        const rejected = results.find((result) => result.status === "rejected");
        if (rejected?.status === "rejected") throw rejected.reason;
      }
      return fulfilled;
    },
    enabled: !!companyId && !!integrationId && effectiveAdAccountIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch campaign statuses
  const { data: campaignStatusRows = [] } = useQuery({
    queryKey: queryKeys.metaAds.campaignStatus(companyId, adAccountQueryKey),
    queryFn: async () => {
      const results = await Promise.allSettled(
        effectiveAdAccountIds.map((accountId) =>
          callProxy("get-campaign-status", {
            ad_account_id: accountId,
          }).then((result) => {
            const account = adAccounts.find((item) => item.id === accountId);
            return {
              accountId,
              accountName: account?.name || accountId,
              campaigns: result.campaigns || [],
            };
          }),
        ),
      );
      return results.flatMap((result) =>
        result.status === "fulfilled"
          ? ((result.value.campaigns || []) as Array<{ id: string; name?: string; status?: string; objective?: string }>).map((campaign) => ({
              ...campaign,
              account_id: result.value.accountId,
              account_name: result.value.accountName,
            }))
          : [],
      );
    },
    enabled: !!companyId && !!integrationId && effectiveAdAccountIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const campaignStatuses = useMemo(() => {
    const map: Record<string, string> = {};
    for (const campaign of campaignStatusRows) {
      map[campaign.id] = campaign.status ?? "";
    }
    return map;
  }, [campaignStatusRows]);

  // Normalize data
  const normalizedRows = useMemo(() => {
    const rows = normalizeInsights(rawInsights, "lead", campaignStatuses as Record<string, string>);
    if (level !== "campaign") return rows;

    const existingIds = new Set(rows.map((row) => row.campaign_id).filter(Boolean));
    const emptyCampaignRows = campaignStatusRows
      .filter((campaign) => campaign.id && !existingIds.has(campaign.id))
      .map((campaign) => ({
        campaign_id: campaign.id,
        campaign_name: campaign.name || campaign.id,
        account_id: campaign.account_id,
        account_name: campaign.account_name,
        objective: campaign.objective,
        status: campaign.status,
        impressions: 0,
        reach: 0,
        clicks: 0,
        spend: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        frequency: 0,
        conversions: 0,
        revenue: 0,
        leads: 0,
        purchases: 0,
        roi: 0,
        cpl: 0,
        cps: 0,
        avg_revenue: 0,
      }));
    return [...rows, ...emptyCampaignRows];
  }, [rawInsights, campaignStatuses, campaignStatusRows, level]);

  const kpis: KPISummary = useMemo(() => computeKPIs(normalizedRows), [normalizedRows]);
  const dailySeries: DailyPoint[] = useMemo(() => computeDailySeries(rawDailyInsights), [rawDailyInsights]);

  // Filter + sort
  const filteredRows = useMemo(() => {
    let rows = [...normalizedRows];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.campaign_name?.toLowerCase().includes(q) ||
          r.adset_name?.toLowerCase().includes(q) ||
          r.ad_name?.toLowerCase().includes(q)
      );
    }
    if (filters.status !== "all") {
      rows = rows.filter((r) => r.status === filters.status);
    }
    if (filters.objective) {
      rows = rows.filter((r) => r.objective === filters.objective);
    }
    if (filters.minSpend !== null) {
      rows = rows.filter((r) => r.spend >= (filters.minSpend || 0));
    }
    if (filters.maxSpend !== null) {
      rows = rows.filter((r) => r.spend <= (filters.maxSpend || Infinity));
    }
    if (filters.onlyWithLeads) {
      rows = rows.filter((r) => r.leads > 0);
    }

    // Sort
    rows.sort((a, b) => {
      const aVal = (a as any)[sortColumn] ?? 0;
      const bVal = (b as any)[sortColumn] ?? 0;
      if (typeof aVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });

    return rows;
  }, [normalizedRows, filters, sortColumn, sortDirection]);

  // Toggle sort
  const toggleSort = useCallback(
    (col: string) => {
      if (sortColumn === col) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(col);
        setSortDirection("desc");
      }
    },
    [sortColumn]
  );

  // Unique objectives for filter dropdown
  const objectives = useMemo(
    () => [...new Set(normalizedRows.map((r) => r.objective).filter(Boolean))],
    [normalizedRows]
  );

  const isConnected = !!integration;
  const isLoading = isLoadingAccounts || isLoadingInsights;
  const hasTokenError = insightsError?.message?.includes("token") || insightsError?.message?.includes("OAuthException");

  // --- Persistence: load preferences on mount ---
  const prefsLoaded = useRef(false);
  useEffect(() => {
    if (!companyId || !userId || prefsLoaded.current) return;
    (async () => {
      const { data } = await supabase
        .from("reporting_preferences")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("report_key", "facebook_ads")
        .maybeSingle();
      if (data) {
        if (data.visible_columns) setVisibleColumns(data.visible_columns as string[]);
        if (data.last_ad_account === ALL_META_ACCOUNTS) setSelectedAccountId(ALL_META_ACCOUNTS);
        if (data.last_date_range) {
          const dr = data.last_date_range as any;
          if (dr.from && dr.to) setDateRange({ from: new Date(dr.from), to: new Date(dr.to) });
        }
        if (data.default_sort) setSortColumn(data.default_sort as string);
      }
      prefsLoaded.current = true;
    })();
  }, [companyId, userId]);

  // --- Persistence: save preferences (debounced) ---
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!companyId || !userId || !prefsLoaded.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await supabase.from("reporting_preferences").upsert(
        {
          company_id: companyId,
          user_id: userId,
          report_key: "facebook_ads",
          visible_columns: visibleColumns as any,
          default_sort: sortColumn,
          last_ad_account: selectedAccountId,
          last_date_range: { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() } as any,
        },
        { onConflict: "company_id,user_id,report_key" }
      );
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [visibleColumns, selectedAccountId, dateRange, sortColumn, companyId, userId]);

  const companyName = (effectiveCompany as any)?.name || "";

  return {
    // Connection
    isConnected,
    hasTokenError,
    // Accounts
    adAccounts,
    selectedAccountId,
    setSelectedAccountId,
    isLoadingAccounts,
    // Date
    dateRange,
    setDateRange,
    // Level
    level,
    setLevel,
    // Data
    rows: filteredRows,
    allRows: normalizedRows,
    kpis,
    dailySeries,
    isLoading,
    // Filters
    filters,
    setFilters,
    objectives,
    // Sort
    sortColumn,
    sortDirection,
    toggleSort,
    // Columns
    visibleColumns,
    setVisibleColumns,
    // Company
    companyName,
  };
}

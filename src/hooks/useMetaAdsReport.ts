import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import { computeDailySeries, type DailyPoint, type NormalizedCampaignRow } from "@/lib/metaInsightsNormalizer";
import {
  buildCrmIndex,
  buildLevelRows,
  computeReportKpis,
  filtraPerPercorso,
  inPausa,
  type AccountReport,
  type AdsReportPayload,
  type CrmIndex,
  type DrillFilter,
  type ReportLevel,
} from "@/lib/metaAdsReportModel";
import { differenceInCalendarDays, format, subDays } from "date-fns";

export type { ReportLevel, DrillFilter } from "@/lib/metaAdsReportModel";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const ALL_META_ACCOUNTS = "__all_meta_accounts__";
export const ALL_META_ACCOUNTS_LABEL = "Tutti gli account BM";

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

/** Colonne visibili di partenza: prima quanto si spende e cosa rende, poi i
 *  numeri di consegna. Le metriche e-commerce (acquisti pixel) restano
 *  disponibili ma spente: per chi vende infissi o impianti non dicono nulla. */
export const DEFAULT_COLUMNS = [
  "name", "account_name", "status", "budget", "spend", "impressions", "reach", "frequency",
  "link_clicks", "ctr", "cpc", "cpm", "leads", "cpl", "lead_crm", "opportunita", "vinte",
  "costo_vinta", "quality_ranking",
];

const REQUIRED_VISIBLE_COLUMNS = ["name"];

function withRequiredVisibleColumns(columns: string[]): string[] {
  const merged = new Set([...columns, ...REQUIRED_VISIBLE_COLUMNS]);
  const orderedDefaults = DEFAULT_COLUMNS.filter((column) => merged.has(column));
  const customColumns = columns.filter((column) => !DEFAULT_COLUMNS.includes(column));
  return [...orderedDefaults, ...customColumns];
}

/** v2: le colonne sono cambiate (lead CRM, contratti, budget); le preferenze
 *  salvate col vecchio elenco avrebbero nascosto proprio le novità. */
const REPORT_KEY = "facebook_ads_v2";

export function useMetaAdsReport() {
  const { effectiveCompany, user } = useAuth();
  const companyId = (effectiveCompany as { id?: string } | null)?.id;
  const userId = user?.id;
  const queryClient = useQueryClient();

  // State
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 14),
    to: new Date(),
  });
  const [selectedAccountId, setSelectedAccountId] = useState<string>(ALL_META_ACCOUNTS);
  const [level, setLevelState] = useState<ReportLevel>("campaign");
  const [drill, setDrill] = useState<DrillFilter>({});
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
    async (action: string, params: Record<string, unknown> = {}) => {
      if (!companyId || !integrationId) throw new Error("Non connesso a Meta");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetchWithTimeout(
        `${SUPABASE_URL}/functions/v1/meta-api-proxy`,
        {
          method: "POST",
          timeoutMs: 60_000,
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

  // Default (vedi useState): tutto il Business Manager, così non si perdono
  // sponsorizzate su account diversi dell'azienda.
  const effectiveAdAccountIds = useMemo(() => {
    if (selectedAccountId === ALL_META_ACCOUNTS) return adAccounts.map((account) => account.id);
    return selectedAccountId ? [selectedAccountId] : [];
  }, [adAccounts, selectedAccountId]);
  const adAccountQueryKey = effectiveAdAccountIds.join(",");

  const dateStart = format(dateRange.from, "yyyy-MM-dd");
  const dateEnd = format(dateRange.to, "yyyy-MM-dd");
  // Periodo precedente di pari durata, per il confronto nei KPI.
  const giorni = differenceInCalendarDays(dateRange.to, dateRange.from) + 1;
  const prevEnd = format(subDays(dateRange.from, 1), "yyyy-MM-dd");
  const prevStart = format(subDays(dateRange.from, giorni), "yyyy-MM-dd");

  // "Aggiorna" salta la cache di 15 minuti del proxy.
  const forzaAggiornamento = useRef(false);

  // Report completo: tre livelli, struttura, totali, andamento giornaliero.
  const {
    data: reports = [],
    isLoading: isLoadingReport,
    isFetching: isFetchingReport,
    error: reportError,
  } = useQuery({
    queryKey: ["meta-ads-report", companyId, adAccountQueryKey, dateStart, dateEnd],
    queryFn: async (): Promise<AccountReport[]> => {
      const refresh = forzaAggiornamento.current;
      forzaAggiornamento.current = false;
      const results = await Promise.allSettled(
        effectiveAdAccountIds.map(async (accountId) => {
          const account = adAccounts.find((item) => item.id === accountId);
          const payload = (await callProxy("get-ads-report", {
            ad_account_id: accountId,
            date_start: dateStart,
            date_end: dateEnd,
            prev_start: prevStart,
            prev_end: prevEnd,
            refresh,
          })) as AdsReportPayload;
          return { accountId, accountName: account?.name || accountId, payload };
        }),
      );
      const fulfilled = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      if (fulfilled.length === 0) {
        const rejected = results.find((result) => result.status === "rejected");
        if (rejected?.status === "rejected") throw rejected.reason;
      }
      return fulfilled;
    },
    enabled: !!companyId && !!integrationId && effectiveAdAccountIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const aggiorna = useCallback(() => {
    forzaAggiornamento.current = true;
    queryClient.invalidateQueries({ queryKey: ["meta-ads-report", companyId] });
    queryClient.invalidateQueries({ queryKey: ["meta-report-crm", companyId] });
  }, [queryClient, companyId]);

  // Esito nel CRM dei lead arrivati dai moduli Meta nel periodo: ogni
  // contatto porta campagna, gruppo e inserzione di provenienza.
  const { data: crmIndex = null, isLoading: isLoadingCrm } = useQuery({
    queryKey: ["meta-report-crm", companyId, dateStart, dateEnd],
    queryFn: async (): Promise<CrmIndex> => {
      const contatti: Array<{ id: string; meta_campaign_id: string | null; meta_adset_id: string | null; meta_ad_id: string | null }> = [];
      for (let da = 0; da < 20_000; da += 1000) {
        const { data, error } = await supabase
          .from("marketing_contacts")
          .select("id, meta_campaign_id, meta_adset_id, meta_ad_id")
          .eq("company_id", companyId!)
          .not("meta_campaign_id", "is", null)
          .is("deleted_at", null)
          .gte("created_at", `${dateStart}T00:00:00`)
          .lte("created_at", `${dateEnd}T23:59:59`)
          .range(da, da + 999);
        if (error) throw error;
        contatti.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      const opportunita: Array<{ contact_id: string | null; status: string | null; value: number | null }> = [];
      const ids = contatti.map((c) => c.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from("marketing_opportunities")
          .select("contact_id, status, value")
          .in("contact_id", ids.slice(i, i + 200))
          .is("deleted_at", null);
        if (error) throw error;
        opportunita.push(...(data ?? []));
      }
      return buildCrmIndex(contatti, opportunita);
    },
    enabled: !!companyId && !!integrationId,
    staleTime: 2 * 60 * 1000,
  });

  // Livello + percorso (campagna → gruppo → inserzione)
  const setLevel = useCallback((next: ReportLevel) => {
    if (next === "campaign") setDrill({});
    if (next === "adset") setDrill((d) => ({ campaignId: d.campaignId, campaignName: d.campaignName }));
    setLevelState(next);
  }, []);
  const apriCampagna = useCallback((row: NormalizedCampaignRow) => {
    setDrill({ campaignId: row.campaign_id, campaignName: row.campaign_name });
    setLevelState("adset");
  }, []);
  const apriGruppo = useCallback((row: NormalizedCampaignRow) => {
    setDrill({
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      adsetId: row.adset_id,
      adsetName: row.adset_name,
    });
    setLevelState("ad");
  }, []);

  const righePerLivello = useMemo(() => {
    const perLivello = {} as Record<ReportLevel, NormalizedCampaignRow[]>;
    for (const l of ["campaign", "adset", "ad"] as ReportLevel[]) {
      perLivello[l] = filtraPerPercorso(buildLevelRows(reports, l, crmIndex), l, drill);
    }
    return perLivello;
  }, [reports, crmIndex, drill]);

  const normalizedRows = righePerLivello[level];
  const conteggi = useMemo(
    () => ({
      campaign: righePerLivello.campaign.length,
      adset: righePerLivello.adset.length,
      ad: righePerLivello.ad.length,
    }),
    [righePerLivello],
  );

  const { attuale: kpis, precedente: kpisPrev } = useMemo(
    () => computeReportKpis(reports, crmIndex, level === "campaign" ? {} : drill),
    [reports, crmIndex, drill, level],
  );
  const dailySeries: DailyPoint[] = useMemo(
    () => computeDailySeries(reports.flatMap((r) => r.payload.daily ?? [])),
    [reports],
  );

  // Filter + sort
  const filteredRows = useMemo(() => {
    let rows = [...normalizedRows];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.campaign_name?.toLowerCase().includes(q) ||
          r.adset_name?.toLowerCase().includes(q) ||
          r.ad_name?.toLowerCase().includes(q) ||
          r.creative_title?.toLowerCase().includes(q)
      );
    }
    if (filters.status === "ACTIVE") rows = rows.filter((r) => r.status === "ACTIVE");
    if (filters.status === "PAUSED") rows = rows.filter((r) => inPausa(r.status));
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
      rows = rows.filter((r) => r.leads > 0 || (r.lead_crm ?? 0) > 0);
    }

    // Sort
    rows.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortColumn] ?? 0;
      const bVal = (b as unknown as Record<string, unknown>)[sortColumn] ?? 0;
      if (typeof aVal === "string" || typeof bVal === "string") {
        return sortDirection === "asc"
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      }
      return sortDirection === "asc" ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
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
  const isLoading = isLoadingAccounts || isLoadingReport;
  const erroreReport = reportError instanceof Error ? reportError.message : null;
  const hasTokenError = !!erroreReport && (erroreReport.includes("token") || erroreReport.includes("OAuthException"));
  const avvisi = useMemo(() => reports.flatMap((r) => r.payload.avvisi ?? []), [reports]);
  const aggiornatoAlle = useMemo(() => {
    const date = reports.map((r) => (r.payload as { fetched_at?: string }).fetched_at).filter(Boolean) as string[];
    return date.length ? date.sort()[0] : null;
  }, [reports]);

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
        .eq("report_key", REPORT_KEY)
        .maybeSingle();
      if (data) {
        if (data.visible_columns) setVisibleColumns(data.visible_columns as string[]);
        if (data.last_ad_account === ALL_META_ACCOUNTS) setSelectedAccountId(ALL_META_ACCOUNTS);
        if (data.last_date_range) {
          const dr = data.last_date_range as { from?: string; to?: string };
          if (dr.from && dr.to) setDateRange({ from: new Date(dr.from), to: new Date(dr.to) });
        }
        if (data.default_sort) setSortColumn(data.default_sort as string);
      }
      prefsLoaded.current = true;
    })();
  }, [companyId, userId, setVisibleColumns]);

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
          report_key: REPORT_KEY,
          visible_columns: visibleColumns,
          default_sort: sortColumn,
          last_ad_account: selectedAccountId,
          last_date_range: { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() },
        },
        { onConflict: "company_id,user_id,report_key" }
      );
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [visibleColumns, selectedAccountId, dateRange, sortColumn, companyId, userId]);

  const companyName = (effectiveCompany as { name?: string } | null)?.name || "";

  return {
    // Connection
    isConnected,
    hasTokenError,
    erroreReport,
    // Accounts
    adAccounts,
    selectedAccountId,
    setSelectedAccountId,
    isLoadingAccounts,
    // Date
    dateRange,
    setDateRange,
    // Level + percorso
    level,
    setLevel,
    drill,
    setDrill,
    apriCampagna,
    apriGruppo,
    conteggi,
    // Data
    rows: filteredRows,
    allRows: normalizedRows,
    kpis,
    kpisPrev,
    dailySeries,
    isLoading,
    isLoadingCrm,
    isFetching: isFetchingReport,
    aggiorna,
    aggiornatoAlle,
    avvisi,
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

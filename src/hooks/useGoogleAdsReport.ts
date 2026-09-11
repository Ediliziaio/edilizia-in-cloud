/**
 * Report Google Ads per livello (campagne → gruppi → annunci, parole chiave,
 * termini di ricerca), letto in diretta da Google tramite l'azione `report`
 * di google-ads-sync-campaigns, con l'esito nel CRM dei lead arrivati da Google.
 *
 * Il vecchio report leggeva `google_ads_stats`, che nessuna funzione riempie:
 * la sincronizzazione scrive `google_ads_campaigns`. Il risultato era una
 * pagina sempre vuota anche ad account collegato.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import { buildCrmIndex, type CrmIndex } from "@/lib/metaAdsReportModel";
import {
  buildGoogleRows,
  computeGoogleKpis,
  filtraGooglePercorso,
  type GoogleLevel,
  type GooglePercorso,
  type GoogleReportPayload,
  type GoogleRow,
} from "@/lib/googleAdsReportModel";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface GoogleDateRange {
  from: Date;
  to: Date;
}

/** Messaggi dell'edge function tradotti in cosa fare. */
function spiegaErrore(msg: string): string {
  if (msg.includes("DEVELOPER_TOKEN")) {
    return "La piattaforma non ha ancora il developer token di Google Ads: finché Google non lo approva, i dati non si possono leggere.";
  }
  if (msg.includes("google_reconnect_required") || msg.includes("refresh")) {
    return "Il collegamento a Google Ads è scaduto: ricollegalo da Impostazioni → Integrazioni.";
  }
  if (msg.includes("customer non selezionato")) {
    return "Google Ads è collegato ma non è stato scelto l'account pubblicitario: completalo da Impostazioni → Integrazioni.";
  }
  if (msg.includes("UNSUPPORTED_VERSION")) {
    return "Google ha ritirato la versione dell'API in uso: va aggiornata la variabile GOOGLE_ADS_API_VERSION.";
  }
  return msg;
}

export function useGoogleAdsReport() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [dateRange, setDateRange] = useState<GoogleDateRange>({ from: subDays(new Date(), 29), to: new Date() });
  const [level, setLevelState] = useState<GoogleLevel>("campaign");
  const [percorso, setPercorso] = useState<GooglePercorso>({});
  const [search, setSearch] = useState("");
  const [soloAttive, setSoloAttive] = useState(false);
  const [sortColumn, setSortColumn] = useState("spend");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Collegamento vero: google_ads_connections (token + account scelto).
  const { data: connessione, isLoading: isLoadingConn } = useQuery({
    queryKey: ["google-ads-report-connection", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("google_ads_connections")
        .select("id, customer_id, customer_descriptive_name, customer_currency_code, status, last_error")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
  });
  const isConnected = !!connessione?.customer_id;

  const dateStart = format(dateRange.from, "yyyy-MM-dd");
  const dateEnd = format(dateRange.to, "yyyy-MM-dd");
  const giorni = differenceInCalendarDays(dateRange.to, dateRange.from) + 1;
  const prevEnd = format(subDays(dateRange.from, 1), "yyyy-MM-dd");
  const prevStart = format(subDays(dateRange.from, giorni), "yyyy-MM-dd");

  const forza = useRef(false);
  const {
    data: payload = null,
    isLoading: isLoadingReport,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["google-ads-report", companyId, dateStart, dateEnd],
    queryFn: async (): Promise<GoogleReportPayload> => {
      const refresh = forza.current;
      forza.current = false;
      const { data: s } = await supabase.auth.getSession();
      const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/google-ads-sync-campaigns`, {
        method: "POST",
        timeoutMs: 60_000,
        context: "google-ads.report",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.session?.access_token}` },
        body: JSON.stringify({
          action: "report",
          company_id: companyId,
          date_start: dateStart,
          date_end: dateEnd,
          prev_start: prevStart,
          prev_end: prevEnd,
          refresh,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(spiegaErrore(String(json.detail ?? json.error ?? res.status)));
      return json as GoogleReportPayload;
    },
    enabled: !!companyId && isConnected,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Esito nel CRM dei lead arrivati da Google nel periodo.
  const { data: crm = null, isLoading: isLoadingCrm } = useQuery({
    queryKey: ["google-report-crm", companyId, dateStart, dateEnd],
    queryFn: async (): Promise<CrmIndex> => {
      const contatti: Array<{ id: string; google_campaign_id: string | null; google_ad_group_id: string | null; google_ad_id: string | null }> = [];
      for (let da = 0; da < 20_000; da += 1000) {
        const { data, error: e } = await supabase
          .from("marketing_contacts")
          .select("id, google_campaign_id, google_ad_group_id, google_ad_id")
          .eq("company_id", companyId!)
          .not("google_campaign_id", "is", null)
          .is("deleted_at", null)
          .gte("created_at", `${dateStart}T00:00:00`)
          .lte("created_at", `${dateEnd}T23:59:59`)
          .range(da, da + 999);
        if (e) throw e;
        contatti.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      const opportunita: Array<{ contact_id: string | null; status: string | null; value: number | null }> = [];
      const ids = contatti.map((c) => c.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error: e } = await supabase
          .from("marketing_opportunities")
          .select("contact_id, status, value")
          .in("contact_id", ids.slice(i, i + 200))
          .is("deleted_at", null);
        if (e) throw e;
        opportunita.push(...(data ?? []));
      }
      // Stesso calcolo del report Meta: campagna / gruppo / annuncio.
      return buildCrmIndex(
        contatti.map((c) => ({ id: c.id, meta_campaign_id: c.google_campaign_id, meta_adset_id: c.google_ad_group_id, meta_ad_id: c.google_ad_id })),
        opportunita,
      );
    },
    enabled: !!companyId && isConnected,
    staleTime: 2 * 60 * 1000,
  });

  const aggiorna = useCallback(() => {
    forza.current = true;
    queryClient.invalidateQueries({ queryKey: ["google-ads-report", companyId] });
    queryClient.invalidateQueries({ queryKey: ["google-report-crm", companyId] });
  }, [queryClient, companyId]);

  const setLevel = useCallback((next: GoogleLevel) => {
    if (next === "campaign") setPercorso({});
    if (next === "ad_group") setPercorso((p) => ({ campaignId: p.campaignId, campaignName: p.campaignName }));
    setLevelState(next);
  }, []);
  const apriCampagna = useCallback((r: GoogleRow) => {
    setPercorso({ campaignId: r.campaign_id || r.id, campaignName: r.campaign_name || r.name || "" });
    setLevelState("ad_group");
  }, []);
  const apriGruppo = useCallback((r: GoogleRow) => {
    setPercorso({ campaignId: r.campaign_id, campaignName: r.campaign_name, adGroupId: r.id, adGroupName: r.name ?? "" });
    setLevelState("ad");
  }, []);

  const perLivello = useMemo(() => {
    const out = {} as Record<GoogleLevel, GoogleRow[]>;
    for (const l of ["campaign", "ad_group", "ad", "keyword", "search_term"] as GoogleLevel[]) {
      out[l] = filtraGooglePercorso(buildGoogleRows(payload, l, crm), l, percorso);
    }
    return out;
  }, [payload, crm, percorso]);

  const conteggi = useMemo(
    () => Object.fromEntries(Object.entries(perLivello).map(([k, v]) => [k, v.length])) as Record<GoogleLevel, number>,
    [perLivello],
  );

  const rows = useMemo(() => {
    let r = [...perLivello[level]];
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter((x) =>
        [x.name, x.campaign_name, x.ad_group_name, ...(x.headlines ?? [])].some((v) => v?.toLowerCase().includes(q)),
      );
    }
    if (soloAttive) r = r.filter((x) => x.status === "ENABLED");
    r.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortColumn];
      const bv = (b as unknown as Record<string, unknown>)[sortColumn];
      if (typeof av === "string" || typeof bv === "string") {
        return sortDirection === "asc" ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? ""));
      }
      const an = Number(av ?? -1);
      const bn = Number(bv ?? -1);
      return sortDirection === "asc" ? an - bn : bn - an;
    });
    return r;
  }, [perLivello, level, search, soloAttive, sortColumn, sortDirection]);

  const toggleSort = useCallback(
    (col: string) => {
      if (sortColumn === col) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortColumn(col);
        setSortDirection("desc");
      }
    },
    [sortColumn],
  );

  const { attuale: kpis, precedente: kpisPrev } = useMemo(
    () => computeGoogleKpis(payload, crm, level === "campaign" ? {} : percorso),
    [payload, crm, percorso, level],
  );

  return {
    companyName: effectiveCompany?.name ?? "",
    connessione,
    isConnected,
    isLoadingConn,
    dateRange,
    setDateRange,
    level,
    setLevel,
    percorso,
    apriCampagna,
    apriGruppo,
    conteggi,
    rows,
    kpis,
    kpisPrev,
    daily: payload?.daily ?? [],
    avvisi: payload?.avvisi ?? [],
    aggiornatoAlle: payload?.fetched_at ?? null,
    isLoading: isLoadingConn || isLoadingReport,
    isLoadingCrm,
    isFetching,
    errore: error instanceof Error ? error.message : null,
    aggiorna,
    search,
    setSearch,
    soloAttive,
    setSoloAttive,
    sortColumn,
    sortDirection,
    toggleSort,
  };
}

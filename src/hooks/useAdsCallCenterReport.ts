import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  buildAdsCallCenterReportRows,
  summarizeAdsCallCenterReportRows,
  type AdsCallCenterAppointmentRow,
  type AdsCallCenterCallRow,
  type AdsCallCenterContactRow,
  type AdsCallCenterProviderFilter,
} from "@/lib/reporting/adsCallCenterReport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => (supabase as any).from(name);

export function useAdsCallCenterReport({
  companyId,
  daysBack = 180,
  provider = "all",
}: {
  companyId?: string;
  daysBack?: number;
  provider?: AdsCallCenterProviderFilter;
}) {
  const fromDate = useMemo(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysBack);
    return date.toISOString();
  }, [daysBack]);

  const query = useQuery({
    queryKey: ["ads-callcenter-report", companyId, daysBack, provider],
    queryFn: async () => {
      if (!companyId) {
        return {
          contacts: [] as AdsCallCenterContactRow[],
          calls: [] as AdsCallCenterCallRow[],
          appointments: [] as AdsCallCenterAppointmentRow[],
        };
      }

      const contacts = await fetchContacts(companyId, fromDate);
      const contactIds = contacts.map((contact) => contact.id).filter(Boolean);
      const [calls, appointments] = await Promise.all([
        fetchCalls(companyId, contactIds, fromDate),
        fetchAppointments(companyId, contactIds),
      ]);

      return { contacts, calls, appointments };
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const rows = useMemo(
    () =>
      buildAdsCallCenterReportRows({
        contacts: query.data?.contacts ?? [],
        calls: query.data?.calls ?? [],
        appointments: query.data?.appointments ?? [],
        provider,
      }),
    [provider, query.data],
  );
  const totals = useMemo(() => summarizeAdsCallCenterReportRows(rows, provider), [provider, rows]);

  return {
    rows,
    totals,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

async function fetchContacts(companyId: string, fromDate: string): Promise<AdsCallCenterContactRow[]> {
  const fullSelect =
    "id, source, source_campaign_id, attr_source, attr_medium, attr_campaign, attr_content, meta_campaign_id, meta_adset_id, meta_ad_id, google_campaign_id, google_ad_group_id, google_ad_id, gclid, wbraid, gbraid, created_at";
  const fallbackSelect =
    "id, source, source_campaign_id, attr_source, attr_medium, attr_campaign, attr_content, created_at";

  try {
    const { data, error } = await table("marketing_contacts")
      .select(fullSelect)
      .eq("company_id", companyId)
      .gte("created_at", fromDate)
      .order("created_at", { ascending: false })
      .limit(3000);
    if (!error) return (data ?? []) as AdsCallCenterContactRow[];
    if (!isSchemaFallbackError(error)) throw error;

    const fallback = await table("marketing_contacts")
      .select(fallbackSelect)
      .eq("company_id", companyId)
      .gte("created_at", fromDate)
      .order("created_at", { ascending: false })
      .limit(3000);
    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []) as AdsCallCenterContactRow[];
  } catch {
    return [];
  }
}

async function fetchCalls(companyId: string, contactIds: string[], fromDate: string): Promise<AdsCallCenterCallRow[]> {
  if (contactIds.length === 0) return [];
  try {
    const { data, error } = await table("call_logs")
      .select("id, contact_id, outcome, started_at, duration_sec")
      .eq("company_id", companyId)
      .in("contact_id", contactIds)
      .gte("started_at", fromDate)
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as AdsCallCenterCallRow[];
  } catch {
    return [];
  }
}

async function fetchAppointments(companyId: string, contactIds: string[]): Promise<AdsCallCenterAppointmentRow[]> {
  if (contactIds.length === 0) return [];
  try {
    const { data, error } = await table("appointments")
      .select("id, contact_id, status")
      .eq("company_id", companyId)
      .in("contact_id", contactIds)
      .limit(3000);
    if (error) throw error;
    return (data ?? []) as AdsCallCenterAppointmentRow[];
  } catch {
    return [];
  }
}

function isSchemaFallbackError(err: unknown) {
  const msg = String((err as Error)?.message ?? err);
  return msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("column");
}

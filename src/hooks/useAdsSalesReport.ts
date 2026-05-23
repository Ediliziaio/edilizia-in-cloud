import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  buildAdsSalesReportRows,
  summarizeAdsSalesReportRows,
  type AdsSalesAppointmentRow,
  type AdsSalesContactRow,
  type AdsSalesCostRow,
  type AdsSalesOpportunityRow,
  type AdsSalesProviderFilter,
} from "@/lib/reporting/adsSalesReport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => (supabase as any).from(name);

export function useAdsSalesReport({
  companyId,
  daysBack = 180,
  provider = "all",
}: {
  companyId?: string;
  daysBack?: number;
  provider?: AdsSalesProviderFilter;
}) {
  const fromDate = useMemo(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysBack);
    return date.toISOString();
  }, [daysBack]);

  const query = useQuery({
    queryKey: ["ads-sales-report", companyId, daysBack, provider],
    queryFn: async () => {
      if (!companyId) {
        return {
          contacts: [] as AdsSalesContactRow[],
          opportunities: [] as AdsSalesOpportunityRow[],
          appointments: [] as AdsSalesAppointmentRow[],
          costs: [] as AdsSalesCostRow[],
        };
      }

      const contacts = await fetchContacts(companyId, fromDate);
      const contactIds = contacts.map((contact) => contact.id).filter(Boolean);
      const [opportunities, appointments, costs] = await Promise.all([
        fetchOpportunities(companyId, contactIds),
        fetchAppointments(companyId, contactIds),
        fetchCosts(companyId, fromDate),
      ]);

      return { contacts, opportunities, appointments, costs };
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const rows = useMemo(
    () =>
      buildAdsSalesReportRows({
        contacts: query.data?.contacts ?? [],
        opportunities: query.data?.opportunities ?? [],
        appointments: query.data?.appointments ?? [],
        costs: query.data?.costs ?? [],
        provider,
      }),
    [provider, query.data],
  );
  const totals = useMemo(() => summarizeAdsSalesReportRows(rows, provider), [provider, rows]);

  return {
    rows,
    totals,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

async function fetchContacts(companyId: string, fromDate: string): Promise<AdsSalesContactRow[]> {
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
    if (!error) return (data ?? []) as AdsSalesContactRow[];
    if (!isSchemaFallbackError(error)) throw error;

    const fallback = await table("marketing_contacts")
      .select(fallbackSelect)
      .eq("company_id", companyId)
      .gte("created_at", fromDate)
      .order("created_at", { ascending: false })
      .limit(3000);
    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []) as AdsSalesContactRow[];
  } catch {
    return [];
  }
}

async function fetchOpportunities(
  companyId: string,
  contactIds: string[],
): Promise<AdsSalesOpportunityRow[]> {
  if (contactIds.length === 0) return [];
  try {
    const { data, error } = await table("marketing_opportunities")
      .select("id, contact_id, status, value")
      .eq("company_id", companyId)
      .in("contact_id", contactIds)
      .limit(3000);
    if (error) throw error;
    return (data ?? []) as AdsSalesOpportunityRow[];
  } catch {
    return [];
  }
}

async function fetchAppointments(companyId: string, contactIds: string[]): Promise<AdsSalesAppointmentRow[]> {
  if (contactIds.length === 0) return [];
  try {
    const { data, error } = await table("appointments")
      .select("id, contact_id, status, is_completed")
      .eq("company_id", companyId)
      .in("contact_id", contactIds)
      .limit(3000);
    if (error) throw error;
    return (data ?? []) as AdsSalesAppointmentRow[];
  } catch {
    return [];
  }
}

async function fetchCosts(companyId: string, fromDate: string): Promise<AdsSalesCostRow[]> {
  try {
    const { data, error } = await table("campaign_costs")
      .select("source, campaign_name, spend_amount")
      .eq("company_id", companyId)
      .gte("date", fromDate.slice(0, 10))
      .limit(2000);
    if (error) throw error;
    return (data ?? []) as AdsSalesCostRow[];
  } catch {
    return [];
  }
}

function isSchemaFallbackError(err: unknown) {
  const msg = String((err as Error)?.message ?? err);
  return msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("column");
}

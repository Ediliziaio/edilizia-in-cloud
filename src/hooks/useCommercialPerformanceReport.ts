import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  buildCommercialPerformanceReport,
  type CommercialAppointmentRow,
  type CommercialContactRow,
  type CommercialOpportunityRow,
  type CommercialOrderRow,
  type CommercialQuoteRow,
} from "@/lib/reporting/commercialPerformanceReport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => (supabase as any).from(name);

export function useCommercialPerformanceReport({
  companyId,
  daysBack = 180,
  monthlyTargetCents,
  fromDate: fromDateProp,
  toDate: toDateProp,
}: {
  companyId?: string;
  daysBack?: number;
  monthlyTargetCents?: number;
  fromDate?: string;
  toDate?: string;
}) {
  const { fromIso, toIso } = useMemo(() => {
    if (fromDateProp) {
      return { fromIso: fromDateProp, toIso: toDateProp ?? null };
    }
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysBack);
    return { fromIso: date.toISOString(), toIso: null as string | null };
  }, [fromDateProp, toDateProp, daysBack]);

  const query = useQuery({
    queryKey: ["commercial-performance-report", companyId, fromIso, toIso, monthlyTargetCents],
    queryFn: async () => {
      if (!companyId) {
        return emptyData();
      }

      const [contacts, appointments, quotes, opportunities, orders] = await Promise.all([
        fetchContacts(companyId, fromIso, toIso),
        fetchAppointments(companyId, fromIso, toIso),
        fetchQuotes(companyId, fromIso, toIso),
        fetchOpportunities(companyId),
        fetchOrders(companyId, fromIso, toIso),
      ]);

      return { contacts, appointments, quotes, opportunities, orders };
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const report = useMemo(
    () =>
      buildCommercialPerformanceReport({
        contacts: query.data?.contacts ?? [],
        appointments: query.data?.appointments ?? [],
        quotes: query.data?.quotes ?? [],
        opportunities: query.data?.opportunities ?? [],
        orders: query.data?.orders ?? [],
        monthlyTargetCents,
      }),
    [monthlyTargetCents, query.data],
  );

  return {
    report,
    rows: query.data ?? emptyData(),
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
  };
}

function emptyData() {
  return {
    contacts: [] as CommercialContactRow[],
    appointments: [] as CommercialAppointmentRow[],
    quotes: [] as CommercialQuoteRow[],
    opportunities: [] as CommercialOpportunityRow[],
    orders: [] as CommercialOrderRow[],
  };
}

async function fetchContacts(companyId: string, fromDate: string, toDate: string | null): Promise<CommercialContactRow[]> {
  try {
    let q = table("marketing_contacts")
      .select("id, created_at, source, source_campaign_id, attr_source, attr_campaign, city, province, assigned_to, call_center_id, stato, tags, icp_score, lead_score, ai_score")
      .eq("company_id", companyId)
      .gte("created_at", fromDate)
      .is("deleted_at", null);
    if (toDate) q = q.lte("created_at", toDate);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(5000);
    if (error) throw error;
    return (data ?? []) as CommercialContactRow[];
  } catch {
    return [];
  }
}

async function fetchAppointments(companyId: string, fromDate: string, toDate: string | null): Promise<CommercialAppointmentRow[]> {
  try {
    let q = table("appointments")
      .select("id, contact_id, assigned_to, appointment_date, appointment_type, order_id, status, is_completed, is_blocked_slot, calendar_id")
      .eq("company_id", companyId)
      .gte("appointment_date", fromDate.slice(0, 10));
    if (toDate) q = q.lte("appointment_date", toDate.slice(0, 10));
    const { data, error } = await q.order("appointment_date", { ascending: false }).limit(5000);
    if (error) throw error;
    return (data ?? []) as CommercialAppointmentRow[];
  } catch {
    return [];
  }
}

async function fetchQuotes(companyId: string, fromDate: string, toDate: string | null): Promise<CommercialQuoteRow[]> {
  try {
    let q = table("quotes")
      .select("id, contact_id, opportunity_id, quote_number, title, status, total, subtotal, created_at, sent_at, signed_at, refused_at, refused_reason, salesperson_id, assigned_to, source, margine_totale_percentuale, margine_pct_snapshot, totale_costo_interno, totale_overhead")
      .eq("company_id", companyId)
      .gte("created_at", fromDate)
      .is("deleted_at", null);
    if (toDate) q = q.lte("created_at", toDate);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(5000);
    if (error) throw error;
    return (data ?? []) as CommercialQuoteRow[];
  } catch {
    return [];
  }
}

async function fetchOpportunities(companyId: string): Promise<CommercialOpportunityRow[]> {
  try {
    const { data, error } = await table("marketing_opportunities")
      .select("id, contact_id, assigned_to, status, value, probability, expected_close_date, next_action, next_action_date, updated_at, won_at, lost_at, created_at, source, lost_reason, loss_reason, lost_reason_category, competitor_won")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as CommercialOpportunityRow[];
  } catch {
    return [];
  }
}

async function fetchOrders(companyId: string, fromDate: string, toDate: string | null): Promise<CommercialOrderRow[]> {
  try {
    let q = table("orders")
      .select("id, quote_id, quote_number, order_type, total_amount, created_at, status, fulfillment_status")
      .eq("company_id", companyId)
      .gte("created_at", fromDate)
      .is("deleted_at", null)
      .not("quote_id", "is", null);
    if (toDate) q = q.lte("created_at", toDate);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(5000);
    if (error) throw error;
    return (data ?? []) as CommercialOrderRow[];
  } catch {
    return [];
  }
}

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
}: {
  companyId?: string;
  daysBack?: number;
  monthlyTargetCents?: number;
}) {
  const fromDate = useMemo(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysBack);
    return date.toISOString();
  }, [daysBack]);

  const query = useQuery({
    queryKey: ["commercial-performance-report", companyId, daysBack, monthlyTargetCents],
    queryFn: async () => {
      if (!companyId) {
        return emptyData();
      }

      const [contacts, appointments, quotes, opportunities, orders] = await Promise.all([
        fetchContacts(companyId, fromDate),
        fetchAppointments(companyId, fromDate),
        fetchQuotes(companyId, fromDate),
        fetchOpportunities(companyId),
        fetchOrders(companyId, fromDate),
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

async function fetchContacts(companyId: string, fromDate: string): Promise<CommercialContactRow[]> {
  try {
    const { data, error } = await table("marketing_contacts")
      .select("id, created_at, source, source_campaign_id, attr_source, attr_campaign, city, province, assigned_to, call_center_id, stato, tags, icp_score, lead_score, ai_score")
      .eq("company_id", companyId)
      .gte("created_at", fromDate)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as CommercialContactRow[];
  } catch {
    return [];
  }
}

async function fetchAppointments(companyId: string, fromDate: string): Promise<CommercialAppointmentRow[]> {
  try {
    const { data, error } = await table("appointments")
      .select("id, contact_id, assigned_to, appointment_date, appointment_type, order_id, status, is_completed, is_blocked_slot")
      .eq("company_id", companyId)
      .gte("appointment_date", fromDate.slice(0, 10))
      .order("appointment_date", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as CommercialAppointmentRow[];
  } catch {
    return [];
  }
}

async function fetchQuotes(companyId: string, fromDate: string): Promise<CommercialQuoteRow[]> {
  try {
    const { data, error } = await table("quotes")
      .select("id, contact_id, opportunity_id, quote_number, title, status, total, subtotal, created_at, sent_at, signed_at, refused_at, refused_reason, salesperson_id, assigned_to, source, margine_totale_percentuale, margine_pct_snapshot, totale_costo_interno, totale_overhead")
      .eq("company_id", companyId)
      .gte("created_at", fromDate)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as CommercialQuoteRow[];
  } catch {
    return [];
  }
}

async function fetchOpportunities(companyId: string): Promise<CommercialOpportunityRow[]> {
  try {
    const { data, error } = await table("marketing_opportunities")
      .select("id, contact_id, assigned_to, status, value, probability, expected_close_date, next_action, next_action_date, updated_at, created_at, source, lost_reason, loss_reason, lost_reason_category, competitor_won")
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

async function fetchOrders(companyId: string, fromDate: string): Promise<CommercialOrderRow[]> {
  try {
    const { data, error } = await table("orders")
      .select("id, quote_id, quote_number, order_type, total_amount, created_at, status, fulfillment_status")
      .eq("company_id", companyId)
      .gte("created_at", fromDate)
      .is("deleted_at", null)
      .not("quote_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data ?? []) as CommercialOrderRow[];
  } catch {
    return [];
  }
}

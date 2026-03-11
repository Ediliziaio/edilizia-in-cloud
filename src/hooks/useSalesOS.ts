import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateLeadScore, getIcpTier } from "@/utils/leadScoring";

// ============================================================
// TYPES
// ============================================================

export interface WeightedPipelineStage {
  pipeline_id: string;
  pipeline_name: string;
  stage_id: string;
  stage_name: string;
  stage_position: number;
  opportunity_count: number;
  total_value: number;
  weighted_value: number;
  avg_probability: number;
}

export interface SalesForecastMonth {
  forecast_month: string;
  expected_revenue: number;
  weighted_revenue: number;
  opportunity_count: number;
}

export interface StalledOpportunity {
  opportunity_id: string;
  opportunity_name: string;
  contact_name: string | null;
  stage_name: string;
  assigned_to: string | null;
  last_activity_at: string;
  days_stalled: number;
  stalled_threshold: number;
  value: number;
}

export interface SalesVelocity {
  open_opportunities: number;
  win_rate: number;
  avg_deal_size: number;
  avg_cycle_days: number;
  sales_velocity: number;
}

export interface SalesPerformance {
  assigned_to: string | null;
  display_name: string;
  won_count: number;
  won_value: number;
  open_count: number;
  open_value: number;
  lost_count: number;
  win_rate: number;
  avg_deal_size: number;
  target_amount: number;
  target_achievement: number;
}

export interface ConversionBySource {
  source: string;
  total_opportunities: number;
  won_opportunities: number;
  win_rate: number;
  total_won_value: number;
  avg_deal_size: number;
}

export interface LeadScoreContact {
  id: string;
  full_name: string;
  company_name: string | null;
  lead_score: number;
  icp_score: number;
  icp_tier: string | null;
  source: string | null;
  city: string | null;
  assigned_to: string | null;
  last_activity_at: string | null;
  open_opportunities_count: number;
}

// ============================================================
// QUERY KEYS
// ============================================================

export const salesOSKeys = {
  all: ["sales-os"] as const,
  weightedPipeline: (companyId: string) =>
    [...salesOSKeys.all, "weighted-pipeline", companyId] as const,
  forecast: (companyId: string, months: number) =>
    [...salesOSKeys.all, "forecast", companyId, months] as const,
  stalled: (companyId: string) =>
    [...salesOSKeys.all, "stalled", companyId] as const,
  velocity: (companyId: string) =>
    [...salesOSKeys.all, "velocity", companyId] as const,
  targets: (companyId: string, year: number) =>
    [...salesOSKeys.all, "targets", companyId, year] as const,
  sellerPerformance: (companyId: string, year: number, month: number) =>
    [...salesOSKeys.all, "seller-perf", companyId, year, month] as const,
  conversionBySource: (companyId: string) =>
    [...salesOSKeys.all, "conversion-source", companyId] as const,
  topLeads: (companyId: string) =>
    [...salesOSKeys.all, "top-leads", companyId] as const,
};

// ============================================================
// HOOKS
// ============================================================

export function useWeightedPipeline(companyId: string | null) {
  return useQuery({
    queryKey: salesOSKeys.weightedPipeline(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<WeightedPipelineStage[]> => {
      const { data, error } = await supabase.rpc("get_weighted_pipeline", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        opportunity_count: Number(row.opportunity_count),
        total_value: Number(row.total_value),
        weighted_value: Number(row.weighted_value),
        avg_probability: Number(row.avg_probability),
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useSalesForecast(companyId: string | null, monthsAhead = 3) {
  return useQuery({
    queryKey: salesOSKeys.forecast(companyId ?? "", monthsAhead),
    enabled: !!companyId,
    queryFn: async (): Promise<SalesForecastMonth[]> => {
      const { data, error } = await supabase.rpc("get_sales_forecast", {
        p_company_id: companyId!,
        p_months_ahead: monthsAhead,
      });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        expected_revenue: Number(row.expected_revenue),
        weighted_revenue: Number(row.weighted_revenue),
        opportunity_count: Number(row.opportunity_count),
      }));
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useStalledOpportunities(companyId: string | null) {
  return useQuery({
    queryKey: salesOSKeys.stalled(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<StalledOpportunity[]> => {
      const { data, error } = await supabase.rpc("get_stalled_opportunities", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        days_stalled: Number(row.days_stalled),
        stalled_threshold: Number(row.stalled_threshold),
        value: Number(row.value),
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useSalesVelocity(companyId: string | null, daysBack = 90) {
  return useQuery({
    queryKey: salesOSKeys.velocity(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<SalesVelocity | null> => {
      const { data, error } = await supabase.rpc("get_sales_velocity", {
        p_company_id: companyId!,
        p_days_back: daysBack,
      });
      if (error) throw error;
      if (!data || data.length === 0) return null;
      const row = data[0];
      return {
        open_opportunities: Number(row.open_opportunities),
        win_rate: Number(row.win_rate),
        avg_deal_size: Number(row.avg_deal_size),
        avg_cycle_days: Number(row.avg_cycle_days),
        sales_velocity: Number(row.sales_velocity),
      };
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useSellerPerformance(
  companyId: string | null,
  year: number,
  month: number
) {
  return useQuery({
    queryKey: salesOSKeys.sellerPerformance(companyId ?? "", year, month),
    enabled: !!companyId,
    queryFn: async (): Promise<SalesPerformance[]> => {
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const monthEnd = new Date(year, month, 1).toISOString().split("T")[0];

      const { data: opps, error: oppsError } = await supabase
        .from("marketing_opportunities")
        .select("assigned_to, status, value, created_at")
        .eq("company_id", companyId!)
        .gte("updated_at", monthStart)
        .lt("updated_at", monthEnd);
      if (oppsError) throw oppsError;

      // Use existing sales_targets schema (user_id, target_revenue)
      const { data: targets, error: targetsError } = await supabase
        .from("sales_targets" as any)
        .select("user_id, target_revenue")
        .eq("company_id", companyId!)
        .eq("period_type", "monthly");
      if (targetsError) throw targetsError;

      const sellerIds = [
        ...new Set((opps ?? []).map((o) => o.assigned_to).filter(Boolean)),
      ];
      let profiles: Array<{ id: string; first_name: string | null; last_name: string | null }> = [];
      if (sellerIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", sellerIds as string[]);
        profiles = profileData ?? [];
      }

      const sellerMap = new Map<string, SalesPerformance>();
      (opps ?? []).forEach((opp) => {
        const key = opp.assigned_to ?? "unassigned";
        if (!sellerMap.has(key)) {
          const profile = profiles.find((p) => p.id === opp.assigned_to);
          const displayName = profile
            ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
            : opp.assigned_to
            ? "Venditore"
            : "Non assegnato";
          sellerMap.set(key, {
            assigned_to: opp.assigned_to,
            display_name: displayName,
            won_count: 0,
            won_value: 0,
            open_count: 0,
            open_value: 0,
            lost_count: 0,
            win_rate: 0,
            avg_deal_size: 0,
            target_amount: 0,
            target_achievement: 0,
          });
        }

        const seller = sellerMap.get(key)!;
        const value = Number(opp.value ?? 0);
        if (opp.status === "won") {
          seller.won_count++;
          seller.won_value += value;
        } else if (opp.status === "open") {
          seller.open_count++;
          seller.open_value += value;
        } else {
          seller.lost_count++;
        }
      });

      // Apply targets from existing schema
      (targets ?? []).forEach((t: any) => {
        const key = t.user_id ?? "unassigned";
        const seller = sellerMap.get(key);
        if (seller) {
          seller.target_amount = Number(t.target_revenue ?? 0);
        }
      });

      return Array.from(sellerMap.values())
        .map((s) => {
          const closedCount = s.won_count + s.lost_count;
          return {
            ...s,
            win_rate: closedCount > 0 ? (s.won_count / closedCount) * 100 : 0,
            avg_deal_size: s.won_count > 0 ? s.won_value / s.won_count : 0,
            target_achievement:
              s.target_amount > 0
                ? (s.won_value / s.target_amount) * 100
                : 0,
          };
        })
        .sort((a, b) => b.won_value - a.won_value);
    },
    staleTime: 1000 * 60 * 15,
  });
}

export function useConversionBySource(companyId: string | null) {
  return useQuery({
    queryKey: salesOSKeys.conversionBySource(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<ConversionBySource[]> => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("source, status, value")
        .eq("company_id", companyId!)
        .not("source", "is", null);
      if (error) throw error;

      const sourceMap = new Map<string, ConversionBySource>();
      (data ?? []).forEach((opp) => {
        const src = opp.source ?? "Sconosciuto";
        if (!sourceMap.has(src)) {
          sourceMap.set(src, {
            source: src,
            total_opportunities: 0,
            won_opportunities: 0,
            win_rate: 0,
            total_won_value: 0,
            avg_deal_size: 0,
          });
        }
        const s = sourceMap.get(src)!;
        s.total_opportunities++;
        if (opp.status === "won") {
          s.won_opportunities++;
          s.total_won_value += Number(opp.value ?? 0);
        }
      });

      return Array.from(sourceMap.values())
        .map((s) => ({
          ...s,
          win_rate:
            s.total_opportunities > 0
              ? (s.won_opportunities / s.total_opportunities) * 100
              : 0,
          avg_deal_size:
            s.won_opportunities > 0
              ? s.total_won_value / s.won_opportunities
              : 0,
        }))
        .sort((a, b) => b.total_won_value - a.total_won_value);
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useTopLeads(companyId: string | null, limit = 20) {
  return useQuery({
    queryKey: salesOSKeys.topLeads(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<LeadScoreContact[]> => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select(
          `id, full_name, company_name, lead_score, icp_score, icp_tier, source, city, assigned_to, last_activity_at`
        )
        .eq("company_id", companyId!)
        .gt("lead_score", 0)
        .order("lead_score", { ascending: false })
        .limit(limit);
      if (error) throw error;

      // Fetch open opportunity counts separately
      const contactIds = (data ?? []).map((c) => c.id);
      let oppCounts: Record<string, number> = {};
      if (contactIds.length > 0) {
        const { data: opps } = await supabase
          .from("marketing_opportunities")
          .select("contact_id")
          .in("contact_id", contactIds)
          .eq("company_id", companyId!)
          .eq("status", "open");
        (opps ?? []).forEach((o) => {
          oppCounts[o.contact_id!] = (oppCounts[o.contact_id!] || 0) + 1;
        });
      }

      return (data ?? []).map((c: any) => ({
        id: c.id,
        full_name: c.full_name,
        company_name: c.company_name,
        lead_score: c.lead_score ?? 0,
        icp_score: c.icp_score ?? 0,
        icp_tier: c.icp_tier,
        source: c.source,
        city: c.city,
        assigned_to: c.assigned_to,
        last_activity_at: c.last_activity_at,
        open_opportunities_count: oppCounts[c.id] ?? 0,
      }));
    },
    staleTime: 1000 * 60 * 10,
  });
}

// ============================================================
// MUTATIONS
// ============================================================

export function useUpdateOpportunityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        probability: number | null;
        expected_close_date: string | null;
        next_action: string | null;
        next_action_date: string | null;
        loss_reason: string | null;
        lost_reason_category: string | null;
        competitor_won: string | null;
        status: string;
      }>;
    }) => {
      const { error } = await supabase
        .from("marketing_opportunities")
        .update({ ...data, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesOSKeys.all });
      queryClient.invalidateQueries({ queryKey: ["marketing"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-opportunities"] });
    },
  });
}

export function useRecalculateLeadScore(companyId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contactId: string) => {
      const { data: contact, error: contactError } = await supabase
        .from("marketing_contacts")
        .select("id, full_name, company_name, phone, city, source, address")
        .eq("id", contactId)
        .single();
      if (contactError) throw contactError;

      const { count: activitiesCount } = await supabase
        .from("marketing_contact_activities")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contactId)
        .eq("company_id", companyId!);

      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      const { count: recentCount } = await supabase
        .from("marketing_contact_activities")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contactId)
        .eq("company_id", companyId!)
        .gte("created_at", fourteenDaysAgo);

      const { data: opps } = await supabase
        .from("marketing_opportunities")
        .select("id, status")
        .eq("contact_id", contactId)
        .eq("company_id", companyId!);

      const openOpps = (opps ?? []).filter((o) => o.status === "open");

      const { leadScore, icpScore } = calculateLeadScore({
        hasCompanyName: !!contact.company_name,
        hasPhone: !!contact.phone,
        hasAddress: !!(contact as any).address,
        source: contact.source,
        city: contact.city,
        activitiesCount: activitiesCount ?? 0,
        hasOpenOpportunity: openOpps.length > 0,
        hasRecentActivity: (recentCount ?? 0) > 0,
        opportunitiesCount: (opps ?? []).length,
      });

      const icpTier = getIcpTier(icpScore);

      const { error: updateError } = await supabase
        .from("marketing_contacts")
        .update({
          lead_score: leadScore,
          icp_score: icpScore,
          icp_tier: icpTier,
          last_score_update: new Date().toISOString(),
        } as any)
        .eq("id", contactId);
      if (updateError) throw updateError;

      return { leadScore, icpScore, icpTier };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesOSKeys.topLeads(companyId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });
    },
  });
}

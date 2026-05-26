/**
 * customerProfile — fetcher tipizzato per la view `customer_profile` (50+ campi).
 *
 * Usato sia dal client UI (Founder Cockpit) sia dalle edge functions agenti.
 * Helper hooks React Query inclusi.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HealthLabel = "champion" | "engaged" | "sleeping" | "at_risk" | "churned";
export type OnboardingPhase =
  | "kickoff"
  | "first_login"
  | "first_value"
  | "team_invited"
  | "integrated"
  | "graduated"
  | "stalled";

export interface CustomerProfile {
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_status: string;
  company_created_at: string;
  // Plan
  subscription_plan_id: string | null;
  plan_name: string | null;
  plan_price_monthly: number | null;
  stripe_subscription_status: string | null;
  payment_method: string | null;
  // Onboarding
  onboarding_phase: OnboardingPhase | null;
  onboarding_started_at: string | null;
  onboarding_graduated_at: string | null;
  days_since_signup: number;
  // Health (latest snapshot)
  health_score_latest: number | null;
  health_label_latest: HealthLabel | null;
  health_delta_7d: number | null;
  health_delta_30d: number | null;
  health_snapshot_date: string | null;
  // Usage 30d
  login_count_30d: number;
  unique_users_30d: number;
  session_minutes_30d: number;
  errors_30d: number;
  last_login_at: string | null;
  features_used_30d_count: number;
  // Interactions 30d
  tickets_opened_30d: number;
  emails_received_30d: number;
  angry_msgs_30d: number;
  last_interaction_at: string;
  sentiment_avg_30d: number | null;
  // NPS
  last_nps_score: number | null;
  last_nps_date: string | null;
  // Team
  team_size: number;
  // Computed flags
  is_at_risk: boolean;
  is_upsell_candidate: boolean;
}

export interface CustomerContext {
  profile: CustomerProfile;
  recent_interactions: Array<{
    id: string;
    channel: string;
    direction: "inbound" | "outbound";
    subject: string | null;
    body_preview: string | null;
    sentiment: string | null;
    ai_persona_key: string | null;
    occurred_at: string;
  }>;
  recent_events: Array<{
    event_name: string;
    category: string;
    occurred_at: string;
    properties: Record<string, unknown>;
  }>;
  fetched_at: string;
}

/** Hook React Query: profilo cliente singolo per Founder Cockpit / Company drawer. */
export function useCustomerProfile(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["customer-profile", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CustomerProfile | null> => {
      if (!companyId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data, error } = await sp
        .from("customer_profile")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CustomerProfile | null;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Hook React Query: lista profili (con filtro health label / onboarding phase). */
export function useCustomerProfiles(filters?: {
  healthLabel?: HealthLabel;
  onboardingPhase?: OnboardingPhase;
  atRisk?: boolean;
  upsellCandidate?: boolean;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["customer-profiles", filters],
    queryFn: async (): Promise<CustomerProfile[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      let q = sp.from("customer_profile").select("*");
      if (filters?.healthLabel) q = q.eq("health_label_latest", filters.healthLabel);
      if (filters?.onboardingPhase) q = q.eq("onboarding_phase", filters.onboardingPhase);
      if (filters?.atRisk !== undefined) q = q.eq("is_at_risk", filters.atRisk);
      if (filters?.upsellCandidate !== undefined) q = q.eq("is_upsell_candidate", filters.upsellCandidate);
      q = q.order("days_since_signup", { ascending: false });
      if (filters?.limit) q = q.limit(filters.limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CustomerProfile[];
    },
    staleTime: 60_000,
  });
}

/** Hook: customer context completo (profile + interactions + events) via RPC. */
export function useCustomerContext(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["customer-context", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CustomerContext | null> => {
      if (!companyId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const { data, error } = await sp.rpc("get_customer_context", {
        p_company_id: companyId,
      });
      if (error) throw error;
      return data as CustomerContext;
    },
    staleTime: 30_000,
  });
}

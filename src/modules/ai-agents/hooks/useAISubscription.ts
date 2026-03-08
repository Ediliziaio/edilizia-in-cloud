import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AISubscription {
  id: string;
  company_id: string;
  status: "trial" | "active" | "cancelled" | "paused";
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  price_eur: number;
}

export function useAISubscription() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const query = useQuery({
    queryKey: ["ai-subscription", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<AISubscription | null> => {
      const { data, error } = await supabase
        .from("ai_subscriptions" as never)
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as AISubscription | null;
    },
    refetchInterval: 60000,
  });

  const subscription = query.data;
  const now = new Date();

  const isActive =
    subscription?.status === "active" ||
    (subscription?.status === "trial" &&
      subscription.trial_ends_at &&
      new Date(subscription.trial_ends_at) > now);

  const isTrial = subscription?.status === "trial";
  const trialDaysLeft = isTrial && subscription?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - now.getTime()) / 86400000))
    : 0;

  return {
    ...query,
    subscription,
    isActive,
    isTrial,
    trialDaysLeft,
  };
}

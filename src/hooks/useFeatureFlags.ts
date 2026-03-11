import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";

interface FeatureFlag {
  key: string;
  name: string;
  description: string | null;
  category: string;
  is_beta: boolean;
  default_value: boolean;
  plans_included: string[];
  icon: string | null;
  sort_order: number;
  price_per_month: number | null;
}

interface FeatureOverride {
  feature_key: string;
  is_enabled: boolean;
  expires_at: string | null;
  override_reason: string | null;
}

type FlagSource = "override" | "plan" | "default";

interface ResolvedFlag {
  key: string;
  enabled: boolean;
  source: FlagSource;
  flag: FeatureFlag;
}

export function useFeatureFlags(companyIdOverride?: string) {
  const { effectiveCompany, role, isImpersonating } = useAuth();
  const companyId = companyIdOverride || effectiveCompany?.id;
  const planName = (effectiveCompany as any)?.subscription_plan?.name?.toLowerCase?.() ?? "";

  // Fetch all feature flags
  const { data: flags = [], isLoading: flagsLoading } = useQuery({
    queryKey: queryKeys.featureFlags.platform,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as FeatureFlag[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch company overrides
  const { data: overrides = [], isLoading: overridesLoading } = useQuery({
    queryKey: ["company-feature-overrides", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_feature_overrides")
        .select("feature_key, is_enabled, expires_at, override_reason")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data as FeatureOverride[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Super admin bypass
  const isSuperAdmin = role === "super_admin";
  const bypass = isSuperAdmin && isImpersonating;

  // Resolve flags
  const resolvedFlags: Record<string, ResolvedFlag> = {};
  for (const flag of flags) {
    const override = overrides.find((o) => o.feature_key === flag.key);
    const overrideValid =
      override && (!override.expires_at || new Date(override.expires_at) > new Date());

    let enabled: boolean;
    let source: FlagSource;

    if (overrideValid) {
      enabled = override.is_enabled;
      source = "override";
    } else if (flag.plans_included.length > 0 && planName && flag.plans_included.includes(planName)) {
      enabled = true;
      source = "plan";
    } else {
      enabled = flag.default_value;
      source = "default";
    }

    resolvedFlags[flag.key] = { key: flag.key, enabled, source, flag };
  }

  const isFeatureEnabled = (key: string): boolean => {
    if (bypass) return true;
    return resolvedFlags[key]?.enabled ?? false;
  };

  return {
    flags,
    overrides,
    resolvedFlags,
    isFeatureEnabled,
    isLoading: flagsLoading || overridesLoading,
  };
}

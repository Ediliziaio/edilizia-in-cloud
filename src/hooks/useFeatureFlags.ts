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

type FlagSource = "override" | "plan_default" | "plan" | "default" | "bypass";

interface ResolvedFlag {
  key: string;
  enabled: boolean;
  source: FlagSource;
  flag?: FeatureFlag;
}

interface FeatureOverrideRow {
  feature_key: string;
  is_enabled: boolean;
  expires_at: string | null;
  override_reason: string | null;
}

interface ResolvedRow {
  feature_key: string;
  is_enabled: boolean;
  source: string;
  limit_value: number | null;
  price_override: number | null;
  expires_at: string | null;
}

/**
 * Centralized feature gating hook.
 *
 * Delegates resolution to the DB RPC `resolve_company_features` so sidebar,
 * FeatureRoute guards and FeatureGate all agree on the same truth:
 *   override > plan.slug membership > default_value
 *
 * History: prior to 2026-04-17 this hook resolved client-side by comparing
 * `plan.name.toLowerCase()` against `plans_included`, while the RPC (used by
 * `useFeatureAccess` and `FeatureRoute`) compared against `plan.slug`. When
 * slug ≠ lowercase(name) the sidebar could hide a voice while the route was
 * open (or vice versa). Moving resolution server-side eliminates that drift.
 */
export function useFeatureFlags(companyIdOverride?: string) {
  const { effectiveCompany, role, isImpersonating, impersonatedCompanyId, impersonationToken } = useAuth();
  const companyId = companyIdOverride || effectiveCompany?.id;

  // Super admin bypass: covers the initial impersonation race where `role` has
  // not resolved yet but the impersonation session tokens are already present.
  const isSuperAdmin = role === "super_admin";
  const bypass = isSuperAdmin && (isImpersonating || (!!impersonatedCompanyId && !!impersonationToken));

  // Catalog: needed for display metadata (icon, category, name, description)
  // in consumers that introspect the flag list. No longer used for resolution.
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

  // Authoritative resolution via RPC (override > plan.slug > default_value).
  // staleTime 60s mirrors useFeatureAccess so both consumers invalidate in sync.
  const { data: resolved = [], isLoading: resolvedLoading } = useQuery({
    queryKey: queryKeys.featureFlags.companyResolved(companyId),
    queryFn: async () => {
      if (!companyId) return [] as ResolvedRow[];
      const { data, error } = await supabase.rpc("resolve_company_features", {
        p_company_id: companyId,
      });
      if (error) throw error;
      return (data ?? []) as ResolvedRow[];
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  // Build the legacy `resolvedFlags` shape so any future consumer that reads
  // `{ key, enabled, source, flag }` keeps working.
  const resolvedFlags: Record<string, ResolvedFlag> = {};
  const flagByKey = new Map(flags.map((f) => [f.key, f] as const));
  for (const row of resolved) {
    resolvedFlags[row.feature_key] = {
      key: row.feature_key,
      enabled: row.is_enabled,
      source: (row.source as FlagSource) ?? "default",
      flag: flagByKey.get(row.feature_key),
    };
  }
  // Catalog entries the RPC didn't emit (company with no plan, or flag added
  // after cache warmed up): fall back to the catalog's default_value so the
  // sidebar stays coherent instead of blanking out on a cold company record.
  for (const flag of flags) {
    if (!resolvedFlags[flag.key]) {
      resolvedFlags[flag.key] = {
        key: flag.key,
        enabled: flag.default_value ?? false,
        source: "default",
        flag,
      };
    }
  }

  const isFeatureEnabled = (key: string): boolean => {
    if (bypass) return true;
    return resolvedFlags[key]?.enabled ?? false;
  };

  // Derive the legacy `overrides` array from the RPC output for any pre-rewrite
  // consumer. `override_reason` is not emitted by the resolver; left as null.
  const overrides: FeatureOverrideRow[] = resolved
    .filter((r) => r.source === "override")
    .map((r) => ({
      feature_key: r.feature_key,
      is_enabled: r.is_enabled,
      expires_at: r.expires_at,
      override_reason: null,
    }));

  return {
    flags,
    overrides,
    resolvedFlags,
    isFeatureEnabled,
    isLoading: flagsLoading || resolvedLoading,
  };
}

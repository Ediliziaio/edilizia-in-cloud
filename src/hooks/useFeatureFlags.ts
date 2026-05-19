import { useCallback } from "react";
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
export type FeatureAccessLevel = "disabled" | "preview" | "enabled";

interface ResolvedFlag {
  key: string;
  enabled: boolean;
  /** Stato fine: disabled (nascosto) / preview (demo) / enabled (operativo). */
  accessLevel: FeatureAccessLevel;
  source: FlagSource;
  /** La feature supporta il preview mode (false per quelle che chiamano API a pagamento). */
  supportsPreview: boolean;
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
  /** v3 — può essere null se il DB non è ancora stato aggiornato. */
  access_level?: FeatureAccessLevel | null;
  source: string;
  limit_value: number | null;
  price_override: number | null;
  expires_at: string | null;
  supports_preview?: boolean | null;
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
  const {
    effectiveCompany,
    role,
    isImpersonating,
    isImpersonationReady,
    impersonatedCompanyId,
    impersonationToken,
  } = useAuth();
  const companyId = companyIdOverride || effectiveCompany?.id;

  // Super admin bypass hardened: ogni gate deve essere vero per attivare il
  // bypass. `isImpersonationReady` è il solo segnale confermato server-side
  // (AuthContext 567-572, post fetchUserData); senza di esso un attaccante
  // che scrive `sa_imp_company_id` in sessionStorage + cache profile con
  // role sbagliata potrebbe aprire tutte le feature prima della verifica async.
  const isSuperAdmin = role === "super_admin";
  const bypass =
    isSuperAdmin &&
    isImpersonationReady &&
    isImpersonating &&
    !!impersonatedCompanyId &&
    !!impersonationToken;

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
  //
  // v8.6.83 — Fallback CLIENT-SIDE per access_level finché il resolver SQL
  // non viene aggiornato a v3. Carichiamo plan_feature_defaults e overrides
  // separatamente e merging in JS, così non dipendiamo dal RETURN della RPC.
  const { data: resolved = [], isLoading: resolvedLoading } = useQuery({
    queryKey: queryKeys.featureFlags.companyResolved(companyId),
    queryFn: async () => {
      if (!companyId) return [] as ResolvedRow[];
      // 1) Risolvi via RPC (sorgente di verità per is_enabled)
      const rpcRes = await supabase.rpc("resolve_company_features", {
        p_company_id: companyId,
      });
      if (rpcRes.error) throw rpcRes.error;
      const rpcRows = (rpcRes.data ?? []) as ResolvedRow[];

      // 2) Se la RPC NON espone access_level (resolver v2 vecchio), patchamo
      //    leggendo direttamente plan_feature_defaults + company_feature_overrides.
      //    Costa 2 query extra ma rende il demo mode operativo subito.
      const hasAccessLevel = rpcRows.length > 0 && "access_level" in (rpcRows[0] as object);
      if (hasAccessLevel) return rpcRows;

      // Plan id corrente della company
      const { data: companyRow } = await supabase
        .from("companies")
        .select("subscription_plan_id")
        .eq("id", companyId)
        .maybeSingle();
      const planId = companyRow?.subscription_plan_id;

      const [pfdRes, ovRes] = await Promise.all([
        planId
          ? supabase
              .from("plan_feature_defaults")
              .select("feature_key, is_enabled, access_level")
              .eq("plan_id", planId)
          : Promise.resolve({ data: [] as Array<{ feature_key: string; is_enabled: boolean; access_level: string }>, error: null }),
        supabase
          .from("company_feature_overrides")
          .select("feature_key, is_enabled, access_level, expires_at")
          .eq("company_id", companyId),
      ]);
      const pfdByKey = new Map(
        (pfdRes.data ?? []).map((r) => [r.feature_key, r] as const),
      );
      const ovByKey = new Map(
        (ovRes.data ?? [])
          .filter((r) => !r.expires_at || new Date(r.expires_at) > new Date())
          .map((r) => [r.feature_key, r] as const),
      );
      // Annota access_level su ogni riga RPC
      return rpcRows.map((row) => {
        const ov = ovByKey.get(row.feature_key);
        const pd = pfdByKey.get(row.feature_key);
        const accessLevel =
          (ov?.access_level as FeatureAccessLevel | undefined) ??
          (pd?.access_level as FeatureAccessLevel | undefined) ??
          (row.is_enabled ? "enabled" : "disabled");
        return { ...row, access_level: accessLevel };
      });
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  // Build the legacy `resolvedFlags` shape so any future consumer that reads
  // `{ key, enabled, source, flag }` keeps working.
  const resolvedFlags: Record<string, ResolvedFlag> = {};
  const flagByKey = new Map(flags.map((f) => [f.key, f] as const));
  for (const row of resolved) {
    // Derivazione access_level retro-compatibile: se il DB non lo espone (resolver
    // vecchio), deriviamo da is_enabled.
    const derivedLevel: FeatureAccessLevel =
      row.access_level ?? (row.is_enabled ? "enabled" : "disabled");
    resolvedFlags[row.feature_key] = {
      key: row.feature_key,
      enabled: row.is_enabled,
      accessLevel: derivedLevel,
      supportsPreview: row.supports_preview ?? true,
      source: (row.source as FlagSource) ?? "default",
      flag: flagByKey.get(row.feature_key),
    };
  }
  // Catalog entries the RPC didn't emit (company with no plan, or flag added
  // after cache warmed up): fall back to the catalog's default_value so the
  // sidebar stays coherent instead of blanking out on a cold company record.
  for (const flag of flags) {
    if (!resolvedFlags[flag.key]) {
      const enabled = flag.default_value ?? false;
      resolvedFlags[flag.key] = {
        key: flag.key,
        enabled,
        accessLevel: enabled ? "enabled" : "disabled",
        supportsPreview: true,
        source: "default",
        flag,
      };
    }
  }

  // v8.6.93 — memoizzate per stabilità referenziale.
  // Consumer in deps di useCallback/useEffect (es. CompanyLayout.filterNavItems)
  // non re-renderizzano in loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const isFeatureEnabled = useCallback((key: string): boolean => {
    if (bypass) return true;
    return resolvedFlags[key]?.enabled ?? false;
  }, [bypass, resolved]);

  /** True se la feature è in modalità DEMO (visibile ma azioni bloccate). */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const isFeaturePreview = useCallback((key: string): boolean => {
    if (bypass) return false;
    return resolvedFlags[key]?.accessLevel === "preview";
  }, [bypass, resolved]);

  /** True se la feature deve essere visibile in sidebar (enabled OR preview). */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const isFeatureVisible = useCallback((key: string): boolean => {
    if (bypass) return true;
    const lvl = resolvedFlags[key]?.accessLevel;
    return lvl === "enabled" || lvl === "preview";
  }, [bypass, resolved]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getFeatureAccessLevel = useCallback((key: string): FeatureAccessLevel => {
    if (bypass) return "enabled";
    return resolvedFlags[key]?.accessLevel ?? "disabled";
  }, [bypass, resolved]);

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
    isFeaturePreview,
    isFeatureVisible,
    getFeatureAccessLevel,
    isLoading: flagsLoading || resolvedLoading,
  };
}

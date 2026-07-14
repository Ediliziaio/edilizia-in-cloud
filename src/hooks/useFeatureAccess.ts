import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { createTimeoutSignal } from "@/lib/query-timeout";
import { queryKeys } from "@/lib/queryKeys";
import { DEMO_COMPANY_ID } from "@/lib/constants/demoCompany";
import { useImpersonationClientView } from "@/hooks/useImpersonationView";

const FEATURE_ACCESS_TIMEOUT_MS = 10_000;
const FEATURE_ACCESS_QUERY_META = { silent: true } as const;

/**
 * Hook unificato per il gating delle feature.
 *
 * Sorgente unica di verità: RPC `resolve_company_feature` (lato DB).
 * Risolve una singola feature con logica override > plan default > default_value,
 * restituendo anche limit_value e source per UI diagnostica.
 *
 * Ordine di fallback:
 *   1. Se l'utente è super_admin in sessione di impersonation → isEnabled=true
 *   2. Altrimenti RPC su (companyId, featureKey)
 *
 * Pattern d'uso:
 *   const { isEnabled, limit, source, isLoading } = useFeatureAccess("export_pdf");
 *   if (isLoading) return <Spinner />;
 *   if (!isEnabled) return <UpgradePrompt />;
 */
/**
 * v8.6.62 — Tri-state feature access:
 *   - enabled:  uso pieno (default per super_admin / azienda con piano)
 *   - preview:  UI visibile in modalità demo, ogni azione bloccata da popup
 *               "Sblocca contattando il consulente"
 *   - disabled: feature nascosta (rotte protette redirigono /azienda/upgrade)
 */
export type FeatureAccessLevel = "disabled" | "preview" | "enabled";

export interface FeatureAccess {
  isEnabled: boolean;
  /** Tri-state esplicito — preferisci questo a isEnabled per le nuove implementazioni. */
  accessLevel: FeatureAccessLevel;
  /** True se la feature è in modalità preview (vede UI, click bloccati). */
  isPreview: boolean;
  /** True se la feature supporta preview mode (alcune feature a consumo non lo supportano). */
  supportsPreview: boolean;
  /**
   * Origine della decisione di gating:
   *   - override:     company_feature_overrides attivo
   *   - plan_default: plan_feature_defaults (tabella esplicita per-piano)
   *   - plan:         fallback legacy platform_feature_flags.plans_included[]
   *   - default:      default_value globale / feature sconosciuta
   *   - bypass:       super_admin in sessione di impersonation
   */
  source: "override" | "plan_default" | "plan" | "default" | "bypass";
  limit: number | null;
  priceOverride: number | null;
  expiresAt: string | null;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  errorMessage: string | null;
  refetch: () => void;
}

// Shape della riga ritornata da RPC `resolve_company_feature` lato DB.
// v8.6.62 — esteso con access_level + supports_preview.
interface ResolveRow {
  is_enabled: boolean;
  access_level: FeatureAccessLevel;
  source: "override" | "plan_default" | "plan" | "default";
  limit_value: number | null;
  price_override: number | null;
  expires_at: string | null;
  supports_preview: boolean;
}

interface ResolvedFeatureRow extends ResolveRow {
  feature_key: string;
}

const normalizeSource = (source: string | null | undefined): ResolveRow["source"] => {
  if (source === "override" || source === "plan_default" || source === "plan") {
    return source;
  }
  return "default";
};

const normalizeAccessLevel = (level: string | null | undefined, isEnabled: boolean): FeatureAccessLevel => {
  if (level === "enabled" || level === "preview" || level === "disabled") return level;
  // Fallback se RPC non ritorna access_level (pre-migration): derivo da is_enabled
  return isEnabled ? "enabled" : "disabled";
};

const normalizeResolvedFeatureRow = (row: ResolvedFeatureRow | undefined): ResolveRow | null => {
  if (!row) return null;
  const isEnabled = Boolean(row.is_enabled);
  return {
    is_enabled: isEnabled,
    access_level: normalizeAccessLevel(row.access_level, isEnabled),
    source: normalizeSource(row.source),
    limit_value: row.limit_value ?? null,
    price_override: row.price_override ?? null,
    expires_at: row.expires_at ?? null,
    supports_preview: row.supports_preview ?? true,
  };
};

export function useFeatureAccess(
  featureKey: string,
  companyIdOverride?: string,
): FeatureAccess {
  const {
    effectiveCompany,
    role,
    isImpersonating,
    isImpersonationReady,
    impersonatedCompanyId,
    impersonationToken,
    selectedMultiCompanyId,
    profile,
    isLoading: authLoading,
  } = useAuth();
  const companyId =
    companyIdOverride ||
    effectiveCompany?.id ||
    selectedMultiCompanyId ||
    impersonatedCompanyId ||
    profile?.company_id ||
    undefined;

  // Bypass sa-impersonation: richiede TUTTE queste condizioni per evitare che
  // un attaccante che scrive in sessionStorage attivi il bypass prima che la
  // verifica server-side del ruolo super_admin sia stata completata.
  //   - role === "super_admin" (dallo state dopo fetchUserData)
  //   - isImpersonationReady=true (gate server-confirmed in AuthContext:567-572)
  //   - isImpersonating=true (company ID + validazione attiva)
  //   - impersonationToken presente (ed usato dal client come auth header)
  const isSuperAdmin = role === "super_admin";
  const directSuperAdminBypass =
    isSuperAdmin &&
    !isImpersonating &&
    !impersonatedCompanyId &&
    !impersonationToken;
  const impersonationSuperAdminBypass =
    isSuperAdmin &&
    isImpersonationReady &&
    isImpersonating &&
    !!impersonatedCompanyId &&
    !!impersonationToken;
  const isDemoBaseline = companyId === DEMO_COMPANY_ID;
  // "Vista cliente": in impersonation il super admin può rinunciare al bypass
  // per vedere le feature esattamente come il piano le dà al cliente.
  const clientView = useImpersonationClientView();
  const bypass =
    isDemoBaseline ||
    directSuperAdminBypass ||
    (impersonationSuperAdminBypass && !clientView);

  // La sidebar usa già `resolve_company_features`; sottoscriverci alla stessa
  // query evita una seconda verifica fragile al primo mount della route. Se il
  // resolver bulk ha già risposto, il guard può decidere subito senza mostrare
  // falsi timeout; se non ha dati, resta il fallback fail-closed sulla RPC
  // singola sotto.
  const {
    data: resolvedFeatures = [],
    isLoading: resolvedFeaturesLoading,
    isFetching: resolvedFeaturesFetching,
    isError: resolvedFeaturesError,
    error: resolvedFeaturesErrorObj,
    refetch: refetchResolvedFeatures,
  } = useQuery<ResolvedFeatureRow[], Error>({
    queryKey: queryKeys.featureFlags.companyResolved(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const timeout = createTimeoutSignal(FEATURE_ACCESS_TIMEOUT_MS);
      try {
        const { data, error } = await supabase
          .rpc("resolve_company_features", {
            p_company_id: companyId,
          })
          .abortSignal(timeout.signal);
        if (error) throw error;
        return (data ?? []) as ResolvedFeatureRow[];
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!companyId && !bypass,
    staleTime: 60 * 1000,
    retry: 0,
    meta: FEATURE_ACCESS_QUERY_META,
  });

  const resolvedFeature = normalizeResolvedFeatureRow(
    resolvedFeatures.find((row) => row.feature_key === featureKey),
  );
  const shouldRunSingleFeatureFallback =
    !!companyId &&
    !!featureKey &&
    !bypass &&
    !resolvedFeature &&
    !resolvedFeaturesLoading;

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<ResolveRow | null, Error>({
    queryKey: ["feature-access", companyId, featureKey],
    queryFn: async () => {
      if (!companyId) return null;
      // Cast sui parametri RPC: il tipo generato di supabase-js è unione discriminata
      // di tutte le RPC — qui specializziamo al nostro payload senza `any`.
      const timeout = createTimeoutSignal(FEATURE_ACCESS_TIMEOUT_MS);
      try {
        const { data, error } = await supabase.rpc(
          "resolve_company_feature" as never,
          {
            p_company_id: companyId,
            p_feature_key: featureKey,
          } as never,
        ).abortSignal(timeout.signal);
        if (error) throw error;
        // La RPC ritorna SETOF RECORD → client normalizza ad array o singolo.
        const row: ResolveRow | null = Array.isArray(data)
          ? ((data[0] as ResolveRow | undefined) ?? null)
          : ((data as ResolveRow | null) ?? null);
        return row;
      } finally {
        timeout.dispose();
      }
    },
    enabled: shouldRunSingleFeatureFallback,
    staleTime: 60 * 1000, // 1 min — override cambiano raramente ma bisogna reagire veloce
    retry: false,
    meta: FEATURE_ACCESS_QUERY_META,
  });

  if (bypass) {
    return {
      isEnabled: true,
      accessLevel: "enabled",
      isPreview: false,
      supportsPreview: true,
      source: "bypass",
      limit: null,
      priceOverride: null,
      expiresAt: null,
      isLoading: false,
      isError: false,
      isFetching: false,
      errorMessage: null,
      refetch: () => undefined,
    };
  }

  const effectiveData = resolvedFeature ?? data ?? null;
  const effectiveError = error?.message ?? resolvedFeaturesErrorObj?.message ?? null;
  const effectiveIsError = !effectiveData && (isError || resolvedFeaturesError);
  const shouldWaitForAuth = authLoading && !companyId;

  const accessLevel: FeatureAccessLevel =
    effectiveData?.access_level ??
    (effectiveData?.is_enabled ? "enabled" : "disabled");

  return {
    isEnabled: Boolean(effectiveData?.is_enabled) || accessLevel === "enabled",
    accessLevel,
    isPreview: accessLevel === "preview",
    supportsPreview: effectiveData?.supports_preview ?? true,
    source: (effectiveData?.source as FeatureAccess["source"]) ?? "default",
    limit: effectiveData?.limit_value ?? null,
    priceOverride: effectiveData?.price_override ?? null,
    expiresAt: effectiveData?.expires_at ?? null,
    isLoading: shouldWaitForAuth || (!effectiveData && (resolvedFeaturesLoading || isLoading)),
    isError: effectiveIsError,
    isFetching: resolvedFeaturesFetching || isFetching,
    errorMessage: effectiveIsError ? effectiveError : null,
    refetch: () => {
      void refetchResolvedFeatures();
      void refetch();
    },
  };
}

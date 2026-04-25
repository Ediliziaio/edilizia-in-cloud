import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { withClientTimeout } from "@/lib/query-timeout";

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
export interface FeatureAccess {
  isEnabled: boolean;
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
    isLoading: authLoading,
  } = useAuth();
  const companyId = companyIdOverride || effectiveCompany?.id;

  // Bypass sa-impersonation: richiede TUTTE queste condizioni per evitare che
  // un attaccante che scrive in sessionStorage attivi il bypass prima che la
  // verifica server-side del ruolo super_admin sia stata completata.
  //   - role === "super_admin" (dallo state dopo fetchUserData)
  //   - isImpersonationReady=true (gate server-confirmed in AuthContext:567-572)
  //   - isImpersonating=true (company ID + validazione attiva)
  //   - impersonationToken presente (ed usato dal client come auth header)
  const isSuperAdmin = role === "super_admin";
  const bypass =
    isSuperAdmin &&
    isImpersonationReady &&
    isImpersonating &&
    !!impersonatedCompanyId &&
    !!impersonationToken;

  // Shape della riga ritornata da RPC `resolve_company_feature` lato DB.
  // Se la feature è sconosciuta la RPC ritorna comunque una riga con
  // `is_enabled=false, source='default'` → fail-closed.
  interface ResolveRow {
    is_enabled: boolean;
    source: "override" | "plan_default" | "plan" | "default";
    limit_value: number | null;
    price_override: number | null;
    expires_at: string | null;
  }

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<ResolveRow | null, Error>({
    queryKey: ["feature-access", companyId, featureKey],
    queryFn: async () => {
      if (!companyId) return null;
      // Cast sui parametri RPC: il tipo generato di supabase-js è unione discriminata
      // di tutte le RPC — qui specializziamo al nostro payload senza `any`.
      const { data, error } = await withClientTimeout(
        supabase.rpc(
          "resolve_company_feature" as never,
          {
            p_company_id: companyId,
            p_feature_key: featureKey,
          } as never,
        ),
        `Verifica accesso ${featureKey}`,
      );
      if (error) throw error;
      // La RPC ritorna SETOF RECORD → client normalizza ad array o singolo.
      const row: ResolveRow | null = Array.isArray(data)
        ? ((data[0] as ResolveRow | undefined) ?? null)
        : ((data as ResolveRow | null) ?? null);
      return row;
    },
    enabled: !!companyId && !!featureKey && !bypass,
    staleTime: 60 * 1000, // 1 min — override cambiano raramente ma bisogna reagire veloce
  });

  if (bypass) {
    return {
      isEnabled: true,
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

  return {
    isEnabled: Boolean(data?.is_enabled),
    source: (data?.source as FeatureAccess["source"]) ?? "default",
    limit: data?.limit_value ?? null,
    priceOverride: data?.price_override ?? null,
    expiresAt: data?.expires_at ?? null,
    isLoading: authLoading || isLoading,
    isError,
    isFetching,
    errorMessage: error?.message ?? null,
    refetch: () => { void refetch(); },
  };
}

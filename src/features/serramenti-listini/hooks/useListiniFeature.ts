/**
 * Hook wrapper: true se la feature 'listini_serramenti_avanzati' è attiva
 * per l'azienda corrente. Usato come gate per sidebar/route/componenti del
 * modulo listini serramenti.
 *
 * Fonte di verità: platform_feature_flags + company_feature_overrides
 * (via useFeatureFlags → resolve_company_features RPC).
 */

import { useFeatureFlags } from "@/hooks/useFeatureFlags";

export const LISTINI_SERRAMENTI_FEATURE_KEY = "listini_serramenti_avanzati";

export function useListiniFeature() {
  const { isFeatureEnabled, isLoading } = useFeatureFlags();
  return {
    enabled: isFeatureEnabled(LISTINI_SERRAMENTI_FEATURE_KEY),
    isLoading,
  };
}

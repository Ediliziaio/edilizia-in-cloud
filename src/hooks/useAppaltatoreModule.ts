/**
 * useAppaltatoreModule — feature-gate helper per il modulo Appaltatori.
 *
 * Il "Modulo Appaltatori" sblocca:
 *   - Tipo cliente "Appaltatore" nella scheda Cliente (impresa committente)
 *   - Tipo ordine "Lavoro per appaltatore" (sola manodopera) con campi
 *     dedicati: indirizzo cantiere, descrizione lavoro, posizione materiali,
 *     date inizio/fine.
 *
 * Sblocco esclusivo: solo i superadmin possono attivare questo flag per una
 * specifica company via `company_feature_overrides` (UI in /admin/FeatureFlags).
 * Le aziende che non hanno l'override NON vedono ALCUNA modifica UI.
 *
 * Naming convention: il flag DB è `appaltatore_module` (vedi migration
 * 20261228000000_appaltatore_module_foundation.sql).
 */
import { useFeatureFlags } from "./useFeatureFlags";

export const APPALTATORE_MODULE_FLAG = "appaltatore_module" as const;

/**
 * Ritorna true se la company corrente ha il modulo Appaltatori sbloccato.
 * Usa la RPC `resolve_company_features` lato DB (override > plan > default).
 *
 * Esempio:
 *
 *   const appaltatoreEnabled = useAppaltatoreModuleEnabled();
 *   if (!appaltatoreEnabled) return <CreateOrderStandard />;
 *   return <OrderTypeChoice />;
 */
export function useAppaltatoreModuleEnabled(): boolean {
  const { isFeatureEnabled } = useFeatureFlags();
  return isFeatureEnabled(APPALTATORE_MODULE_FLAG);
}

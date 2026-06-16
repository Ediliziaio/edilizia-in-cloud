import { useMemo } from "react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import {
  MODULI_VENDITA,
  deriveModuloStato,
  type ModuloVendutaConfig,
  type ModuloStato,
} from "./config";

/**
 * Vista "data + UI state" per la card di un singolo modulo.
 */
export interface ModuloVenditaView {
  modulo: ModuloVendutaConfig;
  stato: ModuloStato;
  isEnabled: boolean;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  /** Origine della decisione (override/plan/default/bypass) per diagnostics. */
  source: "override" | "plan_default" | "plan" | "default" | "bypass";
}

export interface UseModuliVenditaResult {
  moduli: ModuloVenditaView[];
  isLoading: boolean;
  isError: boolean;
  /** Numero di moduli attualmente attivi per la company (escluso bypass admin). */
  countAttivi: number;
}

/**
 * Hook che risolve in parallelo i 7 feature flag dei moduli di vendita
 * verticali per la company corrente e produce le view-model pronte da
 * renderizzare nel grid del tab "Moduli Vendita".
 *
 * Implementazione: chiama 7 useFeatureAccess in ordine fisso (regola degli
 * hook React rispettata grazie alla lista statica MODULI_VENDITA readonly).
 *
 * Performance: ogni useFeatureAccess è cached da React Query con la stessa
 * chiave già usata in tutta l'app, quindi le chiamate sono deduplicated
 * cross-component senza richieste extra.
 */
export function useModuliVendita(): UseModuliVenditaResult {
  // ⚠️ La lista MODULI_VENDITA è readonly e statica: l'ordine non cambia mai
  // tra render. Questo garantisce la stability della chiamata hooks.
  const fotovoltaico = useFeatureAccess(MODULI_VENDITA[0].flag);
  const serramenti = useFeatureAccess(MODULI_VENDITA[1].flag);
  const ristrutturazione = useFeatureAccess(MODULI_VENDITA[2].flag);
  const tetti = useFeatureAccess(MODULI_VENDITA[3].flag);
  const bagni = useFeatureAccess(MODULI_VENDITA[4].flag);
  const cappotto = useFeatureAccess(MODULI_VENDITA[5].flag);
  const pompeCalore = useFeatureAccess(MODULI_VENDITA[6].flag);

  const accessByIndex = useMemo(
    () => [fotovoltaico, serramenti, ristrutturazione, tetti, bagni, cappotto, pompeCalore],
    [fotovoltaico, serramenti, ristrutturazione, tetti, bagni, cappotto, pompeCalore],
  );

  return useMemo<UseModuliVenditaResult>(() => {
    const moduli: ModuloVenditaView[] = MODULI_VENDITA.map((modulo, index) => {
      const access = accessByIndex[index];
      return {
        modulo,
        stato: deriveModuloStato(modulo, access.isEnabled),
        isEnabled: access.isEnabled,
        isLoading: access.isLoading,
        isError: access.isError,
        errorMessage: access.errorMessage,
        source: access.source,
      };
    });

    const isLoading = accessByIndex.some((a) => a.isLoading);
    const isError = accessByIndex.every((a) => a.isError);
    const countAttivi = moduli.filter((m) => m.stato === "attivo").length;

    return { moduli, isLoading, isError, countAttivi };
  }, [accessByIndex]);
}

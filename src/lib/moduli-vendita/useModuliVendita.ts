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
 * Hook che risolve in parallelo i feature flag di TUTTI i moduli di vendita
 * verticali del catalogo `MODULI_VENDITA` per la company corrente e produce
 * le view-model pronte da renderizzare.
 *
 * Implementazione: chiama un `useFeatureAccess` per ogni entry del catalogo in
 * ordine fisso (regola degli hook React rispettata grazie alla lista statica
 * `MODULI_VENDITA` readonly, la cui lunghezza non cambia tra render).
 *
 * ⚠️ MANUTENZIONE: il numero di chiamate `useFeatureAccess` qui sotto DEVE
 * restare uguale a `MODULI_VENDITA.length`. Se aggiungi un modulo al catalogo,
 * aggiungi anche la riga corrispondente qui. Un guard in DEV segnala il
 * disallineamento e il `.filter` finale evita comunque il crash a runtime.
 *
 * Performance: ogni useFeatureAccess condivide la stessa query bulk
 * `resolve_company_features` (cache React Query), quindi N chiamate NON
 * generano N richieste: la risoluzione è un'unica fetch deduplicata.
 */
export function useModuliVendita(): UseModuliVenditaResult {
  // ⚠️ La lista MODULI_VENDITA è readonly e statica: l'ordine e la lunghezza
  // non cambiano mai tra render → stability della chiamata hooks garantita.
  const a0 = useFeatureAccess(MODULI_VENDITA[0].flag);
  const a1 = useFeatureAccess(MODULI_VENDITA[1].flag);
  const a2 = useFeatureAccess(MODULI_VENDITA[2].flag);
  const a3 = useFeatureAccess(MODULI_VENDITA[3].flag);
  const a4 = useFeatureAccess(MODULI_VENDITA[4].flag);
  const a5 = useFeatureAccess(MODULI_VENDITA[5].flag);
  const a6 = useFeatureAccess(MODULI_VENDITA[6].flag);
  const a7 = useFeatureAccess(MODULI_VENDITA[7].flag);
  const a8 = useFeatureAccess(MODULI_VENDITA[8].flag);
  const a9 = useFeatureAccess(MODULI_VENDITA[9].flag);
  const a10 = useFeatureAccess(MODULI_VENDITA[10].flag);
  const a11 = useFeatureAccess(MODULI_VENDITA[11].flag);

  const accessByIndex = useMemo(
    () => [a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11],
    [a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11],
  );

  return useMemo<UseModuliVenditaResult>(() => {
    if (import.meta.env.DEV && accessByIndex.length !== MODULI_VENDITA.length) {
      console.error(
        `useModuliVendita: risolti ${accessByIndex.length} flag ma MODULI_VENDITA ne ha ${MODULI_VENDITA.length}. ` +
          "Aggiungi/rimuovi le chiamate useFeatureAccess per riallineare.",
      );
    }

    const moduli: ModuloVenditaView[] = MODULI_VENDITA
      .map((modulo, index): ModuloVenditaView | null => {
        const access = accessByIndex[index];
        // Guard difensivo: se il catalogo cresce oltre le chiamate hook fisse,
        // omettiamo il modulo non risolto invece di crashare (undefined.isEnabled).
        if (!access) return null;
        return {
          modulo,
          stato: deriveModuloStato(modulo, access.isEnabled),
          isEnabled: access.isEnabled,
          isLoading: access.isLoading,
          isError: access.isError,
          errorMessage: access.errorMessage,
          source: access.source,
        };
      })
      .filter((m): m is ModuloVenditaView => m !== null);

    const isLoading = accessByIndex.some((acc) => acc.isLoading);
    const isError = accessByIndex.every((acc) => acc.isError);
    const countAttivi = moduli.filter((m) => m.stato === "attivo").length;

    return { moduli, isLoading, isError, countAttivi };
  }, [accessByIndex]);
}

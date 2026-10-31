import { useMemo } from "react";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useVociPrevisteFasi } from "@/hooks/useVociPrevisteFasi";
import { economiaFasi } from "@/lib/orders/economiaFasi";

/**
 * Il costo previsto di tutta la commessa con lo STESSO calcolo della scheda
 * Lavorazioni (economiaFasi), e con le stesse query, quindi la stessa cache:
 * le lavorazioni più quello che non sta in nessuna fase. Solo il previsto: il
 * consuntivo della commessa lo dà v_ordine_marginalita.
 */
export function useCostoPrevistoCommessa(orderId: string, abilitato: boolean) {
  const { phases, materials, allAssignments, isLoading, isError } = useOrderWorkPhases(abilitato ? orderId : undefined);
  const voci = useVociPrevisteFasi(orderId, abilitato);
  const economia = useMemo(
    () => economiaFasi({ fasi: phases, righe: materials, assegnazioni: allAssignments, vociPreviste: voci.data }),
    [phases, materials, allAssignments, voci.data],
  );
  const lavorazioniSenzaPrevisto = useMemo(
    () => [...economia.perFase.values()].filter((f) => f.costoPrevisto <= 0).length,
    [economia],
  );
  return {
    costo: economia.totaleFasi.costoPrevisto + economia.senzaFase.costoPrevisto,
    lavorazioni: phases.length,
    lavorazioniSenzaPrevisto,
    isLoading: isLoading || voci.isLoading,
    isError: isError || voci.isError,
  };
}

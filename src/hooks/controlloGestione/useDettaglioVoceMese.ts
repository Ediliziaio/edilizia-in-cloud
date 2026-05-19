/**
 * Drill-down: dettaglio movimenti per (codice voce CE, anno, mese).
 *
 * Usa cg_get_dettaglio_voce_mese_safe (gated dal feature flag).
 * Restituisce:
 *   - meta:           etichette + totale aggregato
 *   - raggruppamento: sub-righe Excel-style per voce_chiave / cliente / dipendente
 *   - righe:          movimenti singoli (fattura, costo, cedolino, cespite…)
 */

import { useQuery } from "@tanstack/react-query";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";

export interface DettaglioRiga {
  id: string;
  source_table: "company_costs" | "bank_transactions" | "prima_nota" | "invoices" | "cedolini" | "cespiti";
  data: string;
  descrizione: string;
  controparte: string | null;
  voce_chiave: string | null;
  categoria: string | null;
  importo: number;
}

export interface DettaglioRaggruppamento {
  etichetta: string;
  totale: number;
  count: number;
}

export interface DettaglioVoceMeseResult {
  meta: {
    company_id: string;
    anno: number;
    mese: number;
    codice: string;
    label: string;
    totale: number;
    macro_voce: string | null;
    has_cedolini: boolean;
    generato_il: string;
  };
  raggruppamento: DettaglioRaggruppamento[];
  righe: DettaglioRiga[];
}

/** Codici CE per i quali NON ha senso fare drill-down (subtotali / voci stub). */
const CODICI_NO_DRILL = new Set([
  "02", "04", "15",
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "L",
]);

export function isDrillDownEnabled(codice: string): boolean {
  return !CODICI_NO_DRILL.has(codice);
}

export function useDettaglioVoceMese(
  anno: number,
  mese: number | null,
  codice: string | null,
) {
  const enabled =
    codice !== null &&
    isDrillDownEnabled(codice);

  return useQuery({
    queryKey: ["cg", "dettaglio-voce-mese", anno, mese, codice] as const,
    enabled,
    queryFn: async (): Promise<DettaglioVoceMeseResult> => {
            const { data, error } = await cgRpc("cg_get_dettaglio_voce_mese_safe", { p_anno: anno, p_mese: mese, p_codice: codice });
      if (error) throw error;
      return data as unknown as DettaglioVoceMeseResult;
    },
    staleTime: 60_000,
  });
}

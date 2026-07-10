/**
 * Hook React Query — Piano Industriale (proiezione 3/5/7 anni) + What-If.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";

export type PianoScenario = "prudente" | "base" | "aggressivo" | "custom";

export interface PianoPeriodo {
  tipo: "consuntivo" | "proiezione";
  anno: number;
  t: number;
  ricavi: number;
  costi_var: number;
  costi_fissi: number;
  ebitda: number;
  ammortamenti: number;
  oneri_finanziari: number;
  utile: number;
  cespiti: number;
  mezzi_propri: number;
  debito_mlt: number;
  investimento_anno?: number;
  rating_score?: number;
  rating_classe?: string;
  crescita_ricavi_pct?: number;
}

export interface PianoResult {
  meta: {
    company_id: string;
    scenario: PianoScenario;
    assumption_id: string;
    anno_base: number;
    orizzonte: number;
    tasso_debito_pct: number;
    aliquota_imposte_pct: number;
  };
  periodi: PianoPeriodo[];
}

/**
 * Proiezione del piano per una riga di assunzioni (scenario).
 * `assumptionId` null = scenario predefinito lato DB (is_default).
 * PRIMA la RPC veniva chiamata SENZA argomenti: il toggle
 * Prudente/Base/Aggressivo cambiava solo il titolo mentre i numeri
 * restavano sempre quelli dello scenario default.
 */
export function usePianoIndustriale(assumptionId: string | null = null) {
  return useQuery({
    queryKey: queryKeys.controlloGestione.piano(assumptionId),
    queryFn: async (): Promise<PianoResult> => {
      const { data, error } = await cgRpc("cg_simula_piano_safe", {
        p_assumption_id: assumptionId ?? null,
      });
      if (error) throw error;
      return data as unknown as PianoResult;
    },
    staleTime: 10 * 60_000,
  });
}

export interface WhatIfInput {
  override_crescita_pct?: number;
  override_margine_pct?: number;
  override_investimento?: number;
  orizzonte?: number;
  assumption_id?: string;
}

export function useWhatIfMutation() {
  return useMutation({
    mutationFn: async (input: WhatIfInput): Promise<PianoResult> => {
            const { data, error } = await cgRpc("cg_simulazione_what_if", {
        p_override_crescita_pct: input.override_crescita_pct ?? null,
        p_override_margine_pct: input.override_margine_pct ?? null,
        p_override_investimento: input.override_investimento ?? null,
        p_orizzonte: input.orizzonte ?? null,
        p_assumption_id: input.assumption_id ?? null,
      });
      if (error) throw error;
      return data as unknown as PianoResult;
    },
  });
}

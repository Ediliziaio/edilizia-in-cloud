/**
 * Hook React Query — Piano Industriale (proiezione 3/5/7 anni) + What-If.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

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

export function usePianoIndustriale(scenario: PianoScenario = "base", orizzonte = 5) {
  return useQuery({
    queryKey: queryKeys.controlloGestione.piano(scenario, orizzonte),
    queryFn: async (): Promise<PianoResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("cg_simula_piano_safe", {});
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("cg_simulazione_what_if", {
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

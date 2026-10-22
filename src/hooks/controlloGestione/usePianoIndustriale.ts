/**
 * Hook React Query — Piano Industriale (proiezione 3/5/7 anni) + What-If.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

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
  /** Solo anno base: il rating è quello della scheda Rating (validato o no). */
  rating_attendibile?: boolean;
  /** Solo anno base: anno in corso riportato a fine anno. */
  stimato_fine_anno?: boolean;
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
    /** Dalla migrazione 20281022104500. */
    base_stimata_fine_anno?: boolean;
    giorni_base?: number;
    sp_base_quadrato?: boolean;
    sp_base_differenza?: number;
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
export function usePianoIndustriale(assumptionId: string | null = null, annoPartenza: number | null = null) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    // Con l'azienda nella chiave: cambiando azienda (accesso multi-azienda o
    // super admin) non si vede per 10 minuti il piano dell'altra.
    queryKey: [...queryKeys.controlloGestione.piano(assumptionId), annoPartenza ?? "scenario", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<PianoResult> => {
      const { data, error } = await cgRpc("cg_simula_piano_safe", {
        p_assumption_id: assumptionId ?? null,
        p_anno_partenza: annoPartenza,
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
  /** Anno di partenza scelto in pagina (null = quello dello scenario). */
  anno_partenza?: number | null;
}

export function useWhatIfMutation() {
  return useMutation({
    mutationFn: async (input: WhatIfInput): Promise<PianoResult> => {
      const args: Record<string, unknown> = {
        p_override_crescita_pct: input.override_crescita_pct ?? null,
        p_override_margine_pct: input.override_margine_pct ?? null,
        p_override_investimento: input.override_investimento ?? null,
        p_orizzonte: input.orizzonte ?? null,
        p_assumption_id: input.assumption_id ?? null,
      };
      // Solo se scelto: le versioni del database prima della migrazione
      // 20281022104500 non conoscono il parametro.
      if (input.anno_partenza != null) args.p_anno_partenza = input.anno_partenza;
      const { data, error } = await cgRpc("cg_simulazione_what_if", args);
      if (error) throw error;
      return data as unknown as PianoResult;
    },
  });
}

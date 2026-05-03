/**
 * Hook React Query per le RPC del modulo Controllo di Gestione.
 *
 * - useCEriclassificato — CE riclassificato (cascata 25 voci con codici 01..L)
 * - useBEP              — Break Even Point + giorno/data raggiunto
 * - useCEMensile        — andamento mensile cumulato (chart vendite/costi/BEP)
 *
 * Tutte le RPC sono SECURITY DEFINER e applicano internamente il filtro
 * `company_id = get_my_company_id()`. Lato client non passiamo `p_company_id`
 * (lasciamo che la RPC risolva da auth.uid()).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

// ── Types ────────────────────────────────────────────────────────────────────

export type VoceCEtipo = "voce" | "subtot" | "subtot_grasso";

export interface VoceCE {
  codice: string;
  label: string;
  tipo: VoceCEtipo;
  valore: number;
  pct_pil?: number;
}

export interface CEMeta {
  company_id: string;
  anno: number;
  mese_da: number;
  mese_a: number;
  modalita: string;
  has_cedolini: boolean;
  aliquota_imposte_pct: number;
  generato_il: string;
}

export interface CEriclassificato {
  meta: CEMeta;
  voci: VoceCE[];
}

export interface BEPResult {
  anno: number;
  ricavi_consuntivi: number;
  costi_fissi: number;
  costi_variabili: number;
  margine_contribuzione_pct: number;
  bep_fatturato_minimo: number | null;
  bep_pct_fatturato: number | null;
  bep_giorno_anno: number | null;
  bep_data: string | null;
  gia_raggiunto: boolean;
  giorni_residui: number | null;
}

export interface CEMensileRow {
  mese: number;
  ricavi: number;
  ricavi_cum: number;
  costi_var: number;
  costi_var_cum: number;
  costi_fissi: number;
  costi_fissi_cum: number;
  costi_totali_cum: number;
  bep_cum: number | null;
  raggiunto: boolean;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useCEriclassificato(anno: number, meseDa = 1, meseA = 12) {
  return useQuery({
    queryKey: queryKeys.controlloGestione.ce(anno, meseDa, meseA),
    queryFn: async (): Promise<CEriclassificato> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "cg_get_ce_safe",
        { p_anno: anno, p_mese_da: meseDa, p_mese_a: meseA },
      );
      if (error) throw error;
      return data as unknown as CEriclassificato;
    },
    staleTime: 5 * 60_000,
  });
}

export function useBEP(anno: number) {
  return useQuery({
    queryKey: queryKeys.controlloGestione.bep(anno),
    queryFn: async (): Promise<BEPResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("cg_get_bep_safe", { p_anno: anno });
      if (error) throw error;
      return data as unknown as BEPResult;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCEMensile(anno: number) {
  return useQuery({
    queryKey: queryKeys.controlloGestione.mens(anno),
    queryFn: async (): Promise<CEMensileRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("cg_get_ce_mensile", { p_anno: anno });
      if (error) throw error;
      return (data ?? []) as unknown as CEMensileRow[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Vista CE Riclassificato mese per mese: 12 cascate complete (Gen..Dic).
 * Usata per la vista "Mensile" del tab CE.
 */
export interface CEMeseDettaglio {
  mese: number;
  voci: VoceCE[];
}
export interface CEMensileDettaglioResult {
  meta: { company_id: string; anno: number; generato_il: string };
  mesi: CEMeseDettaglio[];
}

export function useCEMensileDettaglio(anno: number) {
  return useQuery({
    queryKey: ["cg", "ce-mensile-dettaglio", anno] as const,
    queryFn: async (): Promise<CEMensileDettaglioResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("cg_get_ce_mensile_dettaglio", { p_anno: anno });
      if (error) throw error;
      return data as unknown as CEMensileDettaglioResult;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Confronto multi-anno: ritorna le voci del CE per N anni consecutivi.
 * Usata per la vista "Confronto" del tab CE/SP.
 */
export interface CEMultiAnnoRow {
  anno: number;
  voci: VoceCE[];
}

export function useCEMultiAnno(anniDaConfrontare: number[]) {
  return useQuery({
    queryKey: ["cg", "ce-multi-anno", anniDaConfrontare] as const,
    queryFn: async (): Promise<CEMultiAnnoRow[]> => {
      const results = await Promise.all(
        anniDaConfrontare.map(async (anno) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (supabase.rpc as any)("cg_get_ce_safe", {
            p_anno: anno, p_mese_da: 1, p_mese_a: 12,
          });
          if (error) return { anno, voci: [] as VoceCE[] };
          const ce = data as unknown as CEriclassificato;
          return { anno, voci: ce.voci };
        })
      );
      return results;
    },
    staleTime: 5 * 60_000,
  });
}

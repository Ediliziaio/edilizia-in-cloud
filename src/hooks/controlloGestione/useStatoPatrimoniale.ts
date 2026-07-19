/**
 * Hook React Query — Stato Patrimoniale Riclassificato + Rating bancario.
 * Le RPC sottostanti sono SECURITY DEFINER: passiamo solo l'anno, la company
 * è risolta lato DB tramite get_my_company_id().
 */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";

// ── Stato Patrimoniale ─────────────────────────────────────────────────────

export interface SPAttivo {
  imm_immateriali: number;
  imm_materiali: number;
  imm_finanziarie: number;
  attivo_fisso: number;
  rimanenze: number;
  crediti_clienti: number;
  crediti_tributari: number;
  anticipi_fornitori: number;
  liquidita_differite: number;
  cassa: number;
  banche_positive: number;
  liquidita_immediate: number;
  attivo_circolante: number;
  totale: number;
}

export interface SPPassivo {
  capitale_sociale: number;
  riserve: number;
  utile_esercizio: number;
  rettifica_patrimoniale: number;
  mezzi_propri: number;
  fondo_tfr: number;
  fondi_rischi: number;
  mutui_mlt: number;
  pas_consolidato: number;
  banche_negative: number;
  debiti_fornitori: number;
  debiti_tributari: number;
  debiti_personale: number;
  debiti_previdenziali: number;
  pas_corrente: number;
  totale: number;
}

export interface SPResult {
  meta: {
    company_id: string;
    anno: number;
    data_riferimento: string;
    generato_il: string;
  };
  attivo: SPAttivo;
  passivo: SPPassivo;
  quadratura: { differenza: number; quadrato: boolean };
}

export function useStatoPatrimoniale(anno: number) {
  return useQuery({
    queryKey: queryKeys.controlloGestione.sp(anno),
    queryFn: async (): Promise<SPResult> => {
      const { data, error } = await cgRpc<SPResult>("cg_get_sp_safe", { p_anno: anno });
      if (error) throw error;
      return data as SPResult;
    },
    staleTime: 5 * 60_000,
  });
}

// ── Rating bancario ────────────────────────────────────────────────────────

export type RatingClasse = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC";
export type RatingLivello =
  | "molto_basso" | "basso" | "medio_basso" | "medio"
  | "medio_alto" | "alto" | "default";

export interface RatingIndicatore {
  codice: "liquidita" | "indipendenza" | "oneri_finanziari" | "cashflow";
  label: string;
  valore: number;
  punteggio: number;
  soglia_top: number;
}

export interface RatingResult {
  anno: number;
  classe: RatingClasse;
  livello: RatingLivello;
  score: number;
  indicatori: RatingIndicatore[];
}

export function useRating(anno: number) {
  return useQuery({
    queryKey: queryKeys.controlloGestione.rating(anno),
    queryFn: async (): Promise<RatingResult> => {
      const { data, error } = await cgRpc<RatingResult>("cg_get_rating_safe", { p_anno: anno });
      if (error) throw error;
      return data as RatingResult;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Confronto multi-anno SP: usato dalla vista "Confronto" del tab Stato Patrimoniale.
 */
export interface SPMultiAnnoRow {
  anno: number;
  data: SPResult | null;
}

export function useSPMultiAnno(anniDaConfrontare: number[]) {
  return useQuery({
    queryKey: ["cg", "sp-multi-anno", anniDaConfrontare] as const,
    queryFn: async (): Promise<SPMultiAnnoRow[]> => {
      const results = await Promise.all(
        anniDaConfrontare.map(async (anno) => {
          const { data, error } = await cgRpc<SPResult>("cg_get_sp_safe", { p_anno: anno });
          if (error) return { anno, data: null };
          return { anno, data };
        })
      );
      return results;
    },
    staleTime: 5 * 60_000,
  });
}

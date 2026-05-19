/**
 * Hook React Query — Indici finanziari avanzati: DSO/DPO/DSI/CCC + Altman + DSCR.
 */

import { useQuery } from "@tanstack/react-query";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";

export interface RotazioneData {
  dso_giorni: number | null;
  dpo_giorni: number | null;
  dsi_giorni: number | null;
  ccc_giorni: number;
  crediti_clienti: number;
  debiti_fornitori: number;
  rimanenze: number;
  ricavi: number;
  acquisti: number;
  costo_venduto: number;
}

export interface AltmanData {
  z_score: number | null;
  classe: "safe" | "grey" | "distress" | null;
  descrizione: string;
}

export interface DSCRData {
  valore: number | null;
  servizio_debito: number;
  rate_anno: number;
  interessi_anno: number;
  ebitda: number;
  classe: "eccellente" | "buono" | "critico" | "insufficiente" | "na";
}

export interface IndiciAvanzatiResult {
  meta: { company_id: string; anno: number; generato_il: string };
  rotazione: RotazioneData;
  altman: AltmanData;
  dscr: DSCRData;
}

export function useIndiciAvanzati(anno: number) {
  return useQuery({
    queryKey: ["cg", "indici-avanzati", anno] as const,
    queryFn: async (): Promise<IndiciAvanzatiResult> => {
            const { data, error } = await cgRpc("cg_get_indici_avanzati_safe", { p_anno: anno });
      if (error) throw error;
      return data as unknown as IndiciAvanzatiResult;
    },
    staleTime: 60_000,
  });
}

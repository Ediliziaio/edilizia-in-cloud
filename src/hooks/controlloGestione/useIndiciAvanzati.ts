/**
 * Hook React Query — Indici finanziari avanzati: DSO/DPO/DSI/CCC + Altman + DSCR.
 */

import { useQuery } from "@tanstack/react-query";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface RotazioneData {
  /** Giorni coperti dai dati (anno in corso: giorni trascorsi). Assente prima della migrazione 20281022104100. */
  giorni_periodo?: number | null;
  dso_giorni: number | null;
  dpo_giorni: number | null;
  dsi_giorni: number | null;
  ccc_giorni: number | null;
  /** Da dove viene il debito fornitori: Stato patrimoniale o scadenzario. */
  debiti_fornitori_fonte?: "stato_patrimoniale" | "scadenzario";
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
  provvisorio?: boolean;
}

export interface DSCRData {
  imposte_ce?: number;
  flusso_disponibile?: number;
  valore: number | null;
  servizio_debito: number;
  rate_anno: number;
  rate_periodo?: number;
  interessi_anno: number;
  provvisorio?: boolean;
  ebitda: number;
  classe: "eccellente" | "buono" | "critico" | "insufficiente" | "na";
}

export interface IndiciAvanzatiResult {
  meta: { company_id: string; anno: number; generato_il: string; giorni_periodo?: number | null };
  /** false se lo Stato patrimoniale non quadra (indici patrimoniali provvisori). */
  attendibile?: boolean;
  motivi?: string[];
  rotazione: RotazioneData;
  altman: AltmanData;
  dscr: DSCRData;
}

export function useIndiciAvanzati(anno: number) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "indici-avanzati", anno, "reconciled-v1", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<IndiciAvanzatiResult> => {
      const { data, error } = await cgRpc("cg_get_indici_avanzati_safe", { p_anno: anno });
      if (error) throw error;
      return data as unknown as IndiciAvanzatiResult;
    },
    staleTime: 60_000,
  });
}

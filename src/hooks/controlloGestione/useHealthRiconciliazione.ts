/**
 * Hook React Query — Health-check Dati + Riconciliazione Commercialista.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export type HealthStatus = "ok" | "warn" | "critical";

export interface HealthCheck {
  codice: string;
  label: string;
  valore: number;
  target: string;
  status: HealthStatus;
  descrizione: string;
  azione_url?: string;
  /** 'euro' per gli importi (patrimonio, quadratura): la pagina li formatta. */
  unita?: "euro" | "numero";
}

export interface HealthResult {
  meta: { company_id: string; anno: number; generato_il: string };
  score: number;
  max_score: number;
  percentuale: number;
  report_ready?: boolean;
  checks: HealthCheck[];
}

export function useHealthCheck(anno: number) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "health-check", anno, "reconciled-v1", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<HealthResult> => {
      const { data, error } = await cgRpc("cg_get_health_check_safe", { p_anno: anno });
      if (error) throw error;
      return data as unknown as HealthResult;
    },
    staleTime: 60_000,
  });
}

// ── Riconciliazione Commercialista ──────────────────────────────────────────

export interface RiconciliazioneDichiarato {
  ricavi: number | null;
  costi: number | null;
  utile: number | null;
  patrimonio_netto: number | null;
  imposte: number | null;
  note: string | null;
  updated_at: string;
}
export interface RiconciliazioneSistema {
  ricavi: number;
  utile: number;
  patrimonio_netto: number;
  imposte: number;
}
export interface RiconciliazioneDiscrepanze {
  ricavi_eur: number;
  ricavi_pct: number | null;
  utile_eur: number;
  utile_pct: number | null;
  pn_eur: number;
  imposte_eur: number;
}
export interface RiconciliazioneResult {
  meta: { company_id: string; anno: number; generato_il: string };
  dichiarato: RiconciliazioneDichiarato | null;
  sistema: RiconciliazioneSistema;
  discrepanze: RiconciliazioneDiscrepanze | null;
}

export function useRiconciliazione(anno: number) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "riconciliazione", anno, "reconciled-v1", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<RiconciliazioneResult> => {
      const { data, error } = await cgRpc("cg_get_riconciliazione_safe", { p_anno: anno });
      if (error) throw error;
      return data as unknown as RiconciliazioneResult;
    },
    staleTime: 60_000,
  });
}

export function useUpsertRiconciliazione() {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (input: {
      anno: number;
      ricavi_dichiarati?: number | null;
      costi_dichiarati?: number | null;
      utile_dichiarato?: number | null;
      patrimonio_netto_dichiarato?: number | null;
      imposte_dichiarate?: number | null;
      note?: string | null;
    }) => {
      // company_id è obbligatorio e non ha default: senza, «Salva e riconcilia»
      // falliva sempre (al 22/10/2026 la tabella era vuota per tutte le aziende).
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cg_riconciliazione_commercialista")
        .upsert(
          { ...input, company_id: companyId, updated_at: new Date().toISOString() },
          { onConflict: "company_id,anno" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["cg", "riconciliazione", vars.anno] });
    },
  });
}

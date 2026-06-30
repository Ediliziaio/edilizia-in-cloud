import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePeriodoDate, type PeriodoVendor } from "@/hooks/useVendorReport";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export interface CallCenterKPI {
  operatore_id: string;
  nome_operatore: string;
  email_operatore: string;
  lead_assegnati: number;
  lead_lavorati: number;
  pct_lead_lavorati: number;
  lead_contattati: number;
  tasso_contatto: number;
  tentativi_totali: number;
  tentativi_per_contatto: number;
  avg_speed_to_lead_min: number;
  median_speed_to_lead_min: number;
  pct_entro_5min: number;
  pct_entro_1ora: number;
  pct_oltre_24ore: number;
  appuntamenti_fissati: number;
  tasso_app_su_contattati: number;
  tasso_app_su_assegnati: number;
  show_up_count: number;
  tasso_show_up: number;
  durata_media_min: number;
  chiamate_per_giorno: number;
  giorni_lavorati: number;
}

export interface SpeedBucket {
  bucket: string;
  bucket_ordine: number;
  nr_lead: number;
  pct: number;
}

export interface TrendGiornaliero {
  giorno: string;
  giorno_label: string;
  giorno_settimana: string;
  nr_chiamate: number;
  nr_contatti: number;
  nr_appuntamenti: number;
  tasso_contatto: number;
  tasso_appuntamento: number;
}

export interface FonteLeadPerf {
  fonte: string;
  lead_totali: number;
  lead_contattati: number;
  appuntamenti: number;
  tasso_contatto: number;
  tasso_appuntamento: number;
  avg_speed_to_lead_min: number;
  qualita_fonte: "ottima" | "buona" | "scarsa";
}

export function useCallCenterKPI(periodo: PeriodoVendor, operatoreId?: string) {
  const companyId = useEffectiveCompanyId();
  const { inizio, fine } = usePeriodoDate(periodo);
  return useQuery({
    queryKey: ["callcenter-kpi", companyId, periodo, operatoreId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_callcenter_kpi_per_operatore" as any, {
        p_company_id: companyId,
        p_data_inizio: fmtDate(inizio),
        p_data_fine: fmtDate(fine),
        p_operatore_id: operatoreId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as CallCenterKPI[];
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });
}

export function useSpeedToLeadDistribuzione(periodo: PeriodoVendor, operatoreId?: string, enabled = true) {
  const companyId = useEffectiveCompanyId();
  const { inizio, fine } = usePeriodoDate(periodo);
  return useQuery({
    queryKey: ["speed-distribuzione", companyId, periodo, operatoreId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_callcenter_speed_to_lead_distribuzione" as any, {
        p_company_id: companyId,
        p_data_inizio: fmtDate(inizio),
        p_data_fine: fmtDate(fine),
        p_operatore_id: operatoreId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as SpeedBucket[];
    },
    enabled: !!companyId && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useTrendGiornaliero(periodo: PeriodoVendor, operatoreId?: string, enabled = true) {
  const companyId = useEffectiveCompanyId();
  const { inizio, fine } = usePeriodoDate(periodo);
  return useQuery({
    queryKey: ["callcenter-trend-giornaliero", companyId, periodo, operatoreId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_callcenter_trend_giornaliero" as any, {
        p_company_id: companyId,
        p_data_inizio: fmtDate(inizio),
        p_data_fine: fmtDate(fine),
        p_operatore_id: operatoreId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as TrendGiornaliero[];
    },
    enabled: !!companyId && enabled,
    staleTime: 3 * 60_000,
  });
}

export function useFonteLeadPerformance(periodo: PeriodoVendor, enabled = true) {
  const companyId = useEffectiveCompanyId();
  const { inizio, fine } = usePeriodoDate(periodo);
  return useQuery({
    queryKey: ["fonte-lead-perf", companyId, periodo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_callcenter_fonte_lead_performance" as any, {
        p_company_id: companyId,
        p_data_inizio: fmtDate(inizio),
        p_data_fine: fmtDate(fine),
      });
      if (error) throw error;
      return (data ?? []) as FonteLeadPerf[];
    },
    enabled: !!companyId && enabled,
    staleTime: 5 * 60_000,
  });
}

export interface LeadHandling {
  chiamate_totali: number;
  chiamate_nuovi: number;
  chiamate_vecchi: number;
  risposte_totali: number;
  tasso_risposta_totale: number | null;
  tasso_risposta_nuovi: number | null;
  tasso_risposta_vecchi: number | null;
  lead_nuovi_chiamati: number;
  lead_vecchi_chiamati: number;
  tempo_medio_primo_contatto_ore: number | null;
  chiamate_eta_0_7: number;
  chiamate_eta_8_30: number;
  chiamate_eta_31_60: number;
  chiamate_eta_oltre_60: number;
}

/** "Lavorazione lead": chiamate del periodo divise per età del lead (nuovi vs
 *  riattivazione), tassi di risposta, tempo al 1° contatto sui lead nuovi, aging. */
export function useCallCenterLeadHandling(periodo: PeriodoVendor, operatoreId?: string, enabled = true) {
  const companyId = useEffectiveCompanyId();
  const { inizio, fine } = usePeriodoDate(periodo);
  return useQuery({
    queryKey: ["callcenter-lead-handling", companyId, periodo, operatoreId],
    queryFn: async (): Promise<LeadHandling | null> => {
      const { data, error } = await supabase.rpc("get_callcenter_lead_handling" as any, {
        p_company_id: companyId,
        p_data_inizio: fmtDate(inizio),
        p_data_fine: fmtDate(fine),
        p_operatore_id: operatoreId ?? null,
      });
      if (error) throw error;
      return (((data ?? []) as LeadHandling[])[0]) ?? null;
    },
    enabled: !!companyId && enabled,
    staleTime: 3 * 60_000,
  });
}

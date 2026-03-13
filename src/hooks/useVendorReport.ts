import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from "date-fns";

export type PeriodoVendor = "mese" | "mese_prec" | "trimestre" | "semestre" | "anno";

export function usePeriodoDate(periodo: PeriodoVendor) {
  const now = new Date();
  switch (periodo) {
    case "mese":
      return { inizio: startOfMonth(now), fine: endOfMonth(now) };
    case "mese_prec":
      return { inizio: startOfMonth(subMonths(now, 1)), fine: endOfMonth(subMonths(now, 1)) };
    case "trimestre":
      return { inizio: startOfMonth(subMonths(now, 3)), fine: endOfMonth(now) };
    case "semestre":
      return { inizio: startOfMonth(subMonths(now, 6)), fine: endOfMonth(now) };
    case "anno":
      return { inizio: startOfYear(now), fine: endOfYear(now) };
  }
}

export interface VendorKPI {
  agent_id: string;
  nome_agente: string;
  email_agente: string;
  opp_totali: number;
  opp_vinte: number;
  opp_perse: number;
  opp_aperte: number;
  tasso_chiusura: number | null;
  tasso_conversione: number | null;
  fatturato_generato: number;
  importo_medio_chiusura: number;
  pipeline_valore: number;
  fatturato_perso: number;
  appuntamenti_fissati: number;
  appuntamenti_effettuati: number;
  appuntamenti_no_show: number;
  tasso_show_up: number | null;
  tasso_app_to_opp: number | null;
  tasso_app_to_close: number | null;
  avg_giorni_chiusura: number;
  avg_giorni_chiusura_perse: number;
  min_giorni_chiusura: number;
  max_giorni_chiusura: number;
  nuovi_contatti: number;
}

export interface VendorTrend {
  mese: number;
  mese_label: string;
  opp_vinte: number;
  opp_perse: number;
  fatturato: number;
  appuntamenti_fissati: number;
  appuntamenti_effettuati: number;
  tasso_chiusura: number | null;
  tasso_show_up: number | null;
  nuovi_contatti: number;
}

export interface FunnelStage {
  stage: string;
  count_opp: number;
  valore_totale: number;
  pct_del_totale: number;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function useVendorKPI(periodo: PeriodoVendor, agentId?: string) {
  const companyId = useEffectiveCompanyId();
  const { inizio, fine } = usePeriodoDate(periodo);
  return useQuery({
    queryKey: ["vendor-kpi", companyId, periodo, agentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vendor_kpi_per_agent" as any, {
        p_company_id: companyId,
        p_data_inizio: fmtDate(inizio),
        p_data_fine: fmtDate(fine),
        p_agent_id: agentId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as VendorKPI[];
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });
}

export function useVendorTrend(anno?: number, agentId?: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["vendor-trend", companyId, anno, agentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vendor_trend_mensile" as any, {
        p_company_id: companyId,
        p_anno: anno ?? new Date().getFullYear(),
        p_agent_id: agentId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as VendorTrend[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

export function useVendorFunnel(periodo: PeriodoVendor, agentId?: string) {
  const companyId = useEffectiveCompanyId();
  const { inizio, fine } = usePeriodoDate(periodo);
  return useQuery({
    queryKey: ["vendor-funnel", companyId, periodo, agentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vendor_funnel_stages" as any, {
        p_company_id: companyId,
        p_data_inizio: fmtDate(inizio),
        p_data_fine: fmtDate(fine),
        p_agent_id: agentId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as FunnelStage[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

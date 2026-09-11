import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, format } from "date-fns";
import type { VendorIntegrationHealth } from "@/lib/reporting/vendorOperations";

export type PeriodoVendor = "mese" | "mese_prec" | "trimestre" | "semestre" | "anno";

export function usePeriodoDate(periodo: PeriodoVendor) {
  const now = new Date();
  switch (periodo) {
    case "mese":
      return { inizio: startOfMonth(now), fine: endOfMonth(now) };
    case "mese_prec":
      return { inizio: startOfMonth(subMonths(now, 1)), fine: endOfMonth(subMonths(now, 1)) };
    // «Ultimi 3 mesi» = questo mese e i due prima: con subMonths(now, 3) erano
    // quattro (e sette per il semestre), come nel report Venditori fino al 2026-09-11.
    case "trimestre":
      return { inizio: startOfMonth(subMonths(now, 2)), fine: endOfMonth(now) };
    case "semestre":
      return { inizio: startOfMonth(subMonths(now, 5)), fine: endOfMonth(now) };
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

// Giorno LOCALE: toISOString dà il giorno UTC, e l'inizio mese (mezzanotte
// italiana) finiva nel giorno prima.
function fmtDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function useVendorKPI(inizio: Date, fine: Date, agentId?: string, enabled = true, pipelineId?: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["vendor-kpi", companyId, fmtDate(inizio), fmtDate(fine), agentId, pipelineId ?? "tutte"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vendor_kpi_per_agent" as any, {
        p_company_id: companyId,
        p_data_inizio: fmtDate(inizio),
        p_data_fine: fmtDate(fine),
        p_agent_id: agentId ?? null,
        p_pipeline_id: pipelineId ?? null,
      });
      if (error) throw error;
      // Senza profilo né email la funzione ripiega sull'id: è un utente
      // cancellato con ancora opportunità assegnate, non un nome da mostrare.
      return ((data ?? []) as VendorKPI[]).map((k) =>
        k.nome_agente === k.agent_id ? { ...k, nome_agente: "Utente eliminato" } : k,
      );
    },
    enabled: !!companyId && enabled,
    staleTime: 3 * 60_000,
  });
}

export function useVendorTrend(anno?: number, agentId?: string, enabled = true, pipelineId?: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["vendor-trend", companyId, anno, agentId, pipelineId ?? "tutte"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vendor_trend_mensile" as any, {
        p_company_id: companyId,
        p_anno: anno ?? new Date().getFullYear(),
        p_agent_id: agentId ?? null,
        p_pipeline_id: pipelineId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as VendorTrend[];
    },
    enabled: !!companyId && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useVendorFunnel(inizio: Date, fine: Date, agentId?: string, pipelineId?: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["vendor-funnel", companyId, fmtDate(inizio), fmtDate(fine), agentId, pipelineId ?? "tutte"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vendor_funnel_stages" as any, {
        p_company_id: companyId,
        p_data_inizio: fmtDate(inizio),
        p_data_fine: fmtDate(fine),
        p_agent_id: agentId ?? null,
        p_pipeline_id: pipelineId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as FunnelStage[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

export function useVendorIntegrationHealth(inizio: Date, fine: Date, agentId?: string, pipelineId?: string) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["vendor-integration-health", companyId, fmtDate(inizio), fmtDate(fine), agentId, pipelineId ?? "tutte"],
    queryFn: async (): Promise<VendorIntegrationHealth> => {
      if (!companyId) return emptyVendorIntegrationHealth();
      // Contato nel database con le regole degli altri numeri
      // (vendite_controllo_crm, 20280915410006): nel browser le letture si
      // fermavano a mille righe e gli appuntamenti «senza esito» erano quelli
      // senza la spunta is_completed, cioè quasi tutti.
      const { data, error } = await (supabase as any).rpc("vendite_controllo_crm", {
        p_company: companyId,
        p_da: fmtDate(inizio),
        p_a: fmtDate(fine),
        p_venditore: agentId ?? null,
        p_pipeline: pipelineId ?? null,
      });
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) ?? {};
      return {
        unassignedContacts: Number(r.contatti_senza_venditore ?? 0),
        unassignedOpportunities: Number(r.opportunita_senza_venditore ?? 0),
        unassignedAppointments: Number(r.appuntamenti_senza_venditore ?? 0),
        appointmentsWithoutContact: Number(r.appuntamenti_senza_contatto ?? 0),
        pastUncompletedAppointments: Number(r.appuntamenti_senza_esito ?? 0),
        staleOpenOpportunities: Number(r.opportunita_senza_prossimo_passo ?? 0),
      };
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });
}

function emptyVendorIntegrationHealth(): VendorIntegrationHealth {
  return {
    unassignedContacts: 0,
    unassignedOpportunities: 0,
    unassignedAppointments: 0,
    appointmentsWithoutContact: 0,
    pastUncompletedAppointments: 0,
    staleOpenOpportunities: 0,
  };
}


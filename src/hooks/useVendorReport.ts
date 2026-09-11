import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subDays, format } from "date-fns";
import type { VendorIntegrationHealth } from "@/lib/reporting/vendorOperations";

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

// Giorno LOCALE: toISOString dà il giorno UTC, e l'inizio mese (mezzanotte
// italiana) finiva nel giorno prima.
function fmtDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function useVendorKPI(inizio: Date, fine: Date, agentId?: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["vendor-kpi", companyId, fmtDate(inizio), fmtDate(fine), agentId],
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

export function useVendorTrend(anno?: number, agentId?: string, enabled = true) {
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
    enabled: !!companyId && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useVendorFunnel(inizio: Date, fine: Date, agentId?: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["vendor-funnel", companyId, fmtDate(inizio), fmtDate(fine), agentId],
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

export function useVendorIntegrationHealth(inizio: Date, fine: Date, agentId?: string) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["vendor-integration-health", companyId, fmtDate(inizio), fmtDate(fine), agentId],
    queryFn: async (): Promise<VendorIntegrationHealth> => {
      if (!companyId) return emptyVendorIntegrationHealth();

      const startIso = inizio.toISOString();
      const endIso = fine.toISOString();
      const startDate = fmtDate(inizio);
      const endDate = fmtDate(fine);
      const todayDate = fmtDate(new Date());
      const staleBefore = subDays(new Date(), 14).toISOString();

      const [contactsRes, opportunitiesRes, appointmentsRes] = await Promise.all([
        supabase
          .from("marketing_contacts")
          .select("id, assigned_to, created_at, deleted_at")
          .eq("company_id", companyId)
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .is("deleted_at", null),
        supabase
          .from("marketing_opportunities")
          .select("id, assigned_to, status, created_at, updated_at, next_action, next_action_date, deleted_at")
          .eq("company_id", companyId)
          .lte("created_at", endIso)
          .is("deleted_at", null),
        supabase
          .from("appointments")
          .select("id, assigned_to, contact_id, status, is_completed, appointment_date, is_blocked_slot")
          .eq("company_id", companyId)
          .gte("appointment_date", startDate)
          .lte("appointment_date", endDate),
      ]);

      if (contactsRes.error) throw contactsRes.error;
      if (opportunitiesRes.error) throw opportunitiesRes.error;
      if (appointmentsRes.error) throw appointmentsRes.error;

      const contacts = contactsRes.data ?? [];
      const opportunities = opportunitiesRes.data ?? [];
      const appointments = appointmentsRes.data ?? [];
      const activeAppointments = appointments.filter(
        (appointment) => !appointment.is_blocked_slot && !isCancelledStatus(appointment.status),
      );
      const relevantAppointments = activeAppointments.filter((appointment) => matchesAgent(appointment.assigned_to, agentId));
      const periodOpportunities = opportunities.filter(
        (opportunity) => opportunity.created_at >= startIso && opportunity.created_at <= endIso,
      );
      const openOpportunities = opportunities.filter(
        (opportunity) => isOpenStatus(opportunity.status) && matchesAgent(opportunity.assigned_to, agentId),
      );

      return {
        unassignedContacts: agentId ? 0 : contacts.filter((contact) => !contact.assigned_to).length,
        unassignedOpportunities: agentId ? 0 : periodOpportunities.filter((opportunity) => !opportunity.assigned_to).length,
        unassignedAppointments: agentId ? 0 : activeAppointments.filter((appointment) => !appointment.assigned_to).length,
        appointmentsWithoutContact: relevantAppointments.filter((appointment) => !appointment.contact_id).length,
        pastUncompletedAppointments: relevantAppointments.filter(
          (appointment) => !appointment.is_completed && appointment.appointment_date < todayDate,
        ).length,
        staleOpenOpportunities: openOpportunities.filter(
          (opportunity) =>
            !hasNextStep(opportunity.next_action, opportunity.next_action_date, todayDate) ||
            (opportunity.updated_at && opportunity.updated_at < staleBefore),
        ).length,
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

function matchesAgent(assignedTo: string | null | undefined, agentId?: string) {
  return !agentId || assignedTo === agentId;
}

function isOpenStatus(status: string | null | undefined) {
  const value = normalizeLookup(status);
  return !["won", "closed won", "vinto", "lost", "closed lost", "perso", "cancelled", "canceled", "annullato"].includes(value);
}

function isCancelledStatus(status: string | null | undefined) {
  const value = normalizeLookup(status);
  return ["cancelled", "canceled", "annullato"].includes(value);
}

function hasNextStep(nextAction: string | null | undefined, nextActionDate: string | null | undefined, todayDate: string) {
  const hasAction = typeof nextAction === "string" && nextAction.trim().length > 0;
  const hasFutureDate = typeof nextActionDate === "string" && nextActionDate >= todayDate;
  return hasAction || hasFutureDate;
}

function normalizeLookup(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

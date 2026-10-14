import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { loadArchivedOrderIds, excludeArchivedOrders } from "@/lib/orders/archivedOrderScope";
import { loadDashboardRows } from "@/lib/attivita/dashboardTasks";
import type { AgendaAppointment, AgendaHoliday, AgendaLeave, AgendaOrder, ToggleAgendaLayer } from "@/lib/attivita/dashboardAgenda";

/** Le sorgenti personali non si allargano con i permessi di gestione aziendale. */
export function useDashboardAgenda(from: string, to: string, layers: Set<ToggleAgendaLayer>) {
  const { effectiveCompany, user } = useAuth();
  const p = usePermissions();
  const company = effectiveCompany?.id;
  const ready = !!company && !!user?.id && !p.isLoading;
  const requirePersonalScope = () => { if (!ready) throw new Error("Agenda personale non disponibile"); };
  const orderColumns = "id, order_code, description, work_start_date, work_end_date, expected_date, warehouse_arrival_date";
  const orderDates = `and(work_start_date.lte.${to},work_end_date.gte.${from}),and(work_start_date.gte.${from},work_start_date.lte.${to}),and(work_end_date.gte.${from},work_end_date.lte.${to}),and(expected_date.gte.${from},expected_date.lte.${to}),and(warehouse_arrival_date.gte.${from},warehouse_arrival_date.lte.${to})`;
  const orders = useQuery({
    queryKey: [...queryKeys.calendarOrders.all, "dashboard-personal-agenda", company, user?.id, from, to], enabled: ready && p.canViewOrders && layers.has("order"), staleTime: 60_000, refetchOnMount: "always",
    queryFn: async () => {
      requirePersonalScope();
      if (!p.canViewOrders) throw new Error("Non hai accesso alle commesse");
      // L'accesso Campo canonico comprende le assegnazioni tramite squadre e fasi.
      // Leggiamo solo le relazioni della persona collegata, mai l'intero organico.
      const assignments = await loadDashboardRows<{ id: string; order_id: string }>((a, b) => supabase.from("order_campo_assignments")
        .select("id, order_id").eq("company_id", company!).eq("user_id", user!.id).order("id").range(a, b));
      const own = await loadDashboardRows<AgendaOrder>((a, b) => supabase.from("orders").select(orderColumns)
        .eq("company_id", company!).is("deleted_at", null).or(`assigned_to.eq.${user!.id},capomastro_user_id.eq.${user!.id}`)
        .or(orderDates).order("id").range(a, b));
      const merged = new Map(own.map(order => [order.id, order]));
      const assignedIds = [...new Set(assignments.map(a => a.order_id))];
      // Blocchi piccoli evitano URL troppo lunghi con molte commesse assegnate.
      for (let offset = 0; offset < assignedIds.length; offset += 100) {
        const rows = await loadDashboardRows<AgendaOrder>((a, b) => supabase.from("orders").select(orderColumns)
          .eq("company_id", company!).is("deleted_at", null).in("id", assignedIds.slice(offset, offset + 100))
          .or(orderDates).order("id").range(a, b));
        for (const order of rows) merged.set(order.id, order);
      }
      return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
    },
  });
  // Lo scadenzario economico non ha un responsabile personale: rimane nel suo
  // modulo aziendale, anziché far apparire incassi e pagamenti come impegni miei.
  const appointments = useQuery({
    queryKey: ["appointments", "dashboard-personal-agenda", user?.id, company, from, to], enabled: ready && p.canViewMarketingAppointments && layers.has("appointment"), staleTime: 60_000, refetchOnMount: "always",
    queryFn: async () => {
      requirePersonalScope();
      if (!p.canViewMarketingAppointments) throw new Error("Non hai accesso agli appuntamenti");
      const archived = await loadArchivedOrderIds(company!);
      return loadDashboardRows<AgendaAppointment>((a, b) => {
        const q = supabase.from("appointments").select("id, title, appointment_date, appointment_time, status, assigned_to")
          .eq("company_id", company!).eq("assigned_to", user!.id).gte("appointment_date", from).lte("appointment_date", to)
          .not("status", "in", "(annullato,annullata,cancellato,cancellata,cancelled,canceled,completato,completata,completed,no_show)")
          .order("appointment_date").order("appointment_time").order("id").range(a, b);
        return excludeArchivedOrders(q, archived, "order_id");
      });
    },
  });
  const leaves = useQuery({
    queryKey: ["hr-richieste", "dashboard-personal-agenda", user?.id, company, from, to], enabled: ready && layers.has("leave"), staleTime: 60_000, refetchOnMount: "always",
    queryFn: async () => {
      requirePersonalScope();
      const byProfile = await loadDashboardRows<AgendaLeave>((a, b) => supabase.from("hr_richieste").select("id, tipo, data_inizio, data_fine, user_id, profilo:hr_profili!hr_richieste_profilo_id_fkey!inner(nome, cognome, user_id)")
        .eq("company_id", company!).eq("profilo.user_id", user!.id).eq("stato", "approvata").lte("data_inizio", to).gte("data_fine", from).order("id").range(a, b));
      // Le richieste Campo possono essere legate direttamente all'utente,
      // senza profilo HR: restano personali e non vanno perse con l'inner join.
      const byUser = await loadDashboardRows<Omit<AgendaLeave, "profilo">>((a, b) => supabase.from("hr_richieste")
        .select("id, tipo, data_inizio, data_fine, user_id")
        .eq("company_id", company!).eq("user_id", user!.id).eq("stato", "approvata").lte("data_inizio", to).gte("data_fine", from).order("id").range(a, b));
      const merged = new Map(byProfile.map(leave => [leave.id, leave]));
      for (const leave of byUser) if (!merged.has(leave.id)) merged.set(leave.id, { ...leave, profilo: null });
      return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
    },
  });
  const holidays = useQuery({
    queryKey: ["hr-festivita", "dashboard-personal-agenda", company], enabled: ready, staleTime: 60_000, refetchOnMount: "always",
    queryFn: () => {
      requirePersonalScope();
      return loadDashboardRows<AgendaHoliday>((a, b) => supabase.from("hr_festivita").select("id, data, descrizione, ricorrente").eq("company_id", company!).order("id").range(a, b));
    },
  });
  return { orders, appointments, leaves, holidays };
}

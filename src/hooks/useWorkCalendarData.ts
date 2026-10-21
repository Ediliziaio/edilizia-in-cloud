import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { loadDashboardRows } from "@/lib/attivita/dashboardTasks";
import {
  loadArchivedOrderIds,
  excludeArchivedOrders,
} from "@/lib/orders/archivedOrderScope";
import {
  getOrderWorkPeriods,
  normalizePlanningOrder,
  type RawPlanningOrder,
} from "@/lib/calendar/planning";
import type { CalendarAppointment, CalendarScope } from "@/types/calendar";
import { appuntamentiPerCalendarioLavori } from "@/lib/calendar/appuntamentiRiservati";

const columns: string = `id, order_code, description, expected_date, work_start_date, work_end_date, work_start_time, work_end_time,
  warehouse_arrival_date, created_at, customer_id, current_status_id, indirizzo_lavori, work_address,work_lat,work_lng,distanza_sede_km,distanza_sede_minuti,distanza_sede_il,
  customer:profiles!orders_customer_id_fkey(first_name, last_name), status:order_statuses!orders_current_status_id_fkey(name, color),
  order_work_phases!order_work_phases_order_id_fkey(id,name,start_date,end_date,status,position,notes,percentuale,completata_il),
  order_employees(phase_id, phase:order_work_phases!order_employees_phase_id_fkey(id,name,start_date,end_date), employee:employees(id,first_name,last_name)),
  order_external_teams(phase_id, phase:order_work_phases!order_external_teams_phase_id_fkey(id,name,start_date,end_date), external_team:external_teams(id,name,color)),
  squadre_commesse(phase_id,dal,al,phase:order_work_phases!squadre_commesse_phase_id_fkey(id,name,start_date,end_date),squadra:external_teams!squadre_commesse_squadra_id_fkey(id,name,color))`;

async function personalOrderIds(
  company: string,
  user: string,
  signal: AbortSignal,
) {
  const [direct, campo] = await Promise.all([
    loadDashboardRows<{ id: string }>((a, b) =>
      supabase
        .from("orders")
        .select("id")
        .eq("company_id", company)
        .is("deleted_at", null)
        .or(`assigned_to.eq.${user},capomastro_user_id.eq.${user}`)
        .order("id")
        .range(a, b)
        .abortSignal(signal),
    ),
    loadDashboardRows<{ id: string; order_id: string }>((a, b) =>
      supabase
        .from("order_campo_assignments")
        .select("id,order_id")
        .eq("company_id", company)
        .eq("user_id", user)
        .order("id")
        .range(a, b)
        .abortSignal(signal),
    ),
  ]);
  return [
    ...new Set(
      [...direct.map((o) => o.id), ...campo.map((a) => a.order_id)].filter(
        Boolean,
      ),
    ),
  ];
}
const chunks = (ids: string[]) =>
  Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) =>
    ids.slice(i * 100, i * 100 + 100),
  );

export function useWorkCalendarData(
  from: string,
  to: string,
  requestedScope: CalendarScope = "personal",
) {
  const { user, effectiveCompany } = useAuth();
  const p = usePermissions();
  const company = effectiveCompany?.id;
  const ready = !!company && !!user?.id && !p.isLoading && p.canViewCalendar;
  const canViewTeam =
    !p.onlyAssigned && (p.isAdmin || p.canViewAllTeamCalendar);
  const scope: CalendarScope =
    requestedScope === "team" && canViewTeam ? "team" : "personal";
  const teamAppointments = scope === "team";
  const requireOrders = () => {
    if (!ready || !p.canViewOrders)
      throw new Error("Non hai accesso alle commesse del calendario");
  };
  const dateFilter = `and(work_start_date.lte.${to},work_end_date.gte.${from}),and(work_start_date.gte.${from},work_start_date.lte.${to}),and(work_end_date.gte.${from},work_end_date.lte.${to}),and(expected_date.gte.${from},expected_date.lte.${to}),and(warehouse_arrival_date.gte.${from},warehouse_arrival_date.lte.${to})`;
  const orders = useQuery({
    queryKey: [
      ...queryKeys.calendarOrders.list(company),
      "planning-v3",
      user?.id,
      scope,
      from,
      to,
    ],
    enabled: ready && p.canViewOrders,
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    queryFn: async ({ signal }) => {
      requireOrders();
      const own =
        scope === "personal"
          ? await personalOrderIds(company!, user!.id, signal)
          : null;
      if (own && !own.length) return [];
      const rows = new Map<string, RawPlanningOrder>();
      for (const ids of own ? chunks(own) : [null]) {
        const data = await loadDashboardRows<RawPlanningOrder>((a, b) => {
          let q = supabase
            .from("orders")
            .select(columns)
            .eq("company_id", company!)
            .is("deleted_at", null)
            .or(dateFilter);
          if (ids) q = q.in("id", ids);
          return q
            .order("work_start_date")
            .order("id")
            .range(a, b)
            .abortSignal(signal)
            .overrideTypes<RawPlanningOrder[], { merge: false }>();
        });
        data.forEach((o) => rows.set(o.id, o));
        // Anche una fase spostata fuori dalle date generali della commessa va caricata.
        const phaseOrders = await loadDashboardRows<{
          id: string;
          order_id: string;
        }>((a, b) => {
          let q = supabase
            .from("order_work_phases")
            .select("id,order_id")
            .eq("company_id", company!)
            .or(
              `and(start_date.lte.${to},end_date.gte.${from}),and(start_date.gte.${from},start_date.lte.${to})`,
            );
          if (ids) q = q.in("order_id", ids);
          return q.order("id").range(a, b).abortSignal(signal);
        });
        const extra = [
          ...new Set(
            phaseOrders
              .map((f) => f.order_id)
              .filter((id) => id && !rows.has(id)),
          ),
        ];
        for (const extraIds of chunks(extra)) {
          const data = await loadDashboardRows<RawPlanningOrder>((a, b) =>
            supabase
              .from("orders")
              .select(columns)
              .eq("company_id", company!)
              .is("deleted_at", null)
              .in("id", extraIds)
              .order("id")
              .range(a, b)
              .abortSignal(signal)
              .overrideTypes<RawPlanningOrder[], { merge: false }>(),
          );
          data.forEach((o) => rows.set(o.id, o));
        }
      }
      return [...rows.values()].map(normalizePlanningOrder);
    },
  });
  const appointments = useQuery({
    queryKey: [
      "appointments",
      "work-planning-v3",
      company,
      user?.id,
      scope,
      p.isAdmin || p.canViewMarketingAppointments,
      from,
      to,
    ],
    enabled: ready,
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    queryFn: async ({ signal }) => {
      if (!ready) throw new Error("Calendario non disponibile");
      const archived = await loadArchivedOrderIds(company!);
      const rows = await loadDashboardRows<CalendarAppointment>((a, b) => {
        let q = supabase
          .from("appointments")
          .select(
            `*, order:orders!appointments_order_id_fkey(order_code,description,customer:profiles!orders_customer_id_fkey(first_name,last_name)),contact:marketing_contacts!appointments_contact_id_fkey(first_name,last_name)`,
          )
          .eq("company_id", company!)
          .gte("appointment_date", from)
          .lte("appointment_date", to)
          .not(
            "status",
            "in",
            "(annullato,annullata,cancellato,cancellata,cancelled,canceled,no_show)",
          )
          .order("appointment_date")
          .order("appointment_time")
          .order("id")
          .range(a, b)
          .abortSignal(signal);
        if (!teamAppointments) q = q.eq("assigned_to", user!.id);
        return excludeArchivedOrders(q, archived, "order_id");
      });
      return appuntamentiPerCalendarioLavori(rows, {
        userId: user?.id,
        vedeCrm: p.isAdmin || p.canViewMarketingAppointments,
      });
    },
  });
  const unplanned = useQuery({
    queryKey: [
      ...queryKeys.calendarOrders.list(company),
      "unplanned-v3",
      user?.id,
      scope,
    ],
    enabled: ready && p.canViewOrders,
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    queryFn: async ({ signal }) => {
      requireOrders();
      const own =
        scope === "personal"
          ? await personalOrderIds(company!, user!.id, signal)
          : null;
      const rows = new Map<string, RawPlanningOrder>();
      for (const ids of own ? chunks(own) : [null]) {
        const data = await loadDashboardRows<RawPlanningOrder>((a, b) => {
          let q = supabase
            .from("orders")
            .select(columns)
            .eq("company_id", company!)
            .is("deleted_at", null)
            .is("expected_date", null)
            .is("work_start_date", null);
          if (ids) q = q.in("id", ids);
          return q
            .order("id")
            .range(a, b)
            .abortSignal(signal)
            .overrideTypes<RawPlanningOrder[], { merge: false }>();
        });
        data.forEach((o) => rows.set(o.id, o));
      }
      return [...rows.values()]
        .map(normalizePlanningOrder)
        .filter((o) => !getOrderWorkPeriods(o).length);
    },
  });
  return {
    orders: {
      ...orders,
      data: ready && p.canViewOrders ? orders.data : undefined,
    },
    appointments: {
      ...appointments,
      data: ready ? appointments.data : undefined,
    },
    unplanned: {
      ...unplanned,
      data: ready && p.canViewOrders ? unplanned.data : undefined,
    },
    teamAppointments,
    canViewTeam,
    scope,
  };
}

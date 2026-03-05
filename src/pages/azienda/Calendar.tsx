import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfWeek, endOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarGanttView } from "@/components/calendar/CalendarGanttView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import { CalendarHeatmapView } from "@/components/calendar/CalendarHeatmapView";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ChevronLeft, ChevronRight, RotateCcw, AlertTriangle, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarOrder, CalendarViewType, OrderStatus, CustomerFilter, CalendarAppointment, GoogleBusySlot } from "@/types/calendar";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export default function Calendar() {
  const { effectiveCompany } = useAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { isGoogleConnected, pullBusySlots, reconcileSync, syncMode } = useGoogleCalendarSync();
  const [view, setView] = useState<CalendarViewType>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [externalTeamFilter, setExternalTeamFilter] = useState<string>("all");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["calendar-orders", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_code,
          description,
          expected_date,
          work_start_date,
          work_end_date,
          warehouse_arrival_date,
          created_at,
          customer_id,
          current_status_id,
          customer:profiles!orders_customer_id_fkey(first_name, last_name),
          status:order_statuses!orders_current_status_id_fkey(name, color),
          order_employees(employee:employees(id, first_name, last_name)),
          order_external_teams(external_team:external_teams(id, name))
        `)
        .eq("company_id", effectiveCompany.id)
        .order("work_start_date", { ascending: true });
      
      if (error) throw error;
      return (data || []) as CalendarOrder[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch appointments
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          order:orders!appointments_order_id_fkey(order_code, description)
        `)
        .eq("company_id", effectiveCompany.id)
        .is("calendar_id", null)
        .order("appointment_date", { ascending: true });
      if (error) throw error;

      // Enrich with assigned profile names
      const assignedIds = [...new Set((data || []).map(a => a.assigned_to).filter(Boolean))] as string[];
      let profilesMap: Record<string, { first_name: string; last_name: string }> = {};
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", assignedIds);
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map(p => [p.id, { first_name: p.first_name, last_name: p.last_name }]));
        }
      }

      return (data || []).map(apt => ({
        ...apt,
        assigned_profile: apt.assigned_to ? profilesMap[apt.assigned_to] || null : null,
      })) as CalendarAppointment[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Google Calendar busy slots
  const { data: busySlots = [] } = useQuery({
    queryKey: ["gcal-busy-slots", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("google_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, google_calendar_id")
        .eq("company_id", effectiveCompany.id);
      if (error) throw error;
      return (data || []) as GoogleBusySlot[];
    },
    enabled: !!effectiveCompany?.id && isGoogleConnected,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch synced appointment IDs for badge display
  const { data: syncedAppointmentIds } = useQuery({
    queryKey: ["gcal-synced-ids", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return new Set<string>();
      const { data, error } = await supabase
        .from("google_calendar_event_map")
        .select("appointment_id")
        .eq("company_id", effectiveCompany.id);
      if (error) throw error;
      return new Set((data || []).map((r: any) => r.appointment_id));
    },
    enabled: !!effectiveCompany?.id && isGoogleConnected,
    staleTime: 2 * 60 * 1000,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, color")
        .eq("company_id", effectiveCompany.id)
        .order("position");
      
      if (error) throw error;
      return (data || []) as OrderStatus[];
    },
    enabled: !!effectiveCompany?.id,
  });

  const { data: companyEmployees = [] } = useQuery({
    queryKey: ["employees-filter", effectiveCompany?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", effectiveCompany!.id)
        .eq("is_active", true)
        .order("last_name");
      return data || [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const { data: externalTeams = [] } = useQuery({
    queryKey: ["external-teams-filter", effectiveCompany?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("external_teams")
        .select("id, name")
        .eq("company_id", effectiveCompany!.id)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const uniqueCustomers = useMemo(() => {
    const customersMap = new Map<string, CustomerFilter>();
    orders.forEach(order => {
      if (!customersMap.has(order.customer_id)) {
        customersMap.set(order.customer_id, {
          id: order.customer_id,
          first_name: order.customer.first_name,
          last_name: order.customer.last_name,
        });
      }
    });
    return Array.from(customersMap.values()).sort((a, b) => 
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
    );
  }, [orders]);

  const goToToday = () => setCurrentDate(new Date());

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const goPrev = useCallback(() => {
    if (view === "month") setCurrentDate(d => subMonths(d, 1));
    else if (view === "week") setCurrentDate(d => subWeeks(d, 1));
    else setCurrentDate(d => subDays(d, 1));
  }, [view]);

  const goNext = useCallback(() => {
    if (view === "month") setCurrentDate(d => addMonths(d, 1));
    else if (view === "week") setCurrentDate(d => addWeeks(d, 1));
    else setCurrentDate(d => addDays(d, 1));
  }, [view]);

  const dateLabel = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM yyyy", { locale: it });
    if (view === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(ws, "d MMM", { locale: it })} – ${format(we, "d MMM yyyy", { locale: it })}`;
    }
    return format(currentDate, "EEEE d MMMM yyyy", { locale: it });
  }, [currentDate, view]);

  const handleDateSelect = (d: Date | undefined) => {
    if (d) { setCurrentDate(d); setDatePickerOpen(false); }
  };

  // Fetch assignable staff users
  const { data: assignableUsers = [] } = useQuery({
    queryKey: ["assignable-users", effectiveCompany?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", effectiveCompany!.id)
        .order("last_name");
      return data || [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const resetFilters = () => {
    setStatusFilter("all");
    setCustomerFilter("all");
    setEmployeeFilter("all");
    setExternalTeamFilter("all");
    setAssignedToFilter("all");
  };

  const hasActiveFilters = statusFilter !== "all" || customerFilter !== "all" || employeeFilter !== "all" || externalTeamFilter !== "all" || assignedToFilter !== "all";

  // Filter orders that have at least one date
  const scheduledOrders = useMemo(() => {
    return orders
      .filter(order => order.work_start_date || order.expected_date || order.warehouse_arrival_date)
      .filter(order => {
        if (statusFilter !== "all" && order.current_status_id !== statusFilter) {
          return false;
        }
        if (customerFilter !== "all" && order.customer_id !== customerFilter) {
          return false;
        }
        if (employeeFilter !== "all") {
          const hasEmployee = order.order_employees?.some(
            ae => ae.employee.id === employeeFilter
          );
          if (!hasEmployee) return false;
        }
        if (externalTeamFilter !== "all") {
          const hasTeam = order.order_external_teams?.some(
            aet => aet.external_team.id === externalTeamFilter
          );
          if (!hasTeam) return false;
        }
        return true;
      });
  }, [orders, statusFilter, customerFilter, employeeFilter, externalTeamFilter]);

  // Filter appointments by assignedTo
  const filteredAppointments = useMemo(() => {
    if (assignedToFilter === "all") return appointments;
    return appointments.filter(apt => apt.assigned_to === assignedToFilter);
  }, [appointments, assignedToFilter]);

  // Count orders without important dates
  const unplannedOrdersCount = useMemo(() => {
    return orders.filter(order => !order.expected_date && !order.work_start_date).length;
  }, [orders]);

  return (
    <div className="space-y-4">
      {/* Header: titolo + azioni */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold">Calendario Lavori</h1>
        </div>
        <div className="flex items-center gap-2">
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 relative">
                <SlidersHorizontal className="h-4 w-4" />
                Filtri
                {hasActiveFilters && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {[statusFilter, customerFilter, employeeFilter, externalTeamFilter, assignedToFilter].filter(f => f !== "all").length}
                  </span>
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>

          {isGoogleConnected && (
            <Button
              variant="outline"
              size="sm"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                await pullBusySlots();
                queryClient.invalidateQueries({ queryKey: ["gcal-busy-slots"] });
                setSyncing(false);
              }}
            >
              <RefreshCw className={cn("h-4 w-4 mr-1.5", syncing && "animate-spin")} />
              <span className="hidden sm:inline">Sync</span>
            </Button>
          )}
          <Button variant="default" size="sm" onClick={() => setAppointmentDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuovo
          </Button>
        </div>
      </div>

      {/* Navigation bar stile marketing */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={goToToday}>Oggi</Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <button className="text-sm font-medium hover:text-primary transition-colors cursor-pointer capitalize">
              {dateLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker
              mode="single"
              selected={currentDate}
              onSelect={handleDateSelect}
              locale={it}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <Select value={view} onValueChange={(v) => setView(v as CalendarViewType)}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mese</SelectItem>
            <SelectItem value="week">Settimana</SelectItem>
            <SelectItem value="heatmap">Carico</SelectItem>
            {!isMobile && <SelectItem value="gantt">Gantt</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {/* Pannello filtri collassabile */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent>
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Tutti gli stati" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: status.color }} />
                        {status.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tutti i clienti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i clienti</SelectItem>
                  {uniqueCustomers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.last_name} {customer.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tutti gli operai" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli operai</SelectItem>
                  {companyEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.last_name} {emp.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={externalTeamFilter} onValueChange={setExternalTeamFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tutte le squadre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le squadre</SelectItem>
                  {externalTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Assegnato a" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli utenti</SelectItem>
                  {assignableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.last_name} {user.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5">
                  <RotateCcw className="h-4 w-4" />
                  Resetta
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                {scheduledOrders.length} {scheduledOrders.length === 1 ? "ordine" : "ordini"}
              </Badge>
              {unplannedOrdersCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {unplannedOrdersCount} non pianificati
                </Badge>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center h-96 gap-4 text-muted-foreground">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p>Errore nel caricamento dei dati del calendario</p>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["calendar-orders"] })}>
            Riprova
          </Button>
        </div>
      ) : view === "month" ? (
        <CalendarMonthView
          orders={scheduledOrders}
          appointments={filteredAppointments}
          busySlots={busySlots}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          syncedAppointmentIds={syncedAppointmentIds}
        />
      ) : view === "week" ? (
        <CalendarWeekView
          orders={scheduledOrders}
          appointments={filteredAppointments}
          busySlots={busySlots}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          syncedAppointmentIds={syncedAppointmentIds}
        />
      ) : view === "heatmap" ? (
        <CalendarHeatmapView
          orders={scheduledOrders}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
        />
      ) : (
        <CalendarGanttView
          orders={scheduledOrders}
          allOrders={orders}
          statuses={statuses}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
        />
      )}

      <AppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={setAppointmentDialogOpen}
        hideMarketingFields
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
        }}
        showOrderSelect={true}
      />
    </div>
  );
}

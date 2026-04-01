import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import { CalendarDayView } from "@/components/calendar/CalendarDayView";
import { CalendarGanttView } from "@/components/calendar/CalendarGanttView";

import { CalendarHeatmapView } from "@/components/calendar/CalendarHeatmapView";
import { useConflictDetection } from "@/hooks/useConflictDetection";
import { CalendarLayerPanel } from "@/components/calendar/CalendarLayerPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, GanttChart, Calendar as CalendarIcon, RotateCcw, AlertTriangle, BarChart3, Plus, RefreshCw, SlidersHorizontal, Eye, CalendarRange, Download, MoreHorizontal, X } from "lucide-react";
import { exportAppointmentsIcal } from "@/lib/icalExport";
import { cn } from "@/lib/utils";
import type { CalendarOrder, CalendarViewType, OrderStatus, CustomerFilter, CalendarAppointment, GoogleBusySlot, CalendarWarehouseInfo } from "@/types/calendar";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function CalendarInner() {
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
  // Layer visibility state — initialize from localStorage (parse once)
  const savedPrefs = (() => {
    try { return JSON.parse(localStorage.getItem("calendar-layer-prefs") || "{}"); }
    catch { return {}; }
  })();
  const [layerPanelOpen, setLayerPanelOpen] = useState(savedPrefs.layerPanelOpen ?? !isMobile);
  const [layerVisibility, setLayerVisibility] = useState({
    showPosa: savedPrefs.showPosa ?? true,
    showLavoro: savedPrefs.showLavoro ?? true,
    showAppuntamento: savedPrefs.showAppuntamento ?? true,
    showMerce: savedPrefs.showMerce ?? true,
    showGoogleBusy: savedPrefs.showGoogleBusy ?? true,
    showLeaves: savedPrefs.showLeaves ?? true,
  });
  const setLayer = useCallback((layer: keyof typeof layerVisibility, v: boolean) => {
    setLayerVisibility(prev => ({ ...prev, [layer]: v }));
  }, []);
  const { showPosa, showLavoro, showAppuntamento, showMerce, showGoogleBusy, showLeaves } = layerVisibility;
  const [visibleEmployeeIds, setVisibleEmployeeIds] = useState<Set<string> | null>(
    savedPrefs.visibleEmployeeIds ? new Set<string>(savedPrefs.visibleEmployeeIds) : null
  );
  const [visibleTeamIds, setVisibleTeamIds] = useState<Set<string> | null>(
    savedPrefs.visibleTeamIds ? new Set<string>(savedPrefs.visibleTeamIds) : null
  );

  // Persist layer prefs to localStorage (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const prefs = {
        layerPanelOpen,
        ...layerVisibility,
        visibleEmployeeIds: visibleEmployeeIds ? Array.from(visibleEmployeeIds) : null,
        visibleTeamIds: visibleTeamIds ? Array.from(visibleTeamIds) : null,
      };
      localStorage.setItem("calendar-layer-prefs", JSON.stringify(prefs));
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [layerPanelOpen, layerVisibility, visibleEmployeeIds, visibleTeamIds]);

  // Compute a ±2-month window around the current date for calendar queries
  const calendarRangeStart = useMemo(() => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - 2);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }, [currentDate]);
  const calendarRangeEnd = useMemo(() => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + 3);
    d.setDate(0);
    return d.toISOString().slice(0, 10);
  }, [currentDate]);

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: [...queryKeys.calendarOrders.list(effectiveCompany?.id), calendarRangeStart, calendarRangeEnd],
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
        .or(`work_start_date.lte.${calendarRangeEnd},expected_date.lte.${calendarRangeEnd},warehouse_arrival_date.lte.${calendarRangeEnd}`)
        .or(`work_end_date.gte.${calendarRangeStart},work_start_date.gte.${calendarRangeStart},expected_date.gte.${calendarRangeStart},warehouse_arrival_date.gte.${calendarRangeStart}`)
        .order("work_start_date", { ascending: true })
        .limit(1000);

      if (error) throw error;
      return (data || []) as CalendarOrder[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Fetch all profiles for the company (small, cached)
  const { data: companyProfiles = [] } = useQuery({
    queryKey: ["company-profiles", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", effectiveCompany.id);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Fetch appointments
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", effectiveCompany?.id, calendarRangeStart, calendarRangeEnd],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          order:orders!appointments_order_id_fkey(order_code, description)
        `)
        .eq("company_id", effectiveCompany.id)
        // B10 — rimosso .is("calendar_id", null) che escludeva appuntamenti con calendario specifico
        .gte("appointment_date", calendarRangeStart)
        .lte("appointment_date", calendarRangeEnd)
        .order("appointment_date", { ascending: true })
        .limit(1000);
      if (error) throw error;

      return (data || []) as CalendarAppointment[];
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
        .select("id, first_name, last_name, user_id")
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

  // Approved leaves for calendar
  // B11 — usa calendarRangeStart/End invece dell'anno solare fisso
  const { data: approvedLeaves = [] } = useQuery({
    queryKey: ["approved-leaves", effectiveCompany?.id, calendarRangeStart, calendarRangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, employee_id, type, start_date, end_date, total_days, total_hours, employee:employees!leave_requests_employee_id_fkey(id, first_name, last_name)")
        .eq("company_id", effectiveCompany!.id)
        .eq("status", "approved")
        .gte("start_date", calendarRangeStart)
        .lte("end_date", calendarRangeEnd)
        .order("start_date");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Warehouse items for enriched "Arrivo Merce" events
  const { data: warehouseItems = [] } = useQuery({
    queryKey: ["calendar-warehouse-items", effectiveCompany?.id, calendarRangeStart, calendarRangeEnd],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name, status, order_id")
        .eq("order.company_id", effectiveCompany.id)
        .not("order_id", "is", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
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

  // Build warehouse info map: orderId → CalendarWarehouseInfo
  const warehouseInfoByOrderId = useMemo(() => {
    const map = new Map<string, CalendarWarehouseInfo>();
    for (const item of warehouseItems) {
      if (!item.order_id) continue;
      const order = orders.find(o => o.id === item.order_id);
      if (!order) continue;
      const existing = map.get(item.order_id) ?? {
        orderId: item.order_id,
        orderCode: order.order_code,
        customerName: `${order.customer.first_name} ${order.customer.last_name}`,
        readyCount: 0,
        pendingCount: 0,
        items: [],
      };
      const isReady = item.status === "in_magazzino" || item.status === "installato";
      if (isReady) existing.readyCount++;
      else existing.pendingCount++;
      if (existing.items.length < 10) {
        existing.items.push({ id: item.id, name: item.name, status: item.status ?? "" });
      }
      map.set(item.order_id, existing);
    }
    return map;
  }, [warehouseItems, orders]);

  const goToToday = () => {
    setCurrentDate(new Date());
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
        // Resource layer filtering
        const effectiveEmployeeIds = visibleEmployeeIds ?? new Set(companyEmployees.map(e => e.id));
        const effectiveTeamIds = visibleTeamIds ?? new Set(externalTeams.map(t => t.id));
        const hasVisibleEmployee = !order.order_employees?.length || order.order_employees.some(ae => effectiveEmployeeIds.has(ae.employee.id));
        const hasVisibleTeam = !order.order_external_teams?.length || order.order_external_teams.some(aet => effectiveTeamIds.has(aet.external_team.id));
        if (!hasVisibleEmployee && !hasVisibleTeam) return false;
        return true;
      });
  }, [orders, statusFilter, customerFilter, employeeFilter, externalTeamFilter, visibleEmployeeIds, visibleTeamIds, companyEmployees, externalTeams]);

  // Enrich appointments with assigned profile names (using cached company profiles)
  const profilesById = useMemo(() => {
    return new Map(companyProfiles.map(p => [p.id, p]));
  }, [companyProfiles]);

  const enrichedAppointments = useMemo(() => {
    return appointments.map(apt => ({
      ...apt,
      assigned_profile: apt.assigned_to ? profilesById.get(apt.assigned_to) ?? null : null,
    }));
  }, [appointments, profilesById]);

  // Filter appointments by assignedTo
  const filteredAppointments = useMemo(() => {
    if (assignedToFilter === "all") return enrichedAppointments;
    return enrichedAppointments.filter(apt => apt.assigned_to === assignedToFilter);
  }, [enrichedAppointments, assignedToFilter]);

  // Compute hidden event types for views
  const hiddenEventTypes = useMemo(() => {
    const hidden = new Set<string>();
    if (!showPosa) hidden.add("posa");
    if (!showLavoro) hidden.add("lavoro");
    if (!showAppuntamento) hidden.add("appuntamento");
    if (!showMerce) hidden.add("merce");
    if (!showGoogleBusy) hidden.add("google_busy");
    if (!showLeaves) hidden.add("leaves");
    return hidden;
  }, [showPosa, showLavoro, showAppuntamento, showMerce, showGoogleBusy, showLeaves]);

  // Effective visible sets for layer panel
  const effectiveVisibleEmployees = useMemo(() => visibleEmployeeIds ?? new Set(companyEmployees.map(e => e.id)), [visibleEmployeeIds, companyEmployees]);
  const effectiveVisibleTeams = useMemo(() => visibleTeamIds ?? new Set(externalTeams.map(t => t.id)), [visibleTeamIds, externalTeams]);

  // M13 — ordini non pianificati con drawer
  const [unplannedOpen, setUnplannedOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [notifyingConflict, setNotifyingConflict] = useState<string | null>(null);
  const [mobileLayerOpen, setMobileLayerOpen] = useState(false);
  const unplannedOrders = useMemo(() => {
    return orders.filter(order => !order.expected_date && !order.work_start_date);
  }, [orders]);
  const unplannedOrdersCount = unplannedOrders.length;

  // Build employee user_id → employee mapping for conflict detection bridge
  const employeeByUserId = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const emp of companyEmployees) {
      if (emp.user_id) {
        map.set(emp.user_id, { id: emp.id, name: `${emp.first_name} ${emp.last_name}` });
      }
    }
    return map;
  }, [companyEmployees]);

  // Conflict detection
  const { conflicts, conflictCount } = useConflictDetection(scheduledOrders, filteredAppointments, employeeByUserId);

  return (
    <div className="space-y-4">
      {/* Header compatto: titolo + toggle viste + azioni */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">Calendario Lavori</h1>
          {conflictCount > 0 && (
            <Badge
              variant="destructive"
              className="gap-1 cursor-pointer"
              onClick={() => setConflictsOpen(true)}
            >
              <AlertTriangle className="h-3 w-3" />
              {conflictCount} conflitti
            </Badge>
          )}
        </div>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => value && setView(value as CalendarViewType)}
          className="bg-muted rounded-lg p-1"
        >
          <ToggleGroupItem value="month" aria-label="Vista Mese" className="gap-1.5 px-2.5">
            <CalendarIcon className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Mese</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="Vista Settimana" className="gap-1.5 px-2.5">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Settimana</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="day" aria-label="Vista Giorno" className="gap-1.5 px-2.5">
            <CalendarRange className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Giorno</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="heatmap" aria-label="Vista Carico" className="gap-1.5 px-2.5">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Carico</span>
          </ToggleGroupItem>
          {!isMobile && (
            <ToggleGroupItem value="gantt" aria-label="Vista Gantt" className="gap-1.5 px-2.5">
              <GanttChart className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Gantt</span>
            </ToggleGroupItem>
          )}
        </ToggleGroup>

        <div className="flex items-center gap-2">
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 relative">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filtri</span>
                {hasActiveFilters && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {[statusFilter, customerFilter, employeeFilter, externalTeamFilter, assignedToFilter].filter(f => f !== "all").length}
                  </span>
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>

          <Button variant="outline" size="sm" onClick={goToToday} className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Oggi</span>
          </Button>

          <Button variant="default" size="sm" onClick={() => setAppointmentDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Appuntamento</span>
          </Button>

          {/* Secondary actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => isMobile ? setMobileLayerOpen(true) : setLayerPanelOpen(!layerPanelOpen)}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                {layerPanelOpen && !isMobile ? "Nascondi Layer" : "Mostra Layer"}
              </DropdownMenuItem>
              {isGoogleConnected && (
                <DropdownMenuItem
                  disabled={syncing}
                  onSelect={async () => {
                    setSyncing(true);
                    await pullBusySlots();
                    queryClient.invalidateQueries({ queryKey: ["gcal-busy-slots"] });
                    setSyncing(false);
                  }}
                  className="gap-2"
                >
                  <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                  Sync Google Calendar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => exportAppointmentsIcal(filteredAppointments, scheduledOrders)}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Esporta iCal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filtri attivi come chip */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5">
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Stato: {statuses.find(s => s.id === statusFilter)?.name ?? statusFilter}
              <button onClick={() => setStatusFilter("all")} className="ml-0.5 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {customerFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Cliente: {uniqueCustomers.find(c => c.id === customerFilter)?.last_name ?? customerFilter}
              <button onClick={() => setCustomerFilter("all")} className="ml-0.5 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {employeeFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Operaio: {companyEmployees.find(e => e.id === employeeFilter)?.last_name ?? employeeFilter}
              <button onClick={() => setEmployeeFilter("all")} className="ml-0.5 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {externalTeamFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Squadra: {externalTeams.find(t => t.id === externalTeamFilter)?.name ?? externalTeamFilter}
              <button onClick={() => setExternalTeamFilter("all")} className="ml-0.5 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {assignedToFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Assegnato: {assignableUsers.find(u => u.id === assignedToFilter)?.last_name ?? assignedToFilter}
              <button onClick={() => setAssignedToFilter("all")} className="ml-0.5 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <button onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
            Resetta tutti
          </button>
        </div>
      )}

      {/* Mobile Layer Sheet */}
      {isMobile && (
        <Sheet open={mobileLayerOpen} onOpenChange={setMobileLayerOpen}>
          <SheetContent side="bottom" className="h-[80vh]">
            <SheetHeader>
              <SheetTitle>Gestisci visualizzazione</SheetTitle>
            </SheetHeader>
            <div className="mt-4 overflow-y-auto">
              <CalendarLayerPanel
                employees={companyEmployees}
                externalTeams={externalTeams}
                visibleEmployees={effectiveVisibleEmployees}
                visibleTeams={effectiveVisibleTeams}
                showPosa={showPosa}
                showLavoro={showLavoro}
                showAppuntamento={showAppuntamento}
                showMerce={showMerce}
                showGoogleBusy={showGoogleBusy}
                showLeaves={showLeaves}
                onToggleEmployee={(id) => {
                  const next = new Set(effectiveVisibleEmployees);
                  next.has(id) ? next.delete(id) : next.add(id);
                  setVisibleEmployeeIds(next);
                }}
                onToggleTeam={(id) => {
                  const next = new Set(effectiveVisibleTeams);
                  next.has(id) ? next.delete(id) : next.add(id);
                  setVisibleTeamIds(next);
                }}
                onToggleAllEmployees={(v) => {
                  setVisibleEmployeeIds(v ? new Set(companyEmployees.map(e => e.id)) : new Set());
                }}
                onToggleAllTeams={(v) => {
                  setVisibleTeamIds(v ? new Set(externalTeams.map(t => t.id)) : new Set());
                }}
                onTogglePosa={(v) => setLayer("showPosa", v)}
                onToggleLavoro={(v) => setLayer("showLavoro", v)}
                onToggleAppuntamento={(v) => setLayer("showAppuntamento", v)}
                onToggleMerce={(v) => setLayer("showMerce", v)}
                onToggleGoogleBusy={(v) => setLayer("showGoogleBusy", v)}
                onToggleLeaves={(v) => setLayer("showLeaves", v)}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Pannello filtri collassabile */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent>
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[170px]">
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
                <SelectTrigger className="w-full sm:w-[180px]">
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
                <SelectTrigger className="w-full sm:w-[180px]">
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
                <SelectTrigger className="w-full sm:w-[180px]">
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
                <SelectTrigger className="w-full sm:w-[180px]">
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
                <Badge
                  variant="destructive"
                  className="gap-1 cursor-pointer"
                  onClick={() => setUnplannedOpen(true)}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {unplannedOrdersCount} non pianificati
                </Badge>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-96 gap-4 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p>Errore nel caricamento dei dati del calendario</p>
              <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all })}>
                Riprova
              </Button>
            </div>
          ) : view === "month" ? (
            <CalendarMonthView
              orders={scheduledOrders}
              appointments={filteredAppointments}
              busySlots={showGoogleBusy ? busySlots : []}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              syncedAppointmentIds={syncedAppointmentIds}
              hiddenEventTypes={hiddenEventTypes}
              approvedLeaves={showLeaves ? approvedLeaves : []}
              warehouseInfo={warehouseInfoByOrderId}
            />
          ) : view === "week" ? (
            <CalendarWeekView
              orders={scheduledOrders}
              appointments={filteredAppointments}
              busySlots={showGoogleBusy ? busySlots : []}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              syncedAppointmentIds={syncedAppointmentIds}
              hiddenEventTypes={hiddenEventTypes}
              approvedLeaves={showLeaves ? approvedLeaves : []}
              warehouseInfo={warehouseInfoByOrderId}
            />
          ) : view === "day" ? (
            <CalendarDayView
              orders={scheduledOrders}
              appointments={filteredAppointments}
              busySlots={showGoogleBusy ? busySlots : []}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              syncedAppointmentIds={syncedAppointmentIds}
              hiddenEventTypes={hiddenEventTypes}
              approvedLeaves={showLeaves ? approvedLeaves : []}
              warehouseInfo={warehouseInfoByOrderId}
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
        </div>

        {layerPanelOpen && !isMobile && (
          <CalendarLayerPanel
            employees={companyEmployees}
            externalTeams={externalTeams}
            visibleEmployees={effectiveVisibleEmployees}
            visibleTeams={effectiveVisibleTeams}
            showPosa={showPosa}
            showLavoro={showLavoro}
            showAppuntamento={showAppuntamento}
            showMerce={showMerce}
            showGoogleBusy={showGoogleBusy}
            showLeaves={showLeaves}
            onToggleEmployee={(id) => {
              const next = new Set(effectiveVisibleEmployees);
              next.has(id) ? next.delete(id) : next.add(id);
              setVisibleEmployeeIds(next);
            }}
            onToggleTeam={(id) => {
              const next = new Set(effectiveVisibleTeams);
              next.has(id) ? next.delete(id) : next.add(id);
              setVisibleTeamIds(next);
            }}
            onToggleAllEmployees={(v) => {
              setVisibleEmployeeIds(v ? new Set(companyEmployees.map(e => e.id)) : new Set());
            }}
            onToggleAllTeams={(v) => {
              setVisibleTeamIds(v ? new Set(externalTeams.map(t => t.id)) : new Set());
            }}
            onTogglePosa={(v) => setLayer("showPosa", v)}
            onToggleLavoro={(v) => setLayer("showLavoro", v)}
            onToggleAppuntamento={(v) => setLayer("showAppuntamento", v)}
            onToggleMerce={(v) => setLayer("showMerce", v)}
            onToggleGoogleBusy={(v) => setLayer("showGoogleBusy", v)}
            onToggleLeaves={(v) => setLayer("showLeaves", v)}
          />
        )}
      </div>

      <AppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={setAppointmentDialogOpen}
        hideMarketingFields
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
        }}
        showOrderSelect={true}
      />

      {/* M13 — Drawer ordini non pianificati */}
      <Sheet open={unplannedOpen} onOpenChange={setUnplannedOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Da pianificare ({unplannedOrders.length})
            </SheetTitle>
            <SheetDescription>
              Questi ordini non hanno ancora una data di posa o inizio lavori.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2 overflow-y-auto flex-1">
            {unplannedOrders.map(order => (
              <div key={order.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    {order.order_code ? `${order.order_code} · ` : ""}
                    {order.customer.first_name} {order.customer.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{order.description}</p>
                </div>
                <Link
                  to={`/azienda/ordini/${order.id}`}
                  onClick={() => setUnplannedOpen(false)}
                  className="shrink-0"
                >
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Pianifica
                  </Button>
                </Link>
              </div>
            ))}
            {unplannedOrders.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                Tutti gli ordini hanno una data pianificata.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {/* Conflicts Sheet */}
      <Sheet open={conflictsOpen} onOpenChange={setConflictsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Conflitti risorse ({conflictCount})
            </SheetTitle>
            <SheetDescription>
              Tecnici assegnati a più eventi nello stesso giorno.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-3 mt-4">
            {conflicts.map((conflict, idx) => (
              <div key={idx} className="border border-destructive/30 rounded-lg p-3 space-y-2 bg-destructive/5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{conflict.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{conflict.date}</p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs shrink-0"
                            disabled
                          >
                            Notifica
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Configura le email dei dipendenti per attivare le notifiche</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="space-y-1">
                  {conflict.events.map((evt, ei) => (
                    <div key={ei} className={`text-xs px-2 py-0.5 rounded flex items-center gap-1.5 ${evt.type === "order" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"}`}>
                      <span>{evt.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {conflicts.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                Nessun conflitto rilevato.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function Calendar() {
  return (
    <ErrorBoundary title="Errore nel calendario">
      <CalendarInner />
    </ErrorBoundary>
  );
}

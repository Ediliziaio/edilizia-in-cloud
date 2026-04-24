import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { useAppleCalendarSync } from "@/hooks/useAppleCalendarSync";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { ApiHealthBanner } from "@/components/marketing/ApiHealthBanner";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useIsAdminMarketing } from "@/hooks/useMarketingRoutePrefix";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  startOfWeek,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addDays,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  subDays,
  format,
  isSameDay,
  parseISO,
} from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Settings,
  Calendar as CalendarIcon,
  List as ListIcon,
  Grid3x3,
  Rows3,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/hooks/usePermissions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MarketingCalendarWeekView from "@/components/marketing/MarketingCalendarWeekView";
import MarketingCalendarDayView from "@/components/marketing/MarketingCalendarDayView";
import type { TravelLeg } from "@/types/marketingCalendar";
import { timeToMin, addMinutesToTimeStr } from "@/lib/marketingCalendarConstants";
import MarketingCalendarMonthView from "@/components/marketing/MarketingCalendarMonthView";
import MarketingCalendarFilters from "@/components/marketing/MarketingCalendarFilters";
import MarketingAppointmentsList from "@/components/marketing/MarketingAppointmentsList";
import MarketingAppointmentDialog, { type MarketingAppointmentData } from "@/components/marketing/MarketingAppointmentDialog";

type TabKey = "calendar" | "list";
type CalendarView = "day" | "week" | "month";

export default function MarketingCalendar() {
  const navigate = useNavigate();
  const isAdminContext = useIsAdminMarketing();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const { isGoogleConnected } = useGoogleCalendarSync();
  const { isAppleConnected } = useAppleCalendarSync();

  // Fetch Google busy slots for marketing calendar overlay
  const { data: googleBusySlots = [] } = useQuery({
    queryKey: ["gcal-busy-slots", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("google_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, google_calendar_id")
        .eq("company_id", companyId);
      return data || [];
    },
    enabled: !!companyId && isGoogleConnected,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch Apple Calendar busy slots for marketing calendar overlay
  const { data: appleBusySlots = [] } = useQuery({
    queryKey: ["apple-busy-slots", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("apple_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, caldav_calendar_url")
        .eq("company_id", companyId);
      return (data || []).map((s: any) => ({
        ...s,
        google_calendar_id: s.caldav_calendar_url,
        provider: "apple",
      }));
    },
    enabled: !!companyId && isAppleConnected,
    staleTime: 2 * 60 * 1000,
  });

  const busySlots = [...googleBusySlots, ...appleBusySlots];

  const [activeTab, setActiveTab] = useState<TabKey>("calendar");
  // Su mobile default a "day", su desktop a "week"
  const [calendarView, setCalendarView] = useState<CalendarView>(
    typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "week"
  );
  const [currentDate, setCurrentDate] = useState(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<MarketingAppointmentData | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();
  const [defaultTime, setDefaultTime] = useState<string | undefined>();

  // Filter state
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const filtersInitialized = useRef(false);

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate]
  );

  // Fetch calendars
  const { data: calendars = [] } = useQuery({
    queryKey: ["marketing-calendars", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_calendars")
        .select("id, name, is_active, base_lat, base_lng, base_formatted_address, duration_minutes")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Fetch assignable users — FIX: usa useCompanyStaffUsers che filtra per
  // user_roles (escludendo customer/referrer/platform_*). Prima la query
  // restituiva anche i clienti con record orfani in staff_permissions.
  const { data: rawStaffUsers = [] } = useCompanyStaffUsers(companyId);
  const users = useMemo(
    () =>
      rawStaffUsers.map((u) => ({
        id: u.id,
        first_name: u.first_name ?? "",
        last_name: u.last_name ?? "",
      })),
    [rawStaffUsers]
  );

  // Initialize filters once when data loads
  useEffect(() => {
    if (filtersInitialized.current) return;
    if (calendars.length > 0) {
      setSelectedCalendarIds(calendars.map((c) => c.id));
    }
    if (users.length > 0) {
      setSelectedUserIds(users.map((u) => u.id));
    }
    if (calendars.length > 0 && users.length > 0) {
      filtersInitialized.current = true;
    }
  }, [calendars, users]);

  // Compute date range for query based on view
  const dateRange = useMemo(() => {
    if (activeTab === "list") {
      // For list view, fetch a wide range (1 year back + 1 year ahead)
      const start = format(subMonths(currentDate, 12), "yyyy-MM-dd");
      const end = format(addMonths(currentDate, 12), "yyyy-MM-dd");
      return { start, end };
    }
    if (calendarView === "day") {
      const start = format(subDays(currentDate, 1), "yyyy-MM-dd");
      const end = format(addDays(currentDate, 1), "yyyy-MM-dd");
      return { start, end };
    }
    if (calendarView === "week") {
      const start = format(subWeeks(weekStart, 1), "yyyy-MM-dd");
      const end = format(addWeeks(weekStart, 2), "yyyy-MM-dd");
      return { start, end };
    }
    // month
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const start = format(startOfWeek(monthStart, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const end = format(endOfWeek(monthEnd, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return { start, end };
  }, [activeTab, calendarView, currentDate, weekStart]);

  // Fetch appointments with date range filter
  const { data: rawAppointments = [], refetch: refetchAppointments } = useQuery({
    queryKey: ["marketing-appointments", companyId, dateRange.start, dateRange.end],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("appointments")
        .select("*")
        .eq("company_id", companyId)
        .not("calendar_id", "is", null)
        .gte("appointment_date", dateRange.start)
        .lte("appointment_date", dateRange.end)
        .order("appointment_date", { ascending: true });
      // Permission enforcement: restrict to assigned appointments only
      if (permissions.onlyAssigned && user?.id) {
        query = query.eq("assigned_to", user.id);
      }
      const { data } = await query;
      return (data || []) as any[];
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Extract unique contact IDs from loaded appointments
  const contactIds = useMemo(() => {
    const ids = rawAppointments
      .map((a: any) => a.contact_id)
      .filter((id: string | null): id is string => !!id);
    return [...new Set(ids)];
  }, [rawAppointments]);

  // Fetch only referenced contacts for enrichment
  const { data: contacts = [] } = useQuery({
    queryKey: ["marketing-contacts-lookup", contactIds],
    queryFn: async () => {
      if (contactIds.length === 0) return [];
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .in("id", contactIds);
      return data || [];
    },
    enabled: contactIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Pre-build lookup maps — performance O(n) invece di O(n*m)
  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users]
  );
  const contactMap = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts]
  );
  const calendarMap = useMemo(
    () => new Map(calendars.map((c) => [c.id, c])),
    [calendars]
  );

  // Enrich with names
  const appointments = useMemo(() => {
    return rawAppointments.map((a: any) => {
      const u = a.assigned_to ? userMap.get(a.assigned_to) : null;
      const contact = a.contact_id ? contactMap.get(a.contact_id) : null;
      return {
        ...a,
        calendar_name: calendarMap.get(a.calendar_id)?.name || null,
        assigned_name: u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() : null,
        contact_name: contact
          ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
          : null,
      };
    });
  }, [rawAppointments, calendarMap, userMap, contactMap]);

  // Filtered
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a: any) => {
      if (!a.calendar_id) return false;
      if (selectedCalendarIds.length > 0 && !selectedCalendarIds.includes(a.calendar_id))
        return false;
      if (selectedUserIds.length > 0 && a.assigned_to && !selectedUserIds.includes(a.assigned_to))
        return false;
      return true;
    });
  }, [appointments, selectedCalendarIds, selectedUserIds]);

  // Compute slot duration from selected calendars
  const slotDurationMinutes = useMemo(() => {
    const selected = calendars.filter((c) => selectedCalendarIds.includes(c.id));
    const durations = selected
      .map((c) => (c as any).duration_minutes as number | null)
      .filter((d): d is number => d != null && d > 0);
    if (durations.length === 0) return 30;
    return Math.min(...durations);
  }, [calendars, selectedCalendarIds]);

  // Get base waypoint from selected calendar
  const baseCalendarWaypoint = useMemo(() => {
    if (selectedCalendarIds.length === 1) {
      const cal = calendars.find((c: any) => c.id === selectedCalendarIds[0]);
      if (cal && (cal as any).base_lat && (cal as any).base_lng) {
        return { lat: (cal as any).base_lat, lng: (cal as any).base_lng };
      }
    }
    return null;
  }, [selectedCalendarIds, calendars]);

  // ── Helper: get appointments with coords for a specific date ──
  const getApptsWithCoordsForDate = useCallback((targetDate: Date) => {
    return filteredAppointments
      .filter(
        (a: any) =>
          isSameDay(parseISO(a.appointment_date), targetDate) &&
          a.lat != null &&
          a.lng != null &&
          !a.is_blocked_slot
      )
      .sort((a: any, b: any) => (a.appointment_time || "09:00").localeCompare(b.appointment_time || "09:00"));
  }, [filteredAppointments]);

  // ── Compute travel legs for a given date ──
  const computeTravelLegsForDate = useCallback(async (aptsWithCoords: any[]): Promise<TravelLeg[]> => {
    const waypoints: { lat: number; lng: number }[] = [];
    if (baseCalendarWaypoint) waypoints.push(baseCalendarWaypoint);
    waypoints.push(...aptsWithCoords.map((a: any) => ({ lat: a.lat, lng: a.lng })));
    if (waypoints.length < 2) return [];
    try {
      const { data, error } = await supabase.functions.invoke("maps-proxy", {
        body: { action: "directions", waypoints },
      });
      if (error || !data?.legs) return [];
      const offset = baseCalendarWaypoint ? 1 : 0;
      return data.legs.map((leg: any, i: number) => {
        const fromIdx = i - offset;
        const toIdx = i - offset + 1;
        if (fromIdx < -1 || toIdx >= aptsWithCoords.length) return null;
        const fromApt = fromIdx >= 0 ? aptsWithCoords[fromIdx] as any : null;
        const toApt = aptsWithCoords[toIdx] as any;
        if (!toApt) return null;
      const fromEnd = fromApt ? (fromApt.appointment_end_time?.slice(0, 5) || addMinutesToTimeStr(fromApt.appointment_time?.slice(0, 5) || "09:00", 60)) : "08:00";
        const travelMin = Math.ceil(leg.duration_s / 60);
        const arrivalMin = timeToMin(fromEnd) + travelMin;
        const toStart = timeToMin(toApt.appointment_time?.slice(0, 5) || "09:00");
        const isLate = arrivalMin > toStart;
        const delayMinutes = isLate ? arrivalMin - toStart : 0;
        return {
          duration_s: leg.duration_s,
          distance_m: leg.distance_m,
          duration_text: leg.duration_text,
          distance_text: leg.distance_text,
          fromId: fromApt?.id || "base",
          toId: toApt.id,
          isLate,
          delayMinutes,
        } as TravelLeg;
      }).filter(Boolean);
    } catch {
      return [];
    }
  }, [baseCalendarWaypoint]);

  // ── Day view travel legs ──
  const dayAppointmentsWithCoords = useMemo(() => {
    if (calendarView !== "day") return [];
    return getApptsWithCoordsForDate(currentDate);
  }, [calendarView, currentDate, getApptsWithCoordsForDate]);

  const { data: travelLegs = [] } = useQuery({
    queryKey: ["travel-legs-day", baseCalendarWaypoint?.lat, dayAppointmentsWithCoords.map((a: any) => a.id).join(",")],
    queryFn: () => computeTravelLegsForDate(dayAppointmentsWithCoords),
    enabled: calendarView === "day" && (dayAppointmentsWithCoords.length >= 2 || (dayAppointmentsWithCoords.length >= 1 && !!baseCalendarWaypoint)),
    staleTime: 5 * 60 * 1000,
  });

  // ── Week view travel legs ──
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const weekDaysWithAppts = useMemo(() => {
    if (calendarView !== "week") return [];
    return weekDays
      .map((day) => ({
        dateKey: format(day, "yyyy-MM-dd"),
        aptsWithCoords: getApptsWithCoordsForDate(day),
      }))
      .filter((d) => d.aptsWithCoords.length >= 2 || (d.aptsWithCoords.length >= 1 && !!baseCalendarWaypoint));
  }, [calendarView, weekDays, getApptsWithCoordsForDate, baseCalendarWaypoint]);

  const weekTravelQueryKey = useMemo(() => {
    return weekDaysWithAppts.map((d) => `${d.dateKey}:${d.aptsWithCoords.map((a: any) => a.id).join(",")}`).join("|");
  }, [weekDaysWithAppts]);

  const { data: weekTravelLegs = {} } = useQuery({
    queryKey: ["travel-legs-week", baseCalendarWaypoint?.lat, weekTravelQueryKey],
    queryFn: async (): Promise<Record<string, TravelLeg[]>> => {
      const result: Record<string, TravelLeg[]> = {};
      const entries = await Promise.all(
        weekDaysWithAppts.map(async ({ dateKey, aptsWithCoords }) => ({
          dateKey,
          legs: await computeTravelLegsForDate(aptsWithCoords),
        }))
      );
      entries.forEach(({ dateKey, legs }) => { result[dateKey] = legs; });
      return result;
    },
    enabled: calendarView === "week" && weekDaysWithAppts.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const handleToggleCalendar = useCallback((id: string) => {
    setSelectedCalendarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleToggleUser = useCallback((id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => {
    if (calendarView === "day") setCurrentDate((d) => subDays(d, 1));
    else if (calendarView === "week") setCurrentDate((d) => subWeeks(d, 1));
    else setCurrentDate((d) => subMonths(d, 1));
  };
  const goNext = () => {
    if (calendarView === "day") setCurrentDate((d) => addDays(d, 1));
    else if (calendarView === "week") setCurrentDate((d) => addWeeks(d, 1));
    else setCurrentDate((d) => addMonths(d, 1));
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setCurrentDate(date);
      setDatePickerOpen(false);
    }
  };

  const dateLabel = useMemo(() => {
    if (calendarView === "day") return format(currentDate, "d MMMM yyyy", { locale: it });
    if (calendarView === "week") {
      const end = addDays(weekStart, 6);
      return `${format(weekStart, "d MMM", { locale: it })} – ${format(end, "d MMM yyyy", { locale: it })}`;
    }
    return format(currentDate, "MMMM yyyy", { locale: it });
  }, [calendarView, currentDate, weekStart]);

  // True solo se currentDate è oggi (feedback visivo bottone "Oggi")
  const isCurrentDateToday = useMemo(() => isSameDay(currentDate, new Date()), [currentDate]);

  // KPI header: appuntamenti visibili / oggi / fuori orario concordato
  const headerStats = useMemo(() => {
    const today = new Date();
    const todayCount = appointments.filter((a: any) =>
      a.appointment_date && isSameDay(parseISO(a.appointment_date), today)
    ).length;
    const visible = filteredAppointments.length;
    return { todayCount, visible };
  }, [appointments, filteredAppointments]);

  // Filtri attivi (per badge pulsante filtri)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (calendars.length > 0 && selectedCalendarIds.length < calendars.length) count++;
    if (users.length > 0 && selectedUserIds.length < users.length) count++;
    return count;
  }, [calendars.length, selectedCalendarIds.length, users.length, selectedUserIds.length]);

  // Mobile filters drawer
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const openNewDialog = (date?: Date, hour?: number, minute?: number) => {
    setEditingAppointment(null);
    setDefaultDate(date ? format(date, "yyyy-MM-dd") : undefined);
    setDefaultTime(hour !== undefined ? `${String(hour).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}` : undefined);
    setDialogOpen(true);
  };

  const openEditDialog = (apt: any) => {
    setEditingAppointment({
      id: apt.id,
      title: apt.title,
      description: apt.description,
      appointment_date: apt.appointment_date,
      appointment_time: apt.appointment_time,
      appointment_end_time: apt.appointment_end_time,
      appointment_type: apt.appointment_type,
      assigned_to: apt.assigned_to,
      calendar_id: apt.calendar_id,
      contact_id: apt.contact_id,
      status: apt.status,
      is_completed: apt.is_completed,
      is_blocked_slot: apt.is_blocked_slot,
      internal_notes: apt.internal_notes,
      address_line: apt.address_line,
      address_city: apt.address_city,
      address_postal_code: apt.address_postal_code,
      address_province: apt.address_province,
      address_country: apt.address_country,
      address_notes: apt.address_notes,
      formatted_address: apt.formatted_address,
      lat: apt.lat,
      lng: apt.lng,
      place_id: apt.place_id,
    });
    setDialogOpen(true);
  };

  // ── Drag & Drop handler ──
  const handleDropAppointment = useCallback(async (appointmentId: string, newDate: string, newTime?: string) => {
    const current = appointments.find((a: any) => a.id === appointmentId);
    if (current) {
      const sameDate = current.appointment_date === newDate;
      const sameTime = !newTime || (current.appointment_time?.slice(0, 5) === newTime.slice(0, 5));
      if (sameDate && sameTime) return;
    }

    const oldDate = current?.appointment_date;
    const oldTime = current?.appointment_time;
    const oldEndTime = current?.appointment_end_time;

    const updateData: Record<string, string | null> = { appointment_date: newDate };
    if (newTime) {
      updateData.appointment_time = newTime;
      if (current?.appointment_time && current?.appointment_end_time) {
        const durationMin = timeToMin(current.appointment_end_time) - timeToMin(current.appointment_time);
        if (durationMin > 0) {
          updateData.appointment_end_time = addMinutesToTimeStr(newTime, durationMin);
        }
      }
    }

    if (!companyId) return;
    const { error } = await supabase
      .from("appointments")
      .update(updateData)
      .eq("id", appointmentId)
      .eq("company_id", companyId);

    if (error) {
      toast.error("Errore nello spostamento dell'appuntamento");
      return;
    }

    const label = newTime ? `${newDate} alle ${newTime}` : newDate;
    toast.success(`Appuntamento spostato al ${label}`, {
      action: {
        label: "Annulla",
        onClick: async () => {
          const rollback: Record<string, string | null> = {};
          if (oldDate) rollback.appointment_date = oldDate;
          if (oldTime) rollback.appointment_time = oldTime;
          if (oldEndTime !== undefined) rollback.appointment_end_time = oldEndTime;
          const { error: undoError } = await supabase
            .from("appointments")
            .update(rollback)
            .eq("id", appointmentId)
            .eq("company_id", companyId!);
          if (undoError) {
            toast.error("Errore nell'annullamento");
          } else {
            toast.info("Spostamento annullato");
            refetchAppointments();
            queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
            queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
            queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
          }
        },
      },
    });
    refetchAppointments();
    queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
    queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
  }, [appointments, refetchAppointments, queryClient, companyId]);

  // ── Resize handler ──
  const handleResizeAppointment = useCallback(async (appointmentId: string, newEndTime: string) => {
    if (!companyId) return;

    const { error } = await supabase
      .from("appointments")
      .update({ appointment_end_time: newEndTime })
      .eq("id", appointmentId)
      .eq("company_id", companyId);

    if (error) {
      toast.error("Errore nel ridimensionamento");
      return;
    }
    toast.success(`Durata aggiornata fino alle ${newEndTime}`);
    refetchAppointments();
    queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
    queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
  }, [refetchAppointments, queryClient, companyId]);

  const tabs = [
    { key: "calendar" as const, label: "Calendario", icon: CalendarIcon },
    { key: "list" as const, label: "Elenco", icon: ListIcon },
  ];

  const viewIcons = {
    day: Rows3,
    week: CalendarIcon,
    month: Grid3x3,
  } as const;

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <ApiHealthBanner filter={["googlemaps"]} />

      {/* Header redesign */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Calendario appuntamenti</h1>
            <p className="text-sm text-muted-foreground">
              {headerStats.visible} visibili · <span className="font-medium text-foreground">{headerStats.todayCount}</span> oggi
              {activeFilterCount > 0 && (
                <>
                  {" "}·{" "}
                  <span className="text-primary font-medium">
                    {activeFilterCount} filtro{activeFilterCount > 1 ? "i" : ""} attiv{activeFilterCount > 1 ? "i" : "o"}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isAdminContext && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate("/azienda/impostazioni/calendari")}
              className="h-9 gap-1 text-muted-foreground hover:text-foreground"
              title="Impostazioni calendari"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden md:inline">Impostazioni</span>
            </Button>
          )}
          <Button size="sm" onClick={() => openNewDialog()} className="h-9">
            <Plus className="h-4 w-4 mr-1.5" />
            Nuovo appuntamento
          </Button>
        </div>
      </div>

      {/* Tab bar con icona */}
      <div className="border-b">
        <nav className="-mb-px flex items-center gap-1 overflow-x-auto" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === "calendar" && (
        <div className="flex gap-0 h-[calc(100vh-240px)] md:h-[calc(100vh-220px)]">
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {/* Navigation bar — redesign responsive */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={isCurrentDateToday ? "default" : "outline"}
                size="sm"
                className="h-9 px-3"
                onClick={goToday}
                aria-label="Vai a oggi"
              >
                Oggi
              </Button>
              <div className="flex items-center border rounded-md h-9">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-9 rounded-r-none"
                  onClick={goPrev}
                  aria-label="Periodo precedente"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="w-px h-5 bg-border" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-9 rounded-l-none"
                  onClick={goNext}
                  aria-label="Periodo successivo"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors cursor-pointer truncate max-w-[160px] md:max-w-none h-9 px-2 rounded-md hover:bg-muted/50"
                    aria-label="Apri selezione data"
                  >
                    <CalendarIcon className="h-3.5 w-3.5 opacity-60 shrink-0" />
                    <span className="truncate">{dateLabel}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={currentDate}
                    onSelect={handleDateSelect}
                    locale={it}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <div className="flex-1" />

              {/* Mobile: filtri drawer */}
              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 md:hidden gap-1.5"
                    aria-label="Apri filtri"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filtri
                    {activeFilterCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground"
                      >
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] sm:w-[320px] p-0 overflow-hidden">
                  <SheetHeader className="p-4 border-b">
                    <SheetTitle className="flex items-center gap-2 text-base">
                      <SlidersHorizontal className="h-4 w-4 text-primary" />
                      Filtri
                    </SheetTitle>
                  </SheetHeader>
                  <div className="overflow-y-auto h-[calc(100%-60px)]">
                    <MarketingCalendarFilters
                      calendars={calendars}
                      users={users}
                      selectedCalendarIds={selectedCalendarIds}
                      selectedUserIds={selectedUserIds}
                      onToggleCalendar={handleToggleCalendar}
                      onToggleUser={handleToggleUser}
                      inSheet
                    />
                  </div>
                </SheetContent>
              </Sheet>

              {/* View picker segmented */}
              <div className="inline-flex items-center rounded-md border h-9 bg-background">
                {(["day", "week", "month"] as CalendarView[]).map((v) => {
                  const Icon = viewIcons[v];
                  const label = v === "day" ? "Giorno" : v === "week" ? "Settimana" : "Mese";
                  const active = calendarView === v;
                  return (
                    <button
                      key={v}
                      onClick={() => setCalendarView(v)}
                      className={cn(
                        "h-full px-2.5 md:px-3 text-xs md:text-sm font-medium transition-colors inline-flex items-center gap-1.5 first:rounded-l-md last:rounded-r-md",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                      aria-label={`Vista ${label}`}
                      aria-pressed={active}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {calendarView === "week" && (
              <MarketingCalendarWeekView
                weekStart={weekStart}
                appointments={filteredAppointments}
                calendarIds={calendars.map((c) => c.id)}
                onClickAppointment={openEditDialog}
                onClickSlot={(date, hour, minute) => openNewDialog(date, hour, minute)}
                travelLegs={weekTravelLegs}
                onDropAppointment={(id, date, time) => handleDropAppointment(id, date, time)}
                slotDurationMinutes={slotDurationMinutes}
                onResizeAppointment={handleResizeAppointment}
                busySlots={busySlots}
              />
            )}
            {calendarView === "day" && (
              <MarketingCalendarDayView
                date={currentDate}
                appointments={filteredAppointments}
                calendarIds={calendars.map((c) => c.id)}
                onClickAppointment={openEditDialog}
                onClickSlot={(date, hour, minute) => openNewDialog(date, hour, minute)}
                travelLegs={travelLegs}
                onDropAppointment={(id, date, time) => handleDropAppointment(id, date, time)}
                slotDurationMinutes={slotDurationMinutes}
                onResizeAppointment={handleResizeAppointment}
                busySlots={busySlots}
              />
            )}
            {calendarView === "month" && (
              <MarketingCalendarMonthView
                currentDate={currentDate}
                appointments={filteredAppointments}
                calendarIds={calendars.map((c) => c.id)}
                onClickAppointment={openEditDialog}
                onClickDay={(date) => openNewDialog(date)}
                onDropAppointment={(id, date) => handleDropAppointment(id, date)}
              />
            )}
          </div>

          <div className="hidden md:block">
            <MarketingCalendarFilters
              calendars={calendars}
              users={users}
              selectedCalendarIds={selectedCalendarIds}
              selectedUserIds={selectedUserIds}
              onToggleCalendar={handleToggleCalendar}
              onToggleUser={handleToggleUser}
            />
          </div>
        </div>
      )}

      {activeTab === "list" && (
        <MarketingAppointmentsList
          appointments={filteredAppointments}
          onRefresh={() => refetchAppointments()}
          onClickAppointment={openEditDialog}
        />
      )}

      <MarketingAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editingAppointment}
        onSaved={() => {
          refetchAppointments();
          queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
          queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
          queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
          queryClient.invalidateQueries({ queryKey: ["contact_appointments"] });
          queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
        }}
        calendars={calendars}
        users={users}
        defaultDate={defaultDate}
        defaultTime={defaultTime}
      />
    </div>
  );
}

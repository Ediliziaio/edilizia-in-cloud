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
  CalendarPlus,
  List as ListIcon,
  Grid3x3,
  SlidersHorizontal,
  AlertCircle,
  Link2,
  Clock,
  Users,
  RefreshCw,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { usePermissions } from "@/hooks/usePermissions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  const googleSync = useGoogleCalendarSync();
  const appleSync = useAppleCalendarSync();
  const { isGoogleConnected } = googleSync;
  const { isAppleConnected } = appleSync;
  const calendarSettingsPath = isAdminContext
    ? "/admin/impostazioni/calendari"
    : "/azienda/impostazioni/calendari";

  // Fetch Google busy slots for marketing calendar overlay.
  // 2026-05-26: enabled allargato a `hasGoogleConnection` (era isGoogleConnected
  // che richiedeva anche primary_calendar_id != null). Adesso il sync function
  // setta automaticamente "primary" come default, ma se la query partiva prima
  // del sync iniziale, restava disabilitata fino a hard refresh.
  const { data: googleBusySlots = [], error: googleBusyError, refetch: refetchGoogleBusySlots } = useQuery({
    queryKey: ["gcal-busy-slots", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("google_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, google_calendar_id")
        .eq("company_id", companyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && googleSync.hasGoogleConnection,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch Apple Calendar busy slots for marketing calendar overlay
  const { data: appleBusySlots = [], error: appleBusyError, refetch: refetchAppleBusySlots } = useQuery({
    queryKey: ["apple-busy-slots", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("apple_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, caldav_calendar_url")
        .eq("company_id", companyId);
      if (error) throw error;
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
  // Marketing e vendite: lettura unica mensile per lead, sopralluoghi e appuntamenti commerciali.
  const [calendarView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<MarketingAppointmentData | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();
  const [defaultTime, setDefaultTime] = useState<string | undefined>();
  const [syncingExternal, setSyncingExternal] = useState(false);

  // Filter state
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const calendarFiltersInitialized = useRef(false);
  const userFiltersInitialized = useRef(false);

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate]
  );

  // Fetch calendars
  const { data: calendars = [], error: calendarsError, refetch: refetchCalendars } = useQuery({
    queryKey: ["marketing-calendars", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("id, name, is_active, base_lat, base_lng, base_formatted_address, duration_minutes, default_meeting_provider, default_meeting_enabled")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  const hasCalendars = calendars.length > 0;

  // Fetch assignable users — FIX: scope "sales" per mostrare SOLO ruoli
  // commerciali nel calendario CRM (admin, salesperson, call_center).
  // Esclude operai/dipendenti generici e tutti gli esterni.
  const { data: rawStaffUsers = [] } = useCompanyStaffUsers(companyId, "sales");
  const users = useMemo(
    () =>
      rawStaffUsers.map((u) => ({
        id: u.id,
        first_name: u.first_name ?? "",
        last_name: u.last_name ?? "",
      })),
    [rawStaffUsers]
  );

  // Initialize each filter group once when its own data arrives.
  useEffect(() => {
    if (!calendarFiltersInitialized.current && calendars.length > 0) {
      setSelectedCalendarIds(calendars.map((c) => c.id));
      calendarFiltersInitialized.current = true;
    }
    if (!userFiltersInitialized.current && users.length > 0) {
      setSelectedUserIds(users.map((u) => u.id));
      userFiltersInitialized.current = true;
    }
  }, [calendars, users]);

  // 2026-05-26: Realtime bidirezionale.
  //
  // Quando il webhook Google notifica un cambiamento (evento creato/modificato/
  // cancellato su Google Calendar), la edge function `google-calendar-webhook`
  // aggiorna la tabella `google_calendar_busy_slots`. Con questo listener
  // Supabase Realtime invalidiamo la cache UI in tempo reale → l'utente vede
  // gli eventi Google senza ricaricare la pagina.
  //
  // Stesso pattern per `appointments`: se un collega crea un appuntamento da
  // un altro device, lo vediamo apparire istantaneamente.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`marketing-calendar-realtime-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "google_calendar_busy_slots",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          // Debounce naturale via React Query: invalidate accoda la refetch
          void queryClient.invalidateQueries({ queryKey: ["gcal-busy-slots", companyId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "apple_calendar_busy_slots",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["apple-busy-slots", companyId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["marketing-appointments", companyId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);

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
  const { data: rawAppointments = [], error: appointmentsError, refetch: refetchAppointments } = useQuery({
    queryKey: ["marketing-appointments", companyId, dateRange.start, dateRange.end, permissions.onlyAssigned, user?.id],
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
      const { data, error } = await query;
      if (error) throw error;
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
  const { data: contacts = [], error: contactsError } = useQuery({
    queryKey: ["marketing-contacts-lookup", companyId, contactIds],
    queryFn: async () => {
      if (!companyId || contactIds.length === 0) return [];
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .in("id", contactIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && contactIds.length > 0,
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
    const allUsersSelected = users.length === 0 || selectedUserIds.length >= users.length;
    return appointments.filter((a: any) => {
      if (!a.calendar_id) return false;
      if (calendars.length > 0 && selectedCalendarIds.length === 0) return false;
      if (selectedCalendarIds.length > 0 && !selectedCalendarIds.includes(a.calendar_id))
        return false;
      if (users.length > 0 && selectedUserIds.length === 0) return false;
      if (!allUsersSelected && selectedUserIds.length > 0) {
        if (!a.assigned_to) return false;
        if (!selectedUserIds.includes(a.assigned_to)) return false;
      }
      return true;
    });
  }, [appointments, calendars.length, selectedCalendarIds, selectedUserIds, users.length]);

  const calendarLoadError = calendarsError || appointmentsError || contactsError || googleBusyError || appleBusyError;
  const calendarLoadErrorMessage =
    calendarLoadError instanceof Error
      ? calendarLoadError.message
      : calendarLoadError
        ? "Errore nel caricamento dei dati calendario"
        : null;

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
    if (!hasCalendars) {
      toast.error("Prima configura almeno un calendario CRM");
      return;
    }
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
      meeting_provider: apt.meeting_provider,
      meeting_url: apt.meeting_url,
      meeting_status: apt.meeting_status,
      meeting_created_at: apt.meeting_created_at,
    });
    setDialogOpen(true);
  };

  const syncExternalCalendarsForAppointment = useCallback(async (appointmentId: string) => {
    const tasks: Promise<unknown>[] = [];

    if (googleSync.hasGoogleConnection) {
      tasks.push((async () => {
        const mapping = await googleSync.checkMapping(appointmentId);
        if (mapping) return googleSync.updateEvent(appointmentId);
        if (googleSync.isGoogleConnected) return googleSync.pushEvent(appointmentId);
        return undefined;
      })());
    }

    if (appleSync.hasAppleConnection) {
      tasks.push((async () => {
        const mapping = await appleSync.checkMapping(appointmentId);
        if (mapping) return appleSync.updateEvent(appointmentId);
        if (appleSync.isAppleConnected) return appleSync.pushEvent(appointmentId);
        return undefined;
      })());
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }, [appleSync, googleSync]);

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
    void syncExternalCalendarsForAppointment(appointmentId);
    refetchAppointments();
    queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
    queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
  }, [appointments, refetchAppointments, queryClient, companyId, syncExternalCalendarsForAppointment]);

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
    void syncExternalCalendarsForAppointment(appointmentId);
    refetchAppointments();
    queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
    queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
  }, [refetchAppointments, queryClient, companyId, syncExternalCalendarsForAppointment]);

  // 2026-05-26: il sync resta INLINE — niente più navigate. Se non c'è
  // connessione mostriamo solo toast con CTA "Apri impostazioni" che apre
  // in nuova tab così l'utente non perde la posizione sul calendario.
  // Inoltre tentiamo comunque il sync anche quando isGoogleConnected
  // ritorna false ma hasGoogleConnection è true (caso primary_calendar_id
  // NULL → la sync function ora ha default 'primary' lato edge).
  const handleSyncExternalCalendars = useCallback(async () => {
    const hasAny = googleSync.hasGoogleConnection || appleSync.hasAppleConnection;
    if (!hasAny) {
      toast("Nessun calendario esterno collegato", {
        description: "Collega Google Calendar o Apple Calendar dalle impostazioni del tuo profilo.",
        action: {
          label: "Apri impostazioni",
          onClick: () => {
            window.open(`${calendarSettingsPath}?tab=calendari`, "_blank", "noopener");
          },
        },
      });
      return;
    }

    setSyncingExternal(true);
    try {
      const tasks: Promise<unknown>[] = [];
      if (googleSync.hasGoogleConnection) tasks.push(googleSync.pullBusySlots());
      if (appleSync.hasAppleConnection) tasks.push(appleSync.pullBusySlots());

      const results = await Promise.allSettled(tasks);
      const failed = results.filter((r) => r.status === "rejected").length;

      await Promise.allSettled([
        refetchGoogleBusySlots(),
        refetchAppleBusySlots(),
        refetchAppointments(),
      ]);

      if (failed === 0) {
        toast.success("Sincronizzazione completata", {
          description: "Calendari esterni aggiornati.",
        });
      } else if (failed < results.length) {
        toast.warning("Sync parziale", {
          description: `${failed} su ${results.length} provider con errori. Verifica il collegamento.`,
        });
      } else {
        toast.error("Sincronizzazione non riuscita", {
          description: "Riprova tra poco o riconnetti il calendario dalle impostazioni.",
        });
      }
    } finally {
      setSyncingExternal(false);
    }
  }, [
    appleSync,
    calendarSettingsPath,
    googleSync,
    refetchAppleBusySlots,
    refetchAppointments,
    refetchGoogleBusySlots,
  ]);

  const tabs = [
    { key: "calendar" as const, label: "Calendario", icon: CalendarIcon },
    { key: "list" as const, label: "Elenco", icon: ListIcon },
  ];

  // 2026-05-27: helper per stato sync. Se l'utente ha collegato Google
  // ma `last_sync_at` è null, mostriamo banner attivo "Sincronizza ora"
  // — è il caso del primo accesso post-OAuth (auto-sync fire-and-forget
  // potrebbe non essere finito, o l'auto-sync introdotto recentemente
  // non era attivo all'ora del collegamento).
  const googleConnectedNotSynced = Boolean(
    googleSync.hasGoogleConnection && !googleSync.connection?.last_sync_at,
  );

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden pb-20 md:pb-0">
      <ApiHealthBanner filter={["googlemaps"]} />

      {googleConnectedNotSynced && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-start gap-2 min-w-0">
            <RefreshCw className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <p className="text-amber-900 leading-snug">
              <strong>Google Calendar collegato</strong> ma non ancora sincronizzato.
              {" "}Clicca <em>Sincronizza ora</em> per importare i tuoi appuntamenti delle prossime 4 settimane.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleSyncExternalCalendars}
            disabled={syncingExternal}
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
          >
            {syncingExternal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizza ora
          </Button>
        </div>
      )}

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
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {isGoogleConnected && (
                <Badge variant="outline" className="h-5 gap-1 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Google sync
                </Badge>
              )}
              {isAppleConnected && (
                <Badge variant="outline" className="h-5 gap-1 border-sky-200 bg-sky-50 px-1.5 text-[10px] text-sky-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Apple sync
                </Badge>
              )}
              {!isGoogleConnected && !isAppleConnected && (
                <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground">
                  Sync esterna non collegata
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncExternalCalendars}
            disabled={syncingExternal}
            className="h-9 gap-1.5"
            title="Sincronizza disponibilita' e appuntamenti con i calendari esterni collegati"
          >
            <RefreshCw className={cn("h-4 w-4", syncingExternal && "animate-spin")} />
            <span className="hidden sm:inline">Sync</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(calendarSettingsPath)}
            className="h-9 gap-1 text-muted-foreground hover:text-foreground"
            title="Impostazioni calendari"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden md:inline">Impostazioni</span>
          </Button>
          <Button
            size="sm"
            onClick={() => (hasCalendars ? openNewDialog() : navigate(calendarSettingsPath))}
            className="h-9"
          >
            {hasCalendars ? (
              <>
                <Plus className="h-4 w-4 mr-1.5" />
                Nuovo appuntamento
              </>
            ) : (
              <>
                <CalendarPlus className="h-4 w-4 mr-1.5" />
                Configura calendario
              </>
            )}
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

      {calendarLoadErrorMessage && (
        <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Alcuni dati del calendario non sono stati caricati.</p>
              <p className="mt-0.5 text-xs text-red-700">{calendarLoadErrorMessage}</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 border-red-200 bg-white text-red-800 hover:bg-red-100"
            onClick={() => {
              void refetchCalendars();
              void refetchAppointments();
              void refetchGoogleBusySlots();
              void refetchAppleBusySlots();
            }}
          >
            Riprova
          </Button>
        </div>
      )}

      {/* Content */}
      {activeTab === "calendar" && (
        <div className="grid h-[calc(100vh-240px)] min-h-[560px] grid-cols-1 gap-3 overflow-hidden md:h-[calc(100vh-220px)] md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-3 overflow-hidden">
            {/* Navigation bar — redesign responsive */}
            <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-0.5">
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
                      onConfigureCalendars={() => navigate(calendarSettingsPath)}
                      inSheet
                    />
                  </div>
                </SheetContent>
              </Sheet>

              {/* Vista unica Marketing & Vendite */}
              <div className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-primary px-3 text-xs font-semibold text-primary-foreground md:text-sm">
                <Grid3x3 className="h-3.5 w-3.5" />
                Vista mese
              </div>
            </div>

            {!hasCalendars ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border bg-background p-4 sm:p-6">
                <div className="mx-auto w-full max-w-3xl">
                  <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
                    <div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <CalendarPlus className="h-6 w-6 text-primary" />
                      </div>
                      <h2 className="mt-4 text-xl font-semibold tracking-tight">Configura il calendario marketing</h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Crea calendari per singolo commerciale, team o evento. Ogni calendario genera un link pubblico da inviare al cliente o embeddare nel sito.
                      </p>
                      <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>Prima crea almeno un calendario attivo, poi imposta disponibilita' e collegamenti Google/Apple.</span>
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <Button className="gap-1.5" onClick={() => navigate(calendarSettingsPath)}>
                          <CalendarPlus className="h-4 w-4" />
                          Crea calendario
                        </Button>
                        <Button variant="outline" className="gap-1.5" onClick={() => navigate(`${calendarSettingsPath}?tab=connections`)}>
                          <Settings className="h-4 w-4" />
                          Collegamenti
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-2 text-sm">
                      {[
                        { icon: Users, title: "Assegna al team", text: "Ogni link puo' puntare a un commerciale o reparto." },
                        { icon: Clock, title: "Definisci disponibilita'", text: "Imposta giorni e orari prima di pubblicare il link." },
                        { icon: Link2, title: "Condividi o embedda", text: "Usa link diretto, iframe o bottone sul sito." },
                      ].map((item) => (
                        <div key={item.title} className="rounded-lg border bg-muted/20 p-3">
                          <div className="flex items-center gap-2 font-medium">
                            <item.icon className="h-4 w-4 text-primary" />
                            {item.title}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : calendarView === "week" ? (
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
            ) : calendarView === "day" ? (
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
            ) : (
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

          <div className="hidden min-w-0 overflow-hidden rounded-lg border bg-background md:block">
            <MarketingCalendarFilters
              calendars={calendars}
              users={users}
              selectedCalendarIds={selectedCalendarIds}
              selectedUserIds={selectedUserIds}
              onToggleCalendar={handleToggleCalendar}
              onToggleUser={handleToggleUser}
              onConfigureCalendars={() => navigate(calendarSettingsPath)}
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

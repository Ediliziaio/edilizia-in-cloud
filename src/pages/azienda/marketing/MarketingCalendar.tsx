import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { useAppleCalendarSync } from "@/hooks/useAppleCalendarSync";
import { useOutlookCalendarSync } from "@/hooks/useOutlookCalendarSync";
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
import { timeToMin, addMinutesToTimeStr, buildColorMapForCalendars } from "@/lib/marketingCalendarConstants";
import { getRoute, formatDurationText, formatDistanceText } from "@/lib/routing";
import { useCompanyBase } from "@/hooks/useCompanyBase";
import MarketingCalendarMonthView from "@/components/marketing/MarketingCalendarMonthView";
import BusySlotDetailsDialog, { type BusySlotDetail } from "@/components/marketing/BusySlotDetailsDialog";
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
  const outlookSync = useOutlookCalendarSync();
  const { isGoogleConnected } = googleSync;
  const { isAppleConnected } = appleSync;
  const { isOutlookConnected } = outlookSync;
  const calendarSettingsPath = isAdminContext
    ? "/admin/impostazioni/calendari"
    : "/azienda/impostazioni/calendari";

  // Fetch Google busy slots for marketing calendar overlay.
  // 2026-05-26: enabled allargato a `hasGoogleConnection` (era isGoogleConnected
  // che richiedeva anche primary_calendar_id != null). Adesso il sync function
  // setta automaticamente "primary" come default, ma se la query partiva prima
  // del sync iniziale, restava disabilitata fino a hard refresh.
  const { data: googleBusySlots = [], error: googleBusyError, refetch: refetchGoogleBusySlots } = useQuery({
    queryKey: ["gcal-busy-slots", companyId, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("google_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, google_calendar_id")
        .eq("company_id", companyId);
      // Ruolo ristretto (es. commerciale, only_assigned): vede SOLO il proprio
      // calendario Google. I ruoli con accesso pieno (admin / call center) vedono tutto.
      if (permissions.onlyAssigned && user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && googleSync.hasGoogleConnection,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch Apple Calendar busy slots for marketing calendar overlay
  const { data: appleBusySlots = [], error: appleBusyError, refetch: refetchAppleBusySlots } = useQuery({
    queryKey: ["apple-busy-slots", companyId, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("apple_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, caldav_calendar_url")
        .eq("company_id", companyId);
      // Ruolo ristretto: solo il proprio calendario Apple (vedi nota busy Google).
      if (permissions.onlyAssigned && user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
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

  // Outlook (Microsoft 365): la sync scrive in outlook_calendar_busy_slots, ma
  // fino al 2026-09-08 li leggeva solo la prenotazione pubblica — nel
  // calendario interno gli impegni Outlook non comparivano.
  const { data: outlookBusySlots = [], error: outlookBusyError, refetch: refetchOutlookBusySlots } = useQuery({
    queryKey: ["outlook-busy-slots", companyId, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("outlook_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, outlook_event_id")
        .eq("company_id", companyId);
      if (permissions.onlyAssigned && user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((s: { id: string; start_at: string; end_at: string; summary: string | null; is_all_day: boolean; user_id: string; outlook_event_id: string | null }) => ({
        ...s,
        google_calendar_id: s.outlook_event_id,
        provider: "outlook" as const,
      }));
    },
    enabled: !!companyId && isOutlookConnected,
    staleTime: 2 * 60 * 1000,
  });

  const busySlots = useMemo(
    () => [...googleBusySlots, ...appleBusySlots, ...outlookBusySlots],
    [googleBusySlots, appleBusySlots, outlookBusySlots],
  );

  const [activeTab, setActiveTab] = useState<TabKey>("calendar");
  // 2026-05-27: ripristinato lo switcher Day/Week/Month dopo bug in cui mancava
  // il setter — la vista era hardcoded "month" e i tasti non facevano nulla.
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<MarketingAppointmentData | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();
  const [defaultTime, setDefaultTime] = useState<string | undefined>();
  const [syncingExternal, setSyncingExternal] = useState(false);
  // Dettaglio evento esterno (busy slot Google/Apple) aperto al click.
  const [busySlotDetail, setBusySlotDetail] = useState<BusySlotDetail | null>(null);

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
    queryKey: ["marketing-calendars", companyId, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("marketing_calendars")
        .select("id, name, owner_id, is_active, base_lat, base_lng, base_formatted_address, duration_minutes, default_meeting_provider, default_meeting_enabled, color, link_videochiamata")
        .eq("company_id", companyId)
        .eq("is_active", true);
      // Ruolo ristretto (only_assigned): nel filtro vede solo i calendari di cui
      // è owner. (I suoi appuntamenti restano comunque visibili: per i ristretti
      // il sotto-filtro calendario è bypassato — vedi filteredAppointments.)
      if (permissions.onlyAssigned && user?.id) q = q.eq("owner_id", user.id);
      const { data, error } = await q.order("name");
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
      // Ruolo ristretto (only_assigned): nel filtro vede SOLO sé stesso, coerente
      // col fatto che vede solo i propri appuntamenti e il proprio calendario.
      // I ruoli con accesso pieno (admin / call center) vedono tutti.
      rawStaffUsers
        .filter((u) => !permissions.onlyAssigned || u.id === user?.id)
        .map((u) => ({
          id: u.id,
          first_name: u.first_name ?? "",
          last_name: u.last_name ?? "",
        })),
    [rawStaffUsers, permissions.onlyAssigned, user?.id]
  );

  // Mappa colore per calendario: rispetta il colore scelto dall'utente
  // (marketing_calendars.color), con fallback automatico per indice.
  const calendarColorMap = useMemo(
    () => buildColorMapForCalendars(calendars.map((c) => ({ id: c.id, color: (c as { color?: string | null }).color }))),
    [calendars],
  );

  // Click su un evento esterno (busy slot Google/Apple): apre il dettaglio,
  // risolvendo il nome del proprietario del calendario per mostrarlo nella dialog.
  const handleClickBusySlot = useCallback(
    (slot: { id: string; start_at: string; end_at: string; summary: string | null; is_all_day: boolean; provider?: "google" | "apple" | "outlook"; user_id?: string }) => {
      const owner = rawStaffUsers.find((u) => u.id === slot.user_id);
      const ownerName = owner ? `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim() : null;
      setBusySlotDetail({
        id: slot.id,
        start_at: slot.start_at,
        end_at: slot.end_at,
        summary: slot.summary,
        is_all_day: slot.is_all_day,
        provider: slot.provider,
        ownerName: ownerName || null,
      });
    },
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
          // outlook_calendar_busy_slots e' una VISTA su questa tabella: si
          // ascolta la tabella (migrazione 20280911110002) e si rilegge la vista.
          table: "outlook_calendar_events",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["outlook-busy-slots", companyId] });
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

  // 2026-05-27: toggle "Mostra anche lavori operativi" — per il caso
  // single-titolare che fa vendite + pose, vuole vedere tutto in un
  // unico calendario. Persistito in localStorage per coerenza UX.
  const [showOperativi, setShowOperativi] = useState<boolean>(() => {
    try { return localStorage.getItem("mkt-cal-show-operativi") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("mkt-cal-show-operativi", showOperativi ? "1" : "0"); } catch {/* ignore */}
  }, [showOperativi]);

  // Fetch appointments with date range filter
  const { data: rawAppointments = [], error: appointmentsError, refetch: refetchAppointments } = useQuery({
    queryKey: ["marketing-appointments", companyId, dateRange.start, dateRange.end, permissions.onlyAssigned, user?.id, showOperativi],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("appointments")
        .select("*")
        .eq("company_id", companyId)
        .gte("appointment_date", dateRange.start)
        .lte("appointment_date", dateRange.end)
        .order("appointment_date", { ascending: true });
      // Quando "showOperativi" è OFF, restringi ai soli appointment
      // legati a un calendario marketing (calendar_id NOT NULL).
      // Quando è ON, mostra TUTTO: marketing + operativi (legati a un
      // ordine o stand-alone).
      if (!showOperativi) {
        query = query.not("calendar_id", "is", null);
      }
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
  // 2026-05-27: quando showOperativi è ON, lasciamo passare anche gli
  // appointment senza calendar_id (operativi legati a ordini). Il filtro
  // calendari resta attivo per quelli con calendar_id (commerciali).
  const filteredAppointments = useMemo(() => {
    const allUsersSelected = users.length === 0 || selectedUserIds.length >= users.length;
    return appointments.filter((a: any) => {
      if (!a.calendar_id) {
        // Senza calendar_id = operativo. Mostralo solo se toggle ON.
        if (!showOperativi) return false;
      } else if (!permissions.onlyAssigned) {
        // Il sotto-filtro per calendario si applica solo ai ruoli pieni. Un ruolo
        // ristretto vede comunque tutti i SUOI appuntamenti (già filtrati a
        // assigned_to=self), anche se sono in un calendario condiviso non suo.
        if (calendars.length > 0 && selectedCalendarIds.length === 0) return false;
        if (selectedCalendarIds.length > 0 && !selectedCalendarIds.includes(a.calendar_id))
          return false;
      }
      if (users.length > 0 && selectedUserIds.length === 0) return false;
      if (!allUsersSelected && selectedUserIds.length > 0) {
        if (!a.assigned_to) return false;
        if (!selectedUserIds.includes(a.assigned_to)) return false;
      }
      return true;
    });
  }, [appointments, calendars.length, selectedCalendarIds, selectedUserIds, users.length, showOperativi, permissions.onlyAssigned]);

  // Gli slot Google/Apple (overlay calendario) devono rispettare il filtro
  // UTENTI come gli appuntamenti: ogni slot ha un user_id (il proprietario del
  // calendario Google). Prima venivano passati grezzi → deselezionando un utente
  // i suoi appuntamenti Google restavano visibili. (Il filtro "Calendari" è per i
  // calendari marketing interni, non per quelli Google, quindi non si applica qui.)
  const filteredBusySlots = useMemo(() => {
    const allUsersSelected = users.length === 0 || selectedUserIds.length >= users.length;
    if (users.length > 0 && selectedUserIds.length === 0) return [];
    if (allUsersSelected) return busySlots;
    return busySlots.filter((s: any) => s.user_id && selectedUserIds.includes(s.user_id));
  }, [busySlots, selectedUserIds, users.length]);

  const calendarLoadError = calendarsError || appointmentsError || contactsError || googleBusyError || appleBusyError || outlookBusyError;
  const calendarLoadErrorMessage =
    calendarLoadError instanceof Error
      ? calendarLoadError.message
      : calendarLoadError
        ? "Errore nel caricamento dei dati calendario"
        : null;

  // Compute slot duration from selected calendars.
  // 2026-05-27 (UX request): se nessuna durata è definita dai calendari attivi
  // il fallback è ora 15 min (prima 30) — uniforma con la WeekView operativa
  // e permette di fissare appuntamenti precisi (es. 14:15, 14:45).
  const slotDurationMinutes = useMemo(() => {
    const selected = calendars.filter((c) => selectedCalendarIds.includes(c.id));
    const durations = selected
      .map((c) => (c as any).duration_minutes as number | null)
      .filter((d): d is number => d != null && d > 0);
    if (durations.length === 0) return 15;
    return Math.min(...durations);
  }, [calendars, selectedCalendarIds]);

  // Get base waypoint from selected calendar; fallback: sede operativa azienda
  const companyBase = useCompanyBase();
  const baseCalendarWaypoint = useMemo(() => {
    if (selectedCalendarIds.length === 1) {
      const cal = calendars.find((c: any) => c.id === selectedCalendarIds[0]);
      if (cal && (cal as any).base_lat && (cal as any).base_lng) {
        return { lat: (cal as any).base_lat, lng: (cal as any).base_lng };
      }
    }
    return companyBase;
  }, [selectedCalendarIds, calendars, companyBase]);

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
  // 2026-06-11: passato da maps-proxy (Google Directions — chiave mai
  // configurata, tornava sempre []) a getRoute() → HERE con traffico reale
  // e fallback OSRM. I legs HERE sono per-tratta nello stesso ordine.
  const computeTravelLegsForDate = useCallback(async (aptsWithCoords: any[]): Promise<TravelLeg[]> => {
    const waypoints: { lat: number; lng: number }[] = [];
    if (baseCalendarWaypoint) waypoints.push(baseCalendarWaypoint);
    waypoints.push(...aptsWithCoords.map((a: any) => ({ lat: a.lat, lng: a.lng })));
    if (waypoints.length < 2) return [];
    try {
      const route = await getRoute(waypoints);
      if (!route?.legs?.length) return [];
      const offset = baseCalendarWaypoint ? 1 : 0;
      return route.legs.map((leg, i: number) => {
        const fromIdx = i - offset;
        const toIdx = i - offset + 1;
        if (fromIdx < -1 || toIdx >= aptsWithCoords.length) return null;
        const fromApt = fromIdx >= 0 ? aptsWithCoords[fromIdx] as any : null;
        const toApt = aptsWithCoords[toIdx] as any;
        if (!toApt) return null;
        const fromEnd = fromApt ? (fromApt.appointment_end_time?.slice(0, 5) || addMinutesToTimeStr(fromApt.appointment_time?.slice(0, 5) || "09:00", 60)) : "08:00";
        const travelMin = Math.ceil(leg.durationSec / 60);
        const arrivalMin = timeToMin(fromEnd) + travelMin;
        const toStart = timeToMin(toApt.appointment_time?.slice(0, 5) || "09:00");
        const isLate = arrivalMin > toStart;
        const delayMinutes = isLate ? arrivalMin - toStart : 0;
        return {
          duration_s: Math.round(leg.durationSec),
          distance_m: Math.round(leg.distanceMeters),
          duration_text: formatDurationText(leg.durationSec),
          distance_text: formatDistanceText(leg.distanceMeters),
          fromId: fromApt?.id || "base",
          toId: toApt.id,
          isLate,
          delayMinutes,
        } as TravelLeg;
      }).filter(Boolean) as TravelLeg[];
    } catch {
      return [];
    }
  }, [baseCalendarWaypoint]);

  // ── Day view travel legs ──
  const dayAppointmentsWithCoords = useMemo(() => {
    if (calendarView !== "day") return [];
    return getApptsWithCoordsForDate(currentDate);
  }, [calendarView, currentDate, getApptsWithCoordsForDate]);

  // 2026-05-27 (perf fix 3): queryKey stabilizzata.
  // Prima `dayAppointmentsWithCoords.map(a => a.id).join(",")` veniva ricalcolata
  // ad ogni render con potenziale ordine diverso → cache miss continui → raffica
  // di chiamate al geocoding/directions API esterno. Ora memoizziamo l'id-string
  // ordinata in `useMemo` così la query key è veramente stabile tra render.
  const dayTravelKey = useMemo(
    () => dayAppointmentsWithCoords.map((a: any) => a.id).sort().join(","),
    [dayAppointmentsWithCoords]
  );

  const { data: travelLegs = [] } = useQuery({
    queryKey: ["travel-legs-day", baseCalendarWaypoint?.lat, dayTravelKey],
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

  // 2026-05-27 (perf): stesso pattern del dayTravelKey — ordina gli id per
  // garantire stabilità della string anche se l'ordine degli appuntamenti
  // dentro `aptsWithCoords` oscilla tra render (refetch / re-enrichment).
  const weekTravelQueryKey = useMemo(() => {
    return weekDaysWithAppts
      .map((d) => `${d.dateKey}:${d.aptsWithCoords.map((a: any) => a.id).sort().join(",")}`)
      .join("|");
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

  // KPI header: appuntamenti visibili / oggi / settimana / da assegnare /
  // conflitti. 2026-05-27 (UX request): allineato al pattern del Calendario
  // Lavori operativo per consistenza visiva tra le due viste calendario.
  const headerStats = useMemo(() => {
    const today = new Date();
    const wkStart = startOfWeek(today, { weekStartsOn: 1 });
    // 2026-05-27 (audit fix): endOfWeek invece di addDays(wkStart, 6)
    // — quest'ultimo termina la domenica alle 00:00:00, escludendo gli
    // appuntamenti di domenica con orario > mezzanotte. endOfWeek dà 23:59:59.999.
    const wkEnd = endOfWeek(today, { weekStartsOn: 1 });

    let todayCount = 0;
    let weekCount = 0;
    let unassigned = 0;
    // Conflitti = appuntamenti con stesso assigned_to e orari sovrapposti
    // (stessa data, intervalli [start,end] che si toccano). Calcolato sui
    // filteredAppointments — riflette ciò che l'utente sta vedendo.
    type SlotKey = { date: string; start: number; end: number; aptId: string };
    const slots: Map<string, SlotKey[]> = new Map(); // key = assigned_to
    const conflictAptIds = new Set<string>();
    // Fallback durata per appuntamenti senza end_time: usa lo slot del
    // calendario (default 15min) invece di 30 hardcoded — meno falsi positivi.
    const fallbackDuration = slotDurationMinutes;

    for (const a of filteredAppointments as any[]) {
      if (a.appointment_date) {
        const dt = parseISO(a.appointment_date);
        if (isSameDay(dt, today)) todayCount++;
        if (dt >= wkStart && dt <= wkEnd) weekCount++;
      }
      if (!a.assigned_to && !a.is_blocked_slot) unassigned++;

      const ownerKey = a.assigned_to;
      if (!ownerKey || !a.appointment_date || !a.appointment_time) continue;
      const start = timeToMin(a.appointment_time.slice(0, 5));
      const end = a.appointment_end_time
        ? timeToMin(a.appointment_end_time.slice(0, 5))
        : start + fallbackDuration;
      if (start < 0 || end <= start) continue;
      const arr = slots.get(ownerKey) || [];
      arr.push({ date: a.appointment_date, start, end, aptId: a.id });
      slots.set(ownerKey, arr);
    }

    // Per ogni venditore, ordina per inizio e segna overlap
    for (const list of slots.values()) {
      const byDate = new Map<string, SlotKey[]>();
      for (const s of list) {
        const arr = byDate.get(s.date) || [];
        arr.push(s);
        byDate.set(s.date, arr);
      }
      for (const arr of byDate.values()) {
        arr.sort((a, b) => a.start - b.start);
        for (let i = 1; i < arr.length; i++) {
          if (arr[i].start < arr[i - 1].end) {
            conflictAptIds.add(arr[i].aptId);
            conflictAptIds.add(arr[i - 1].aptId);
          }
        }
      }
    }

    return {
      todayCount,
      weekCount,
      visible: filteredAppointments.length,
      unassigned,
      conflicts: conflictAptIds.size,
      conflictIds: conflictAptIds,
    };
    // slotDurationMinutes nei deps: senza, cambiando calendario selezionato il
    // fallback durata dei conflitti restava quello vecchio (stale closure).
  }, [filteredAppointments, slotDurationMinutes]);

  // Filtri attivi (per badge pulsante filtri)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (calendars.length > 0 && selectedCalendarIds.length < calendars.length) count++;
    if (users.length > 0 && selectedUserIds.length < users.length) count++;
    return count;
  }, [calendars.length, selectedCalendarIds.length, users.length, selectedUserIds.length]);

  // Mobile filters drawer
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // KPI cliccabili: "Da assegnare" e "Conflitti" filtrano la griglia sul
  // sottoinsieme corrispondente (toggle). I numeri delle card restano calcolati
  // su filteredAppointments (pre-filtro KPI) così non cambiano cliccandole.
  const [kpiFilter, setKpiFilter] = useState<"all" | "unassigned" | "conflicts">("all");
  const displayAppointments = useMemo(() => {
    if (kpiFilter === "unassigned") {
      return filteredAppointments.filter((a: any) => !a.assigned_to && !a.is_blocked_slot);
    }
    if (kpiFilter === "conflicts") {
      return filteredAppointments.filter((a: any) => headerStats.conflictIds.has(a.id));
    }
    return filteredAppointments;
  }, [filteredAppointments, kpiFilter, headerStats.conflictIds]);

  const openNewDialog = (date?: Date, hour?: number, minute?: number) => {
    // In sola lettura clic su slot e giorni non aprono un modulo che non salverebbe.
    if (permissions.solaLettura) return;
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
      opportunity_id: apt.opportunity_id,
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

    // Chi clicca puo' non avere Google: basta che ce l'abbia il responsabile
    // del calendario o l'account agganciato — lo risolve la edge.
    if (googleSync.hasGoogleConnection || googleSync.hasAnyCompanyGoogleConnection) {
      tasks.push((async () => {
        const mapping = await googleSync.checkMapping(appointmentId);
        if (mapping) return googleSync.updateEvent(appointmentId);
        if (googleSync.isGoogleConnected || googleSync.hasAnyCompanyGoogleConnection) return googleSync.pushEvent(appointmentId);
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
  //
  // 2026-05-27 (bug "sposto ma non viene aggiornato"): l'UPDATE su Postgres
  // funzionava (verificato in DB), ma l'UI sembrava tornare indietro perché
  // dnd-kit elimina l'overlay drag al drop → l'item ridisegna alla vecchia
  // posizione finché il refetch React Query (200-500ms) non finisce.
  //
  // Fix: optimistic update sulla cache PRIMA di aspettare la response.
  // L'item si sposta immediatamente nel nuovo slot, e se il backend errore
  // facciamo rollback puntuale.
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

    // OPTIMISTIC UPDATE — aggiorniamo la cache locale subito così l'item
    // si sposta visivamente nello stesso frame del drop. Snapshot dello
    // stato precedente per rollback su errore.
    // 2026-05-27 (audit fix): queryKey deve includere showOperativi, altrimenti
    // l'optimistic update scrive su una key che nessuna view sta osservando
    // → l'item rimbalza alla vecchia posizione fino al refetch.
    const queryKey = ["marketing-appointments", companyId, dateRange.start, dateRange.end, permissions.onlyAssigned, user?.id, showOperativi];
    const previousData = queryClient.getQueryData<any[]>(queryKey);
    queryClient.setQueryData<any[]>(queryKey, (old) => {
      if (!old) return old;
      return old.map((a) =>
        a.id === appointmentId
          ? {
              ...a,
              ...updateData,
              // normalizza il time a "HH:MM:SS" per coerenza con il DB
              ...(updateData.appointment_time
                ? { appointment_time: `${updateData.appointment_time}:00`.slice(0, 8) }
                : {}),
              ...(updateData.appointment_end_time
                ? { appointment_end_time: `${updateData.appointment_end_time}:00`.slice(0, 8) }
                : {}),
            }
          : a
      );
    });

    const { error } = await supabase
      .from("appointments")
      .update(updateData)
      .eq("id", appointmentId)
      .eq("company_id", companyId);

    if (error) {
      // Rollback optimistic update.
      queryClient.setQueryData(queryKey, previousData);
      toast.error("Errore nello spostamento", { description: error.message });
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
            // Ri-sincronizza anche i calendari esterni: il drop aveva già
            // spinto il NUOVO orario su Google/Apple — senza questo, l'evento
            // esterno restava spostato mentre il DB era tornato indietro.
            void syncExternalCalendarsForAppointment(appointmentId);
            refetchAppointments();
            queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
            queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
            queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
          }
        },
      },
    });
    void syncExternalCalendarsForAppointment(appointmentId);
    // refetch in background per allineare con eventuali side-effect dei trigger
    refetchAppointments();
    queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
    queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
    // showOperativi nei deps: la queryKey dell'optimistic update lo contiene —
    // senza, dopo un toggle il drop scriveva sulla cache key VECCHIA e l'item
    // "rimbalzava" alla posizione precedente fino al refetch.
  }, [appointments, refetchAppointments, queryClient, companyId, dateRange.start, dateRange.end, permissions.onlyAssigned, user?.id, showOperativi, syncExternalCalendarsForAppointment]);

  // ── Resize handler ── (stesso pattern optimistic update)
  const handleResizeAppointment = useCallback(async (appointmentId: string, newEndTime: string) => {
    if (!companyId) return;

    // Optimistic
    // 2026-05-27 (audit fix): queryKey deve includere showOperativi, altrimenti
    // l'optimistic update scrive su una key che nessuna view sta osservando
    // → l'item rimbalza alla vecchia posizione fino al refetch.
    const queryKey = ["marketing-appointments", companyId, dateRange.start, dateRange.end, permissions.onlyAssigned, user?.id, showOperativi];
    const previousData = queryClient.getQueryData<any[]>(queryKey);
    // Guard: il drag-resize bypassa la validazione del dialog → evita di salvare
    // un orario di fine ≤ inizio (range non valido).
    const currentAppt = previousData?.find((a) => a.id === appointmentId);
    const startHHMM = currentAppt?.appointment_time?.slice(0, 5);
    if (startHHMM && newEndTime <= startHHMM) {
      toast.error("L'orario di fine deve essere successivo all'inizio");
      return;
    }
    queryClient.setQueryData<any[]>(queryKey, (old) => {
      if (!old) return old;
      return old.map((a) =>
        a.id === appointmentId
          ? { ...a, appointment_end_time: `${newEndTime}:00`.slice(0, 8) }
          : a
      );
    });

    const { error } = await supabase
      .from("appointments")
      .update({ appointment_end_time: newEndTime })
      .eq("id", appointmentId)
      .eq("company_id", companyId);

    if (error) {
      queryClient.setQueryData(queryKey, previousData);
      toast.error("Errore nel ridimensionamento", { description: error.message });
      return;
    }
    toast.success(`Durata aggiornata fino alle ${newEndTime}`);
    void syncExternalCalendarsForAppointment(appointmentId);
    refetchAppointments();
    queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
    queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
    queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
    // showOperativi nei deps per lo stesso motivo del drop (queryKey optimistic).
  }, [refetchAppointments, queryClient, companyId, dateRange.start, dateRange.end, permissions.onlyAssigned, user?.id, showOperativi, syncExternalCalendarsForAppointment]);

  // 2026-05-26: il sync resta INLINE — niente più navigate. Se non c'è
  // connessione mostriamo solo toast con CTA "Apri impostazioni" che apre
  // in nuova tab così l'utente non perde la posizione sul calendario.
  // Inoltre tentiamo comunque il sync anche quando isGoogleConnected
  // ritorna false ma hasGoogleConnection è true (caso primary_calendar_id
  // NULL → la sync function ora ha default 'primary' lato edge).
  const handleSyncExternalCalendars = useCallback(async () => {
    const hasAny = googleSync.hasGoogleConnection || appleSync.hasAppleConnection || outlookSync.hasOutlookConnection;
    if (!hasAny) {
      toast("Nessun calendario esterno collegato", {
        description: "Collega Google Calendar, Outlook o Apple Calendar dalle impostazioni del tuo profilo.",
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
      if (outlookSync.hasOutlookConnection) tasks.push(outlookSync.pullBusySlots());

      const results = await Promise.allSettled(tasks);
      const failed = results.filter((r) => r.status === "rejected").length;

      await Promise.allSettled([
        refetchGoogleBusySlots(),
        refetchAppleBusySlots(),
        refetchOutlookBusySlots(),
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
    outlookSync,
    refetchAppleBusySlots,
    refetchAppointments,
    refetchGoogleBusySlots,
    refetchOutlookBusySlots,
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

      {/* Header redesign — telefono: titolo e «Nuovo» su una riga; sync e
          impostazioni dei calendari restano a computer e tablet. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 max-sm:flex-row max-sm:items-center max-sm:justify-between max-sm:gap-2">
        <div className="flex items-center gap-3 max-sm:min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 max-sm:hidden">
            <CalendarIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="max-sm:min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight max-sm:truncate max-sm:text-lg">Calendario<span className="max-sm:hidden"> appuntamenti</span></h1>
            <p className="text-sm text-muted-foreground max-sm:text-xs">
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
            <div className="mt-1 flex flex-wrap items-center gap-1.5 max-sm:hidden">
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
              {isOutlookConnected && (
                <Badge variant="outline" className="h-5 gap-1 border-indigo-200 bg-indigo-50 px-1.5 text-[10px] text-indigo-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Outlook sync
                </Badge>
              )}
              {!isGoogleConnected && !isAppleConnected && !isOutlookConnected && (
                <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground">
                  Sync esterna non collegata
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 max-sm:shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncExternalCalendars}
            disabled={syncingExternal}
            className="h-9 gap-1.5 max-sm:hidden"
            title="Sincronizza disponibilità e appuntamenti con i calendari esterni collegati"
          >
            <RefreshCw className={cn("h-4 w-4", syncingExternal && "animate-spin")} />
            <span className="hidden sm:inline">Sync</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(calendarSettingsPath)}
            className="h-9 gap-1 text-muted-foreground hover:text-foreground max-md:hidden"
            title="Impostazioni calendari"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden md:inline">Impostazioni</span>
          </Button>
          <Button
            size="sm"
            onClick={() => (hasCalendars ? openNewDialog() : navigate(calendarSettingsPath))}
            disabled={hasCalendars && permissions.solaLettura}
            title={hasCalendars && permissions.solaLettura ? "Sei in sola lettura" : undefined}
            // Senza calendari il bottone porta alla configurazione, che dal telefono non si fa.
            className={cn("h-9", !hasCalendars && "max-md:hidden")}
          >
            {hasCalendars ? (
              <>
                <Plus className="h-4 w-4 mr-1.5" />
                <span className="max-sm:hidden">Nuovo appuntamento</span>
                <span className="sm:hidden">Nuovo</span>
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

      {/* KPI dashboard — 2026-05-27 (UX request): allineata al Calendario
          Lavori operativo per consistenza. Mostra metriche del periodo che
          l'utente sta filtrando, NON dell'intera azienda. */}
      {/* Telefono: oggi e settimana; «da assegnare» e «conflitti» solo quando ce ne sono. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <div className="rounded-lg border bg-card px-3 py-2 max-sm:hidden">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Visibili</p>
          <p className="text-xl font-bold tabular-nums">{headerStats.visible}</p>
        </div>
        <button
          type="button"
          onClick={goToday}
          className="rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50"
          title="Vai a oggi"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Oggi</p>
          <p className="text-xl font-bold tabular-nums">{headerStats.todayCount}</p>
        </button>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Settimana</p>
          <p className="text-xl font-bold tabular-nums">{headerStats.weekCount}</p>
        </div>
        {/* KPI-filtro (toggle): mostra solo il sottoinsieme sulla griglia/elenco. */}
        <button
          type="button"
          onClick={() => setKpiFilter((f) => (f === "unassigned" ? "all" : "unassigned"))}
          aria-pressed={kpiFilter === "unassigned"}
          title={kpiFilter === "unassigned" ? "Mostra tutti gli appuntamenti" : "Mostra solo i non assegnati"}
          className={cn(
            "rounded-lg border px-3 py-2 text-left transition-colors hover:bg-amber-50/70 dark:hover:bg-amber-950/40",
            headerStats.unassigned > 0 ? "border-amber-200 bg-amber-50 dark:bg-amber-950/30" : "bg-card max-sm:hidden",
            kpiFilter === "unassigned" && "ring-2 ring-amber-400 ring-offset-1",
          )}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Da assegnare{kpiFilter === "unassigned" && " · filtro attivo"}
          </p>
          <p className={cn(
            "text-xl font-bold tabular-nums",
            headerStats.unassigned > 0 && "text-amber-700 dark:text-amber-400"
          )}>{headerStats.unassigned}</p>
        </button>
        <button
          type="button"
          onClick={() => setKpiFilter((f) => (f === "conflicts" ? "all" : "conflicts"))}
          aria-pressed={kpiFilter === "conflicts"}
          title={kpiFilter === "conflicts" ? "Mostra tutti gli appuntamenti" : "Mostra solo gli appuntamenti in conflitto"}
          className={cn(
            "col-span-2 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-red-50/70 dark:hover:bg-red-950/40 md:col-span-1",
            headerStats.conflicts > 0 ? "border-red-200 bg-red-50 dark:bg-red-950/30" : "bg-card max-sm:hidden",
            kpiFilter === "conflicts" && "ring-2 ring-red-400 ring-offset-1",
          )}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Conflitti{kpiFilter === "conflicts" && " · filtro attivo"}
          </p>
          <p className={cn(
            "text-xl font-bold tabular-nums",
            headerStats.conflicts > 0 ? "text-red-700 dark:text-red-400" : "text-foreground"
          )}>{headerStats.conflicts}</p>
        </button>
      </div>

      {/* Striscia di stato del filtro KPI: rende evidente perché la griglia è
          "vuota" quando il filtro nasconde tutto, con uscita a un click. */}
      {kpiFilter !== "all" && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>
            Stai vedendo solo{" "}
            <strong>{kpiFilter === "unassigned" ? "gli appuntamenti da assegnare" : "gli appuntamenti in conflitto"}</strong>{" "}
            ({displayAppointments.length}).
          </span>
          <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={() => setKpiFilter("all")}>
            Mostra tutti
          </Button>
        </div>
      )}

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
              void refetchOutlookBusySlots();
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
                    <span className="max-sm:hidden">Filtri</span>
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

              {/* 2026-05-27: switcher Day/Week/Month ripristinato.
                  Era stato sostituito da un badge statico "Vista mese" — UI
                  ingannevole perché il rendering condizionale a valle
                  supportava già tutte e 3 le viste. */}
              {/* Telefono: resta il mese con l'elenco del giorno sotto; giorno e settimana a colonne orarie al computer. */}
              <div className="inline-flex h-9 items-center rounded-md border bg-background p-0.5 text-xs font-medium md:text-sm max-sm:hidden">
                <button
                  type="button"
                  onClick={() => setCalendarView("day")}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 transition-colors md:px-3",
                    calendarView === "day"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  aria-pressed={calendarView === "day"}
                  title="Vista giornaliera"
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Giorno</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView("week")}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 transition-colors md:px-3",
                    calendarView === "week"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  aria-pressed={calendarView === "week"}
                  title="Vista settimanale"
                >
                  <ListIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Settimana</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView("month")}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 transition-colors md:px-3",
                    calendarView === "month"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  aria-pressed={calendarView === "month"}
                  title="Vista mensile"
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Mese</span>
                </button>
              </div>

              {/* 2026-05-27: toggle "Lavori operativi" — quando ON, mostra
                  anche gli appuntamenti operativi (legati a un ordine,
                  senza calendar_id marketing) nel calendario marketing.
                  Pensato per il caso single-titolare vendite+pose: 1 vista
                  per tutto. Persistito in localStorage. */}
              <button
                type="button"
                onClick={() => setShowOperativi((v) => !v)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors md:text-sm max-sm:hidden",
                  showOperativi
                    ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title={showOperativi
                  ? "Stai vedendo anche i lavori operativi. Clicca per nasconderli."
                  : "Mostra anche i lavori operativi (cantieri, pose) di questo periodo"}
              >
                <Clock className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{showOperativi ? "Operativi visibili" : "Mostra operativi"}</span>
              </button>
            </div>

            {!hasCalendars ? (
              <>
              <p className="rounded-lg border bg-muted/30 px-3 py-2.5 text-[13px] text-muted-foreground md:hidden">
                Il calendario si imposta da computer o tablet.
              </p>
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border bg-background p-4 sm:p-6 max-md:hidden">
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
                        <span>Prima crea almeno un calendario attivo, poi imposta disponibilità e collegamenti Google/Apple.</span>
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
                        { icon: Clock, title: "Definisci disponibilità", text: "Imposta giorni e orari prima di pubblicare il link." },
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
              </>
            ) : calendarView === "week" ? (
              <MarketingCalendarWeekView
                weekStart={weekStart}
                appointments={displayAppointments}
                calendarIds={calendars.map((c) => c.id)}
                onClickAppointment={openEditDialog}
                onClickSlot={(date, hour, minute) => openNewDialog(date, hour, minute)}
                travelLegs={weekTravelLegs}
                onDropAppointment={(id, date, time) => handleDropAppointment(id, date, time)}
                slotDurationMinutes={slotDurationMinutes}
                onResizeAppointment={handleResizeAppointment}
                busySlots={filteredBusySlots}
                onClickBusySlot={handleClickBusySlot}
                colorMap={calendarColorMap}
              />
            ) : calendarView === "day" ? (
              <MarketingCalendarDayView
                date={currentDate}
                appointments={displayAppointments}
                calendarIds={calendars.map((c) => c.id)}
                onClickAppointment={openEditDialog}
                onClickSlot={(date, hour, minute) => openNewDialog(date, hour, minute)}
                travelLegs={travelLegs}
                onDropAppointment={(id, date, time) => handleDropAppointment(id, date, time)}
                slotDurationMinutes={slotDurationMinutes}
                onResizeAppointment={handleResizeAppointment}
                busySlots={filteredBusySlots}
                onClickBusySlot={handleClickBusySlot}
                colorMap={calendarColorMap}
              />
            ) : (
              <MarketingCalendarMonthView
                currentDate={currentDate}
                appointments={displayAppointments}
                calendarIds={calendars.map((c) => c.id)}
                onClickAppointment={openEditDialog}
                onClickDay={(date) => openNewDialog(date)}
                onDropAppointment={(id, date) => handleDropAppointment(id, date)}
                busySlots={filteredBusySlots}
                onClickBusySlot={handleClickBusySlot}
                colorMap={calendarColorMap}
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
          appointments={displayAppointments}
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

      <BusySlotDetailsDialog
        slot={busySlotDetail}
        open={!!busySlotDetail}
        onOpenChange={(o) => { if (!o) setBusySlotDetail(null); }}
      />
    </div>
  );
}

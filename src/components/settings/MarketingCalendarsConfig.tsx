import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, CalendarDays, Link2, Clock, Settings2, Copy, AlertTriangle, ExternalLink, Code2, Share2, Video } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import CalendarDialog, { type CalendarFormData } from "./CalendarDialog";
import GoogleCalendarConnectionTab from "./GoogleCalendarConnectionTab";
import AppleCalendarConnectionTab from "./AppleCalendarConnectionTab";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { buildBookingButtonCode, buildBookingEmbedCode, buildBookingUrl, normalizeBookingSlug } from "@/lib/bookingLinks";

type MarketingCalendar = {
  id: string;
  company_id: string;
  name: string;
  group_name: string | null;
  duration_minutes: number;
  max_daily_km: number | null;
  calendar_type: string;
  booking_slug: string | null;
  is_active: boolean;
  owner_id: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  default_meeting_provider: "none" | "google_meet";
  default_meeting_enabled: boolean;
  base_address_line: string | null;
  base_address_city: string | null;
  base_address_postal_code: string | null;
  base_address_province: string | null;
  base_address_country: string | null;
  base_formatted_address: string | null;
  base_lat: number | null;
  base_lng: number | null;
  base_place_id: string | null;
};

type CalendarPreferences = {
  id: string;
  company_id: string;
  week_start_day: string;
  time_format: string;
  language: string;
  show_services_menu: boolean;
  show_rooms: boolean;
  show_equipment: boolean;
  default_max_daily_km: number;
  max_travel_minutes: number;
  default_appointment_duration_minutes: number;
};

type CalendarAvailability = {
  id: string;
  company_id: string;
  calendar_id: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
  specific_date: string | null;
};

type CalendarAppointmentRef = {
  calendar_id: string | null;
  status: string | null;
};

const DAYS = [
  { value: 1, label: "Lunedì" },
  { value: 2, label: "Martedì" },
  { value: 3, label: "Mercoledì" },
  { value: 4, label: "Giovedì" },
  { value: 5, label: "Venerdì" },
  { value: 6, label: "Sabato" },
  { value: 0, label: "Domenica" },
];

const CALENDAR_SETTINGS_TABS = ["calendars", "preferences", "availability", "connections"] as const;

function normalizeSettingsTab(value: string | null) {
  return CALENDAR_SETTINGS_TABS.includes(value as typeof CALENDAR_SETTINGS_TABS[number])
    ? value as typeof CALENDAR_SETTINGS_TABS[number]
    : "calendars";
}

export default function MarketingCalendarsConfig() {
  const { effectiveCompany, user, role } = useAuth();
  const effectiveCompanyId = effectiveCompany?.id;
  const canManageCalendars = role === "company_admin" || role === "super_admin";
  const queryClient = useQueryClient();
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<MarketingCalendar | null>(null);
  const [sharingCalendar, setSharingCalendar] = useState<MarketingCalendar | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(normalizeSettingsTab(urlSearchParams.get("tab")));
  const { data: staffUsers = [] } = useCompanyStaffUsers(effectiveCompanyId);

  useEffect(() => {
    const nextTab = normalizeSettingsTab(urlSearchParams.get("tab"));
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }, [urlSearchParams]);

  const handleTabChange = (value: string) => {
    const nextTab = normalizeSettingsTab(value);
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams(urlSearchParams);
    if (nextTab === "calendars") nextParams.delete("tab");
    else nextParams.set("tab", nextTab);
    setUrlSearchParams(nextParams);
  };

  const validateCalendarPayload = (data: CalendarFormData) => {
    const name = String(data.name || "").trim();
    const duration = Number(data.duration_minutes);
    const maxDailyKm = data.max_daily_km == null ? null : Number(data.max_daily_km);
    const bookingSlug = normalizeBookingSlug(data.booking_slug || name);
    const calendarType = ["personal", "team", "event"].includes(data.calendar_type) ? data.calendar_type : "personal";
    const meetingProvider = data.default_meeting_provider === "google_meet" ? "google_meet" : "none";

    if (!name) throw new Error("Inserisci un nome calendario.");
    if (!bookingSlug) throw new Error("Genera o inserisci uno slug per il link pubblico.");
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24 * 60) {
      throw new Error("La durata appuntamento deve essere tra 1 minuto e 24 ore.");
    }
    if (maxDailyKm != null && (!Number.isFinite(maxDailyKm) || maxDailyKm <= 0)) {
      throw new Error("I km massimi giornalieri devono essere maggiori di zero.");
    }

    return { name, duration, maxDailyKm, bookingSlug, calendarType, meetingProvider };
  };

  const assertNoDuplicateCalendarName = async (name: string, excludeId?: string) => {
    if (!effectiveCompanyId) throw new Error("Azienda non disponibile.");
    let query = supabase
      .from("marketing_calendars")
      .select("id")
      .eq("company_id", effectiveCompanyId)
      .ilike("name", name)
      .limit(1);
    if (excludeId) query = query.neq("id", excludeId);
    const { data, error } = await query;
    if (error) throw error;
    if ((data || []).length > 0) throw new Error("Esiste già un calendario con questo nome.");
  };

  const isBookingSlugTaken = async (slug: string, excludeId?: string) => {
    if (!effectiveCompanyId) throw new Error("Azienda non disponibile.");
    let query = supabase
      .from("marketing_calendars")
      .select("id")
      .eq("booking_slug", slug)
      .limit(1);
    if (excludeId) query = query.neq("id", excludeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).length > 0;
  };

  const getAvailableBookingSlug = async (raw: string, excludeId?: string) => {
    const base = normalizeBookingSlug(raw) || "calendario";
    let candidate = base;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (!(await isBookingSlugTaken(candidate, excludeId))) return candidate;
      candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    throw new Error("Non riesco a generare un link pubblico univoco. Riprova con uno slug diverso.");
  };

  const copyText = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiato`);
    } catch {
      toast.error("Copia non riuscita: seleziona il testo manualmente.");
    }
  };

  const validateAvailabilityRows = (rows: { day_of_week: number; start_time: string; end_time: string; is_enabled: boolean }[]) => {
    const seenDays = new Set<number>();
    for (const row of rows) {
      if (seenDays.has(row.day_of_week)) throw new Error("Disponibilità duplicata per lo stesso giorno.");
      seenDays.add(row.day_of_week);
      if (!row.is_enabled) continue;
      if (!row.start_time || !row.end_time) throw new Error("Completa gli orari dei giorni attivi.");
      if (row.start_time >= row.end_time) {
        const dayName = DAYS.find(d => d.value === row.day_of_week)?.label || "giorno selezionato";
        throw new Error(`Orario non valido per ${dayName}: l'ora di fine deve essere successiva all'inizio.`);
      }
    }
  };

  const validatePreferencesPayload = (data: Partial<CalendarPreferences>) => {
    const defaultMaxKm = Number(data.default_max_daily_km);
    const travelMinutes = Number(data.max_travel_minutes);
    const durationMinutes = Number(data.default_appointment_duration_minutes);
    if (!Number.isFinite(defaultMaxKm) || defaultMaxKm <= 0) throw new Error("Km massimi giornalieri non validi.");
    if (!Number.isFinite(travelMinutes) || travelMinutes <= 0) throw new Error("Tempo massimo spostamento non valido.");
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 24 * 60) {
      throw new Error("Durata appuntamento di default non valida.");
    }
  };

  // ---- QUERIES ----
  const { data: calendars = [], isLoading: loadingCalendars, isError: calendarsError } = useQuery({
    queryKey: ["marketing-calendars", effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("*")
        .eq("company_id", effectiveCompanyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MarketingCalendar[];
    },
    enabled: !!effectiveCompanyId,
  });

  const { data: appointmentRefs = [] } = useQuery({
    queryKey: ["marketing-calendar-appointment-refs", effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select("calendar_id, status")  // rimosso `id` non usato (saved bytes)
        .eq("company_id", effectiveCompanyId)
        .not("calendar_id", "is", null)
        .limit(5000);
      if (error) throw error;
      return data as CalendarAppointmentRef[];
    },
    // Aggregate counter usato solo per badge "X appuntamenti" sui calendar
    // cards: refresh ogni 2 min e' largamente sufficiente (i count cambiano
    // lentamente). Prima staleTime=0 → re-fetch a ogni mount delle settings.
    enabled: !!effectiveCompanyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: preferences } = useQuery({
    queryKey: ["marketing-calendar-preferences", effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return null;
      const { data, error } = await supabase
        .from("marketing_calendar_preferences")
        .select("*")
        .eq("company_id", effectiveCompanyId)
        .maybeSingle();
      if (error) throw error;
      return data as CalendarPreferences | null;
    },
    enabled: !!effectiveCompanyId,
  });

  const { data: availability = [], isLoading: loadingAvail } = useQuery({
    queryKey: ["marketing-calendar-availability", selectedCalendarId],
    queryFn: async () => {
      if (!selectedCalendarId || !effectiveCompanyId) return [];
      const { data, error } = await supabase
        .from("marketing_calendar_availability")
        .select("*")
        .eq("calendar_id", selectedCalendarId)
        .eq("company_id", effectiveCompanyId)
        .order("day_of_week");
      if (error) throw error;
      return data as CalendarAvailability[];
    },
    enabled: !!selectedCalendarId && !!effectiveCompanyId,
  });

  // ---- MUTATIONS ----
  const createCalendar = useMutation({
    mutationFn: async (data: CalendarFormData) => {
      if (!effectiveCompanyId || !user?.id) throw new Error("Dati mancanti");
      if (!canManageCalendars) throw new Error("Non hai i permessi per creare calendari.");
      const { name, duration, maxDailyKm, bookingSlug, calendarType, meetingProvider } = validateCalendarPayload(data);
      await assertNoDuplicateCalendarName(name);
      const safeBookingSlug = await getAvailableBookingSlug(bookingSlug);
      const { error } = await supabase.from("marketing_calendars").insert({
        company_id: effectiveCompanyId,
        created_by: user.id,
        name,
        description: data.description || null,
        owner_id: data.owner_id || null,
        booking_slug: safeBookingSlug,
        duration_minutes: duration,
        max_daily_km: maxDailyKm,
        calendar_type: calendarType,
        default_meeting_provider: meetingProvider,
        default_meeting_enabled: meetingProvider === "google_meet",
        group_name: null,
        base_address_line: data.base_address_line || null,
        base_address_city: data.base_address_city || null,
        base_address_postal_code: data.base_address_postal_code || null,
        base_address_province: data.base_address_province || null,
        base_address_country: data.base_address_country || "IT",
        base_formatted_address: data.base_formatted_address || null,
        base_lat: data.base_lat ?? null,
        base_lng: data.base_lng ?? null,
        base_place_id: data.base_place_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Calendario creato");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendars"] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "Impossibile creare il calendario"),
  });

  const updateCalendar = useMutation({
    mutationFn: async ({ id, ...data }: CalendarFormData & { id: string }) => {
      if (!effectiveCompanyId) throw new Error("Azienda non disponibile.");
      if (!canManageCalendars) throw new Error("Non hai i permessi per modificare calendari.");
      const { name, duration, maxDailyKm, bookingSlug, calendarType, meetingProvider } = validateCalendarPayload(data);
      await assertNoDuplicateCalendarName(name, id);
      if (await isBookingSlugTaken(bookingSlug, id)) {
        throw new Error("Questo link pubblico e gia usato da un altro calendario.");
      }
      const { error } = await supabase.from("marketing_calendars").update({
        name,
        description: data.description || null,
        owner_id: data.owner_id || null,
        booking_slug: bookingSlug,
        calendar_type: calendarType,
        default_meeting_provider: meetingProvider,
        default_meeting_enabled: meetingProvider === "google_meet",
        duration_minutes: duration,
        max_daily_km: maxDailyKm,
        base_address_line: data.base_address_line || null,
        base_address_city: data.base_address_city || null,
        base_address_postal_code: data.base_address_postal_code || null,
        base_address_province: data.base_address_province || null,
        base_address_country: data.base_address_country || "IT",
        base_formatted_address: data.base_formatted_address || null,
        base_lat: data.base_lat ?? null,
        base_lng: data.base_lng ?? null,
        base_place_id: data.base_place_id || null,
      }).eq("id", id).eq("company_id", effectiveCompanyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Calendario aggiornato");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendars"] });
      setDialogOpen(false);
      setEditingCalendar(null);
    },
    onError: (e: Error) => toast.error(e.message || "Impossibile aggiornare il calendario"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (!effectiveCompanyId) throw new Error("Azienda non disponibile.");
      if (!canManageCalendars) throw new Error("Non hai i permessi per modificare calendari.");
      const { error } = await supabase.from("marketing_calendars").update({ is_active }).eq("id", id).eq("company_id", effectiveCompanyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-calendars"] });
    },
    onError: (e: Error) => toast.error(e.message || "Impossibile aggiornare lo stato del calendario"),
  });

  const ensureBookingSlug = useMutation({
    mutationFn: async (calendar: MarketingCalendar) => {
      if (!effectiveCompanyId) throw new Error("Azienda non disponibile.");
      if (!canManageCalendars) throw new Error("Non hai i permessi per modificare calendari.");
      const bookingSlug = await getAvailableBookingSlug(calendar.booking_slug || calendar.name, calendar.id);
      const { error } = await supabase
        .from("marketing_calendars")
        .update({ booking_slug: bookingSlug })
        .eq("id", calendar.id)
        .eq("company_id", effectiveCompanyId);
      if (error) throw error;
      return { ...calendar, booking_slug: bookingSlug };
    },
    onSuccess: (calendar) => {
      toast.success("Link pubblico generato");
      setSharingCalendar(calendar);
      queryClient.invalidateQueries({ queryKey: ["marketing-calendars"] });
    },
    onError: (e: Error) => toast.error(e.message || "Impossibile generare il link"),
  });

  const deleteCalendar = useMutation({
    mutationFn: async (id: string) => {
      if (!effectiveCompanyId) throw new Error("Azienda non disponibile.");
      if (!canManageCalendars) throw new Error("Non hai i permessi per eliminare calendari.");
      const { count, error: countError } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("company_id", effectiveCompanyId)
        .eq("calendar_id", id)
        .not("status", "in", "(cancelled,canceled,archived)");
      if (countError) throw countError;
      if ((count || 0) > 0) {
        throw new Error("Calendario collegato ad appuntamenti attivi: disattivalo invece di eliminarlo.");
      }
      const { error } = await supabase.from("marketing_calendars").delete().eq("id", id).eq("company_id", effectiveCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Calendario eliminato");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendars"] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message || "Impossibile eliminare il calendario"),
  });

  const upsertPreferences = useMutation({
    mutationFn: async (data: Partial<CalendarPreferences>) => {
      if (!effectiveCompanyId) throw new Error("Dati mancanti");
      if (!canManageCalendars) throw new Error("Non hai i permessi per modificare le preferenze calendario.");
      validatePreferencesPayload(data);
      const { error } = await supabase.from("marketing_calendar_preferences").upsert(
        { company_id: effectiveCompanyId, ...data },
        { onConflict: "company_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preferenze salvate");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendar-preferences"] });
    },
    onError: (e: Error) => toast.error(e.message || "Impossibile salvare le preferenze"),
  });

  const saveAvailability = useMutation({
    mutationFn: async (rows: { day_of_week: number; start_time: string; end_time: string; is_enabled: boolean }[]) => {
      if (!selectedCalendarId || !effectiveCompanyId) throw new Error("Dati mancanti");
      if (!canManageCalendars) throw new Error("Non hai i permessi per modificare la disponibilità.");
      validateAvailabilityRows(rows);
      // Delete existing weekly rows, then insert new
      const { error: deleteError } = await supabase.from("marketing_calendar_availability")
        .delete()
        .eq("calendar_id", selectedCalendarId)
        .eq("company_id", effectiveCompanyId)
        .is("specific_date", null);
      if (deleteError) throw deleteError;
      const inserts = rows.map(r => ({
        company_id: effectiveCompanyId,
        calendar_id: selectedCalendarId,
        day_of_week: r.day_of_week,
        start_time: r.start_time,
        end_time: r.end_time,
        is_enabled: r.is_enabled,
        specific_date: null as string | null,
      }));
      if (inserts.length > 0) {
        const { error } = await supabase.from("marketing_calendar_availability").insert(inserts);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Disponibilità salvata");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendar-availability"] });
    },
    onError: (e: Error) => toast.error(e.message || "Impossibile salvare la disponibilità"),
  });

  // ---- FILTERS ----
  const filtered = calendars.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== "all" && (filterStatus === "active" ? !c.is_active : c.is_active)) return false;
    if (filterType !== "all" && c.calendar_type !== filterType) return false;
    return true;
  });

  const appointmentCountsByCalendar = appointmentRefs.reduce<Record<string, number>>((acc, apt) => {
    if (!apt.calendar_id) return acc;
    if (["cancelled", "canceled", "archived"].includes(apt.status || "")) return acc;
    acc[apt.calendar_id] = (acc[apt.calendar_id] || 0) + 1;
    return acc;
  }, {});

  const ownerName = (ownerId: string | null) => {
    if (!ownerId) return "Non assegnato";
    const owner = staffUsers.find(u => u.id === ownerId);
    return owner ? [owner.first_name, owner.last_name].filter(Boolean).join(" ") || "Senza nome" : "Utente non trovato";
  };

  const calendarTypeMeta = (type: string) => {
    if (type === "team") return { label: "Team", variant: "default" as const };
    if (type === "event") return { label: "Evento", variant: "outline" as const };
    return { label: "Commerciale", variant: "secondary" as const };
  };

  const calendarStats = {
    total: calendars.length,
    active: calendars.filter(c => c.is_active).length,
    assigned: calendars.filter(c => !!c.owner_id).length,
    withAddress: calendars.filter(c => !!c.base_formatted_address || !!c.base_address_city).length,
    withMeet: calendars.filter(c => c.default_meeting_provider === "google_meet").length,
    appointments: Object.values(appointmentCountsByCalendar).reduce((sum, count) => sum + count, 0),
  };

  const getConfigWarnings = (cal: MarketingCalendar) => {
    const warnings: string[] = [];
    if (!cal.owner_id) warnings.push("utente");
    if (!cal.booking_slug) warnings.push("link");
    if (!cal.duration_minutes || cal.duration_minutes <= 0) warnings.push("durata");
    if (!cal.base_formatted_address && !cal.base_address_city) warnings.push("sede");
    return warnings;
  };

  const shareUrl = sharingCalendar?.booking_slug ? buildBookingUrl(sharingCalendar.booking_slug) : "";
  const shareEmbedCode = buildBookingEmbedCode(shareUrl);
  const shareButtonCode = buildBookingButtonCode(shareUrl);

  // ---- AVAILABILITY LOCAL STATE ----
  const [localAvail, setLocalAvail] = useState<{ day_of_week: number; start_time: string; end_time: string; is_enabled: boolean }[]>([]);

  // Sync availability from query data
  useEffect(() => {
    if (availability.length > 0) {
      setLocalAvail(
        availability
          .filter(a => a.specific_date === null)
          .map(a => ({
            day_of_week: a.day_of_week!,
            start_time: a.start_time,
            end_time: a.end_time,
            is_enabled: a.is_enabled,
          }))
      );
    } else if (selectedCalendarId) {
      setLocalAvail(
        DAYS.map(d => ({
          day_of_week: d.value,
          start_time: "09:00",
          end_time: "18:00",
          is_enabled: d.value >= 1 && d.value <= 5,
        }))
      );
    }
  }, [availability, selectedCalendarId]);

  // ---- PREFERENCES LOCAL STATE ----
  const [localPrefs, setLocalPrefs] = useState({
    week_start_day: "monday",
    time_format: "24h",
    language: "it",
    show_services_menu: true,
    show_rooms: true,
    show_equipment: true,
    default_max_daily_km: 250,
    max_travel_minutes: 60,
    default_appointment_duration_minutes: 90,
  });

  // Sync preferences from query data
  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        week_start_day: preferences.week_start_day,
        time_format: preferences.time_format,
        language: preferences.language,
        show_services_menu: preferences.show_services_menu,
        show_rooms: preferences.show_rooms,
        show_equipment: preferences.show_equipment,
        default_max_daily_km: preferences.default_max_daily_km ?? 250,
        max_travel_minutes: preferences.max_travel_minutes ?? 60,
        default_appointment_duration_minutes: preferences.default_appointment_duration_minutes ?? 90,
      });
    }
  }, [preferences]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendari Marketing</h1>
        <p className="text-muted-foreground">Gestisci i calendari del modulo Marketing e Vendita</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Calendari</p>
            <p className="mt-1 text-2xl font-semibold">{calendarStats.total}</p>
            <p className="text-xs text-muted-foreground">{calendarStats.active} attivi</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Assegnati</p>
            <p className="mt-1 text-2xl font-semibold">{calendarStats.assigned}</p>
            <p className="text-xs text-muted-foreground">con responsabile</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Sedi base</p>
            <p className="mt-1 text-2xl font-semibold">{calendarStats.withAddress}</p>
            <p className="text-xs text-muted-foreground">utili per scheduling e percorrenze</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Appuntamenti</p>
            <p className="mt-1 text-2xl font-semibold">{calendarStats.appointments}</p>
            <p className="text-xs text-muted-foreground">collegati ai calendari</p>
          </CardContent>
        </Card>
      </div>

      {!canManageCalendars && (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="flex gap-3 py-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Accesso in sola lettura</p>
              <p className="text-amber-800/80">Puoi consultare calendari e collegamenti, ma solo un amministratore può creare, modificare, disattivare o sincronizzare configurazioni.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        {/* v8.6.74 — overflow-x-auto: 4 tab con icona+label si sovrapponevano su 375px */}
        <TabsList className="w-full sm:w-auto max-w-full h-auto flex-wrap justify-start gap-1 sm:flex-nowrap overflow-x-auto">
          <TabsTrigger value="calendars" className="gap-2 shrink-0"><CalendarDays className="h-4 w-4" />Calendari</TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2 shrink-0"><Settings2 className="h-4 w-4" />Preferenze</TabsTrigger>
          <TabsTrigger value="availability" className="gap-2 shrink-0"><Clock className="h-4 w-4" />Disponibilità</TabsTrigger>
          <TabsTrigger value="connections" className="gap-2 shrink-0"><Link2 className="h-4 w-4" />Collegamenti</TabsTrigger>
        </TabsList>

        {/* TAB: CALENDARI */}
        <TabsContent value="calendars" forceMount className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cerca calendario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Stato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="active">Attivi</SelectItem>
                  <SelectItem value="inactive">Inattivi</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="personal">Commerciale</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="event">Evento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => { setEditingCalendar(null); setDialogOpen(true); }} disabled={!canManageCalendars} className="gap-2">
              <Plus className="h-4 w-4" /> Nuovo calendario
            </Button>
          </div>

          {calendarsError ? (
            <Card className="border-destructive/40">
              <CardContent className="flex gap-3 py-6 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Impossibile caricare i calendari</p>
                  <p className="text-destructive/80">Riprova tra poco o verifica i permessi dell'utente.</p>
                </div>
              </CardContent>
            </Card>
          ) : loadingCalendars ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">Nessun calendario</h3>
                <p className="text-muted-foreground mb-4">Crea il tuo primo calendario marketing per iniziare</p>
                <Button onClick={() => { setEditingCalendar(null); setDialogOpen(true); }} disabled={!canManageCalendars} className="gap-2">
                  <Plus className="h-4 w-4" /> Nuovo calendario
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden sm:table-cell">Responsabile</TableHead>
                    <TableHead className="hidden lg:table-cell">Sede base</TableHead>
                    <TableHead>Durata</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="hidden lg:table-cell">Link booking</TableHead>
                    <TableHead className="hidden md:table-cell">App.</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="hidden md:table-cell">Aggiornato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(cal => (
                    <TableRow key={cal.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{cal.name}</p>
                          {cal.default_meeting_provider === "google_meet" && (
                            <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-sky-700">
                              <Video className="h-3 w-3" />
                              Meet
                            </Badge>
                          )}
                          {getConfigWarnings(cal).length > 0 && (
                            <p className="text-xs text-amber-600">
                              Da completare: {getConfigWarnings(cal).join(", ")}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">{ownerName(cal.owner_id)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {cal.base_formatted_address || [cal.base_address_city, cal.base_address_province].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell>{cal.duration_minutes} min</TableCell>
                      <TableCell>
                        {(() => {
                          const meta = calendarTypeMeta(cal.calendar_type);
                          return <Badge variant={meta.variant}>{meta.label}</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {cal.booking_slug ? (
                          <button
                            type="button"
                            className="inline-flex max-w-[220px] items-center gap-1 truncate text-sm text-primary hover:underline"
                            onClick={() => setSharingCalendar(cal)}
                          >
                            <Link2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">/prenota/{cal.booking_slug}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-amber-600">Da generare</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{appointmentCountsByCalendar[cal.id] || 0}</TableCell>
                      <TableCell>
                        <Switch checked={cal.is_active} disabled={!canManageCalendars || toggleActive.isPending} onCheckedChange={(v) => toggleActive.mutate({ id: cal.id, is_active: v })} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {format(new Date(cal.updated_at), "dd MMM yyyy", { locale: it })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setSharingCalendar(cal)} title="Condividi link prenotazione">
                            <Share2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" disabled={!canManageCalendars} onClick={() => { setEditingCalendar(cal); setDialogOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" disabled={!canManageCalendars} onClick={() => setDeleteId(cal.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* TAB: PREFERENZE */}
        <TabsContent value="preferences" forceMount className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Preferenze dell'app</CardTitle>
              <CardDescription>Configura le preferenze generali del calendario</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Giorno di inizio settimana</Label>
                  <Select value={localPrefs.week_start_day} onValueChange={v => setLocalPrefs(p => ({ ...p, week_start_day: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monday">Lunedì</SelectItem>
                      <SelectItem value="sunday">Domenica</SelectItem>
                      <SelectItem value="saturday">Sabato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Servizi</CardTitle>
              <CardDescription>Attiva o disattiva le funzionalità aggiuntive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label>Menu dei servizi</Label><p className="text-sm text-muted-foreground">Mostra il menu dei servizi nel calendario</p></div>
                <Switch checked={localPrefs.show_services_menu} onCheckedChange={v => setLocalPrefs(p => ({ ...p, show_services_menu: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Stanze</Label><p className="text-sm text-muted-foreground">Gestisci le stanze per gli appuntamenti</p></div>
                <Switch checked={localPrefs.show_rooms} onCheckedChange={v => setLocalPrefs(p => ({ ...p, show_rooms: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Attrezzature</Label><p className="text-sm text-muted-foreground">Gestisci le attrezzature disponibili</p></div>
                <Switch checked={localPrefs.show_equipment} onCheckedChange={v => setLocalPrefs(p => ({ ...p, show_equipment: v }))} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preferenze widget</CardTitle>
              <CardDescription>Configura la visualizzazione del widget calendario</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Lingua</Label>
                  <Select value={localPrefs.language} onValueChange={v => setLocalPrefs(p => ({ ...p, language: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="it">Italiano</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Formato ora</Label>
                  <Select value={localPrefs.time_format} onValueChange={v => setLocalPrefs(p => ({ ...p, time_format: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24 ore</SelectItem>
                      <SelectItem value="12h">12 ore (AM/PM)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Inizio settimana</Label>
                  <Select value={localPrefs.week_start_day} onValueChange={v => setLocalPrefs(p => ({ ...p, week_start_day: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monday">Lunedì</SelectItem>
                      <SelectItem value="sunday">Domenica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spostamenti e percorrenza</CardTitle>
              <CardDescription>Configura i limiti per il suggerimento automatico dei calendari negli appuntamenti</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Km massimi giornalieri A/R (default)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={localPrefs.default_max_daily_km}
                    onChange={(e) => setLocalPrefs(p => ({ ...p, default_max_daily_km: parseInt(e.target.value) || 250 }))}
                  />
                  <p className="text-xs text-muted-foreground">Limite km per commerciale se non specificato sul calendario</p>
                </div>
                <div className="space-y-2">
                  <Label>Tempo max spostamento tra appuntamenti (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={localPrefs.max_travel_minutes}
                    onChange={(e) => setLocalPrefs(p => ({ ...p, max_travel_minutes: parseInt(e.target.value) || 60 }))}
                  />
                  <p className="text-xs text-muted-foreground">Oltre questo tempo il calendario viene marcato come bloccato</p>
                </div>
                <div className="space-y-2">
                  <Label>Durata appuntamento di default (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={localPrefs.default_appointment_duration_minutes}
                    onChange={(e) => setLocalPrefs(p => ({ ...p, default_appointment_duration_minutes: parseInt(e.target.value) || 90 }))}
                  />
                  <p className="text-xs text-muted-foreground">Usata quando il calendario non ha una durata specifica</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => upsertPreferences.mutate(localPrefs)} disabled={!canManageCalendars || upsertPreferences.isPending}>
              {upsertPreferences.isPending ? "Salvataggio..." : "Salva preferenze"}
            </Button>
          </div>
        </TabsContent>

        {/* TAB: DISPONIBILITÀ */}
        <TabsContent value="availability" forceMount className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Disponibilità settimanale</CardTitle>
              <CardDescription>Seleziona un calendario e configura gli orari di lavoro</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Calendario</Label>
                <Select value={selectedCalendarId || ""} onValueChange={setSelectedCalendarId}>
                  <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Seleziona un calendario" /></SelectTrigger>
                  <SelectContent>
                    {calendars.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!selectedCalendarId ? (
                <p className="text-muted-foreground text-sm py-4">Seleziona un calendario per configurare la disponibilità</p>
              ) : loadingAvail ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                      <div>
                        <p className="font-medium">Copertura settimanale</p>
                        <p className="text-muted-foreground">
                          {localAvail.filter(a => a.is_enabled).length} giorni attivi su 7
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!canManageCalendars}
                          onClick={() => setLocalAvail(prev => prev.map(a => ({
                            ...a,
                            is_enabled: a.day_of_week >= 1 && a.day_of_week <= 5,
                            start_time: "09:00",
                            end_time: "18:00",
                          })))}
                        >
                          Lun-Ven 09-18
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!canManageCalendars}
                          onClick={() => setLocalAvail(prev => prev.map(a => ({ ...a, is_enabled: false })))}
                        >
                          Chiudi tutti
                        </Button>
                      </div>
                    </div>
                    {DAYS.map(day => {
                      const row = localAvail.find(a => a.day_of_week === day.value);
                      if (!row) return null;
                      const invalid = row.is_enabled && row.start_time >= row.end_time;
                      return (
                        <div key={day.value} className={`flex flex-wrap items-center gap-3 py-2 border-b last:border-0 ${invalid ? "rounded-md bg-destructive/5 px-2" : ""}`}>
                          <Checkbox
                            checked={row.is_enabled}
                            disabled={!canManageCalendars}
                            onCheckedChange={(v) => setLocalAvail(prev => prev.map(a => a.day_of_week === day.value ? { ...a, is_enabled: !!v } : a))}
                          />
                          <span className="w-24 text-sm font-medium">{day.label}</span>
                          <Input
                            type="time"
                            value={row.start_time}
                            onChange={e => setLocalAvail(prev => prev.map(a => a.day_of_week === day.value ? { ...a, start_time: e.target.value } : a))}
                            className="w-28"
                            disabled={!row.is_enabled || !canManageCalendars}
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            value={row.end_time}
                            onChange={e => setLocalAvail(prev => prev.map(a => a.day_of_week === day.value ? { ...a, end_time: e.target.value } : a))}
                            className="w-28"
                            disabled={!row.is_enabled || !canManageCalendars}
                          />
                          <Button variant="ghost" size="icon" title="Copia a tutti i giorni attivi" disabled={!canManageCalendars} onClick={() => {
                            setLocalAvail(prev => prev.map(a => a.is_enabled ? { ...a, start_time: row.start_time, end_time: row.end_time } : a));
                          }}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          {invalid && <span className="text-xs text-destructive">Fine prima dell'inizio</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => saveAvailability.mutate(localAvail)} disabled={!canManageCalendars || saveAvailability.isPending}>
                      {saveAvailability.isPending ? "Salvataggio..." : "Salva disponibilità"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: COLLEGAMENTI */}
        <TabsContent value="connections" forceMount className="space-y-6">
          <GoogleCalendarConnectionTab />
          <AppleCalendarConnectionTab />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CalendarDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingCalendar(null); }}
        onSubmit={(data) => {
          if (!canManageCalendars) {
            toast.error("Non hai i permessi per modificare calendari.");
            return;
          }
          if (editingCalendar) {
            updateCalendar.mutate({ id: editingCalendar.id, ...data });
          } else {
            createCalendar.mutate(data);
          }
        }}
        onAdvancedSettings={() => {
          setDialogOpen(false);
          handleTabChange("availability");
        }}
        initialData={editingCalendar}
        isLoading={createCalendar.isPending || updateCalendar.isPending}
      />

      <Dialog open={!!sharingCalendar} onOpenChange={(open) => !open && setSharingCalendar(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Condividi calendario</DialogTitle>
            <DialogDescription>
              Copia il link per inviarlo al cliente oppure usa il codice embed per inserirlo nel sito.
            </DialogDescription>
          </DialogHeader>

          {sharingCalendar && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{sharingCalendar.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ownerName(sharingCalendar.owner_id)} · {sharingCalendar.duration_minutes} min · {calendarTypeMeta(sharingCalendar.calendar_type).label}
                    </p>
                  </div>
                  <Badge variant={sharingCalendar.is_active ? "default" : "secondary"}>
                    {sharingCalendar.is_active ? "Attivo" : "Disattivato"}
                  </Badge>
                </div>

                {!sharingCalendar.booking_slug ? (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-medium">Questo calendario non ha ancora un link pubblico.</p>
                    <p className="mt-1 text-xs text-amber-800/80">Generalo per ottenere una pagina di prenotazione tipo Calendly.</p>
                    <Button
                      className="mt-3 gap-2"
                      size="sm"
                      disabled={!canManageCalendars || ensureBookingSlug.isPending}
                      onClick={() => ensureBookingSlug.mutate(sharingCalendar)}
                    >
                      <Link2 className="h-4 w-4" />
                      {ensureBookingSlug.isPending ? "Generazione..." : "Genera link pubblico"}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Link diretto</Label>
                      <div className="flex gap-2">
                        <Input value={shareUrl} readOnly className="font-mono text-xs" />
                        <Button type="button" variant="outline" className="gap-2" onClick={() => copyText(shareUrl, "Link")}>
                          <Copy className="h-4 w-4" />
                          Copia
                        </Button>
                        <Button type="button" variant="outline" size="icon" asChild>
                          <a href={shareUrl} target="_blank" rel="noopener noreferrer" aria-label="Apri anteprima booking">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="inline-flex items-center gap-1.5">
                            <Code2 className="h-3.5 w-3.5" />
                            Embed inline
                          </Label>
                          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={() => copyText(shareEmbedCode, "Codice embed")}>
                            <Copy className="h-3.5 w-3.5" />
                            Copia
                          </Button>
                        </div>
                        <Textarea value={shareEmbedCode} readOnly rows={5} className="font-mono text-xs" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="inline-flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5" />
                            Bottone sito
                          </Label>
                          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={() => copyText(shareButtonCode, "Codice bottone")}>
                            <Copy className="h-3.5 w-3.5" />
                            Copia
                          </Button>
                        </div>
                        <Textarea value={shareButtonCode} readOnly rows={5} className="font-mono text-xs" />
                      </div>
                    </div>

                    <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">Flusso consigliato</p>
                      <p className="mt-1">
                        Invialo via WhatsApp/email per un commerciale singolo, oppure incorporalo in landing page e campagne per eventi specifici.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il calendario?</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile. Il calendario e tutte le relative disponibilità verranno eliminati.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteCalendar.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

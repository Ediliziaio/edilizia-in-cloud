import { useState } from "react";
import { registraCanaleCalendario } from "@/hooks/useCalendariLavori";
import CompanyCalendarsOverview from "@/components/integrations/CompanyCalendarsOverview";
import { PROVIDER_LABEL as PROVIDER_NOME, useCaselleCalendario } from "@/hooks/useCalendariEsterni";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";
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
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, CalendarDays, Link2, Clock, Route, Copy, AlertTriangle, ExternalLink, Code2, Share2, Video, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import CalendarDialog, { type CalendarFormData } from "./CalendarDialog";
import GoogleCalendarConnectionTab from "./GoogleCalendarConnectionTab";
import AppleCalendarConnectionTab from "./AppleCalendarConnectionTab";
import OutlookCalendarConnectionTab from "./OutlookCalendarConnectionTab";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { buildBookingBadgeCode, buildBookingButtonCode, buildBookingEmbedCode, buildBookingInlineCode, buildBookingPopupCode, buildBookingUrl, normalizeBookingSlug } from "@/lib/bookingLinks";

type MarketingCalendar = {
  id: string;
  company_id: string;
  name: string;
  group_name: string | null;
  duration_minutes: number;
  buffer_before_min?: number | null;
  buffer_after_min?: number | null;
  min_notice_minutes?: number | null;
  max_per_day?: number | null;
  reminder_24h?: boolean | null;
  reminder_1h?: boolean | null;
  max_daily_km: number | null;
  calendar_type: string;
  booking_slug: string | null;
  is_active: boolean;
  owner_id: string | null;
  description: string | null;
  color: string | null;
  external_provider?: "google" | "outlook" | "apple" | null;
  external_connection_id?: string | null;
  external_calendar_id?: string | null;
  external_calendar_name?: string | null;
  link_videochiamata?: string | null;
  whatsapp_numero_id?: string | null;
  promemoria_5min?: boolean | null;
  messaggi_crm_dal?: string | null;
  firma_messaggi?: string | null;
  cosa_preparare?: string | null;
  modello_descrizione_evento?: string | null;
  mittente_nome?: string | null;
  mittente_email?: string | null;
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

/** Una fascia oraria della settimana, com'è nella bozza degli orari. */
type FasciaOraria = { rid: string; day_of_week: number; start_time: string; end_time: string; is_enabled: boolean };

/**
 * I tre numeri di «Spostamenti e durata»: gli unici di quella scheda che qualcuno legge (suggest-calendars). Le altre sei
 * impostazioni che c'erano (inizio settimana, lingua, formato ora, menu dei servizi, stanze, attrezzature) non le leggeva
 * nessun codice e sono state tolte il 10/10/2026: le colonne restano nel database, con il loro valore di partenza.
 */
const PREFERENZE_SPOSTAMENTI = [
  { chiave: "default_max_daily_km", etichetta: "Km massimi giornalieri A/R (default)", aiuto: "Limite km per commerciale se non specificato sul calendario", predefinito: 250, errore: "Scrivi i km massimi giornalieri: un numero intero maggiore di zero." },
  { chiave: "max_travel_minutes", etichetta: "Tempo max spostamento tra appuntamenti (min)", aiuto: "Oltre questo tempo il calendario viene marcato come bloccato", predefinito: 60, errore: "Scrivi il tempo massimo di spostamento: minuti, un numero intero maggiore di zero." },
  { chiave: "default_appointment_duration_minutes", etichetta: "Durata appuntamento di default (min)", aiuto: "Usata quando il calendario non ha una durata specifica", predefinito: 90, errore: "Scrivi la durata di default: minuti, tra 1 e 1440." },
] as const;
type ChiavePreferenza = typeof PREFERENZE_SPOSTAMENTI[number]["chiave"];

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
  const permissions = usePermissions();
  // Stessa regola della RLS (calendari_gestiti_dallo_staff): admin o staff con
  // la modifica di «Personalizzazione».
  const canManageCalendars = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsCustomization;
  const queryClient = useQueryClient();
  // Gli elenchi dei calendari vivono anche fuori da questa pagina (dialog
  // appuntamento, scheda contatto, demo outreach, suggerimenti): senza
  // rinfrescarli, un calendario nuovo o spento restava invisibile o ancora
  // selezionabile fino al ricaricamento.
  const invalidaCalendari = () => {
    for (const chiave of [
      "marketing-calendars",
      "marketing-calendars-con-orari",
      "appointment-calendars",
      "marketing-calendars-for-contact",
      "outreach-demo-calendars",
      "suggest-calendars",
      "marketing-calendar-appointment-refs",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [chiave] });
    }
  };
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<MarketingCalendar | null>(null);
  const [sharingCalendar, setSharingCalendar] = useState<MarketingCalendar | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  // La scheda aperta è quella dell'indirizzo (?tab=…): una sola fonte, senza copiarla in uno stato.
  const activeTab = normalizeSettingsTab(urlSearchParams.get("tab"));
  const { data: staffUsers = [] } = useCompanyStaffUsers(effectiveCompanyId);

  const handleTabChange = (value: string) => {
    const nextTab = normalizeSettingsTab(value);
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
    if (!bookingSlug) throw new Error("Scrivi la parte finale del link, per esempio sopralluogo-milano.");
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
    throw new Error("Non riesco a generare un link univoco. Riprova scrivendo una parte finale diversa.");
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
    // Piu' fasce nello stesso giorno sono ammesse (es. 9-13 e 14:30-18: la
    // pausa pranzo). Devono pero' essere valide e non sovrapporsi fra loro.
    for (const row of rows) {
      if (!row.is_enabled) continue;
      const dayName = DAYS.find(d => d.value === row.day_of_week)?.label || "giorno selezionato";
      if (!row.start_time || !row.end_time) throw new Error("Completa gli orari dei giorni attivi.");
      if (row.start_time >= row.end_time) {
        throw new Error(`Orario non valido per ${dayName}: l'ora di fine deve essere successiva all'inizio.`);
      }
    }
    for (const day of new Set(rows.filter(r => r.is_enabled).map(r => r.day_of_week))) {
      const fasce = rows.filter(r => r.is_enabled && r.day_of_week === day)
        .slice().sort((x, y) => x.start_time.localeCompare(y.start_time));
      for (let i = 1; i < fasce.length; i++) {
        if (fasce[i].start_time < fasce[i - 1].end_time) {
          const dayName = DAYS.find(d => d.value === day)?.label || "giorno selezionato";
          throw new Error(`Fasce sovrapposte per ${dayName}: ${fasce[i - 1].start_time}-${fasce[i - 1].end_time} e ${fasce[i].start_time}-${fasce[i].end_time}.`);
        }
      }
    }
  };

  const validatePreferencesPayload = (data: Record<ChiavePreferenza, number>) => {
    for (const p of PREFERENZE_SPOSTAMENTI) {
      const valore = data[p.chiave];
      const massimo = p.chiave === "default_appointment_duration_minutes" ? 24 * 60 : Number.MAX_SAFE_INTEGER;
      if (!Number.isInteger(valore) || valore <= 0 || valore > massimo) throw new Error(p.errore);
    }
  };

  // Account calendario collegati in azienda: servono a scrivere di CHI e' il
  // calendario in cui finiscono gli appuntamenti, non solo come si chiama.
  const { data: caselleCalendario = [] } = useCaselleCalendario();
  const emailAccount = (connectionId?: string | null) =>
    connectionId ? caselleCalendario.find((c) => c.connectionId === connectionId)?.email ?? null : null;

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

  // Quali calendari hanno almeno una fascia oraria attiva: serve per avvisare
  // che un link pubblico senza orari non mostrera' nessuno slot.
  const { data: calendariConOrari = new Set<string>() } = useQuery({
    queryKey: ["marketing-calendars-con-orari", effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return new Set<string>();
      const { data, error } = await supabase
        .from("marketing_calendar_availability")
        .select("calendar_id")
        .eq("company_id", effectiveCompanyId)
        .eq("is_enabled", true);
      if (error) throw error;
      return new Set((data ?? []).map((r: { calendar_id: string }) => r.calendar_id));
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

  const { data: preferences, isLoading: loadingPrefs } = useQuery({
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

  // Il primo calendario è già scelto: chi ne ha uno solo (o apre «Orari» per la prima volta) non deve scegliere niente.
  const calendarioOrariId = selectedCalendarId && calendars.some((c) => c.id === selectedCalendarId)
    ? selectedCalendarId
    : (calendars[0]?.id ?? null);

  const { data: availability = [], isLoading: loadingAvail } = useQuery({
    queryKey: ["marketing-calendar-availability", calendarioOrariId],
    queryFn: async () => {
      if (!calendarioOrariId || !effectiveCompanyId) return [];
      const { data, error } = await supabase
        .from("marketing_calendar_availability")
        .select("*")
        .eq("calendar_id", calendarioOrariId)
        .eq("company_id", effectiveCompanyId)
        .order("day_of_week");
      if (error) throw error;
      return data as CalendarAvailability[];
    },
    enabled: !!calendarioOrariId && !!effectiveCompanyId,
  });

  // ---- MUTATIONS ----
  const createCalendar = useMutation({
    mutationFn: async (data: CalendarFormData) => {
      if (!effectiveCompanyId || !user?.id) throw new Error("Dati mancanti");
      if (!canManageCalendars) throw new Error("Non hai i permessi per creare calendari.");
      const { name, duration, maxDailyKm, bookingSlug, calendarType, meetingProvider } = validateCalendarPayload(data);
      await assertNoDuplicateCalendarName(name);
      const safeBookingSlug = await getAvailableBookingSlug(bookingSlug);
      const { data: creato, error } = await supabase.from("marketing_calendars").insert({
        company_id: effectiveCompanyId,
        created_by: user.id,
        name,
        description: data.description || null,
        color: data.color || null,
        owner_id: data.owner_id || null,
        booking_slug: safeBookingSlug,
        duration_minutes: duration,
        buffer_before_min: Math.max(0, Number(data.buffer_before_min) || 0),
        buffer_after_min: Math.max(0, Number(data.buffer_after_min) || 0),
        min_notice_minutes: Math.max(0, Number(data.min_notice_minutes) || 0),
        max_per_day: data.max_per_day == null ? null : Math.max(1, Number(data.max_per_day)),
        reminder_24h: data.reminder_24h !== false,
        reminder_1h: data.reminder_1h !== false,
        // Il calendario esterno scelto nel passo 3 del dialog.
        external_provider: data.external_provider ?? null,
        external_connection_id: data.external_connection_id ?? null,
        external_calendar_id: data.external_calendar_id ?? null,
        external_calendar_name: data.external_calendar_name ?? null,
        // Link fisso, WhatsApp e testi dei messaggi al cliente (22/09/2026).
        link_videochiamata: data.link_videochiamata.trim() || null,
        whatsapp_numero_id: data.whatsapp_numero_id || null,
        promemoria_5min: !!data.promemoria_5min,
        messaggi_crm_dal: data.messaggi_crm_dal ?? null,
        firma_messaggi: data.firma_messaggi.trim() || null,
        cosa_preparare: data.cosa_preparare.trim() || null,
        modello_descrizione_evento: data.modello_descrizione_evento.trim() || null,
        mittente_nome: data.mittente_nome.trim() || null,
        mittente_email: data.mittente_email.trim().toLowerCase() || null,
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
      } as never).select("id").single();
      if (error) throw error;

      // Orari di partenza (lun-ven 9-18): un calendario appena creato ha gia' un
      // link pubblico, e senza fasce quel link non mostra NESSUN orario — sembra
      // rotto. Si cambiano subito dalla sezione "Disponibilità".
      if (creato?.id) {
        const fasce = [0, 1, 2, 3, 4, 5, 6].map((giorno) => ({
          company_id: effectiveCompanyId,
          calendar_id: creato.id as string,
          day_of_week: giorno,
          start_time: "09:00",
          end_time: "18:00",
          is_enabled: giorno >= 1 && giorno <= 5,
          specific_date: null as string | null,
        }));
        const { error: errFasce } = await supabase.from("marketing_calendar_availability").insert(fasce);
        if (errFasce) {
          console.warn("[calendari] orari di partenza non creati:", errFasce.message);
          return { orariCreati: false, id: creato.id as string };
        }
      }
      return { orariCreati: true, id: creato?.id as string | undefined };
    },
    onSuccess: (esito, data) => {
      // Un canale webhook sul calendario Google agganciato: cosi' uno
      // spostamento fatto su Google arriva in EiC in pochi secondi, come per
      // le pose. Best effort: il cron dei 15 minuti rilegge comunque.
      if (data.external_provider === "google") void registraCanaleCalendario(data.external_connection_id ?? null, data.external_calendar_id ?? null);
      // Prima il messaggio prometteva gli orari anche quando non erano stati
      // salvati: il link di prenotazione restava senza fasce libere.
      // Il pulsante nel messaggio porta direttamente agli orari del calendario appena creato.
      const vaiAgliOrari = esito?.id
        ? { label: "Cambia gli orari", onClick: () => { setSelectedCalendarId(esito.id!); handleTabChange("availability"); } }
        : undefined;
      if (esito?.orariCreati === false) {
        toast.warning("Calendario creato, orari non salvati", { description: "Imposta gli orari dalla scheda «Orari», altrimenti nessuno potrà prenotare.", action: vaiAgliOrari });
      } else {
        toast.success("Calendario creato", { description: "Orari di partenza: lunedì-venerdì 9-18. Puoi cambiarli dalla scheda «Orari».", action: vaiAgliOrari });
      }
      invalidaCalendari();
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
        throw new Error("Questo link è già usato da un altro calendario: scrivine un altro.");
      }
      const { error } = await supabase.from("marketing_calendars").update({
        name,
        description: data.description || null,
        color: data.color || null,
        owner_id: data.owner_id || null,
        booking_slug: bookingSlug,
        calendar_type: calendarType,
        default_meeting_provider: meetingProvider,
        default_meeting_enabled: meetingProvider === "google_meet",
        duration_minutes: duration,
        buffer_before_min: Math.max(0, Number(data.buffer_before_min) || 0),
        buffer_after_min: Math.max(0, Number(data.buffer_after_min) || 0),
        min_notice_minutes: Math.max(0, Number(data.min_notice_minutes) || 0),
        max_per_day: data.max_per_day == null ? null : Math.max(1, Number(data.max_per_day)),
        reminder_24h: data.reminder_24h !== false,
        reminder_1h: data.reminder_1h !== false,
        // Il calendario esterno scelto nel passo 3 del dialog.
        external_provider: data.external_provider ?? null,
        external_connection_id: data.external_connection_id ?? null,
        external_calendar_id: data.external_calendar_id ?? null,
        external_calendar_name: data.external_calendar_name ?? null,
        // Link fisso, WhatsApp e testi dei messaggi al cliente (22/09/2026).
        link_videochiamata: data.link_videochiamata.trim() || null,
        whatsapp_numero_id: data.whatsapp_numero_id || null,
        promemoria_5min: !!data.promemoria_5min,
        messaggi_crm_dal: data.messaggi_crm_dal ?? null,
        firma_messaggi: data.firma_messaggi.trim() || null,
        cosa_preparare: data.cosa_preparare.trim() || null,
        modello_descrizione_evento: data.modello_descrizione_evento.trim() || null,
        mittente_nome: data.mittente_nome.trim() || null,
        mittente_email: data.mittente_email.trim().toLowerCase() || null,
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
      } as never).eq("id", id).eq("company_id", effectiveCompanyId!);
      if (error) throw error;
    },
    onSuccess: (_r, data) => {
      if (data.external_provider === "google") void registraCanaleCalendario(data.external_connection_id ?? null, data.external_calendar_id ?? null);
      toast.success("Calendario aggiornato");
      invalidaCalendari();
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
      invalidaCalendari();
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
      invalidaCalendari();
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
        // Anche gli appuntamenti senza stato contano: con il solo "not in"
        // restavano fuori dal conteggio e perdevano il calendario.
        .or("status.is.null,status.not.in.(cancelled,canceled,archived)");
      if (countError) throw countError;
      if ((count || 0) > 0) {
        throw new Error("Calendario collegato ad appuntamenti attivi: disattivalo invece di eliminarlo.");
      }
      const { error } = await supabase.from("marketing_calendars").delete().eq("id", id).eq("company_id", effectiveCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Calendario eliminato");
      invalidaCalendari();
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message || "Impossibile eliminare il calendario"),
  });

  const upsertPreferences = useMutation({
    mutationFn: async (data: Record<ChiavePreferenza, number>) => {
      if (!effectiveCompanyId) throw new Error("Dati mancanti");
      if (!canManageCalendars) throw new Error("Non hai i permessi per modificare gli spostamenti.");
      validatePreferencesPayload(data);
      // Solo i tre numeri vivi: le altre colonne restano come sono (o, alla prima volta, con il loro valore di partenza).
      const { error } = await supabase.from("marketing_calendar_preferences").upsert(
        { company_id: effectiveCompanyId, ...data },
        { onConflict: "company_id" }
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Spostamenti salvati");
      await queryClient.refetchQueries({ queryKey: ["marketing-calendar-preferences"] });
      setBozzaPrefs({});
    },
    onError: (e: Error) => toast.error(e.message || "Impossibile salvare gli spostamenti"),
  });

  const saveAvailability = useMutation({
    mutationFn: async (rows: { day_of_week: number; start_time: string; end_time: string; is_enabled: boolean }[]) => {
      if (!calendarioOrariId || !effectiveCompanyId) throw new Error("Dati mancanti");
      if (!canManageCalendars) throw new Error("Non hai i permessi per modificare gli orari.");
      validateAvailabilityRows(rows);
      // Delete existing weekly rows, then insert new
      const { error: deleteError } = await supabase.from("marketing_calendar_availability")
        .delete()
        .eq("calendar_id", calendarioOrariId)
        .eq("company_id", effectiveCompanyId)
        .is("specific_date", null);
      if (deleteError) throw deleteError;
      const inserts = rows.map(r => ({
        company_id: effectiveCompanyId,
        calendar_id: calendarioOrariId,
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
    onSuccess: async () => {
      toast.success("Orari salvati");
      queryClient.invalidateQueries({ queryKey: ["marketing-calendars-con-orari"] });
      // Si rilegge prima di togliere la bozza: nessun lampo con gli orari di prima.
      await queryClient.refetchQueries({ queryKey: ["marketing-calendar-availability"] });
      setBozzaOrari(null);
    },
    onError: (e: Error) => toast.error(e.message || "Impossibile salvare gli orari"),
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
  };

  // 2026-05-26: la sede NON è più richiesta come warning. Molti calendari
  // (videocall, telefonate, sopralluoghi dal cliente) non hanno una sede
  // base — chiederlo come "da completare" creava rumore inutile.
  const getConfigWarnings = (cal: MarketingCalendar) => {
    const warnings: string[] = [];
    if (!cal.owner_id) warnings.push("responsabile");
    if (!cal.booking_slug) warnings.push("link");
    if (!cal.duration_minutes || cal.duration_minutes <= 0) warnings.push("durata");
    // Senza fasce attive il link pubblico non propone alcun orario.
    if (!calendariConOrari.has(cal.id)) warnings.push("orari");
    return warnings;
  };

  const shareUrl = sharingCalendar?.booking_slug ? buildBookingUrl(sharingCalendar.booking_slug) : "";
  const shareEmbedCode = buildBookingEmbedCode(shareUrl);
  const shareButtonCode = buildBookingButtonCode(shareUrl);
  const shareSlug = sharingCalendar?.booking_slug ?? "";
  const shareInlineCode = buildBookingInlineCode(shareUrl, shareSlug);
  const sharePopupCode = buildBookingPopupCode(shareUrl, shareSlug, `Prenota — ${sharingCalendar?.name ?? "appuntamento"}`);
  const shareBadgeCode = buildBookingBadgeCode(shareUrl, shareSlug, `Prenota — ${sharingCalendar?.name ?? "appuntamento"}`);

  // ---- ORARI: la bozza (`null` = nessuna modifica) sostituisce gli orari salvati finché non si salva ----
  const orariSalvati: FasciaOraria[] = availability.length > 0
    ? availability
        .filter(a => a.specific_date === null)
        .map((a, i) => ({
          rid: a.id ?? `r${i}`,
          day_of_week: a.day_of_week!,
          start_time: a.start_time,
          end_time: a.end_time,
          is_enabled: a.is_enabled,
        }))
    : DAYS.map(d => ({
        rid: `d${d.value}`,
        day_of_week: d.value,
        start_time: "09:00",
        end_time: "18:00",
        is_enabled: d.value >= 1 && d.value <= 5,
      }));
  const [bozzaOrari, setBozzaOrari] = useState<FasciaOraria[] | null>(null);
  const localAvail = bozzaOrari ?? orariSalvati;
  const modificaOrari = (cambia: (fasce: FasciaOraria[]) => FasciaOraria[]) => setBozzaOrari((corrente) => cambia(corrente ?? orariSalvati));

  // ---- SPOSTAMENTI: stesso schema, con i numeri scritti come testo finché si digita ----
  const [bozzaPrefs, setBozzaPrefs] = useState<Partial<Record<ChiavePreferenza, string>>>({});
  const valorePreferenza = (chiave: ChiavePreferenza, predefinito: number) =>
    bozzaPrefs[chiave] ?? String(preferences?.[chiave] ?? predefinito);

  const conferma = useSettingsDraftGuard(bozzaOrari !== null || Object.keys(bozzaPrefs).length > 0 || saveAvailability.isPending || upsertPreferences.isPending);
  const cambiaCalendarioOrari = (id: string) => {
    if (id === calendarioOrariId) return;
    if (bozzaOrari !== null && !conferma()) return;
    setBozzaOrari(null);
    setSelectedCalendarId(id);
  };
  const salvaSpostamenti = () => {
    upsertPreferences.mutate(Object.fromEntries(
      PREFERENZE_SPOSTAMENTI.map((p) => [p.chiave, Number(valorePreferenza(p.chiave, p.predefinito).trim() || Number.NaN)]),
    ) as Record<ChiavePreferenza, number>);
  };

  return (
    <div className="flex flex-col gap-4">
      {!canManageCalendars && (
        <AvvisoSolaLettura>
          Sola lettura: per creare, modificare, disattivare o sincronizzare un calendario serve un amministratore o il permesso «Modifica» su Personalizzazione.
        </AvvisoSolaLettura>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        {/* Schede nell'ordine in cui si usano. I valori nell'indirizzo (?tab=availability, ?tab=preferences) non cambiano: ricerca e
            collegamenti già in giro continuano ad aprire la scheda giusta. */}
        <TabsList className="w-full sm:w-auto max-w-full h-auto flex-wrap justify-start gap-1 sm:flex-nowrap overflow-x-auto">
          <TabsTrigger value="calendars" className="gap-2 shrink-0 max-md:min-h-11"><CalendarDays className="h-4 w-4" />Calendari</TabsTrigger>
          <TabsTrigger value="availability" className="gap-2 shrink-0 max-md:min-h-11"><Clock className="h-4 w-4" />Orari</TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2 shrink-0 max-md:min-h-11"><Route className="h-4 w-4" />Spostamenti</TabsTrigger>
          <TabsTrigger value="connections" className="gap-2 shrink-0 max-md:min-h-11"><Link2 className="h-4 w-4" />Collegamenti</TabsTrigger>
        </TabsList>

        {/* TAB: CALENDARI */}
        {/* 09/09/2026 — I quattro pannelli erano montati a forza tutti insieme:
            Radix li teneva visibili uno sotto l'altro, e cliccare "Collegamenti"
            o "Disponibilita'" non cambiava niente — restava sempre in cima
            l'elenco dei calendari, e il resto stava in fondo alla pagina. */}
        <TabsContent value="calendars" className="space-y-4">
          {!loadingCalendars && !calendarsError && (
            <p className="text-sm text-muted-foreground">
              {calendarStats.total === 1 ? "1 calendario" : `${calendarStats.total} calendari`} · {calendarStats.active === 1 ? "1 attivo" : `${calendarStats.active} attivi`}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative max-md:w-full">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Cerca calendario…" aria-label="Cerca un calendario" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56 max-md:h-11 max-md:w-full" />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32 max-md:h-11" aria-label="Filtra per stato"><SelectValue placeholder="Stato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="active">Attivi</SelectItem>
                  <SelectItem value="inactive">Inattivi</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-32 max-md:h-11" aria-label="Filtra per tipo"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="personal">Commerciale</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="event">Evento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => { setEditingCalendar(null); setDialogOpen(true); }} disabled={!canManageCalendars} className="gap-2 max-md:h-11 max-md:w-full">
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
                <h2 className="text-lg font-medium mb-1">Nessun calendario</h2>
                <p className="text-muted-foreground mb-4">Crea il tuo primo calendario per iniziare</p>
                <Button onClick={() => { setEditingCalendar(null); setDialogOpen(true); }} disabled={!canManageCalendars} className="gap-2 max-md:h-11">
                  <Plus className="h-4 w-4" /> Nuovo calendario
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="max-sm:px-2">Nome</TableHead>
                    <TableHead className="hidden sm:table-cell">Responsabile</TableHead>
                    {/* Colonne spostate più in là: nelle Impostazioni a 1024 lo
                        spazio è 686px e la tabella ne chiedeva 1157. */}
                    <TableHead className="hidden 2xl:table-cell">Sede base</TableHead>
                    <TableHead className="hidden sm:table-cell">Durata</TableHead>
                    <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                    <TableHead className="hidden 2xl:table-cell">Link di prenotazione</TableHead>
                    <TableHead className="hidden xl:table-cell">Calendario esterno</TableHead>
                    <TableHead className="hidden xl:table-cell">Appuntamenti</TableHead>
                    <TableHead className="max-sm:px-2">Stato</TableHead>
                    <TableHead className="hidden min-[1700px]:table-cell">Aggiornato</TableHead>
                    <TableHead className="text-right max-sm:px-2">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(cal => (
                    <TableRow key={cal.id}>
                      <TableCell className="max-sm:px-2">
                        <div className="space-y-1">
                          <p className="font-medium">{cal.name}</p>
                          <p className="text-xs text-muted-foreground sm:hidden">{cal.duration_minutes} min · {calendarTypeMeta(cal.calendar_type).label}</p>
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
                      <TableCell className="hidden 2xl:table-cell text-muted-foreground">
                        {cal.base_formatted_address || [cal.base_address_city, cal.base_address_province].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{cal.duration_minutes} min</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {(() => {
                          const meta = calendarTypeMeta(cal.calendar_type);
                          return <Badge variant={meta.variant}>{meta.label}</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="hidden 2xl:table-cell">
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
                      {/* Dove finiscono gli appuntamenti: prima si vedeva solo
                          entrando nel calendario e scorrendo fino in fondo. Il
                          nome del calendario da solo non basta ("Principale" e'
                          uguale per tutti): serve anche di CHI e' l'account. */}
                      <TableCell className="hidden xl:table-cell">
                        {cal.external_calendar_id ? (
                          <button
                            type="button"
                            className="block max-w-[220px] text-left hover:underline"
                            onClick={() => { setEditingCalendar(cal); setDialogOpen(true); }}
                          >
                            <span className="flex items-center gap-1.5 text-sm">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="truncate">{cal.external_calendar_name || "Collegato"}</span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {emailAccount(cal.external_connection_id) ?? PROVIDER_NOME[cal.external_provider ?? "google"]}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:underline"
                            onClick={() => { setEditingCalendar(cal); setDialogOpen(true); }}
                          >
                            Non collegato
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">{appointmentCountsByCalendar[cal.id] || 0}</TableCell>
                      <TableCell className="max-sm:px-2">
                        <Switch checked={cal.is_active} aria-label={`Attivo: ${cal.name}`} disabled={!canManageCalendars || toggleActive.isPending} onCheckedChange={(v) => toggleActive.mutate({ id: cal.id, is_active: v })} className="max-md:relative max-md:before:absolute max-md:before:-inset-x-1 max-md:before:-inset-y-2.5 max-md:before:content-['']" />
                      </TableCell>
                      <TableCell className="hidden min-[1700px]:table-cell text-muted-foreground text-sm">
                        {/* 2026-05-27: guard contro updated_at null/invalid che
                            lanciava RangeError "Invalid time value" da date-fns
                            e crashava l'intera pagina via ErrorBoundary. */}
                        {(() => {
                          if (!cal.updated_at) return "—";
                          const d = new Date(cal.updated_at);
                          if (Number.isNaN(d.getTime())) return "—";
                          return format(d, "dd MMM yyyy", { locale: it });
                        })()}
                      </TableCell>
                      <TableCell className="text-right max-sm:px-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setSharingCalendar(cal)} title="Condividi il link di prenotazione" aria-label={`Condividi il link di «${cal.name}»`} className="max-md:h-11 max-md:w-11">
                            <Share2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" disabled={!canManageCalendars} onClick={() => { setEditingCalendar(cal); setDialogOpen(true); }} aria-label={`Modifica «${cal.name}»`} className="max-md:h-11 max-md:w-11">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" disabled={!canManageCalendars} onClick={() => setDeleteId(cal.id)} aria-label={`Elimina «${cal.name}»`} className="text-destructive hover:text-destructive max-md:h-11 max-md:w-11">
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

        {/* TAB: ORARI — gli orari in cui i clienti possono prenotare con il link.
            Il primo calendario è già scelto; chi ne ha uno solo non sceglie niente. */}
        <TabsContent value="availability" className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold leading-none tracking-tight">Orari di prenotazione</h2>
              <CardDescription>Sono gli orari in cui i clienti possono prenotare con il link.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {calendars.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">Crea prima un calendario: gli orari si impostano calendario per calendario.</p>
              ) : (
                <>
                  {calendars.length > 1 ? (
                    <div className="space-y-2">
                      <Label htmlFor="orari-calendario">Calendario</Label>
                      <Select value={calendarioOrariId ?? ""} onValueChange={cambiaCalendarioOrari}>
                        <SelectTrigger id="orari-calendario" className="w-full sm:w-72 max-md:h-11"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {calendars.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <p className="text-sm font-medium">Calendario: {calendars[0].name}</p>
                  )}

                  {loadingAvail ? (
                    <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                          <div>
                            <p className="font-medium">Copertura settimanale</p>
                            <p className="text-muted-foreground">
                              {new Set(localAvail.filter(a => a.is_enabled).map(a => a.day_of_week)).size} giorni attivi su 7
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!canManageCalendars}
                              className="max-md:h-11"
                              onClick={() => modificaOrari(prev => prev.map(a => ({
                                ...a,
                                is_enabled: a.day_of_week >= 1 && a.day_of_week <= 5,
                                start_time: "09:00",
                                end_time: "18:00",
                              })))}
                            >
                              Lunedì-venerdì 9-18
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!canManageCalendars}
                              className="max-md:h-11"
                              onClick={() => modificaOrari(prev => prev.map(a => ({ ...a, is_enabled: false })))}
                            >
                              Chiudi tutti i giorni
                            </Button>
                          </div>
                        </div>
                        {DAYS.map(day => {
                          const fasce = localAvail.filter(a => a.day_of_week === day.value);
                          if (fasce.length === 0) return null;
                          const attivo = fasce.some(f => f.is_enabled);
                          return (
                            <div key={day.value} className="border-b py-2 last:border-0">
                              {fasce.map((row, idx) => {
                                const invalid = row.is_enabled && row.start_time >= row.end_time;
                                const nomeFascia = idx === 0 ? day.label : `${day.label}, seconda fascia`;
                                return (
                                  <div key={row.rid} className={`flex flex-wrap items-center gap-3 py-1 ${invalid ? "rounded-md bg-destructive/5 px-2" : ""}`}>
                                    {/* L'etichetta con il giorno fa da bersaglio grande per la casella (44 px sul telefono). */}
                                    {idx === 0 ? (
                                      <label className="flex w-36 items-center gap-3 text-sm font-medium max-sm:w-full max-md:min-h-11">
                                        <Checkbox
                                          checked={attivo}
                                          disabled={!canManageCalendars}
                                          aria-label={`${day.label}: aperto`}
                                          onCheckedChange={(v) => modificaOrari(prev => prev.map(a => a.day_of_week === day.value ? { ...a, is_enabled: !!v } : a))}
                                        />
                                        {day.label}
                                      </label>
                                    ) : <span className="w-36 max-sm:hidden" />}
                                    <Input
                                      type="time"
                                      aria-label={`${nomeFascia}: dalle`}
                                      value={row.start_time}
                                      onChange={e => modificaOrari(prev => prev.map(a => a.rid === row.rid ? { ...a, start_time: e.target.value } : a))}
                                      className="w-28 max-md:h-11"
                                      disabled={!row.is_enabled || !canManageCalendars}
                                    />
                                    <span className="text-muted-foreground">–</span>
                                    <Input
                                      type="time"
                                      aria-label={`${nomeFascia}: alle`}
                                      value={row.end_time}
                                      onChange={e => modificaOrari(prev => prev.map(a => a.rid === row.rid ? { ...a, end_time: e.target.value } : a))}
                                      className="w-28 max-md:h-11"
                                      disabled={!row.is_enabled || !canManageCalendars}
                                    />
                                    {idx === 0 ? (
                                      <Button variant="ghost" size="icon" title="Copia questa fascia a tutti i giorni attivi" aria-label={`Copia gli orari di ${day.label} a tutti i giorni aperti`} disabled={!canManageCalendars} className="max-md:h-11 max-md:w-11" onClick={() => {
                                        modificaOrari(prev => prev.map(a => a.is_enabled ? { ...a, start_time: row.start_time, end_time: row.end_time } : a));
                                      }}>
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    ) : (
                                      <Button variant="ghost" size="icon" title="Togli questa fascia" aria-label={`Togli la seconda fascia di ${day.label}`} disabled={!canManageCalendars} className="max-md:h-11 max-md:w-11"
                                        onClick={() => modificaOrari(prev => prev.filter(a => a.rid !== row.rid))}>
                                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                    )}
                                    {invalid && <span className="text-xs text-destructive">La fine deve essere dopo l'inizio</span>}
                                  </div>
                                );
                              })}
                              {attivo && canManageCalendars && (
                                <button
                                  type="button"
                                  className="mt-0.5 text-xs text-muted-foreground hover:text-foreground sm:ml-40 max-md:min-h-11"
                                  title="Una seconda fascia serve per la pausa pranzo (es. 9-13 e 14:30-18)"
                                  onClick={() => modificaOrari(prev => {
                                    const ultime = prev.filter(a => a.day_of_week === day.value);
                                    const ultima = ultime[ultime.length - 1];
                                    // Con una fascia che arriva a fine giornata (9-18) la seconda non avrebbe posto: si divide il giorno,
                                    // prima fascia fino alle 13 e seconda dalle 14:30 (la pausa pranzo del pulsante). Altrimenti la seconda
                                    // parte da dove finisce l'ultima.
                                    const dividi = !!ultima && ultima.end_time >= "17:00" && ultima.start_time < "13:00";
                                    const nuovaInizio = dividi ? "14:30" : (ultima ? ultima.end_time : "14:30");
                                    const nuovaFine = dividi ? ultima.end_time : "18:00";
                                    return [
                                      ...prev.map(a => (dividi && ultima && a.rid === ultima.rid ? { ...a, end_time: "13:00" } : a)),
                                      {
                                        rid: `n${day.value}-${Date.now()}`,
                                        day_of_week: day.value,
                                        start_time: nuovaInizio,
                                        end_time: nuovaFine,
                                        is_enabled: true,
                                      },
                                    ];
                                  })}
                                >
                                  + Aggiungi una seconda fascia (per la pausa pranzo)
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* La barra resta in vista: con sette giorni il pulsante in fondo usciva dallo schermo. */}
                      {canManageCalendars && bozzaOrari !== null && (
                        <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-2 rounded-b-lg border-t bg-card px-6 py-3">
                          <span role="status" className="text-sm text-muted-foreground">Modifiche non salvate</span>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setBozzaOrari(null)} disabled={saveAvailability.isPending} className="max-md:h-11">
                              Annulla le modifiche
                            </Button>
                            <Button size="sm" onClick={() => saveAvailability.mutate(localAvail)} disabled={saveAvailability.isPending} className="max-md:h-11">
                              {saveAvailability.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvataggio…</> : "Salva gli orari"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: SPOSTAMENTI — i tre numeri che il suggerimento dei calendari legge davvero. */}
        <TabsContent value="preferences" className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold leading-none tracking-tight">Spostamenti e durata</h2>
              <CardDescription>Valori che si usano quando il calendario non ne ha di suoi, per proporre il calendario giusto a un nuovo appuntamento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {PREFERENZE_SPOSTAMENTI.map((p) => (
                  <div key={p.chiave} className="space-y-2">
                    <Label htmlFor={`pref-${p.chiave}`}>{p.etichetta}</Label>
                    <Input
                      id={`pref-${p.chiave}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      disabled={!canManageCalendars || loadingPrefs}
                      value={valorePreferenza(p.chiave, p.predefinito)}
                      onChange={(e) => setBozzaPrefs((b) => ({ ...b, [p.chiave]: e.target.value }))}
                      className="max-md:h-11"
                    />
                    <p className="text-xs text-muted-foreground">{p.aiuto}</p>
                  </div>
                ))}
              </div>
              {canManageCalendars && Object.keys(bozzaPrefs).length > 0 && (
                <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-2 rounded-b-lg border-t bg-card px-6 py-3">
                  <span role="status" className="text-sm text-muted-foreground">Modifiche non salvate</span>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setBozzaPrefs({})} disabled={upsertPreferences.isPending} className="max-md:h-11">
                      Annulla le modifiche
                    </Button>
                    <Button size="sm" onClick={salvaSpostamenti} disabled={upsertPreferences.isPending} className="max-md:h-11">
                      {upsertPreferences.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvataggio…</> : "Salva gli spostamenti"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: COLLEGAMENTI */}
        {/* 09/09/2026 — Erano quattro riquadri di fila senza gerarchia: i primi
            tre sono il TUO account (valgono solo per te), il quarto e' la vista
            di squadra. Chi apriva la pagina non capiva se stesse guardando le
            proprie connessioni o quelle di tutti. */}
        <TabsContent value="connections" className="space-y-8">
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Il tuo account</h2>
              <p className="text-xs text-muted-foreground">
                Vale solo per te: collega qui il calendario dove vuoi ricevere i tuoi appuntamenti.
                Ogni persona del team collega il proprio dal suo profilo.
              </p>
            </div>
            <GoogleCalendarConnectionTab />
            <OutlookCalendarConnectionTab />
            <AppleCalendarConnectionTab />
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Tutta l'azienda</h2>
              <p className="text-xs text-muted-foreground">
                Chi ha collegato un account, con quale indirizzo, quando ha sincronizzato
                l'ultima volta e quali calendari del gestionale ci scrivono dentro.
              </p>
            </div>
            <CompanyCalendarsOverview />
          </section>
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
          if (editingCalendar) setSelectedCalendarId(editingCalendar.id);
          setDialogOpen(false);
          handleTabChange("availability");
        }}
        haOrari={editingCalendar ? calendariConOrari.has(editingCalendar.id) : true}
        initialData={editingCalendar}
        isLoading={createCalendar.isPending || updateCalendar.isPending}
      />

      <Dialog open={!!sharingCalendar} onOpenChange={(open) => !open && setSharingCalendar(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Condividi calendario</DialogTitle>
            <DialogDescription>
              Copia il link da mandare al cliente, oppure incolla uno dei codici nel tuo sito.
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
                    <p className="mt-1 text-xs text-amber-800/80">Generalo per avere una pagina dove i clienti prenotano da soli.</p>
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
                      <Label htmlFor="condividi-link">Link diretto</Label>
                      <div className="flex gap-2">
                        <Input id="condividi-link" value={shareUrl} readOnly className="font-mono text-xs" />
                        <Button type="button" variant="outline" className="gap-2 max-md:h-11" onClick={() => copyText(shareUrl, "Link")}>
                          <Copy className="h-4 w-4" />
                          Copia
                        </Button>
                        <Button type="button" variant="outline" size="icon" asChild>
                          <a href={shareUrl} target="_blank" rel="noopener noreferrer" aria-label="Apri la pagina di prenotazione in una nuova scheda">
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
                            Codice da incollare nel sito
                          </Label>
                          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 max-md:h-11" onClick={() => copyText(shareEmbedCode, "Codice")}>
                            <Copy className="h-3.5 w-3.5" />
                            Copia
                          </Button>
                        </div>
                        <Textarea value={shareEmbedCode} readOnly rows={5} aria-label="Codice da incollare nel sito" className="font-mono text-xs" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="inline-flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5" />
                            Pulsante per il sito
                          </Label>
                          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 max-md:h-11" onClick={() => copyText(shareButtonCode, "Codice del pulsante")}>
                            <Copy className="h-3.5 w-3.5" />
                            Copia
                          </Button>
                        </div>
                        <Textarea value={shareButtonCode} readOnly rows={5} aria-label="Codice del pulsante per il sito" className="font-mono text-xs" />
                      </div>
                      {/* Widget: come Calendly — riquadro che si adatta, finestra
                          al clic e bottone fisso. Servono lo script prenota.js. */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="inline-flex items-center gap-1.5">
                            <Code2 className="h-3.5 w-3.5" />
                            Riquadro che si adatta
                          </Label>
                          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 max-md:h-11" onClick={() => copyText(shareInlineCode, "Codice del riquadro")}>
                            <Copy className="h-3.5 w-3.5" /> Copia
                          </Button>
                        </div>
                        <Textarea value={shareInlineCode} readOnly rows={3} aria-label="Codice del riquadro che si adatta" className="font-mono text-xs" />
                        <p className="text-[11px] text-muted-foreground">Cresce e si accorcia da solo con il contenuto.</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="inline-flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5" />
                            Finestra al clic
                          </Label>
                          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 max-md:h-11" onClick={() => copyText(sharePopupCode, "Codice della finestra")}>
                            <Copy className="h-3.5 w-3.5" /> Copia
                          </Button>
                        </div>
                        <Textarea value={sharePopupCode} readOnly rows={3} aria-label="Codice della finestra al clic" className="font-mono text-xs" />
                        <p className="text-[11px] text-muted-foreground">
                          Si apre sopra il sito, senza lasciare la pagina. Funziona su qualsiasi bottone con <code>data-prenota</code>.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="inline-flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5" />
                            Pulsante fisso in basso
                          </Label>
                          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 max-md:h-11" onClick={() => copyText(shareBadgeCode, "Codice del pulsante fisso")}>
                            <Copy className="h-3.5 w-3.5" /> Copia
                          </Button>
                        </div>
                        <Textarea value={shareBadgeCode} readOnly rows={3} aria-label="Codice del pulsante fisso in basso" className="font-mono text-xs" />
                        <p className="text-[11px] text-muted-foreground">
                          Una riga nel tema del sito: il bottone compare su tutte le pagine. A prenotazione fatta il sito riceve l'evento <code>eic:appuntamento-prenotato</code> per Analytics.
                        </p>
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
            <AlertDialogDescription>Il calendario e i suoi orari vengono eliminati e non si possono recuperare. Se ha appuntamenti attivi non si elimina: disattivalo.</AlertDialogDescription>
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

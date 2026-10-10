import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, Loader2, Trash2, Clock, Car, Pencil, AlertTriangle, CheckCircle2, Copy, MessageCircle, Video } from "lucide-react";
import { format, getDay, addMinutes, parse } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import AddressAutocomplete, { type AddressData, emptyAddress } from "@/components/shared/AddressAutocomplete";
import AddressMapPreview from "@/components/shared/AddressMapPreview";
import MarketingAppointmentDialog, { type MarketingAppointmentData } from "@/components/marketing/MarketingAppointmentDialog";
import CalendarSuggestions, { type CalendarSuggestion } from "@/components/marketing/CalendarSuggestions";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { useAppleCalendarSync } from "@/hooks/useAppleCalendarSync";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsPlatformCrm } from "@/hooks/useIsPlatformCrm";
import { aggiornaAgendaSchede } from "@/lib/opportunitaAgenda";
import { forwardGeocode } from "@/lib/geocoding";
import {
  distanzaLineaAria, linkWhatsApp, scorciatoieData, testoKm, sovrapposizioni, testoConferma, titoloSuggerito,
} from "@/lib/opportunita/appuntamentoPrecompilato";
import { calcolaSlotLiberi, impegniEsterniInFascia, type Occupato } from "@/lib/opportunita/slotCalendario";

interface Props {
  contactId: string;
  companyId: string;
  opportunityId: string;
  contactName: string;
}

// 2026-05-27: Tipi appuntamento coerenti con AppointmentDialog operativo.
// Sottoinsieme rilevante per il flow Opportunità → booking commerciale.
const OPP_APPOINTMENT_TYPES = [
  { value: "sopralluogo_preventivo", label: "Sopralluogo Preventivo" },
  { value: "rilievo_tecnico",        label: "Rilievo Tecnico" },
  { value: "misurazione",            label: "Misurazione" },
  { value: "conferma_ordine",        label: "Conferma Ordine" },
  { value: "riunione",               label: "Riunione" },
  { value: "cliente",                label: "Appuntamento Cliente" },
  { value: "generico",               label: "Generico" },
];

// CRM di piattaforma: si vende in videochiamata, niente cantiere né sopralluoghi.
// Tutti e quattro si salvano come «videocall» (tipo che il calendario e la sincronizzazione già
// conoscono): la differenza sta nel titolo («Demo · Nome»).
const PLATFORM_APPOINTMENT_TYPES = [
  { value: "demo",      label: "Demo" },
  { value: "discovery", label: "Discovery" },
  { value: "follow_up", label: "Follow-up" },
  { value: "chiusura",  label: "Chiusura" },
];

const STATUS_OPTIONS = [
  { value: "confermato",  label: "Confermato" },
  { value: "in_attesa",   label: "In attesa" },
  { value: "completato",  label: "Completato" },
  { value: "annullato",   label: "Annullato" },
];

const REMINDER_OPTIONS = [
  { value: "none", label: "Nessuno" },
  { value: "10",   label: "10 minuti prima" },
  { value: "30",   label: "30 minuti prima" },
  { value: "60",   label: "1 ora prima" },
  { value: "120",  label: "2 ore prima" },
  { value: "1440", label: "1 giorno prima" },
];

const DURATION_OPTIONS = [
  { value: "15",  label: "15 minuti" },
  { value: "30",  label: "30 minuti" },
  { value: "45",  label: "45 minuti" },
  { value: "60",  label: "1 ora" },
  { value: "90",  label: "1 ora e 30" },
  { value: "120", label: "2 ore" },
  { value: "180", label: "3 ore" },
  { value: "240", label: "4 ore" },
];

function addMinutesToTimeStr(hhmm: string, minutes: number): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = h * 60 + m + minutes;
  const newH = Math.floor((total % (24 * 60)) / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function diffMinutesTimeStr(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return null;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

export function OpportunityAppointmentTab({ contactId, companyId, opportunityId, contactName }: Props) {
  // In sola lettura niente prenotazioni (policy RESTRICTIVE su appointments).
  const { solaLettura, onlyAssigned } = usePermissions();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const googleSync = useGoogleCalendarSync();
  const appleSync = useAppleCalendarSync();
  const isPlatformCrm = useIsPlatformCrm();
  const appointmentTypes = isPlatformCrm ? PLATFORM_APPOINTMENT_TYPES : OPP_APPOINTMENT_TYPES;
  const tipoPredefinito = isPlatformCrm ? "demo" : "sopralluogo_preventivo";
  // Promemoria 30 minuti prima di serie per le demo: chi prenota sceglie solo giorno e ora.
  const promemoriaPredefinito = isPlatformCrm ? "30" : "none";

  const [calendarId, setCalendarId] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [addressData, setAddressData] = useState<AddressData>(emptyAddress);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<MarketingAppointmentData | null>(null);

  // 2026-05-27 (user request): allineato con AppointmentDialog operativo —
  // aggiunti orario manuale (override slot-picker), tipo, assegnatario,
  // stato, promemoria. Prima il tab opportunità accettava solo "appuntamento"
  // generico con slot fisso del calendario; ora ha lo stesso set di campi
  // della dialog commessa così è coerente.
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");
  const [manualDuration, setManualDuration] = useState<string>("60");
  const [appointmentType, setAppointmentType] = useState<string>(tipoPredefinito);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [status, setStatus] = useState<string>("confermato");
  const [reminderMinutes, setReminderMinutes] = useState<string>(promemoriaPredefinito);
  // Precompilazione: quello che l'utente non ha ancora toccato si riempie da solo.
  const [titoloToccato, setTitoloToccato] = useState(false);
  const [assegnatarioToccato, setAssegnatarioToccato] = useState(false);
  const [mostraStorico, setMostraStorico] = useState(false);
  const [conferma, setConferma] = useState<{ testo: string; link: string | null } | null>(null);

  // Fetch calendars with base address
  const { data: calendars = [] } = useQuery({
    queryKey: ["marketing_calendars_active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("id, name, duration_minutes, calendar_type, base_lat, base_lng, base_formatted_address, default_meeting_provider, default_meeting_enabled, link_videochiamata, owner_id, buffer_before_min, buffer_after_min, min_notice_minutes, max_per_day")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const selectedCalendar = calendars.find((c) => c.id === calendarId);
  const durationMinutes = selectedCalendar?.duration_minutes || 30;
  const linkVideochiamata = isPlatformCrm ? (selectedCalendar?.link_videochiamata ?? "").trim() : "";

  // Availability
  const dayOfWeek = date ? getDay(date) : null;
  const dateStr = date ? format(date, "yyyy-MM-dd") : null;

  // Tutte le regole del calendario per quel giorno, anche quelle spente: una giornata speciale
  // spenta (ferie, chiusura) deve chiudere il giorno, non ricadere sulla regola settimanale.
  const { data: availability = [] } = useQuery({
    queryKey: ["calendar_availability", calendarId, dayOfWeek, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_calendar_availability")
        .select("*")
        .eq("calendar_id", calendarId)
        .or(`specific_date.eq.${dateStr},and(specific_date.is.null,day_of_week.eq.${dayOfWeek})`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!calendarId && date !== undefined && dayOfWeek !== null,
  });

  // Gli appuntamenti del giorno di TUTTI i calendari dello stesso titolare: con più calendari
  // (Demo, Consulenza…) intestati alla stessa persona, prenotarne uno deve bloccare gli altri.
  const ownerCalendario = selectedCalendar?.owner_id ?? null;
  const idsDelTitolare = ownerCalendario ? calendars.filter((c) => c.owner_id === ownerCalendario).map((c) => c.id) : [];
  const calendariDelTitolare = idsDelTitolare.length > 0 ? idsDelTitolare : calendarId ? [calendarId] : [];

  const { data: existingAppointments = [] } = useQuery({
    queryKey: ["appointments_for_slot", calendarId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, appointment_time, appointment_end_time, lat, lng, formatted_address, title")
        .in("calendar_id", calendariDelTitolare)
        .eq("appointment_date", dateStr!)
        .neq("status", "annullato");
      if (error) throw error;
      return data || [];
    },
    enabled: calendariDelTitolare.length > 0 && !!dateStr,
  });

  // Gli impegni del titolare su Google, Outlook e Apple Calendar: solo inizio e fine.
  const { data: occupatiEsterni = [] } = useQuery({
    queryKey: ["calendar_busy_owner", ownerCalendario, dateStr],
    enabled: !!ownerCalendario && !!dateStr && !!date,
    staleTime: 60_000,
    queryFn: async (): Promise<Occupato[]> => {
      const inizioGiorno = new Date(date!.getFullYear(), date!.getMonth(), date!.getDate()).toISOString();
      const fineGiorno = new Date(date!.getFullYear(), date!.getMonth(), date!.getDate(), 23, 59, 59, 999).toISOString();
      // Le tre tabelle hanno le stesse colonne; le viste non sono nei tipi generati (as never, come nel resto del repo).
      const leggi = async (tabella: string): Promise<Occupato[]> => {
        const { data, error } = await supabase
          .from(tabella as never)
          .select("start_at, end_at")
          .eq("user_id" as never, ownerCalendario as never)
          .lt("start_at" as never, fineGiorno as never)
          .gt("end_at" as never, inizioGiorno as never);
        return error ? [] : ((data ?? []) as unknown as Occupato[]);
      };
      const [g, o, a] = await Promise.all([leggi("google_calendar_busy_slots"), leggi("outlook_calendar_busy_slots"), leggi("apple_calendar_busy_slots")]);
      return [...g, ...o, ...a];
    },
  });

  // Tutti gli appuntamenti del contatto (in programma e passati), non solo il prossimo.
  const { data: contactAppointments = [] } = useQuery({
    queryKey: ["contact_future_appointment", contactId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, marketing_calendars:calendar_id(name)")
        .eq("contact_id", contactId)
        .eq("company_id", companyId)
        .order("appointment_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!contactId && !!companyId,
  });
  const oggiStr = format(new Date(), "yyyy-MM-dd");
  const appuntamentiInProgramma = useMemo(
    () => contactAppointments.filter((a) => a.status !== "annullato" && a.appointment_date >= oggiStr)
      .sort((x, y) => `${x.appointment_date}${x.appointment_time ?? ""}`.localeCompare(`${y.appointment_date}${y.appointment_time ?? ""}`)),
    [contactAppointments, oggiStr],
  );
  const appuntamentiPassati = useMemo(
    () => contactAppointments.filter((a) => a.status === "annullato" || a.appointment_date < oggiStr),
    [contactAppointments, oggiStr],
  );
  const existingContactAppointment = appuntamentiInProgramma[0] ?? null;

  // Opportunità e contatto: da qui si precompila assegnatario, luogo e telefono.
  const { data: oppInfo } = useQuery({
    queryKey: ["appt_opp_info", companyId, opportunityId],
    enabled: !!companyId && !!opportunityId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("marketing_opportunities")
        .select("assigned_to").eq("company_id", companyId).eq("id", opportunityId).maybeSingle();
      return data;
    },
  });
  const { data: contactInfo } = useQuery({
    queryKey: ["appt_contact_info", companyId, contactId],
    enabled: !!companyId && !!contactId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("marketing_contacts")
        .select("first_name, last_name, phone, address, city, postal_code, province, country")
        .eq("company_id", companyId).eq("id", contactId).maybeSingle();
      return data;
    },
  });

  // Impegni dello stesso giorno dell'assegnatario o dello stesso cliente: per avvisare dei conflitti.
  const { data: impegniDelGiorno = [] } = useQuery({
    queryKey: ["appt_conflitti", companyId, dateStr, assignedTo, contactId],
    enabled: !!companyId && !!dateStr,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase.from("appointments")
        .select("id, title, appointment_time, appointment_end_time, assigned_to, contact_id")
        .eq("company_id", companyId).eq("appointment_date", dateStr!).neq("status", "annullato");
      q = assignedTo ? q.or(`assigned_to.eq.${assignedTo},contact_id.eq.${contactId}`) : q.eq("contact_id", contactId);
      const { data, error } = await q;
      if (error) return [];
      return data ?? [];
    },
  });

  // Team users for dialog
  const { data: teamUsers = [] } = useQuery({
    queryKey: ["company_team_users", companyId],
    queryFn: async () => {
      // profiles NON ha la colonna `role` (i ruoli stanno in user_roles):
      // il filtro .or("role.eq...") mandava la query in errore e il dropdown
      // "Assegna a" era SEMPRE vuoto. Tutti i profili aziendali vanno bene.
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!)
        .order("first_name");
      if (error) throw error;
      return (data || []) as { id: string; first_name: string; last_name: string }[];
    },
    enabled: !!companyId,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleOpenAppointmentDialog = (appt: any | null = existingContactAppointment) => {
    if (!appt) return;
    setEditingAppointment({
      id: appt.id,
      title: appt.title,
      description: appt.description || null,
      appointment_date: appt.appointment_date,
      appointment_time: appt.appointment_time || null,
      appointment_end_time: appt.appointment_end_time || null,
      appointment_type: appt.appointment_type || "appuntamento",
      assigned_to: appt.assigned_to || null,
      calendar_id: appt.calendar_id || null,
      contact_id: appt.contact_id || null,
      opportunity_id: appt.opportunity_id || null,
      status: appt.status,
      is_completed: appt.is_completed || false,
      is_blocked_slot: appt.is_blocked_slot || false,
      internal_notes: appt.internal_notes || null,
      address_line: appt.address_line || null,
      address_city: appt.address_city || null,
      address_postal_code: appt.address_postal_code || null,
      address_province: appt.address_province || null,
      address_country: appt.address_country || null,
      address_notes: appt.address_notes || null,
      formatted_address: appt.formatted_address || null,
      lat: appt.lat ?? null,
      lng: appt.lng ?? null,
      place_id: appt.place_id || null,
      meeting_provider: appt.meeting_provider || null,
      meeting_url: appt.meeting_url || null,
      meeting_status: appt.meeting_status || null,
      meeting_created_at: appt.meeting_created_at || null,
    });
    setDialogOpen(true);
  };
  // ── Precompilazione ──
  const chiaveCalendario = `eic.appt.calendario.${companyId}`;
  useEffect(() => {
    if (calendarId || calendars.length === 0) return;
    let scelto = "";
    try {
      const salvato = window.localStorage.getItem(chiaveCalendario);
      if (salvato && calendars.some((c) => c.id === salvato)) scelto = salvato;
    } catch { /* senza memoria locale si parte dall'unico calendario, se c'è */ }
    if (!scelto && calendars.length === 1) scelto = calendars[0].id;
    if (scelto) setCalendarId(scelto);
  }, [calendars, calendarId, chiaveCalendario]);

  useEffect(() => {
    if (assegnatarioToccato || assignedTo || !oppInfo?.assigned_to) return;
    if (teamUsers.some((u) => u.id === oppInfo.assigned_to)) setAssignedTo(oppInfo.assigned_to);
  }, [oppInfo, teamUsers, assegnatarioToccato, assignedTo]);

  // L'indirizzo del contatto si propone una volta sola (chi lo toglie con la X non lo
  // vede riapparire) e si geocodifica: senza coordinate non ci sono mappa, km né
  // suggerimenti di calendario.
  const indirizzoPrecompilato = useRef(false);
  useEffect(() => {
    if (indirizzoPrecompilato.current || !contactInfo?.address) return;
    indirizzoPrecompilato.current = true;
    const citta = [contactInfo.postal_code, contactInfo.city].filter(Boolean).join(" ");
    const formatted = [contactInfo.address, [citta, contactInfo.province ? `(${contactInfo.province})` : ""].filter(Boolean).join(" ")]
      .filter(Boolean).join(", ");
    setAddressData((prev) => (prev.address_line || prev.formatted_address ? prev : {
      ...emptyAddress,
      address_line: contactInfo.address ?? "",
      address_city: contactInfo.city ?? "",
      address_postal_code: contactInfo.postal_code ?? "",
      address_province: contactInfo.province ?? "",
      address_country: contactInfo.country && contactInfo.country.length === 2 ? contactInfo.country : "IT",
      formatted_address: formatted,
    }));
    void forwardGeocode(formatted).then((c) => {
      if (!c) return;
      // Solo se nel frattempo l'utente non ha cambiato indirizzo.
      setAddressData((prev) => (prev.formatted_address === formatted && prev.lat == null ? { ...prev, lat: c.lat, lng: c.lng } : prev));
    });
  }, [contactInfo]);

  const tipoEtichetta = appointmentTypes.find((t) => t.value === appointmentType)?.label ?? "";
  const nomePerTitolo = contactName || [contactInfo?.first_name, contactInfo?.last_name].filter(Boolean).join(" ");
  const titoloProposto = titoloSuggerito(tipoEtichetta, nomePerTitolo);
  const titoloEffettivo = titoloToccato ? title : titoloProposto;

  // Conflitti: altri impegni nella stessa fascia (stesso assegnatario o stesso cliente).
  const orarioInizio = manualStartTime || selectedSlot;
  const orarioFine = manualEndTime || (orarioInizio ? addMinutesToTimeStr(orarioInizio, Number(manualDuration) || 60) : "");
  const conflitti = useMemo(
    () => (orarioInizio && orarioFine
      ? sovrapposizioni(orarioInizio, orarioFine, impegniDelGiorno.map((a) => ({ id: a.id, inizio: a.appointment_time, fine: a.appointment_end_time, titolo: a.title })))
      : []),
    [orarioInizio, orarioFine, impegniDelGiorno],
  );

  const { data: baseDistance } = useQuery({
    queryKey: ["base-distance", calendarId, addressData.lat, addressData.lng],
    queryFn: async () => {
      if (!selectedCalendar?.base_lat || !selectedCalendar?.base_lng || !addressData.lat || !addressData.lng) return null;
      try {
        const { data, error } = await supabase.functions.invoke("maps-proxy", {
          body: {
            action: "directions",
            waypoints: [
              { lat: selectedCalendar.base_lat, lng: selectedCalendar.base_lng },
              { lat: addressData.lat, lng: addressData.lng },
            ],
          },
        });
        if (!error && data?.legs?.[0]) {
          return { duration_text: data.legs[0].duration_text as string, distance_text: data.legs[0].distance_text as string, stima: false };
        }
      } catch {
        // si ripiega sulla stima
      }
      // Strada non calcolabile: almeno i km in linea d'aria, detti come tali.
      const km = distanzaLineaAria(selectedCalendar.base_lat, selectedCalendar.base_lng, addressData.lat, addressData.lng);
      return { duration_text: "", distance_text: testoKm(km * 1000), stima: true };
    },
    enabled: !!selectedCalendar?.base_lat && !!addressData.lat,
    staleTime: 5 * 60 * 1000,
  });

  // Calendar suggestions
  const { data: calendarSuggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: ["suggest-calendars", companyId, addressData.lat, addressData.lng, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("suggest-calendars", {
        body: {
          company_id: companyId,
          client_lat: addressData.lat,
          client_lng: addressData.lng,
          date: dateStr,
          client_address: addressData.formatted_address || "",
        },
      });
      if (error) throw error;
      return (data?.suggestions || []) as CalendarSuggestion[];
    },
    enabled: !!companyId && addressData.lat != null && addressData.lng != null && !!dateStr,
    staleTime: 2 * 60 * 1000,
  });

  const handleSuggestionSelect = (suggCalendarId: string, suggestedTime?: string) => {
    setCalendarId(suggCalendarId);
    if (suggestedTime) {
      setSelectedSlot(suggestedTime);
    } else {
      setSelectedSlot("");
    }
  };

  // Same-day appointments distances
  const sameDayWithCoords = useMemo(() => {
    if (!date) return [];
    return existingAppointments
      .filter((a) => a.lat != null && a.lng != null)
      .sort((a, b) => (a.appointment_time || "").localeCompare(b.appointment_time || ""));
  }, [existingAppointments, date]);

  // Orari liberi: stesse regole della pagina pubblica di prenotazione (disponibilità, margini,
  // preavviso, tetto giornaliero e impegni del titolare su Google/Outlook/Apple).
  const haCalendario = !!selectedCalendar;
  const bufferPrimaCal = selectedCalendar?.buffer_before_min ?? 0;
  const bufferDopoCal = selectedCalendar?.buffer_after_min ?? 0;
  const preavvisoCal = selectedCalendar?.min_notice_minutes ?? 0;
  const maxAlGiornoCal = selectedCalendar?.max_per_day ?? null;
  const esitoSlot = date && haCalendario
      ? calcolaSlotLiberi({
          giorno: date,
          regole: availability,
          appuntamenti: existingAppointments.map((a) => ({ inizio: a.appointment_time, fine: a.appointment_end_time })),
          occupatiEsterni,
          durataMin: durationMinutes,
          bufferPrimaMin: bufferPrimaCal,
          bufferDopoMin: bufferDopoCal,
          preavvisoMin: preavvisoCal,
          maxAlGiorno: maxAlGiornoCal,
        })
      : { slot: [], fasce: [], motivoVuoto: null as null };
  const freeSlots = esitoSlot.slot;

  const syncCreatedAppointment = useCallback(async (appointmentId: string) => {
    const tasks: Promise<unknown>[] = [];
    if (googleSync.isGoogleConnected) tasks.push(googleSync.pushEvent(appointmentId));
    if (appleSync.isAppleConnected) tasks.push(appleSync.pushEvent(appointmentId));
    if (tasks.length > 0) await Promise.allSettled(tasks);
  }, [appleSync, googleSync]);

  const syncCancelledAppointment = useCallback(async (appointmentId: string) => {
    const tasks: Promise<unknown>[] = [];
    if (googleSync.hasGoogleConnection) tasks.push(googleSync.deleteEvent(appointmentId));
    if (appleSync.hasAppleConnection) tasks.push(appleSync.deleteEvent(appointmentId));
    if (tasks.length > 0) await Promise.allSettled(tasks);
  }, [appleSync, googleSync]);

  // Book mutation with contact sync
  // 2026-05-27 (user request): preferisce manualStartTime/manualEndTime se
  // popolato (anche da clic su slot); usa tipo/stato/promemoria/assegnatario
  // dai campi estesi così l'appuntamento creato da Opportunità è equivalente
  // a uno creato dalla dialog operativa.
  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!calendarId || !date) throw new Error("Dati incompleti");
      const startTime = manualStartTime || selectedSlot;
      if (!startTime) throw new Error("Orario non impostato");
      const dur = Number(manualDuration) || durationMinutes;
      const endTime = manualEndTime
        || format(addMinutes(parse(startTime, "HH:mm", date), dur), "HH:mm");

      const { data: created, error } = await supabase.from("appointments").insert({
        company_id: companyId,
        calendar_id: calendarId,
        contact_id: contactId,
        // Con più opportunità sullo stesso contatto l'attribuzione si perdeva:
        // l'appuntamento creato DA QUI deve restare legato all'opportunità.
        opportunity_id: opportunityId || null,
        appointment_date: format(date, "yyyy-MM-dd"),
        appointment_time: `${startTime}:00`,
        appointment_end_time: `${endTime}:00`,
        title: titoloEffettivo || `Appuntamento con ${contactName}`,
        description: description || null,
        appointment_type: isPlatformCrm ? "videocall" : (appointmentType || "sopralluogo_preventivo"),
        ...(isPlatformCrm
          ? {
              meeting_provider: linkVideochiamata ? "manual" : "none",
              meeting_url: linkVideochiamata || null,
              meeting_status: linkVideochiamata ? "ready" : "none",
            }
          : {}),
        status: status || "confermato",
        // Con «Solo i propri» l'appuntamento resta a chi lo fissa.
        assigned_to: assignedTo || (onlyAssigned ? (user?.id ?? null) : null),
        reminder_minutes: reminderMinutes !== "none" ? parseInt(reminderMinutes, 10) : null,
        created_by: user!.id,
        address_line: isPlatformCrm ? null : addressData.address_line || null,
        address_city: isPlatformCrm ? null : addressData.address_city || null,
        address_postal_code: isPlatformCrm ? null : addressData.address_postal_code || null,
        address_province: isPlatformCrm ? null : addressData.address_province || null,
        address_country: isPlatformCrm ? null : addressData.address_country || "IT",
        address_notes: isPlatformCrm ? null : addressData.address_notes || null,
        formatted_address: isPlatformCrm ? null : addressData.formatted_address || null,
        lat: isPlatformCrm ? null : addressData.lat ?? null,
        lng: isPlatformCrm ? null : addressData.lng ?? null,
        place_id: isPlatformCrm ? null : addressData.place_id || null,
      }).select("id").single();
      if (error) throw error;
      if (created?.id) void syncCreatedAppointment(created.id);

      // Sync address to contact (non-blocking: log error + toast warning).
      // 2026-05-27 (audit error handling): prima solo console.error → l'utente
      // pensava che l'indirizzo fosse aggiornato sul contatto, in realtà no.
      // Ora toast.warning informa che l'appuntamento è OK ma indirizzo cliente
      // resta vecchio — l'utente sa che deve aggiornare manualmente.
      if (!isPlatformCrm && contactId && addressData.address_line) {
        const { error: syncError } = await supabase.from("marketing_contacts").update({
          address: addressData.address_line,
          city: addressData.address_city || null,
          postal_code: addressData.address_postal_code || null,
          province: addressData.address_province || null,
          country: addressData.address_country || "Italia",
        }).eq("id", contactId);
        if (syncError) {
          console.error("Sync indirizzo contatto fallito:", syncError.message);
          toast.warning("Appuntamento creato, ma indirizzo non sincronizzato sul contatto", {
            description: "Aggiorna manualmente l'indirizzo nel contatto. Dettagli: " + syncError.message,
          });
        }
      }
      return { giorno: date, ora: startTime, luogo: isPlatformCrm ? "" : addressData.formatted_address || addressData.address_line || "", tipo: tipoEtichetta, videochiamata: linkVideochiamata };
    },
    onSuccess: (esito) => {
      toast.success("Appuntamento prenotato");
      try { window.localStorage.setItem(chiaveCalendario, calendarId); } catch { /* memoria locale non disponibile */ }
      if (esito) {
        const testo = testoConferma({ nome: contactInfo?.first_name || contactName, data: esito.giorno, ora: esito.ora, luogo: esito.luogo, tipo: esito.tipo, videochiamata: esito.videochiamata });
        setConferma({ testo, link: linkWhatsApp(contactInfo?.phone, testo) });
      }
      queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
      queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
      aggiornaAgendaSchede(queryClient);
      setSelectedSlot("");
      setTitle("");
      setTitoloToccato(false);
      setDescription("");
      setDate(undefined);
      setAddressData(emptyAddress);
      setManualStartTime("");
      setManualEndTime("");
      setManualDuration("60");
      setAppointmentType(tipoPredefinito);
      setAssegnatarioToccato(false);
      setAssignedTo("");
      setStatus("confermato");
      setReminderMinutes(promemoriaPredefinito);
    },
    onError: (e: any) => toast.error(e.message || "Errore nella prenotazione"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await syncCancelledAppointment(id);
      const { error } = await supabase.from("appointments").update({ status: "annullato" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appuntamento annullato");
      queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
      queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
      aggiornaAgendaSchede(queryClient);
    },
  });

  return (
    <div className="space-y-5 max-sm:space-y-3">
      {/* Conferma al cliente, subito dopo la prenotazione */}
      {conferma && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Appuntamento prenotato — vuoi confermarlo al cliente?
          </div>
          <p className="whitespace-pre-wrap rounded-md bg-white/80 p-2 text-xs text-emerald-950">{conferma.testo}</p>
          <div className="flex flex-wrap gap-2">
            {conferma.link && (
              <Button asChild size="sm" className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                <a href={conferma.link} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3.5 w-3.5" /> Invia su WhatsApp</a>
              </Button>
            )}
            <Button
              size="sm" variant="outline" className="h-8 gap-1.5"
              onClick={() => { void navigator.clipboard?.writeText(conferma.testo).then(() => toast.success("Testo copiato")).catch(() => toast.error("Copia non riuscita")); }}
            >
              <Copy className="h-3.5 w-3.5" /> Copia testo
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setConferma(null)}>Chiudi</Button>
          </div>
        </div>
      )}

      {/* Appuntamenti di questo cliente: in programma, poi lo storico */}
      {(appuntamentiInProgramma.length > 0 || appuntamentiPassati.length > 0) && (
        <div className="space-y-2">
          {appuntamentiInProgramma.length > 0 && (
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              {appuntamentiInProgramma.length === 1 ? "Appuntamento già fissato" : `Appuntamenti in programma (${appuntamentiInProgramma.length})`}
            </h4>
          )}
          {appuntamentiInProgramma.map((appt) => (
            <div
              key={appt.id}
              className="rounded-lg border border-primary/20 bg-primary/5 p-3 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => handleOpenAppointmentDialog(appt)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm space-y-0.5 min-w-0">
                  <p className="font-semibold truncate">{appt.title}</p>
                  <p className="text-muted-foreground">
                    {format(new Date(`${appt.appointment_date}T00:00:00`), "EEEE d MMMM yyyy", { locale: it })}
                    {appt.appointment_time && ` alle ${appt.appointment_time.substring(0, 5)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">Calendario: {(appt as any).marketing_calendars?.name || "—"}</p>
                  <Badge variant="outline" className="mt-1">{appt.status}</Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-muted-foreground hidden sm:inline">Clicca per modificare</span>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(appt.id); }} disabled={deleteMutation.isPending || solaLettura} title={solaLettura ? "Sei in sola lettura" : "Annulla appuntamento"}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {appuntamentiPassati.length > 0 && (
            <div>
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setMostraStorico((v) => !v)}>
                {mostraStorico ? "Nascondi" : "Mostra"} lo storico ({appuntamentiPassati.length})
              </button>
              {mostraStorico && (
                <ul className="mt-1.5 divide-y rounded-md border text-xs">
                  {appuntamentiPassati.map((appt) => (
                    <li key={appt.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/50" onClick={() => handleOpenAppointmentDialog(appt)}>
                      <span className="tabular-nums text-muted-foreground">{format(new Date(`${appt.appointment_date}T00:00:00`), "dd/MM/yyyy")}{appt.appointment_time ? ` ${appt.appointment_time.substring(0, 5)}` : ""}</span>
                      <span className="truncate flex-1">{appt.title}</span>
                      <Badge variant="outline" className="text-[10px]">{appt.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mobile no: una riga vuota in cima alla scheda. */}
      <Separator className="max-sm:hidden" />

      {/* Calendar select */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Calendario <span className="text-destructive">*</span></Label>
        <Select value={calendarId} onValueChange={(v) => { setCalendarId(v); setSelectedSlot(""); }}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Seleziona un calendario..." /></SelectTrigger>
          <SelectContent>
            {calendars.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name} ({c.duration_minutes} min)</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <Label className="text-sm">Titolo dell'appuntamento</Label>
        <Input value={titoloEffettivo} onChange={(e) => { setTitoloToccato(true); setTitle(e.target.value); }} placeholder={`Appuntamento con ${contactName}`} className="h-9" />
      </div>

      {isPlatformCrm ? (
        /* CRM di piattaforma: la demo è in videochiamata, niente indirizzo, mappa né chilometri. */
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
          <Label className="text-sm font-medium flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Videochiamata</Label>
          {linkVideochiamata ? (
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm">
              <a href={linkVideochiamata.startsWith("http") ? linkVideochiamata : `https://${linkVideochiamata}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-primary underline-offset-2 hover:underline">{linkVideochiamata}</a>
              <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={() => { void navigator.clipboard?.writeText(linkVideochiamata); toast.success("Link copiato"); }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{selectedCalendar ? `Il calendario «${selectedCalendar.name}» non ha un link di videochiamata. Aggiungilo in Impostazioni → Appuntamenti e prenotazioni.` : "Scegli un calendario: il link della videochiamata arriva da lì."}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">Il link viene salvato nell'appuntamento e scritto nel messaggio di conferma al cliente.</p>
        </div>
      ) : (
        <>
      {/* Mobile: senza riquadro intorno, i campi stanno in fila con gli altri. */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3 max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
        <AddressAutocomplete value={addressData} onChange={setAddressData} />
        {(addressData.formatted_address || addressData.address_line) && (addressData.lat == null || addressData.lng == null) && (
          <p className="text-xs text-muted-foreground">
            Indirizzo senza posizione sulla mappa: tocca la X e cercalo di nuovo scegliendolo dai suggerimenti, così si calcolano i km.
          </p>
        )}
        {addressData.lat != null && addressData.lng != null && (
          <>
            <AddressMapPreview lat={addressData.lat} lng={addressData.lng} formattedAddress={addressData.formatted_address} />
            {baseDistance && (
              <div className="flex items-center gap-2 text-sm bg-background rounded-md border px-3 py-1.5">
                <Car className="h-3.5 w-3.5 text-primary" />
                {baseDistance.duration_text && <span className="font-medium">{baseDistance.duration_text}</span>}
                <span className={baseDistance.duration_text ? "text-muted-foreground" : "font-medium"}>
                  {baseDistance.duration_text ? "- " : "≈ "}{baseDistance.distance_text}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {baseDistance.stima ? "in linea d'aria dalla base" : "dalla base calendario"}
                </span>
              </div>
            )}
            {selectedCalendar && !selectedCalendar.base_lat && (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Il calendario «{selectedCalendar.name}» non ha un indirizzo base, quindi non si possono calcolare i km.
                  Impostalo in Impostazioni → Appuntamenti e prenotazioni.
                </span>
              </p>
            )}
          </>
        )}
      </div>

      {/* Calendar Suggestions */}
      {addressData.lat != null && addressData.lng != null && date && (
        <CalendarSuggestions
          suggestions={calendarSuggestions}
          isLoading={suggestionsLoading}
          onSelect={handleSuggestionSelect}
          selectedCalendarId={calendarId}
        />
      )}

      {/* Same-day appointments with distances */}
      {sameDayWithCoords.length > 0 && addressData.lat != null && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-sm">Altri appuntamenti del giorno</p>
          {sameDayWithCoords.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              <span>
                {a.appointment_time?.substring(0, 5)} — {a.title || a.formatted_address || "Appuntamento"}
                {addressData.lat != null && addressData.lng != null && a.lat != null && a.lng != null && (
                  <span className="ml-1 text-muted-foreground">
                    · ≈ {testoKm(distanzaLineaAria(addressData.lat, addressData.lng, a.lat, a.lng) * 1000)} da qui
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

        </>
      )}

      {/* Date picker */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Data <span className="text-destructive">*</span></Label>
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9", !date && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, "d MMMM yyyy", { locale: it }) : "Seleziona una data"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date} onSelect={(d) => { setDate(d); setSelectedSlot(""); setDatePickerOpen(false); }} disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))} autoFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>

      {/* Scorciatoie di data */}
      <div className="flex flex-wrap gap-1.5 -mt-3">
        {scorciatoieData().map((sc) => (
          <Button
            key={sc.chiave} type="button" size="sm"
            variant={date && format(date, "yyyy-MM-dd") === format(sc.data, "yyyy-MM-dd") ? "default" : "outline"}
            className="h-7 px-2.5 text-xs"
            onClick={() => { setDate(sc.data); setSelectedSlot(""); }}
          >
            {sc.etichetta}
          </Button>
        ))}
      </div>

      {/* Available slots */}
      {calendarId && date && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Slot disponibili</Label>
          {esitoSlot.fasce.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Orari del calendario «{selectedCalendar?.name}»: {esitoSlot.fasce.map((f) => `${f.da}–${f.a}`).join(", ")}
              {occupatiEsterni.length > 0 ? ` · tolti ${occupatiEsterni.length} impegni del titolare sul suo calendario` : ""}
              {(selectedCalendar?.min_notice_minutes ?? 0) > 0 ? ` · preavviso minimo ${selectedCalendar!.min_notice_minutes} min` : ""}
            </p>
          )}
          {esitoSlot.motivoVuoto === "chiuso" ? (
            <p className="text-sm text-muted-foreground py-2">Il calendario non lavora in questo giorno (nessuna disponibilità, o giornata chiusa).</p>
          ) : esitoSlot.motivoVuoto === "tetto" ? (
            <p className="text-sm text-muted-foreground py-2">Raggiunto il numero massimo di appuntamenti per questo giorno ({selectedCalendar?.max_per_day}). Puoi comunque scegliere un orario a mano qui sotto.</p>
          ) : esitoSlot.motivoVuoto === "pieno" ? (
            <p className="text-sm text-muted-foreground py-2">Nessun orario libero per questa data: sono tutti occupati o troppo vicini. Puoi scegliere un orario a mano qui sotto.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {freeSlots.map((slot) => (
                <Button
                  key={slot}
                  variant={selectedSlot === slot ? "default" : "outline"}
                  size="sm"
                  className="h-8 min-w-[64px]"
                  onClick={() => {
                    setSelectedSlot(slot);
                    // 2026-05-27: clic su slot popola anche i campi manuali
                    // (Ora inizio / Ora fine / Durata) per coerenza con
                    // l'editor avanzato sottostante.
                    setManualStartTime(slot);
                    setManualEndTime(addMinutesToTimeStr(slot, durationMinutes));
                    setManualDuration(String(durationMinutes));
                  }}
                >
                  {slot}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2026-05-27 (user request): Orario manuale + Tipo + Assegnatario +
          Stato + Promemoria — stessi campi della dialog appuntamento commessa.
          Lo slot-picker sopra popola automaticamente, ma l'utente può
          override (es. orari 14:23). */}
      <div className="space-y-3 rounded-lg border bg-muted/20 p-3 max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
        <div>
          <Label className="text-sm font-medium">Orario appuntamento</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-sm:hidden">
            Imposta inizio e fine; la durata resta sincronizzata.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Ora inizio</Label>
            <Input
              type="time"
              step={900}
              value={manualStartTime}
              onChange={(e) => {
                const v = e.target.value;
                setManualStartTime(v);
                // Sync end-time = start + durata
                const dur = Number(manualDuration) || 60;
                if (v) setManualEndTime(addMinutesToTimeStr(v, dur));
                // Deselezione slot se l'orario è diverso
                if (v !== selectedSlot) setSelectedSlot("");
              }}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ora fine</Label>
            <Input
              type="time"
              step={900}
              value={manualEndTime}
              onChange={(e) => {
                const v = e.target.value;
                setManualEndTime(v);
                // Sync durata
                const newDur = diffMinutesTimeStr(manualStartTime, v);
                if (newDur != null) setManualDuration(String(newDur));
                setSelectedSlot("");
              }}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Durata</Label>
            <Select
              value={manualDuration}
              onValueChange={(v) => {
                setManualDuration(v);
                if (manualStartTime) setManualEndTime(addMinutesToTimeStr(manualStartTime, Number(v) || 60));
              }}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={appointmentType} onValueChange={setAppointmentType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {appointmentTypes.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Assegna a</Label>
            <Select value={assignedTo || "none"} onValueChange={(v) => { setAssegnatarioToccato(true); setAssignedTo(v === "none" ? "" : v); }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Nessun assegnatario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessun assegnatario</SelectItem>
                {teamUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mobile no: stato e promemoria restano quelli predefiniti. */}
        <div className="grid grid-cols-2 gap-2 max-sm:hidden">
          <div className="space-y-1">
            <Label className="text-xs">Stato</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Promemoria</Label>
            <Select value={reminderMinutes} onValueChange={setReminderMinutes}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REMINDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Impegni del titolare su Google/Outlook/Apple in quella fascia */}
      {date && orarioInizio && orarioFine && impegniEsterniInFascia(date, orarioInizio, orarioFine, occupatiEsterni).length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Su questo orario il titolare del calendario ha già un impegno sul suo calendario (Google, Outlook o Apple). Puoi prenotare lo stesso, ma controlla.</p>
        </div>
      )}

      {/* Conflitti di orario */}
      {conflitti.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-semibold">Hai già {conflitti.length === 1 ? "un impegno" : `${conflitti.length} impegni`} in questa fascia</p>
            <ul className="mt-0.5 list-disc pl-4">
              {conflitti.map((c) => (
                <li key={c.id}>{(c.inizio ?? "").substring(0, 5)}{c.fine ? `–${c.fine.substring(0, 5)}` : ""} · {c.titolo || "Appuntamento"}</li>
              ))}
            </ul>
            <p className="mt-0.5">Puoi prenotare lo stesso, ma controlla che non si sovrappongano.</p>
          </div>
        </div>
      )}

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-sm">Descrizione</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Note aggiuntive..." rows={3} />
      </div>

      {/* Book button */}
      <Button
        className="w-full"
        disabled={solaLettura || !calendarId || !date || (!selectedSlot && !manualStartTime) || bookMutation.isPending}
        title={solaLettura ? "Sei in sola lettura" : undefined}
        onClick={() => bookMutation.mutate()}
      >
        {bookMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Prenota appuntamento
      </Button>
      <MarketingAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editingAppointment}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
          queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
          aggiornaAgendaSchede(queryClient);
        }}
        calendars={calendars.map((c) => ({ ...c, default_meeting_provider: c.default_meeting_provider === "google_meet" ? ("google_meet" as const) : ("none" as const) }))}
        users={teamUsers}
        contestoScheda="opportunita"
      />
    </div>
  );
}

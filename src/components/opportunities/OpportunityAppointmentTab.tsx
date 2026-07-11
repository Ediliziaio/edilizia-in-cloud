import { useState, useMemo, useCallback } from "react";
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
import { CalendarIcon, Loader2, Trash2, Clock, Car, Pencil } from "lucide-react";
import { format, getDay, addMinutes, parse, isAfter } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import AddressAutocomplete, { type AddressData, emptyAddress } from "@/components/shared/AddressAutocomplete";
import AddressMapPreview from "@/components/shared/AddressMapPreview";
import MarketingAppointmentDialog, { type MarketingAppointmentData } from "@/components/marketing/MarketingAppointmentDialog";
import CalendarSuggestions, { type CalendarSuggestion } from "@/components/marketing/CalendarSuggestions";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { useAppleCalendarSync } from "@/hooks/useAppleCalendarSync";

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const googleSync = useGoogleCalendarSync();
  const appleSync = useAppleCalendarSync();

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
  const [appointmentType, setAppointmentType] = useState<string>("sopralluogo_preventivo");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [status, setStatus] = useState<string>("confermato");
  const [reminderMinutes, setReminderMinutes] = useState<string>("none");

  // Fetch calendars with base address
  const { data: calendars = [] } = useQuery({
    queryKey: ["marketing_calendars_active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("id, name, duration_minutes, calendar_type, base_lat, base_lng, base_formatted_address, default_meeting_provider, default_meeting_enabled")
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

  // Availability
  const dayOfWeek = date ? getDay(date) : null;
  const dateStr = date ? format(date, "yyyy-MM-dd") : null;

  const { data: availability = [] } = useQuery({
    queryKey: ["calendar_availability", calendarId, dayOfWeek, dateStr],
    queryFn: async () => {
      const { data: specificData } = await supabase
        .from("marketing_calendar_availability")
        .select("*")
        .eq("calendar_id", calendarId)
        .eq("specific_date", dateStr!)
        .eq("is_enabled", true);
      if (specificData && specificData.length > 0) return specificData;
      const { data, error } = await supabase
        .from("marketing_calendar_availability")
        .select("*")
        .eq("calendar_id", calendarId)
        .eq("day_of_week", dayOfWeek!)
        .eq("is_enabled", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!calendarId && date !== undefined && dayOfWeek !== null,
  });

  const { data: existingAppointments = [] } = useQuery({
    queryKey: ["appointments_for_slot", calendarId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, appointment_time, appointment_end_time, lat, lng, formatted_address, title")
        .eq("calendar_id", calendarId)
        .eq("appointment_date", dateStr!)
        .neq("status", "annullato");
      if (error) throw error;
      return data || [];
    },
    enabled: !!calendarId && !!dateStr,
  });

  const { data: existingContactAppointment } = useQuery({
    queryKey: ["contact_future_appointment", contactId, companyId],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("appointments")
        .select("*, marketing_calendars:calendar_id(name)")
        .eq("contact_id", contactId)
        .eq("company_id", companyId)
        .gte("appointment_date", today)
        .neq("status", "annullato")
        .order("appointment_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!contactId && !!companyId,
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

  const handleOpenAppointmentDialog = () => {
    if (!existingContactAppointment) return;
    const appt = existingContactAppointment;
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
        if (error || !data?.legs?.[0]) return null;
        return { duration_text: data.legs[0].duration_text, distance_text: data.legs[0].distance_text };
      } catch {
        return null;
      }
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

  // Free slots
  const freeSlots = useMemo(() => {
    if (!availability.length || !date) return [];
    const slots: string[] = [];
    for (const avail of availability) {
      const startTime = parse(avail.start_time, "HH:mm:ss", date);
      const endTime = parse(avail.end_time, "HH:mm:ss", date);
      let cursor = startTime;
      while (true) {
        const slotEnd = addMinutes(cursor, durationMinutes);
        if (isAfter(slotEnd, endTime)) break;
        const cursorStr = format(cursor, "HH:mm");
        const slotEndStr = format(slotEnd, "HH:mm");
        const isOccupied = existingAppointments.some((appt) => {
          if (!appt.appointment_time) return false;
          const apptStart = appt.appointment_time.substring(0, 5);
          const apptEnd = appt.appointment_end_time ? appt.appointment_end_time.substring(0, 5) : format(addMinutes(parse(apptStart, "HH:mm", date), durationMinutes), "HH:mm");
          return cursorStr < apptEnd && slotEndStr > apptStart;
        });
        if (!isOccupied) slots.push(cursorStr);
        cursor = addMinutes(cursor, durationMinutes);
      }
    }
    return slots;
  }, [availability, existingAppointments, date, durationMinutes]);

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
        title: title || `Appuntamento con ${contactName}`,
        description: description || null,
        appointment_type: appointmentType || "sopralluogo_preventivo",
        status: status || "confermato",
        assigned_to: assignedTo || null,
        reminder_minutes: reminderMinutes !== "none" ? parseInt(reminderMinutes, 10) : null,
        created_by: user!.id,
        address_line: addressData.address_line || null,
        address_city: addressData.address_city || null,
        address_postal_code: addressData.address_postal_code || null,
        address_province: addressData.address_province || null,
        address_country: addressData.address_country || "IT",
        address_notes: addressData.address_notes || null,
        formatted_address: addressData.formatted_address || null,
        lat: addressData.lat ?? null,
        lng: addressData.lng ?? null,
        place_id: addressData.place_id || null,
      }).select("id").single();
      if (error) throw error;
      if (created?.id) void syncCreatedAppointment(created.id);

      // Sync address to contact (non-blocking: log error + toast warning).
      // 2026-05-27 (audit error handling): prima solo console.error → l'utente
      // pensava che l'indirizzo fosse aggiornato sul contatto, in realtà no.
      // Ora toast.warning informa che l'appuntamento è OK ma indirizzo cliente
      // resta vecchio — l'utente sa che deve aggiornare manualmente.
      if (contactId && addressData.address_line) {
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
    },
    onSuccess: () => {
      toast.success("Appuntamento prenotato");
      queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
      queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
      setSelectedSlot("");
      setTitle("");
      setDescription("");
      setDate(undefined);
      setAddressData(emptyAddress);
      setManualStartTime("");
      setManualEndTime("");
      setManualDuration("60");
      setAppointmentType("sopralluogo_preventivo");
      setAssignedTo("");
      setStatus("confermato");
      setReminderMinutes("none");
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
    },
  });

  return (
    <div className="space-y-5">
      {existingContactAppointment && (
        <div
          className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2 cursor-pointer hover:border-primary/40 transition-colors"
          onClick={handleOpenAppointmentDialog}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Appuntamento già fissato
            </h4>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground hidden sm:inline">Clicca per modificare</span>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(existingContactAppointment.id); }} disabled={deleteMutation.isPending}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="text-sm text-muted-foreground space-y-0.5">
            <p><strong>{existingContactAppointment.title}</strong></p>
            <p>{format(new Date(existingContactAppointment.appointment_date), "d MMMM yyyy", { locale: it })}{existingContactAppointment.appointment_time && ` alle ${existingContactAppointment.appointment_time.substring(0, 5)}`}</p>
            <p>Calendario: {(existingContactAppointment as any).marketing_calendars?.name || "—"}</p>
            <Badge variant="outline" className="mt-1">{existingContactAppointment.status}</Badge>
          </div>
        </div>
      )}

      <Separator />

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
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Appuntamento con ${contactName}`} className="h-9" />
      </div>

      {/* Address */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <AddressAutocomplete value={addressData} onChange={setAddressData} />
        {addressData.lat != null && addressData.lng != null && (
          <>
            <AddressMapPreview lat={addressData.lat} lng={addressData.lng} formattedAddress={addressData.formatted_address} />
            {baseDistance && (
              <div className="flex items-center gap-2 text-sm bg-background rounded-md border px-3 py-1.5">
                <Car className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">{baseDistance.duration_text}</span>
                <span className="text-muted-foreground">- {baseDistance.distance_text}</span>
                <span className="text-xs text-muted-foreground ml-auto">dalla base calendario</span>
              </div>
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
              <span>{a.appointment_time?.substring(0, 5)} — {a.title || a.formatted_address || "Appuntamento"}</span>
            </div>
          ))}
        </div>
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

      {/* Available slots */}
      {calendarId && date && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Slot disponibili</Label>
          {availability.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nessuna disponibilità configurata per questo giorno.</p>
          ) : freeSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nessuno slot disponibile per questa data.</p>
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
      <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
        <div>
          <Label className="text-sm font-medium">Orario appuntamento</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
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
                {OPP_APPOINTMENT_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Assegna a</Label>
            <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
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

        <div className="grid grid-cols-2 gap-2">
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

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-sm">Descrizione</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Note aggiuntive..." rows={3} />
      </div>

      {/* Book button */}
      <Button
        className="w-full"
        disabled={!calendarId || !date || (!selectedSlot && !manualStartTime) || bookMutation.isPending}
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
        }}
        calendars={calendars}
        users={teamUsers}
      />
    </div>
  );
}

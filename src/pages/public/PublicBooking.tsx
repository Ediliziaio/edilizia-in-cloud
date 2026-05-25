import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { format, addDays, isBefore, startOfDay, parse, isAfter } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, ExternalLink, Loader2, Mail, Phone, ShieldCheck, User, Video } from "lucide-react";
import { toast } from "sonner";

const PUBLIC_BOOKING_TIMEOUT_MS = 8_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function withPublicBookingTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label}: caricamento troppo lento. Riprova tra qualche secondo.`));
    }, PUBLIC_BOOKING_TIMEOUT_MS);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const initialName = searchParams.get("name") || "";
  const initialNameParts = initialName.trim().split(" ").filter(Boolean);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [form, setForm] = useState({
    first_name: searchParams.get("first_name") || initialNameParts.slice(0, -1).join(" ") || initialNameParts[0] || "",
    last_name: searchParams.get("last_name") || (initialNameParts.length > 1 ? initialNameParts.at(-1) || "" : ""),
    email: searchParams.get("email") || "",
    phone: searchParams.get("phone") || "",
    notes: "",
  });
  const emailValue = form.email.trim();
  const phoneValue = form.phone.trim();
  const hasContactMethod = !!emailValue || !!phoneValue;
  const emailIsValid = !emailValue || EMAIL_PATTERN.test(emailValue);

  // Fetch calendar by slug
  const { data: calendar, isLoading: calLoading, isError: calError, error: calLoadError, refetch: refetchCalendar, isFetching: calFetching } = useQuery({
    queryKey: queryKeys.publicBooking.calendar(slug),
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await withPublicBookingTimeout(
        supabase
          .from("marketing_calendars")
          .select("id, name, description, company_id, duration_minutes, booking_slug, owner_id, default_meeting_provider, default_meeting_enabled")
          .eq("booking_slug", slug)
          .eq("is_active", true)
          .maybeSingle(),
        "Calendario",
      );
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
    retry: false,
  });

  // Fetch availability rules
  const { data: availability = [], isLoading: availabilityLoading, isError: availabilityError, error: availabilityLoadError } = useQuery({
    queryKey: queryKeys.publicBooking.availability(calendar?.id),
    queryFn: async () => {
      if (!calendar?.id) return [];
      const { data, error } = await supabase
        .from("marketing_calendar_availability")
        .select("*")
        .eq("calendar_id", calendar.id)
        .eq("is_enabled", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!calendar?.id,
  });

  // Fetch Google Calendar busy slots for the calendar owner (if they have block_busy_slots enabled)
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedDayRange = useMemo(() => {
    if (!selectedDate) return null;
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }, [selectedDate]);
  const { data: googleBusySlots = [], isFetching: googleBusyFetching } = useQuery({
    queryKey: ["public-gcal-busy", calendar?.id, dateStr, selectedDayRange?.startIso, selectedDayRange?.endIso],
    queryFn: async () => {
      if (!calendar?.id || !selectedDayRange) return [];
      // Get the calendar owner
      const { data: cal } = await supabase
        .from("marketing_calendars")
        .select("owner_id, company_id")
        .eq("id", calendar.id)
        .single();
      if (!cal?.owner_id) return [];
      // Check if the owner has block_busy_slots enabled
      const { data: prefs } = await supabase
        .from("user_calendar_preferences")
        .select("block_busy_slots")
        .eq("user_id", cal.owner_id)
        .maybeSingle();
      if (!prefs?.block_busy_slots) return [];
      const { data, error } = await supabase
        .from("google_calendar_busy_slots")
        .select("start_at, end_at")
        .eq("company_id", calendar.company_id)
        .eq("user_id", cal.owner_id)
        .lt("start_at", selectedDayRange.endIso)
        .gt("end_at", selectedDayRange.startIso);
      if (error) throw error;
      return data || [];
    },
    enabled: !!calendar?.id && !!selectedDayRange,
  });

  // Fetch Apple Calendar busy slots for the calendar owner
  const { data: appleBusySlots = [], isFetching: appleBusyFetching } = useQuery({
    queryKey: ["public-apple-busy", calendar?.id, dateStr, selectedDayRange?.startIso, selectedDayRange?.endIso],
    queryFn: async () => {
      if (!calendar?.id || !selectedDayRange) return [];
      const { data: cal } = await supabase
        .from("marketing_calendars")
        .select("owner_id")
        .eq("id", calendar.id)
        .single();
      if (!cal?.owner_id) return [];
      const { data: prefs } = await supabase
        .from("user_calendar_preferences")
        .select("block_busy_slots")
        .eq("user_id", cal.owner_id)
        .maybeSingle();
      if (!prefs?.block_busy_slots) return [];
      const { data, error } = await supabase
        .from("apple_calendar_busy_slots")
        .select("start_at, end_at")
        .eq("company_id", calendar.company_id)
        .eq("user_id", cal.owner_id)
        .lt("start_at", selectedDayRange.endIso)
        .gt("end_at", selectedDayRange.startIso);
      if (error) throw error;
      return data || [];
    },
    enabled: !!calendar?.id && !!selectedDayRange,
  });

  // Fetch existing appointments for the selected date
  const { data: existingAppointments = [], isFetching: existingAppointmentsFetching } = useQuery({
    queryKey: queryKeys.publicBooking.appointments(calendar?.id, dateStr),
    queryFn: async () => {
      if (!calendar?.id || !dateStr) return [];
      const { data, error } = await supabase
        .from("public_appointment_slots")
        .select("appointment_time, appointment_end_time")
        .eq("company_id", calendar.company_id)
        .eq("calendar_id", calendar.id)
        .eq("appointment_date", dateStr)
        .or("is_blocked_slot.is.null,is_blocked_slot.eq.false");
      if (error) throw error;
      return data || [];
    },
    enabled: !!calendar?.id && !!dateStr,
  });

  // Check if a time slot overlaps with any busy slot (Google or Apple)
  const isSlotBusy = useCallback((slotTime: string, durationMinutes: number): boolean => {
    const allBusySlots = [...googleBusySlots, ...appleBusySlots];
    if (!selectedDate || allBusySlots.length === 0) return false;
    const slotStart = parse(slotTime, "HH:mm", selectedDate);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
    return allBusySlots.some((busy) => {
      const bStart = new Date(busy.start_at);
      const bEnd = new Date(busy.end_at);
      return slotStart < bEnd && slotEnd > bStart;
    });
  }, [appleBusySlots, googleBusySlots, selectedDate]);

  const parseAvailabilityTime = useCallback(
    (value: string) => parse(value.length === 5 ? value : value.slice(0, 5), "HH:mm", selectedDate || new Date()),
    [selectedDate],
  );

  const slotOverlapsExistingAppointments = useCallback((slotTime: string, durationMinutes: number, rows = existingAppointments) => {
    if (!selectedDate) return false;
    const slotEndTime = format(new Date(parse(slotTime, "HH:mm", selectedDate).getTime() + durationMinutes * 60000), "HH:mm");
    return rows.some((apt) => {
      if (!apt.appointment_time) return false;
      const aptStart = apt.appointment_time.slice(0, 5);
      const aptEnd = apt.appointment_end_time?.slice(0, 5) || format(
        new Date(parse(aptStart, "HH:mm", selectedDate).getTime() + durationMinutes * 60000), "HH:mm"
      );
      return slotTime < aptEnd && slotEndTime > aptStart;
    });
  }, [existingAppointments, selectedDate]);

  // Calculate available slots for selected date
  const slots = useMemo(() => {
    if (!selectedDate || !calendar) return [];
    const dayOfWeek = selectedDate.getDay(); // 0=Sun
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const duration = calendar.duration_minutes || 30;

    // Find matching availability rules (day_of_week or specific_date)
    const rules = availability.filter(
      (a) => (a.specific_date === dateStr) || (a.specific_date === null && a.day_of_week === dayOfWeek)
    );
    // Specific date overrides day_of_week
    const effectiveRules = rules.filter(r => r.specific_date === dateStr).length > 0
      ? rules.filter(r => r.specific_date === dateStr)
      : rules.filter(r => r.specific_date === null);

    if (effectiveRules.length === 0) return [];

    const allSlots: string[] = [];
    for (const rule of effectiveRules) {
      const start = parseAvailabilityTime(rule.start_time);
      const end = parseAvailabilityTime(rule.end_time);
      let current = start;
      while (current.getTime() + duration * 60000 <= end.getTime()) {
        const slotTime = format(current, "HH:mm");
        const isOccupied = slotOverlapsExistingAppointments(slotTime, duration);
        if (!isOccupied && !isSlotBusy(slotTime, duration)) {
          allSlots.push(slotTime);
        }
        current = new Date(current.getTime() + duration * 60000);
      }
    }
    return [...new Set(allSlots)].sort();
  }, [selectedDate, calendar, availability, parseAvailabilityTime, slotOverlapsExistingAppointments, isSlotBusy]);

  // Disable dates with no availability
  const isDateDisabled = (date: Date) => {
    if (availabilityLoading) return true;
    if (isBefore(date, startOfDay(new Date()))) return true;
    if (isAfter(date, addDays(new Date(), 60))) return true;
    const dayOfWeek = date.getDay();
    const dateStr = format(date, "yyyy-MM-dd");
    const hasRule = availability.some(
      (a) => (a.specific_date === dateStr) || (a.specific_date === null && a.day_of_week === dayOfWeek)
    );
    return !hasRule;
  };

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!calendar || !selectedDate || !selectedSlot) throw new Error("Dati mancanti");
      if (!form.first_name.trim()) throw new Error("Inserisci il nome.");
      if (!hasContactMethod) throw new Error("Inserisci almeno email o telefono.");
      if (!emailIsValid) throw new Error("Inserisci un indirizzo email valido.");
      const duration = calendar.duration_minutes || 30;
      const usesGoogleMeet = calendar.default_meeting_provider === "google_meet";
      const endTime = format(
        new Date(parse(selectedSlot, "HH:mm", selectedDate).getTime() + duration * 60000),
        "HH:mm"
      );
      const { data: freshAppointments, error: freshAppointmentsError } = await supabase
        .from("public_appointment_slots")
        .select("appointment_time, appointment_end_time")
        .eq("company_id", calendar.company_id)
        .eq("calendar_id", calendar.id)
        .eq("appointment_date", format(selectedDate, "yyyy-MM-dd"))
        .or("is_blocked_slot.is.null,is_blocked_slot.eq.false");
      if (freshAppointmentsError) throw freshAppointmentsError;
      if (slotOverlapsExistingAppointments(selectedSlot, duration, freshAppointments || [])) {
        throw new Error("Questo orario e' appena stato occupato. Scegli un altro slot.");
      }
      if (isSlotBusy(selectedSlot, duration)) {
        throw new Error("Questo orario risulta occupato nel calendario collegato.");
      }
      const { error } = await supabase.from("appointments").insert({
        calendar_id: calendar.id,
        company_id: calendar.company_id,
        appointment_date: format(selectedDate, "yyyy-MM-dd"),
        appointment_time: selectedSlot + ":00",
        appointment_end_time: endTime + ":00",
        title: `${form.first_name} ${form.last_name}`.trim() || "Prenotazione",
        description: [
          form.email && `Email: ${form.email}`,
          form.phone && `Tel: ${form.phone}`,
          form.notes && `Note: ${form.notes}`,
        ].filter(Boolean).join("\n"),
        appointment_type: usesGoogleMeet ? "videocall" : "appuntamento",
        status: "confermato",
        assigned_to: calendar.owner_id || null,
        created_by: "00000000-0000-0000-0000-000000000000",
        meeting_provider: usesGoogleMeet ? "google_meet" : "none",
        meeting_status: usesGoogleMeet ? "pending" : "none",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBooked(true);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore durante la prenotazione");
    },
  });

  if (calLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Carico il calendario...</p>
        </div>
      </div>
    );
  }

  if (calError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-3">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">Calendario momentaneamente non disponibile</h1>
          <p className="text-sm text-muted-foreground">
            {calLoadError instanceof Error ? calLoadError.message : "Non riesco a caricare il link di prenotazione."}
          </p>
          <Button onClick={() => refetchCalendar()} disabled={calFetching}>
            {calFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  if (!calendar) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">Calendario non trovato</h1>
          <p className="text-muted-foreground">Il link di prenotazione non è valido o il calendario non è attivo.</p>
        </div>
      </div>
    );
  }

  const selectedStart = selectedDate && selectedSlot ? parse(selectedSlot, "HH:mm", selectedDate) : null;
  const selectedEnd = selectedStart
    ? new Date(selectedStart.getTime() + (calendar.duration_minutes || 30) * 60000)
    : null;
  const calendarDateRange = selectedStart && selectedEnd
    ? `${format(selectedStart, "yyyyMMdd'T'HHmmss")}/${format(selectedEnd, "yyyyMMdd'T'HHmmss")}`
    : "";
  const addToGoogleUrl = selectedStart && selectedEnd
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calendar.name)}&dates=${calendarDateRange}&ctz=Europe/Rome&details=${encodeURIComponent(form.notes || calendar.description || "")}`
    : "";
  const addToOutlookUrl = selectedStart && selectedEnd
    ? `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(calendar.name)}&startdt=${encodeURIComponent(selectedStart.toISOString())}&enddt=${encodeURIComponent(selectedEnd.toISOString())}&body=${encodeURIComponent(form.notes || calendar.description || "")}`
    : "";
  const usesGoogleMeet = calendar.default_meeting_provider === "google_meet";

  if (booked) {
    return (
      <div className="min-h-screen bg-muted/30 px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">
          <div className="w-full rounded-xl border bg-background p-8 text-center shadow-sm">
            <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-500" />
            <h1 className="mt-4 text-2xl font-bold">Prenotazione confermata</h1>
            <p className="mt-2 text-muted-foreground">
            Il tuo appuntamento è stato fissato per il{" "}
            <strong>{selectedDate && format(selectedDate, "d MMMM yyyy", { locale: it })}</strong> alle{" "}
            <strong>{selectedSlot}</strong>.
          </p>
            <p className="mt-4 text-sm text-muted-foreground">Riceverai conferma dall'azienda se sono necessarie altre informazioni.</p>
            {usesGoogleMeet && (
              <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                <Video className="mr-2 inline h-4 w-4" />
                Videocall Google Meet: il link verrà creato dall'azienda e aggiunto all'evento calendario.
              </div>
            )}
            {(addToGoogleUrl || addToOutlookUrl) && (
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {addToGoogleUrl && (
                  <Button variant="outline" asChild>
                    <a href={addToGoogleUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Google Calendar
                    </a>
                  </Button>
                )}
                {addToOutlookUrl && (
                  <Button variant="outline" asChild>
                    <a href={addToOutlookUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Outlook
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const slotsLoading = !!selectedDate && (existingAppointmentsFetching || googleBusyFetching || appleBusyFetching);
  const canSubmit = selectedDate && selectedSlot && form.first_name.trim() && hasContactMethod && emailIsValid && !slotsLoading;
  const selectedSummary = selectedDate && selectedSlot
    ? `${format(selectedDate, "EEEE d MMMM yyyy", { locale: it })} alle ${selectedSlot}`
    : null;

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="grid min-h-[680px] lg:grid-cols-[340px_1fr]">
          <aside className="border-b bg-muted/20 p-6 lg:border-b-0 lg:border-r">
            <div className="space-y-6">
              <div>
                <CalendarDays className="h-10 w-10 text-primary" />
                <h1 className="mt-4 text-2xl font-bold tracking-tight">{calendar.name}</h1>
                {calendar.description && <p className="mt-2 text-sm text-muted-foreground">{calendar.description}</p>}
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{calendar.duration_minutes || 30} minuti</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  <span>Fuso orario Europe/Rome</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Conferma immediata in calendario</span>
                </div>
                {usesGoogleMeet && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Video className="h-4 w-4" />
                    <span>Videocall Google Meet</span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border bg-background p-3 text-sm">
                <p className="font-medium">Percorso prenotazione</p>
                <div className="mt-3 space-y-2">
                  {[
                    { label: "Scegli data", ok: !!selectedDate },
                    { label: "Scegli orario", ok: !!selectedSlot },
                    { label: "Lascia i dati", ok: !!selectedSlot && !!form.first_name.trim() },
                  ].map((step, index) => (
                    <div key={step.label} className="flex items-center gap-2 text-xs">
                      {step.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[10px] text-muted-foreground">
                          {index + 1}
                        </span>
                      )}
                      <span className={step.ok ? "text-foreground" : "text-muted-foreground"}>{step.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedSummary && (
                <div className="rounded-lg border bg-background p-3 text-sm">
                  <p className="font-medium">Hai scelto</p>
                  <p className="mt-1 text-muted-foreground">{selectedSummary}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 gap-1 px-0 text-primary hover:bg-transparent"
                    onClick={() => setSelectedSlot(null)}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Cambia orario
                  </Button>
                </div>
              )}
            </div>
          </aside>

          <main className="grid gap-6 p-5 md:grid-cols-[minmax(280px,360px)_1fr] md:p-6">
          {/* Date picker */}
          <div className="space-y-2">
            <Label className="text-base font-semibold">Scegli una data</Label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
              disabled={isDateDisabled}
              locale={it}
              className="rounded-md border"
            />
            {availabilityLoading && (
              <p className="flex items-center gap-2 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carico disponibilita' e regole del calendario...
              </p>
            )}
            {availabilityError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {availabilityLoadError instanceof Error
                  ? availabilityLoadError.message
                  : "Non riesco a caricare la disponibilita' del calendario."}
              </div>
            )}
            {!availabilityLoading && !availabilityError && availability.length === 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                Questo calendario non ha ancora giorni/orari pubblicati.
              </div>
            )}
          </div>

          {/* Time slots */}
          <div className="space-y-3">
            {!selectedDate ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center">
                <div className="max-w-xs">
                  <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="mt-3 font-medium">Seleziona una data</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vedrai subito gli orari disponibili e potrai confermare in pochi passaggi.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Label className="text-base font-semibold">
                  Orari disponibili — {format(selectedDate, "d MMMM", { locale: it })}
                </Label>
                {slotsLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Controllo appuntamenti gia' fissati e calendari collegati...
                  </div>
                ) : slots.length === 0 ? (
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Nessuno slot disponibile per questa data.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                    {slots.map((slot) => (
                      <Button
                        key={slot}
                        variant={selectedSlot === slot ? "default" : "outline"}
                        className="h-10 text-sm"
                        onClick={() => setSelectedSlot(slot)}
                      >
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        {slot}
                      </Button>
                    ))}
                  </div>
                )}
              </>
            )}

            {selectedDate && !selectedSlot && slots.length > 0 && (
              <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                Scegli un orario per aprire il modulo dati e completare la prenotazione.
              </p>
            )}

            {selectedSlot && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <Label className="text-base font-semibold">I tuoi dati</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs inline-flex items-center gap-1"><User className="h-3 w-3" /> Nome *</Label>
                    <Input
                      value={form.first_name}
                      onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))}
                      placeholder="Mario"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cognome</Label>
                    <Input
                      value={form.last_name}
                      onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value }))}
                      placeholder="Rossi"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs inline-flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="mario@email.com"
                    className={`h-8 text-sm ${!emailIsValid ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                  {!emailIsValid && (
                    <p className="mt-1 text-xs text-destructive">Email non valida.</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs inline-flex items-center gap-1"><Phone className="h-3 w-3" /> Telefono</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+39 333 1234567"
                    className="h-8 text-sm"
                  />
                </div>
                {!hasContactMethod && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    Inserisci almeno email o telefono per permettere all'azienda di confermare l'appuntamento.
                  </p>
                )}
                <div>
                  <Label className="text-xs">Note</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Informazioni aggiuntive..."
                    className="text-sm resize-none"
                    rows={2}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!canSubmit || bookMutation.isPending}
                  onClick={() => bookMutation.mutate()}
                >
                  {bookMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Conferma prenotazione
                </Button>
              </div>
            )}
          </div>
          </main>
        </div>
      </div>
    </div>
  );
}

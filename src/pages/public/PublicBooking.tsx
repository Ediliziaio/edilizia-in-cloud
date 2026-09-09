import { useCallback, useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

const PUBLIC_BOOKING_TIMEOUT_MS = 8_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * La forma dei campi che la vista `public_booking_calendars` restituisce.
 * Serve scritta a mano: la vista e' nata oggi e i tipi generati da Supabase
 * (src/integrations/supabase/types.ts) non la conoscono — senza, il risultato
 * della query e' `never` e ogni `calendar.qualcosa` diventa un errore.
 */
interface CalendarioPubblico {
  id: string;
  name: string;
  description: string | null;
  company_id: string;
  duration_minutes: number | null;
  booking_slug: string;
  owner_id: string | null;
  default_meeting_provider: string | null;
  default_meeting_enabled: boolean | null;
  buffer_before_min: number | null;
  buffer_after_min: number | null;
  min_notice_minutes: number | null;
  max_per_day: number | null;
}

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
        // Vista `public_booking_calendars`: solo i calendari con link attivo e
        // solo i campi che questa pagina mostra. Sulla tabella la lettura
        // anonima e' chiusa — ci finivano dentro anche le colonne
        // dell'aggancio, cioe' l'indirizzo dell'account del titolare — e per
        // chi era LOGGATO la policy pubblica non valeva affatto: apriva il
        // link e leggeva "Calendario non trovato".
        supabase
          .from("public_booking_calendars" as never)
          .select("id, name, description, company_id, duration_minutes, booking_slug, owner_id, default_meeting_provider, default_meeting_enabled, buffer_before_min, buffer_after_min, min_notice_minutes, max_per_day")
          .eq("booking_slug", slug)
          .maybeSingle(),
        "Calendario",
      );
      if (error) throw error;
      return (data ?? null) as unknown as CalendarioPubblico | null;
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
  // Fasce occupate del titolare, da UNA vista pubblica (08/09/2026).
  //
  // Prima erano tre query separate su google_/apple_/outlook_calendar_busy_slots:
  // da visitatore anonimo le prime due davano 401 (anon non ha il GRANT) e la
  // terza zero righe — cioè gli impegni del titolare non bloccavano MAI gli
  // orari proposti, e un cliente poteva prenotare mentre eri in riunione.
  // `public_calendar_busy_slots` espone solo inizio e fine, mai il titolo, e
  // solo per chi ha un calendario pubblico attivo con il blocco fasce acceso.
  const { data: busySlots = [], isFetching: busyFetching } = useQuery({
    queryKey: ["public-busy-slots", calendar?.id, dateStr, selectedDayRange?.startIso, selectedDayRange?.endIso],
    queryFn: async () => {
      if (!calendar?.id || !selectedDayRange) return [];
      // owner_id lo abbiamo gia' dalla vista: era una seconda query sulla
      // tabella, che da anonimo ora non e' piu' leggibile.
      if (!calendar.owner_id) return [];
      const cal = { owner_id: calendar.owner_id };
      // La vista non e' nei tipi generati (as never, come le altre del repo).
      const { data, error } = await supabase
        .from("public_calendar_busy_slots" as never)
        .select("start_at, end_at")
        .eq("user_id", cal.owner_id)
        .lt("start_at", selectedDayRange.endIso)
        .gt("end_at", selectedDayRange.startIso);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ start_at: string; end_at: string }>;
    },
    enabled: !!calendar?.id && !!selectedDayRange,
  });

  // Appuntamenti gia' fissati sul giorno scelto: la vista pubblica espone solo
  // inizio e fine, mai il nome di chi ha prenotato.
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
    const allBusySlots = busySlots;
    if (!selectedDate || allBusySlots.length === 0) return false;
    const slotStart = parse(slotTime, "HH:mm", selectedDate);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
    return allBusySlots.some((busy) => {
      const bStart = new Date(busy.start_at);
      const bEnd = new Date(busy.end_at);
      return slotStart < bEnd && slotEnd > bStart;
    });
  }, [busySlots, selectedDate]);

  const parseAvailabilityTime = useCallback(
    (value: string) => parse(value.length === 5 ? value : value.slice(0, 5), "HH:mm", selectedDate || new Date()),
    [selectedDate],
  );

  // Regole del calendario: margini fra appuntamenti, preavviso minimo e tetto
  // giornaliero. Erano colonne che nessuno leggeva.
  const bufferPrima = calendar?.buffer_before_min ?? 0;
  const bufferDopo = calendar?.buffer_after_min ?? 0;
  const preavvisoMin = calendar?.min_notice_minutes ?? 0;
  const maxAlGiorno = calendar?.max_per_day ?? null;
  // Orologio di stato: il preavviso va confrontato con "adesso", ma leggere
  // l'ora durante il render non e' puro. Aggiornandolo ogni minuto gli orari
  // troppo vicini spariscono da soli mentre la pagina resta aperta.
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAdesso(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Quando la pagina e' dentro un altro sito (script prenota.js) le si parla
  // via postMessage: l'altezza fa crescere il riquadro, la conferma permette al
  // sito di tracciare la conversione.
  const dentroIframe = typeof window !== "undefined" && window.parent !== window;
  useEffect(() => {
    if (!dentroIframe) return;
    // L'altezza da mandare e' quella del CONTENUTO, non del body: il body si
    // estende fino al fondo del riquadro, quindi misurandolo si misura il
    // riquadro stesso — il sito lo allargava, il body cresceva con lui e i due
    // si rincorrevano fino al tetto (2000px di vuoto sotto il calendario).
    const contenuto = document.getElementById("root") ?? document.body;
    const invia = () => {
      try {
        const h = Math.ceil(contenuto.getBoundingClientRect().height);
        if (h > 0) window.parent.postMessage({ source: "eic-prenota", event: "altezza", height: h }, "*");
      } catch { /* origine diversa: nessun problema */ }
    };
    invia();
    const osservatore = new ResizeObserver(invia);
    osservatore.observe(contenuto);
    return () => osservatore.disconnect();
  }, [dentroIframe]);


  // Fuso del visitatore: gli orari restano quelli italiani (li tiene il
  // titolare), ma chi prenota da un altro fuso deve sapere che ore sono da lui,
  // altrimenti si presenta con un'ora di scarto.
  const fusoVisitatore = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome"; }
    catch { return "Europe/Rome"; }
  }, []);
  const fusoDiverso = fusoVisitatore !== "Europe/Rome";
  const oraLocale = useCallback((giorno: Date, hhmm: string): string => {
    try {
      // "HH:mm" italiano → istante → stessa ora nel fuso di chi guarda.
      const [h, m] = hhmm.split(":").map(Number);
      const iso = `${format(giorno, "yyyy-MM-dd")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
      const comeRoma = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Europe/Rome" }));
      const scarto = new Date(iso).getTime() - comeRoma.getTime();
      return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: fusoVisitatore })
        .format(new Date(new Date(iso).getTime() + scarto));
    } catch { return hhmm; }
  }, [fusoVisitatore]);


  const slotOverlapsExistingAppointments = useCallback((slotTime: string, durationMinutes: number, rows = existingAppointments) => {
    if (!selectedDate) return false;
    // I margini del calendario allargano gli estremi: fra due appuntamenti
    // devono restare liberi buffer_before/after minuti, altrimenti si finisce
    // con una consulenza attaccata all'altra senza un minuto in mezzo.
    const inizio = parse(slotTime, "HH:mm", selectedDate).getTime() - bufferPrima * 60000;
    const fineSlot = parse(slotTime, "HH:mm", selectedDate).getTime() + (durationMinutes + bufferDopo) * 60000;
    return rows.some((apt) => {
      if (!apt.appointment_time) return false;
      const aptStart = parse(apt.appointment_time.slice(0, 5), "HH:mm", selectedDate).getTime();
      const aptEnd = apt.appointment_end_time
        ? parse(apt.appointment_end_time.slice(0, 5), "HH:mm", selectedDate).getTime()
        : aptStart + durationMinutes * 60000;
      return inizio < (aptEnd + bufferDopo * 60000) && fineSlot > (aptStart - bufferPrima * 60000);
    });
  }, [existingAppointments, selectedDate, bufferPrima, bufferDopo]);

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
        // Preavviso minimo: niente prenotazioni "fra cinque minuti".
        const troppoVicino = current.getTime() < adesso + preavvisoMin * 60000;
        if (!isOccupied && !troppoVicino && !isSlotBusy(slotTime, duration)) {
          allSlots.push(slotTime);
        }
        current = new Date(current.getTime() + duration * 60000);
      }
    }
    // Tetto di appuntamenti al giorno: raggiunto, la giornata non ha piu' orari.
    if (maxAlGiorno && existingAppointments.length >= maxAlGiorno) return [];
    return [...new Set(allSlots)].sort();
  }, [selectedDate, calendar, availability, parseAvailabilityTime, slotOverlapsExistingAppointments, isSlotBusy, preavvisoMin, maxAlGiorno, existingAppointments.length, adesso]);

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
      // La prenotazione la fa il server (public-booking-crea): ricontrolla che
      // lo slot sia davvero libero — anche rispetto agli impegni del titolare —
      // crea l'appuntamento, conferma al cliente e avvisa chi lo riceve. Prima
      // si scriveva da qui con la chiave anonima: nessuna email, e due persone
      // sullo stesso orario passavano entrambe.
      const { data, error } = await supabase.functions.invoke("public-booking-crea", {
        body: {
          slug,
          date: format(selectedDate, "yyyy-MM-dd"),
          time: selectedSlot,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          notes: form.notes.trim(),
        },
      });
      if (error) {
        let messaggio = "";
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) messaggio = String(((await ctx.clone().json()) as { error?: string })?.error ?? "");
        } catch { /* body non leggibile */ }
        throw new Error(messaggio || error.message || "Prenotazione non riuscita");
      }
      if ((data as { error?: string } | null)?.error) throw new Error(String((data as { error?: string }).error));
    },
    onSuccess: () => {
      setBooked(true);
      if (dentroIframe) {
        try {
          window.parent.postMessage({
            source: "eic-prenota", event: "prenotato",
            detail: { slug, date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : null, time: selectedSlot, calendar: calendar?.name },
          }, "*");
        } catch { /* origine diversa */ }
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore durante la prenotazione");
    },
  });

  if (calLoading) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/30 px-4", dentroIframe ? "min-h-[360px]" : "min-h-screen")}>
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Carico il calendario...</p>
        </div>
      </div>
    );
  }

  if (calError) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/30 px-4", dentroIframe ? "min-h-[360px]" : "min-h-screen")}>
        <div className="w-full max-w-sm rounded-2xl border bg-background p-6 text-center shadow-sm">
          <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">Calendario non raggiungibile</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {calLoadError instanceof Error ? calLoadError.message : "Non riesco a caricare il link di prenotazione."}
          </p>
          <Button className="mt-5 h-11 w-full" onClick={() => refetchCalendar()} disabled={calFetching}>
            {calFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  if (!calendar) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/30 px-4", dentroIframe ? "min-h-[360px]" : "min-h-screen")}>
        <div className="w-full max-w-sm rounded-2xl border bg-background p-6 text-center shadow-sm">
          <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">Calendario non trovato</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Il link di prenotazione non è valido o il calendario non è più attivo.
          </p>
        </div>
      </div>
    );
  }

  const durata = calendar.duration_minutes || 30;
  const selectedStart = selectedDate && selectedSlot ? parse(selectedSlot, "HH:mm", selectedDate) : null;
  const selectedEnd = selectedStart
    ? new Date(selectedStart.getTime() + durata * 60000)
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
      <div className={cn("flex items-center justify-center bg-muted/30 px-4 py-8", dentroIframe ? "min-h-[420px]" : "min-h-screen")}>
        <div className="w-full max-w-md rounded-2xl border bg-background p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">Prenotazione confermata</h1>
          <p className="mt-1 text-sm text-muted-foreground">{calendar.name}</p>

          <div className="mt-5 rounded-xl border bg-muted/30 p-4 text-left">
            <p className="text-sm font-medium first-letter:uppercase">
              {selectedDate && format(selectedDate, "EEEE d MMMM yyyy", { locale: it })}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="tabular-nums">{selectedSlot}</span>
              <span>· {durata} minuti</span>
              {fusoDiverso && selectedDate && selectedSlot && (
                <span>· le {oraLocale(selectedDate, selectedSlot)} da te</span>
              )}
            </p>
          </div>

          {usesGoogleMeet && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-left text-xs text-sky-900">
              <Video className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Il link Google Meet viene creato dall'azienda e aggiunto all'evento in calendario.</span>
            </div>
          )}

          {(addToGoogleUrl || addToOutlookUrl) && (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {addToGoogleUrl && (
                <Button variant="outline" className="h-11" asChild>
                  <a href={addToGoogleUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Google Calendar
                  </a>
                </Button>
              )}
              {addToOutlookUrl && (
                <Button variant="outline" className="h-11" asChild>
                  <a href={addToOutlookUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Outlook
                  </a>
                </Button>
              )}
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Riceverai conferma dall'azienda se servono altre informazioni.
          </p>
        </div>
      </div>
    );
  }

  const slotsLoading = !!selectedDate && (existingAppointmentsFetching || busyFetching);
  const canSubmit = selectedDate && selectedSlot && form.first_name.trim() && hasContactMethod && emailIsValid && !slotsLoading;
  // Due passi veri: prima quando, poi chi sei. Su telefono il secondo passo
  // prende tutto lo schermo — il calendario resta solo da tablet in su.
  const passo = selectedSlot ? 2 : 1;
  const selectedSummary = selectedDate && selectedSlot
    ? `${format(selectedDate, "EEEE d MMMM yyyy", { locale: it })} alle ${selectedSlot}${
        fusoDiverso ? ` (le ${oraLocale(selectedDate, selectedSlot)} da te)` : ""
      }`
    : null;

  return (
    // Dentro un iframe l'altezza la decide il contenuto: con min-h-screen la
    // pagina e' alta quanto il riquadro, il riquadro si adatta all'altezza
    // della pagina, e i due si rincorrono fino al tetto dei 2000px.
    <div className={cn("bg-muted/30 sm:px-4", dentroIframe ? "py-0 sm:py-4" : "min-h-screen sm:py-10")}>
      <div className={cn(
        "mx-auto max-w-5xl overflow-hidden bg-background sm:rounded-2xl sm:border sm:shadow-sm",
        !dentroIframe && "min-h-screen sm:min-h-0",
      )}>
        <div className={cn("lg:grid lg:grid-cols-[300px_1fr]", !dentroIframe && "lg:min-h-[640px]")}>
          <aside className="border-b bg-muted/20 px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r lg:p-6">
            <div className="space-y-4 lg:sticky lg:top-6 lg:space-y-6">
              <div>
                <div className="mb-4 hidden h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary lg:flex">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl lg:font-bold">
                  {calendar.name}
                </h1>
                {calendar.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground lg:line-clamp-none">
                    {calendar.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground lg:flex-col lg:items-start lg:gap-3 lg:text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" />
                  {durata} minuti
                </span>
                {usesGoogleMeet && (
                  <span className="inline-flex items-center gap-1.5">
                    <Video className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" />
                    Google Meet
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" />
                  {fusoDiverso ? <>Orari italiani · tu su {fusoVisitatore}</> : <>Orari italiani</>}
                </span>
                <span className="hidden items-center gap-1.5 lg:inline-flex">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  Conferma immediata
                </span>
              </div>

              {selectedSummary && (
                <div className="hidden rounded-xl border bg-background p-3 text-sm lg:block">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hai scelto</p>
                  <p className="mt-1.5 font-medium leading-snug first-letter:uppercase">{selectedSummary}</p>
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

          <main className="p-4 sm:p-6">
            <div className="lg:hidden">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{passo === 1 ? "Scegli data e ora" : "Lascia i tuoi dati"}</p>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">Passo {passo} di 2</p>
              </div>
              <div className="mt-2 flex gap-1.5" aria-hidden>
                <span className="h-1 flex-1 rounded-full bg-primary" />
                <span className={cn("h-1 flex-1 rounded-full", passo === 2 ? "bg-primary" : "bg-border")} />
              </div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:gap-6 lg:mt-0">
              {/* Passo 1 — la data */}
              <div className={cn("space-y-3", selectedSlot && "hidden md:block")}>
                <p className="hidden text-sm font-medium md:block">Scegli una data</p>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
                  disabled={isDateDisabled}
                  locale={it}
                  className="w-full rounded-xl border p-2 sm:p-3"
                  classNames={{
                    month: "w-full space-y-4",
                    month_grid: "w-full border-collapse",
                    weekdays: "flex justify-between",
                    week: "mt-1.5 flex w-full justify-between",
                    // Celle piu' grandi (dito, non mouse) e giorno scelto pieno,
                    // con il numero in bianco: e' l'unico punto della pagina in
                    // cui si capisce dove sei.
                    day: "relative h-10 w-10 rounded-lg p-0 text-center text-sm focus-within:relative focus-within:z-20",
                    selected: "rounded-lg bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary/90 [&>button:hover]:text-primary-foreground",
                  }}
                />
                {!selectedDate && !availabilityLoading && availability.length > 0 && (
                  <p className="text-center text-xs text-muted-foreground md:hidden">
                    Tocca un giorno per vedere gli orari liberi.
                  </p>
                )}
                {availabilityLoading && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Carico i giorni disponibili...
                  </p>
                )}
                {availabilityError && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {availabilityLoadError instanceof Error
                      ? availabilityLoadError.message
                      : "Non riesco a caricare la disponibilità del calendario."}
                  </p>
                )}
                {!availabilityLoading && !availabilityError && availability.length === 0 && (
                  <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Questo calendario non ha ancora giorni e orari pubblicati.
                  </p>
                )}
              </div>

              {/* Passo 1b — gli orari · Passo 2 — i dati */}
              {/* Finche' non c'e' una data, su telefono qui non va niente: il
                  riquadro "scegli un giorno" sarebbe solo altro da scorrere. */}
              <div className={cn("space-y-3", !selectedDate && "hidden md:block")}>
                {!selectedDate ? (
                  <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center">
                    <div className="max-w-[15rem]">
                      <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
                      <p className="mt-3 text-sm font-medium">Scegli un giorno</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Gli orari liberi compaiono qui.
                      </p>
                    </div>
                  </div>
                ) : !selectedSlot ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium first-letter:uppercase">
                        {format(selectedDate, "EEEE d MMMM", { locale: it })}
                      </p>
                      {!slotsLoading && slots.length > 0 && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {slots.length} {slots.length === 1 ? "orario libero" : "orari liberi"}
                        </span>
                      )}
                    </div>

                    {slotsLoading ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
                        ))}
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                        Nessun orario libero in questa data. Prova con un altro giorno.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">
                        {slots.map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className="flex h-12 flex-col items-center justify-center rounded-lg border bg-background text-sm font-medium tabular-nums transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {slot}
                            {fusoDiverso && (
                              <span className="text-[10px] font-normal text-muted-foreground">
                                {oraLocale(selectedDate, slot)} da te
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3 md:hidden">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium first-letter:uppercase">
                          {format(selectedDate, "EEEE d MMMM", { locale: it })} · {selectedSlot}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {durata} minuti
                          {fusoDiverso ? ` · le ${oraLocale(selectedDate, selectedSlot)} da te` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 shrink-0 gap-1 px-2 text-primary"
                        onClick={() => setSelectedSlot(null)}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Cambia
                      </Button>
                    </div>

                    <p className="hidden text-sm font-medium md:block">I tuoi dati</p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="pb-nome" className="inline-flex items-center gap-1.5 text-xs font-medium">
                          <User className="h-3.5 w-3.5" /> Nome *
                        </Label>
                        <Input
                          id="pb-nome"
                          autoComplete="given-name"
                          value={form.first_name}
                          onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))}
                          placeholder="Mario"
                          className="h-11 md:h-10"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pb-cognome" className="text-xs font-medium">Cognome</Label>
                        <Input
                          id="pb-cognome"
                          autoComplete="family-name"
                          value={form.last_name}
                          onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value }))}
                          placeholder="Rossi"
                          className="h-11 md:h-10"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="pb-email" className="inline-flex items-center gap-1.5 text-xs font-medium">
                          <Mail className="h-3.5 w-3.5" /> Email
                        </Label>
                        <Input
                          id="pb-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          value={form.email}
                          onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="mario@email.com"
                          aria-invalid={!emailIsValid}
                          className={cn("h-11 md:h-10", !emailIsValid && "border-destructive focus-visible:ring-destructive")}
                        />
                        {!emailIsValid && <p className="text-xs text-destructive">Email non valida.</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pb-telefono" className="inline-flex items-center gap-1.5 text-xs font-medium">
                          <Phone className="h-3.5 w-3.5" /> Telefono
                        </Label>
                        <Input
                          id="pb-telefono"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          value={form.phone}
                          onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                          placeholder="+39 333 1234567"
                          className="h-11 md:h-10"
                        />
                      </div>
                    </div>

                    {/* L'avviso arriva quando serve — all'apertura del modulo
                        sarebbe un rimprovero a chi non ha ancora scritto nulla. */}
                    {!hasContactMethod && !!form.first_name.trim() && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        Lascia almeno email o telefono: servono all'azienda per confermarti l'appuntamento.
                      </p>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="pb-note" className="text-xs font-medium">Note (facoltative)</Label>
                      <Textarea
                        id="pb-note"
                        value={form.notes}
                        onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Di cosa vuoi parlare?"
                        className="resize-none text-sm"
                        rows={3}
                      />
                    </div>

                    {/* Su telefono il tasto resta incollato in basso: con la
                        tastiera aperta sulle note sparirebbe sotto. Dentro un
                        iframe no — li' il riquadro cresce con il contenuto e una
                        barra fissa coprirebbe il modulo. */}
                    <div
                      className={cn(
                        "md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0 md:backdrop-blur-none",
                        !dentroIframe &&
                          "fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80",
                      )}
                    >
                      <Button
                        className="h-12 w-full text-base md:h-10 md:text-sm"
                        disabled={!canSubmit || bookMutation.isPending}
                        onClick={() => bookMutation.mutate()}
                      >
                        {bookMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Conferma prenotazione
                      </Button>
                    </div>
                    {!dentroIframe && <div className="h-16 md:hidden" aria-hidden />}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

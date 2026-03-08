import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, isBefore, startOfDay, parse, isAfter } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", notes: "" });

  // Fetch calendar by slug
  const { data: calendar, isLoading: calLoading } = useQuery({
    queryKey: ["public-booking-calendar", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("id, name, description, company_id, duration_minutes, booking_slug")
        .eq("booking_slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  // Fetch availability rules
  const { data: availability = [] } = useQuery({
    queryKey: ["public-booking-availability", calendar?.id],
    queryFn: async () => {
      if (!calendar?.id) return [];
      const { data } = await supabase
        .from("marketing_calendar_availability")
        .select("*")
        .eq("calendar_id", calendar.id)
        .eq("is_enabled", true);
      return data || [];
    },
    enabled: !!calendar?.id,
  });

  // Fetch existing appointments for the selected date
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const { data: existingAppointments = [] } = useQuery({
    queryKey: ["public-booking-appointments", calendar?.id, dateStr],
    queryFn: async () => {
      if (!calendar?.id || !dateStr) return [];
      const { data } = await supabase
        .from("appointments")
        .select("appointment_time, appointment_end_time")
        .eq("calendar_id", calendar.id)
        .eq("appointment_date", dateStr)
        .neq("status", "cancelled");
      return data || [];
    },
    enabled: !!calendar?.id && !!dateStr,
  });

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
      const start = parse(rule.start_time, "HH:mm:ss", selectedDate);
      const end = parse(rule.end_time, "HH:mm:ss", selectedDate);
      let current = start;
      while (isBefore(current, end)) {
        const slotTime = format(current, "HH:mm");
        const slotEnd = format(addDays(current, 0), "HH:mm"); // just for time calc
        // Check if slot overlaps with existing appointments
        const slotEndTime = format(new Date(current.getTime() + duration * 60000), "HH:mm");
        const isOccupied = existingAppointments.some((apt) => {
          if (!apt.appointment_time) return false;
          const aptStart = apt.appointment_time.slice(0, 5);
          const aptEnd = apt.appointment_end_time?.slice(0, 5) || format(
            new Date(parse(aptStart, "HH:mm", selectedDate).getTime() + duration * 60000), "HH:mm"
          );
          return slotTime < aptEnd && slotEndTime > aptStart;
        });
        if (!isOccupied) {
          allSlots.push(slotTime);
        }
        current = new Date(current.getTime() + duration * 60000);
      }
    }
    return [...new Set(allSlots)].sort();
  }, [selectedDate, availability, existingAppointments, calendar]);

  // Disable dates with no availability
  const isDateDisabled = (date: Date) => {
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
      const duration = calendar.duration_minutes || 30;
      const endTime = format(
        new Date(parse(selectedSlot, "HH:mm", selectedDate).getTime() + duration * 60000),
        "HH:mm"
      );
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
        appointment_type: "appuntamento",
        status: "confermato",
        created_by: "00000000-0000-0000-0000-000000000000",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBooked(true);
    },
    onError: (err: any) => {
      toast.error(err.message || "Errore durante la prenotazione");
    },
  });

  if (calLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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

  if (booked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3 max-w-md px-4">
          <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-500" />
          <h1 className="text-2xl font-bold">Prenotazione confermata!</h1>
          <p className="text-muted-foreground">
            Il tuo appuntamento è stato fissato per il{" "}
            <strong>{selectedDate && format(selectedDate, "d MMMM yyyy", { locale: it })}</strong> alle{" "}
            <strong>{selectedSlot}</strong>.
          </p>
        </div>
      </div>
    );
  }

  const canSubmit = selectedDate && selectedSlot && form.first_name.trim();

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-1">
          <CalendarDays className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-2xl font-bold">{calendar.name}</h1>
          {calendar.description && <p className="text-muted-foreground text-sm">{calendar.description}</p>}
          <p className="text-xs text-muted-foreground">Durata: {calendar.duration_minutes || 30} min</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Date picker */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Scegli una data</Label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
              disabled={isDateDisabled}
              locale={it}
              className="rounded-md border mx-auto"
            />
          </div>

          {/* Time slots */}
          <div className="space-y-3">
            {selectedDate && (
              <>
                <Label className="text-sm font-medium">
                  Orari disponibili — {format(selectedDate, "d MMMM", { locale: it })}
                </Label>
                {slots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessuno slot disponibile per questa data.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => (
                      <Button
                        key={slot}
                        variant={selectedSlot === slot ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => setSelectedSlot(slot)}
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        {slot}
                      </Button>
                    ))}
                  </div>
                )}
              </>
            )}

            {selectedSlot && (
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-sm font-medium">I tuoi dati</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Nome *</Label>
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
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="mario@email.com"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Telefono</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+39 333 1234567"
                    className="h-8 text-sm"
                  />
                </div>
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
        </div>
      </div>
    </div>
  );
}

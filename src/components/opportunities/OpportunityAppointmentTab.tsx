import { useState, useMemo } from "react";
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
import { CalendarIcon, Loader2, Trash2, Clock } from "lucide-react";
import { format, getDay, addMinutes, parse, isAfter, isBefore, isEqual } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  contactId: string;
  companyId: string;
  opportunityId: string;
  contactName: string;
}

export function OpportunityAppointmentTab({ contactId, companyId, opportunityId, contactName }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [calendarId, setCalendarId] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Fetch calendars
  const { data: calendars = [] } = useQuery({
    queryKey: ["marketing_calendars_active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("id, name, duration_minutes, calendar_type")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Get selected calendar's duration
  const selectedCalendar = calendars.find((c) => c.id === calendarId);
  const durationMinutes = selectedCalendar?.duration_minutes || 30;

  // Fetch availability for selected calendar + date
  const dayOfWeek = date ? getDay(date) : null; // 0=Sun, 1=Mon...
  const dateStr = date ? format(date, "yyyy-MM-dd") : null;

  const { data: availability = [] } = useQuery({
    queryKey: ["calendar_availability", calendarId, dayOfWeek, dateStr],
    queryFn: async () => {
      // First check for specific_date override
      const { data: specificData } = await supabase
        .from("marketing_calendar_availability")
        .select("*")
        .eq("calendar_id", calendarId)
        .eq("specific_date", dateStr!)
        .eq("is_enabled", true);

      if (specificData && specificData.length > 0) return specificData;

      // Fall back to day_of_week
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

  // Fetch existing appointments for that date + calendar
  const { data: existingAppointments = [] } = useQuery({
    queryKey: ["appointments_for_slot", calendarId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("appointment_time, appointment_end_time")
        .eq("calendar_id", calendarId)
        .eq("appointment_date", dateStr!)
        .neq("status", "annullato");
      if (error) throw error;
      return data || [];
    },
    enabled: !!calendarId && !!dateStr,
  });

  // Fetch existing future appointment for this contact
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

  // Calculate free slots
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

        // Check overlap with existing appointments
        const isOccupied = existingAppointments.some((appt) => {
          if (!appt.appointment_time) return false;
          const apptStart = appt.appointment_time.substring(0, 5);
          const apptEnd = appt.appointment_end_time ? appt.appointment_end_time.substring(0, 5) : format(addMinutes(parse(apptStart, "HH:mm", date), durationMinutes), "HH:mm");
          // Overlap: slotStart < apptEnd && slotEnd > apptStart
          return cursorStr < apptEnd && slotEndStr > apptStart;
        });

        if (!isOccupied) {
          slots.push(cursorStr);
        }

        cursor = addMinutes(cursor, durationMinutes);
      }
    }

    return slots;
  }, [availability, existingAppointments, date, durationMinutes]);

  // Book mutation
  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!calendarId || !date || !selectedSlot) throw new Error("Dati incompleti");

      const slotEnd = format(addMinutes(parse(selectedSlot, "HH:mm", date), durationMinutes), "HH:mm:ss");

      const { error } = await supabase.from("appointments").insert({
        company_id: companyId,
        calendar_id: calendarId,
        contact_id: contactId,
        appointment_date: format(date, "yyyy-MM-dd"),
        appointment_time: `${selectedSlot}:00`,
        appointment_end_time: slotEnd,
        title: title || `Appuntamento con ${contactName}`,
        description: description || null,
        appointment_type: "appuntamento",
        status: "confermato",
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appuntamento prenotato con successo");
      queryClient.invalidateQueries({ queryKey: ["contact_future_appointment"] });
      queryClient.invalidateQueries({ queryKey: ["appointments_for_slot"] });
      // Reset form
      setSelectedSlot("");
      setTitle("");
      setLocation("");
      setDescription("");
      setDate(undefined);
    },
    onError: (e: any) => toast.error(e.message || "Errore nella prenotazione"),
  });

  // Delete existing appointment
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
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
      {/* Existing appointment banner */}
      {existingContactAppointment && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Appuntamento già fissato
            </h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => deleteMutation.mutate(existingContactAppointment.id)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="text-sm text-muted-foreground space-y-0.5">
            <p><strong>{existingContactAppointment.title}</strong></p>
            <p>
              {format(new Date(existingContactAppointment.appointment_date), "d MMMM yyyy", { locale: it })}
              {existingContactAppointment.appointment_time && ` alle ${existingContactAppointment.appointment_time.substring(0, 5)}`}
            </p>
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
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Seleziona un calendario..." />
          </SelectTrigger>
          <SelectContent>
            {calendars.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name} ({c.duration_minutes} min)</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Title + Location row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm">Luogo dell'incontro</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Es. Ufficio, Zoom..." className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Titolo dell'appuntamento</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Appuntamento con ${contactName}`} className="h-9" />
        </div>
      </div>

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
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => { setDate(d); setSelectedSlot(""); setDatePickerOpen(false); }}
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              initialFocus
              className="p-3 pointer-events-auto"
            />
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
                  onClick={() => setSelectedSlot(slot)}
                >
                  {slot}
                </Button>
              ))}
            </div>
          )}
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
        disabled={!calendarId || !date || !selectedSlot || bookMutation.isPending}
        onClick={() => bookMutation.mutate()}
      >
        {bookMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Prenota appuntamento
      </Button>
    </div>
  );
}

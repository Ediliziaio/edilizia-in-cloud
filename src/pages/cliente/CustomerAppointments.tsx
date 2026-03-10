import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarDays, Loader2, MapPin, Clock, CheckCircle2, Calendar, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, isPast, isToday, isFuture } from "date-fns";
import { it } from "date-fns/locale";
import { useMemo } from "react";

interface Appointment {
  id: string;
  title: string;
  description: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_end_time: string | null;
  appointment_type: string;
  status: string;
  is_completed: boolean;
  formatted_address: string | null;
  address_city: string | null;
}

function generateICS(apt: Appointment): string {
  const dtStart = apt.appointment_time
    ? `${apt.appointment_date.replace(/-/g, "")}T${apt.appointment_time.replace(/:/g, "")}00`
    : `${apt.appointment_date.replace(/-/g, "")}`;
  const dtEnd = apt.appointment_end_time
    ? `${apt.appointment_date.replace(/-/g, "")}T${apt.appointment_end_time.replace(/:/g, "")}00`
    : dtStart;
  const isAllDay = !apt.appointment_time;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EdiliziaInCloud//IT",
    "BEGIN:VEVENT",
    isAllDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
    isAllDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
    `SUMMARY:${apt.title}`,
    apt.description ? `DESCRIPTION:${apt.description.replace(/\n/g, "\\n")}` : "",
    apt.formatted_address ? `LOCATION:${apt.formatted_address}` : "",
    `UID:${apt.id}@ediliziaincloud`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function downloadICS(apt: Appointment) {
  const ics = generateICS(apt);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${apt.title.replace(/[^a-zA-Z0-9]/g, "_")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  confermato: { label: "Confermato", variant: "default" },
  confirmed: { label: "Confermato", variant: "default" },
  pending: { label: "In attesa", variant: "secondary" },
  in_attesa: { label: "In attesa", variant: "secondary" },
  completed: { label: "Completato", variant: "outline" },
  completato: { label: "Completato", variant: "outline" },
  cancelled: { label: "Annullato", variant: "destructive" },
  annullato: { label: "Annullato", variant: "destructive" },
};

export default function CustomerAppointments() {
  const { user } = useAuth();

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["customer-appointments", user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user!.id)
        .single();

      if (!profile?.email) return [];

      const { data, error } = await supabase
        .from("appointments")
        .select("id, title, description, appointment_date, appointment_time, appointment_end_time, appointment_type, status, is_completed, formatted_address, address_city")
        .order("appointment_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as Appointment[];
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
  });

  const { upcoming, past } = useMemo(() => {
    const up: Appointment[] = [];
    const pa: Appointment[] = [];
    appointments.forEach((a) => {
      const d = new Date(a.appointment_date);
      if (a.is_completed || a.status === "cancelled" || a.status === "annullato") {
        pa.push(a);
      } else if (isFuture(d) || isToday(d)) {
        up.push(a);
      } else {
        pa.push(a);
      }
    });
    up.sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime());
    return { upcoming: up, past: pa };
  }, [appointments]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Appuntamenti</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Nessun appuntamento in programma.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function AppointmentRow({ apt }: { apt: Appointment }) {
    const st = statusMap[apt.status] || { label: apt.status, variant: "secondary" as const };
    const d = new Date(apt.appointment_date);
    const isPastDate = isPast(d) && !isToday(d);

    return (
      <div className={`flex items-start justify-between gap-3 p-3 rounded-lg border ${isPastDate ? "bg-muted/20 opacity-75" : "bg-muted/30"}`}>
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary shrink-0">
            <span className="text-xs font-medium uppercase">{format(d, "MMM", { locale: it })}</span>
            <span className="text-lg font-bold leading-none">{format(d, "dd")}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{apt.title}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
              {apt.appointment_time && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {apt.appointment_time.slice(0, 5)}
                  {apt.appointment_end_time && ` – ${apt.appointment_end_time.slice(0, 5)}`}
                </span>
              )}
              {(apt.formatted_address || apt.address_city) && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {apt.address_city || apt.formatted_address}
                </span>
              )}
            </div>
            {apt.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{apt.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={st.variant}>{st.label}</Badge>
          {!isPastDate && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadICS(apt)} title="Scarica .ics">
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Appuntamenti</h1>

      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-primary" />
              Prossimi appuntamenti ({upcoming.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map((apt) => (
              <AppointmentRow key={apt.id} apt={apt} />
            ))}
          </CardContent>
        </Card>
      )}

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              Storico ({past.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {past.map((apt) => (
              <AppointmentRow key={apt.id} apt={apt} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

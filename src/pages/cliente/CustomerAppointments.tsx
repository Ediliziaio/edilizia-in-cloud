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
  contact_email: string | null;
}

const EXCLUDED_TYPES = ["preventivo", "telefonata", "consulenza", "videocall", "meeting"];

const typeLabels: Record<string, string> = {
  posa: "Posa in opera",
  installazione: "Installazione",
  manutenzione: "Manutenzione",
  consegna: "Consegna materiale",
  collaudo: "Collaudo",
  sopralluogo: "Sopralluogo tecnico",
  rilievo: "Rilievo tecnico",
  assistenza: "Assistenza tecnica",
};

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
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user!.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.email) return [];

      const { data, error } = await supabase
        .from("appointments")
        .select("id, title, description, appointment_date, appointment_time, appointment_end_time, appointment_type, status, is_completed, formatted_address, address_city, contact_email")
        .eq("contact_email", profile.email)
        .not("appointment_type", "in", `(${EXCLUDED_TYPES.join(",")})`)
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
        <div>
          <h1 className="text-xl font-bold">I Miei Interventi</h1>
          <p className="text-sm text-muted-foreground">Calendario degli interventi programmati</p>
        </div>
        <div className="bg-background border border-border/60 rounded-2xl p-8 text-center">
          <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground font-medium">Nessun intervento programmato</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Gli interventi confermati appariranno qui</p>
        </div>
      </div>
    );
  }

  function AppointmentCard({ apt }: { apt: Appointment }) {
    const st = statusMap[apt.status] || { label: apt.status, variant: "secondary" as const };
    const d = new Date(apt.appointment_date);
    const isPastDate = isPast(d) && !isToday(d);
    const typeLabel = typeLabels[apt.appointment_type] || apt.appointment_type;

    return (
      <div className={`bg-background border border-border/60 rounded-2xl p-4 ${isPastDate ? "opacity-70" : ""}`}>
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary shrink-0">
            <span className="text-lg font-bold leading-none">{format(d, "dd")}</span>
            <span className="text-[11px] font-medium uppercase mt-0.5">{format(d, "MMM", { locale: it })}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{typeLabel}</p>
                <p className="text-xs text-muted-foreground truncate">{apt.title}</p>
              </div>
              <Badge variant={st.variant} className="shrink-0 text-[11px]">{st.label}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
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
            {!isPastDate && (
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs rounded-xl gap-1.5"
                  onClick={() => downloadICS(apt)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Aggiungi al calendario
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">I Miei Interventi</h1>
        <p className="text-sm text-muted-foreground">Calendario degli interventi programmati</p>
      </div>

      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Prossimi interventi ({upcoming.length})
          </h2>
          <div className="space-y-3">
            {upcoming.map((apt) => (
              <AppointmentCard key={apt.id} apt={apt} />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Storico ({past.length})
          </h2>
          <div className="space-y-3">
            {past.map((apt) => (
              <AppointmentCard key={apt.id} apt={apt} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

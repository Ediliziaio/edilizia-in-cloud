import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MarketingAppointmentDialog, { type MarketingAppointmentData } from "@/components/marketing/MarketingAppointmentDialog";

interface Props {
  contactId: string;
  companyId: string;
  contactName: string;
  calendars: { id: string; name: string; base_lat?: number | null; base_lng?: number | null; base_formatted_address?: string | null }[];
  users: { id: string; first_name: string; last_name: string }[];
}

export function ContactAppointmentsPanel({ contactId, companyId, contactName, calendars, users }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingApt, setEditingApt] = useState<MarketingAppointmentData | null>(null);
  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["contact_appointments", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, marketing_calendars:calendar_id(name)")
        .eq("contact_id", contactId)
        .eq("company_id", companyId)
        .order("appointment_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId && !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
  });

  const now = useMemo(() => new Date(), []);
  const upcoming = appointments.filter((a: any) => new Date(a.appointment_date) >= now && a.status !== "annullato");
  const past = appointments.filter((a: any) => new Date(a.appointment_date) < now || a.status === "annullato");

  const openEdit = (apt: any) => {
    setEditingApt({
      id: apt.id, title: apt.title, description: apt.description,
      appointment_date: apt.appointment_date, appointment_time: apt.appointment_time,
      appointment_end_time: apt.appointment_end_time, appointment_type: apt.appointment_type,
      assigned_to: apt.assigned_to, calendar_id: apt.calendar_id, contact_id: apt.contact_id,
      status: apt.status, is_completed: apt.is_completed, is_blocked_slot: apt.is_blocked_slot,
      internal_notes: apt.internal_notes, address_line: apt.address_line, address_city: apt.address_city,
      address_postal_code: apt.address_postal_code, address_province: apt.address_province,
      address_country: apt.address_country, formatted_address: apt.formatted_address,
      lat: apt.lat, lng: apt.lng, place_id: apt.place_id,
    });
    setDialogOpen(true);
  };

  const renderApt = (apt: any) => (
    <div
      key={apt.id}
      className="rounded bg-muted/50 p-2 space-y-0.5 cursor-pointer hover:bg-muted/80 transition-colors"
      onClick={() => openEdit(apt)}
    >
      <p className="text-[11px] font-medium truncate">{apt.title}</p>
      <p className="text-[10px] text-muted-foreground">
        {format(new Date(apt.appointment_date), "d MMM yyyy", { locale: it })}
        {apt.appointment_time && ` · ${apt.appointment_time.substring(0, 5)}`}
      </p>
      <div className="flex items-center gap-1">
        <Badge
          variant={apt.status === "completato" ? "default" : apt.status === "annullato" ? "destructive" : "secondary"}
          className="text-[9px] h-4 px-1"
        >
          {apt.status}
        </Badge>
        {(apt as any).marketing_calendars?.name && (
          <span className="text-[9px] text-muted-foreground">{(apt as any).marketing_calendars.name}</span>
        )}
      </div>
      {apt.formatted_address && (
        <p className="text-[9px] text-muted-foreground truncate">{apt.formatted_address}</p>
      )}
    </div>
  );

  if (isLoading) return <p className="text-[11px] text-muted-foreground text-center py-4">Caricamento...</p>;

  return (
    <div className="space-y-2.5">
      <Button
        size="sm"
        className="w-full h-7 text-[11px]"
        onClick={() => { setEditingApt(null); setDialogOpen(true); }}
      >
        <Plus className="h-3 w-3 mr-1" /> Prenota appuntamento
      </Button>

      {upcoming.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Prossimi</p>
          {upcoming.map(renderApt)}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Passati</p>
          {past.map(renderApt)}
        </div>
      )}

      {appointments.length === 0 && (
        <p className="text-[11px] text-muted-foreground text-center py-4">Nessun appuntamento</p>
      )}

      <MarketingAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editingApt}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["contact_appointments", contactId] })}
        calendars={calendars}
        users={users}
        defaultContactId={contactId}
      />
    </div>
  );
}

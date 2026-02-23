import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarDays, Trash2, Plus, Clock, Ban } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

interface CalendarOption {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  first_name: string;
  last_name: string;
}

export interface MarketingAppointmentData {
  id?: string;
  title: string;
  description: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_end_time?: string | null;
  appointment_type: string;
  assigned_to: string | null;
  calendar_id: string | null;
  contact_id: string | null;
  status: string;
  is_completed: boolean;
  is_blocked_slot?: boolean;
  internal_notes?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: MarketingAppointmentData | null;
  onSaved: () => void;
  calendars: CalendarOption[];
  users: UserOption[];
  defaultDate?: string;
  defaultTime?: string;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export default function MarketingAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSaved,
  calendars,
  users,
  defaultDate,
  defaultTime,
}: Props) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const isEditing = !!appointment?.id;

  const [activeTab, setActiveTab] = useState<"appointment" | "blocked">("appointment");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [contactId, setContactId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [status, setStatus] = useState("confermato");
  const [internalNotes, setInternalNotes] = useState("");
  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Auto-select single calendar
  const defaultCalendarId = useMemo(() => {
    if (calendars.length === 1) return calendars[0].id;
    return "";
  }, [calendars]);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setActiveTab(appointment.is_blocked_slot ? "blocked" : "appointment");
      setTitle(appointment.title);
      setDescription(appointment.description || "");
      setAppointmentDate(appointment.appointment_date ? new Date(appointment.appointment_date) : undefined);
      setStartTime(appointment.appointment_time?.slice(0, 5) || "09:00");
      setEndTime(appointment.appointment_end_time?.slice(0, 5) || addMinutesToTime(appointment.appointment_time?.slice(0, 5) || "09:00", 30));
      setCalendarId(appointment.calendar_id || defaultCalendarId);
      setAssignedTo(appointment.assigned_to || "");
      setContactId(appointment.contact_id || "");
      setStatus(appointment.status || "confermato");
      setInternalNotes(appointment.internal_notes || "");
      setShowInternalNotes(!!appointment.internal_notes);
    } else {
      setActiveTab("appointment");
      setTitle("");
      setDescription("");
      const st = defaultTime || "09:00";
      setStartTime(st);
      setEndTime(addMinutesToTime(st, 30));
      setAppointmentDate(defaultDate ? new Date(defaultDate) : new Date());
      setCalendarId(defaultCalendarId);
      setAssignedTo("");
      setContactId("");
      setStatus("confermato");
      setInternalNotes("");
      setShowInternalNotes(false);
    }
  }, [appointment, open, defaultDate, defaultTime, defaultCalendarId]);

  // Contacts search
  const { data: contacts = [] } = useQuery({
    queryKey: ["mkt-apt-contacts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId)
        .order("last_name")
        .limit(200);
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const handleSave = async () => {
    const isBlocked = activeTab === "blocked";

    if (!calendarId || calendarId === "none") {
      toast({ title: "Seleziona un calendario", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Inserisci un titolo", variant: "destructive" });
      return;
    }
    if (!appointmentDate) {
      toast({ title: "Seleziona una data", variant: "destructive" });
      return;
    }
    if (!startTime || !endTime) {
      toast({ title: "Inserisci orario inizio e fine", variant: "destructive" });
      return;
    }
    if (endTime <= startTime) {
      toast({ title: "L'ora di fine deve essere successiva all'ora di inizio", variant: "destructive" });
      return;
    }
    if (!isBlocked && (!contactId || contactId === "none")) {
      toast({ title: "Seleziona un contatto", variant: "destructive" });
      return;
    }
    if (!companyId || !user) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_id: companyId,
        title: title.trim(),
        description: description.trim() || null,
        appointment_date: format(appointmentDate, "yyyy-MM-dd"),
        appointment_time: startTime + ":00",
        appointment_end_time: endTime + ":00",
        appointment_type: isBlocked ? "blocked" : "generico",
        assigned_to: assignedTo && assignedTo !== "none" ? assignedTo : null,
        calendar_id: calendarId,
        contact_id: !isBlocked && contactId && contactId !== "none" ? contactId : null,
        status: isBlocked ? "confermato" : status,
        is_blocked_slot: isBlocked,
        internal_notes: internalNotes.trim() || null,
        order_id: null,
      };

      if (isEditing && appointment?.id) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", appointment.id);
        if (error) throw error;
        toast({ title: isBlocked ? "Tempo bloccato aggiornato" : "Appuntamento aggiornato" });
      } else {
        payload.created_by = user.id;
        const { error } = await supabase.from("appointments").insert(payload as any);
        if (error) throw error;
        toast({ title: isBlocked ? "Tempo bloccato creato" : "Appuntamento prenotato" });
      }

      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!appointment?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("appointments").delete().eq("id", appointment.id);
      if (error) throw error;
      toast({ title: "Eliminato con successo" });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isBlocked = activeTab === "blocked";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? isBlocked ? "Modifica tempo bloccato" : "Modifica appuntamento"
              : isBlocked ? "Aggiungi tempo bloccato" : "Prenota appuntamento"}
          </DialogTitle>
          <DialogDescription>
            {isBlocked
              ? "Blocca un periodo sul calendario per impedire prenotazioni"
              : "Compila i dettagli per prenotare un appuntamento"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "appointment" | "blocked")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="appointment" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Appuntamento
            </TabsTrigger>
            <TabsTrigger value="blocked" className="gap-1.5">
              <Ban className="h-3.5 w-3.5" />
              Tempo bloccato
            </TabsTrigger>
          </TabsList>

          {/* ── APPOINTMENT TAB ── */}
          <TabsContent value="appointment" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-6">
              {/* Left column */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Calendario *</Label>
                  <Select value={calendarId} onValueChange={setCalendarId}>
                    <SelectTrigger><SelectValue placeholder="Seleziona calendario" /></SelectTrigger>
                    <SelectContent>
                      {calendars.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mkt-title">Titolo dell'appuntamento *</Label>
                  <Input id="mkt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Consulenza iniziale" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mkt-desc">Descrizione</Label>
                  <Textarea id="mkt-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dettagli aggiuntivi..." rows={3} />
                </div>

                <div className="space-y-2">
                  <Label>Membro del team</Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger><SelectValue placeholder="Nessun assegnatario" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuno</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.first_name} {u.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date & Time card */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Data e ora</Label>
                    <span className="text-xs text-muted-foreground">Fuso orario: CET</span>
                  </div>

                  <div className="space-y-2">
                    <Label>Data *</Label>
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !appointmentDate && "text-muted-foreground")}>
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {appointmentDate ? format(appointmentDate, "EEEE d MMMM yyyy", { locale: it }) : "Seleziona data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={appointmentDate}
                          onSelect={(d) => { setAppointmentDate(d); setDatePickerOpen(false); }}
                          locale={it}
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="start-time" className="text-xs">Ora inizio *</Label>
                      <Input id="start-time" type="time" value={startTime} onChange={(e) => {
                        setStartTime(e.target.value);
                        if (e.target.value) setEndTime(addMinutesToTime(e.target.value, 30));
                      }} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="end-time" className="text-xs">Ora fine *</Label>
                      <Input id="end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Seleziona Contatto *</Label>
                  <Select value={contactId} onValueChange={setContactId}>
                    <SelectTrigger><SelectValue placeholder="Cerca contatto..." /></SelectTrigger>
                    <SelectContent>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.first_name} {c.last_name || ""} {c.email ? `(${c.email})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  {!showInternalNotes ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowInternalNotes(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Aggiungi nota interna
                    </Button>
                  ) : (
                    <>
                      <Label htmlFor="mkt-internal-notes">Note interne</Label>
                      <Textarea
                        id="mkt-internal-notes"
                        value={internalNotes}
                        onChange={(e) => setInternalNotes(e.target.value)}
                        placeholder="Visibile solo al team..."
                        rows={4}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── BLOCKED SLOT TAB ── */}
          <TabsContent value="blocked" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Vai in vacanza? Devi bloccare del tempo? Aggiungi qui un periodo di blocco per impedire la prenotazione di appuntamenti.
            </p>

            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>Calendario *</Label>
                <Select value={calendarId} onValueChange={setCalendarId}>
                  <SelectTrigger><SelectValue placeholder="Seleziona calendario" /></SelectTrigger>
                  <SelectContent>
                    {calendars.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="blocked-title">Titolo *</Label>
                <Input id="blocked-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Ferie, Pausa pranzo..." />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Data e ora</Label>
                  <span className="text-xs text-muted-foreground">Fuso orario: CET</span>
                </div>

                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !appointmentDate && "text-muted-foreground")}>
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {appointmentDate ? format(appointmentDate, "EEEE d MMMM yyyy", { locale: it }) : "Seleziona data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={appointmentDate}
                        onSelect={setAppointmentDate}
                        locale={it}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="blocked-start" className="text-xs">Ora inizio *</Label>
                    <Input id="blocked-start" type="time" value={startTime} onChange={(e) => {
                      setStartTime(e.target.value);
                      if (e.target.value) setEndTime(addMinutesToTime(e.target.value, 30));
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="blocked-end" className="text-xs">Ora fine *</Label>
                    <Input id="blocked-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          {isEditing && (
            <Button variant="destructive" onClick={handleDelete} disabled={saving} className="sm:mr-auto" size="sm">
              <Trash2 className="h-4 w-4 mr-1" />
              Elimina
            </Button>
          )}

          {!isBlocked && (
            <div className="flex items-center gap-2 sm:mr-auto">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Stato:</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confermato">Confermato</SelectItem>
                  <SelectItem value="annullato">Annullato</SelectItem>
                  <SelectItem value="riprogrammato">Riprogrammato</SelectItem>
                  <SelectItem value="completato">Completato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? "Salvataggio..."
                : isEditing
                  ? "Salva modifiche"
                  : isBlocked
                    ? "Blocca tempo"
                    : "Prenota appuntamento"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

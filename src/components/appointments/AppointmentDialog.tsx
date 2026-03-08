import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarDays, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";

export interface AppointmentData {
  id?: string;
  title: string;
  description: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_type: string;
  assigned_to: string | null;
  order_id: string | null;
  is_completed: boolean;
  calendar_id?: string | null;
  contact_id?: string | null;
  status?: string;
  reminder_minutes?: number | null;
}

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: AppointmentData | null;
  onSaved: () => void;
  defaultOrderId?: string;
  showOrderSelect?: boolean;
  defaultDate?: string;
  defaultTime?: string;
  requireTime?: boolean;
  hideMarketingFields?: boolean;
}

const APPOINTMENT_TYPES = [
  { value: "sopralluogo", label: "Sopralluogo" },
  { value: "consegna", label: "Consegna" },
  { value: "riunione", label: "Riunione" },
  { value: "cliente", label: "Appuntamento Cliente" },
  { value: "generico", label: "Generico" },
];

export function AppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSaved,
  defaultOrderId,
  showOrderSelect = false,
  defaultDate,
  defaultTime,
  requireTime = false,
  hideMarketingFields = false,
}: AppointmentDialogProps) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const isEditing = !!appointment?.id;
  const { onlyAssigned } = usePermissions();
  const { isGoogleConnected, pushEvent: gcalPush, updateEvent: gcalUpdate, deleteEvent: gcalDelete, checkMapping } = useGoogleCalendarSync();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>();
  const [appointmentTime, setAppointmentTime] = useState("");
  const [appointmentType, setAppointmentType] = useState("generico");
  const [assignedTo, setAssignedTo] = useState("");
  const [orderId, setOrderId] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [contactId, setContactId] = useState("");
  const [status, setStatus] = useState("confermato");
  const [reminderMinutes, setReminderMinutes] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appointment) {
      setTitle(appointment.title);
      setDescription(appointment.description || "");
      setAppointmentDate(appointment.appointment_date ? new Date(appointment.appointment_date) : undefined);
      setAppointmentTime(appointment.appointment_time || "");
      setAppointmentType(appointment.appointment_type);
      setAssignedTo(appointment.assigned_to || "");
      setOrderId(appointment.order_id || "");
      setCalendarId(appointment.calendar_id || "");
      setContactId(appointment.contact_id || "");
      setStatus(appointment.status || "confermato");
      setReminderMinutes(appointment.reminder_minutes != null ? String(appointment.reminder_minutes) : "none");
    } else {
      setTitle("");
      setDescription("");
      setAppointmentDate(defaultDate ? new Date(defaultDate) : undefined);
      setAppointmentTime(defaultTime || "");
      setAppointmentType("generico");
      setAssignedTo(onlyAssigned && user?.id ? user.id : "");
      setOrderId(defaultOrderId || "");
      setCalendarId("");
      setContactId("");
      setStatus("confermato");
      setReminderMinutes("none");
    }
  }, [appointment, open, defaultOrderId, onlyAssigned, user?.id, defaultDate, defaultTime]);

  const { data: assignableUsers = [] } = useQuery({
    queryKey: ["assignable-users", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .order("last_name");
      if (!profiles?.length) return [];
      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      const validUserIds = roles
        ?.filter((r) => ["company_admin", "company_staff", "salesperson", "call_center"].includes(r.role))
        .map((r) => r.user_id) || [];
      return profiles.filter((p) => validUserIds.includes(p.id));
    },
    enabled: open && !!companyId,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["appointment-orders", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, description, order_code")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: open && !!companyId && showOrderSelect,
  });

  const { data: marketingCalendars = [] } = useQuery({
    queryKey: ["appointment-calendars", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_calendars")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["appointment-contacts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .order("last_name")
        .limit(200);
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Inserisci un titolo", variant: "destructive" });
      return;
    }
    if (!appointmentDate) {
      toast({ title: "Inserisci una data", variant: "destructive" });
      return;
    }
    if (requireTime && !appointmentTime) {
      toast({ title: "Inserisci un orario", variant: "destructive" });
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
        appointment_time: appointmentTime || null,
        appointment_type: appointmentType,
        assigned_to: assignedTo && assignedTo !== "none" ? assignedTo : null,
        order_id: orderId && orderId !== "none" ? orderId : null,
        calendar_id: hideMarketingFields ? null : (calendarId && calendarId !== "none" ? calendarId : null),
        contact_id: hideMarketingFields ? null : (contactId && contactId !== "none" ? contactId : null),
        status: status,
      };

      if (isEditing && appointment?.id) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", appointment.id);
        if (error) throw error;
        toast({ title: "Appuntamento aggiornato" });
        // Fire-and-forget Google sync
        if (isGoogleConnected) {
          gcalUpdate(appointment.id).catch(() => {});
        }
      } else {
        payload.created_by = user.id;
        const { data: inserted, error } = await supabase.from("appointments").insert(payload as any).select("id").single();
        if (error) throw error;
        toast({ title: "Appuntamento creato" });
        // Fire-and-forget Google sync
        if (isGoogleConnected && inserted?.id) {
          gcalPush(inserted.id).catch(() => {});
        }
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
      // Fire-and-forget Google delete before CRM delete
      if (isGoogleConnected) {
        gcalDelete(appointment.id).catch(() => {});
      }
      const { error } = await supabase.from("appointments").delete().eq("id", appointment.id);
      if (error) throw error;
      toast({ title: "Appuntamento eliminato" });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Modifica Appuntamento" : "Nuovo Appuntamento"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifica i dettagli dell'appuntamento" : "Compila i campi per creare un nuovo appuntamento"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="apt-title">Titolo *</Label>
            <Input id="apt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Sopralluogo tecnico" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={appointmentType} onValueChange={setAppointmentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !appointmentDate && "text-muted-foreground")}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {appointmentDate ? format(appointmentDate, "dd/MM/yyyy") : "Seleziona data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={appointmentDate} onSelect={setAppointmentDate} locale={it} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="apt-time">{requireTime ? "Ora *" : "Ora (opzionale)"}</Label>
              <Input id="apt-time" type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Assegna a</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo} disabled={onlyAssigned}>
                <SelectTrigger><SelectValue placeholder="Nessun assegnatario" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.first_name} {u.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showOrderSelect && (
            <div className="space-y-2">
              <Label>Ordine collegato</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger><SelectValue placeholder="Nessun ordine" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ? `${o.order_code} - ` : ""}{o.description?.slice(0, 40)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className={hideMarketingFields ? "" : "grid grid-cols-2 gap-4"}>
            {!hideMarketingFields && (
              <div className="space-y-2">
                <Label>Calendario</Label>
                <Select value={calendarId} onValueChange={setCalendarId}>
                  <SelectTrigger><SelectValue placeholder="Nessun calendario" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
                    {marketingCalendars.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Stato</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confermato">Confermato</SelectItem>
                  <SelectItem value="annullato">Annullato</SelectItem>
                  <SelectItem value="riprogrammato">Riprogrammato</SelectItem>
                  <SelectItem value="completato">Completato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!hideMarketingFields && (
            <div className="space-y-2">
              <Label>Contatto CRM</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue placeholder="Nessun contatto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="apt-desc">Note</Label>
            <Textarea id="apt-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dettagli aggiuntivi..." rows={3} />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isEditing && (
            <Button variant="destructive" onClick={handleDelete} disabled={saving} className="sm:mr-auto">
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : isEditing ? "Salva modifiche" : "Crea appuntamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

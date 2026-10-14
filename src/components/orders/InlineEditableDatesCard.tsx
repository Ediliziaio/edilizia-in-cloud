import { useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, CalendarPlus, MoreHorizontal, Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
import { planningDay, planningTime, validatePlanning, type OrderPlanningDates } from "@/lib/orders/planning";

interface InlineEditableDatesCardProps {
  orderId: string;
  expectedDate?: string | null;
  warehouseArrivalDate?: string | null;
  workStartDate?: string | null;
  workEndDate?: string | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  updatedAt?: string | null;
  orderCode?: string | null;
  orderDescription?: string | null;
  defaultAddress?: string | null;
  onOpenSchedule?: () => void;
}
const DATE_FIELDS = [
  ["work_start_date", "Inizio lavori"], ["work_end_date", "Fine lavori"],
  ["expected_date", "Posa prevista"], ["warehouse_arrival_date", "Arrivo materiali"],
] as const;

/** Read dates first, edit together. The order is already a calendar event:
 * never generate/delete a second pair of start/end appointments. */
export function InlineEditableDatesCard(props: InlineEditableDatesCardProps) {
  return <PlanningDatesPanel key={props.orderId} {...props} />;
}
function PlanningDatesPanel({orderId, expectedDate, warehouseArrivalDate, workStartDate, workEndDate,
  workStartTime, workEndTime, updatedAt, orderCode, orderDescription, defaultAddress, onOpenSchedule}: InlineEditableDatesCardProps) {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const { canEditOrders } = usePermissions();
  const companyId = effectiveCompany?.id;
  const readonly = !canEditOrders || !companyId;
  const persisted: OrderPlanningDates = {
    expected_date: expectedDate ?? null, warehouse_arrival_date: warehouseArrivalDate ?? null,
    work_start_date: workStartDate ?? null, work_end_date: workEndDate ?? null,
    work_start_time: planningTime(workStartTime) || null, work_end_time: planningTime(workEndTime) || null,
  };
  const fingerprint = JSON.stringify([updatedAt, persisted]);
  const [saved, setSaved] = useState<{fingerprint: string; dates: OrderPlanningDates} | null>(null);
  const displayed = saved?.fingerprint === fingerprint ? saved.dates : persisted;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OrderPlanningDates>(persisted);
  const [editVersion, setEditVersion] = useState(updatedAt);
  const [saving, setSaving] = useState(false);
  const [appointmentPreset, setAppointmentPreset] = useState<{type: string; title: string; date?: string} | null>(null);
  const orderRef = [orderCode, orderDescription].filter(Boolean).join(" - ");
  const refresh = () => {
    for (const key of [["order", orderId], ["orders", "detail", orderId], ["orders", "diary-header", orderId],
      ["calendar-orders"], ["appointments"], ["order-appointments", orderId], ["order-schedule-health", orderId],
      ["campo-lavoro", orderId], ["campo-lavori-assegnati"], ["order-conteggi-viste", orderId]])
      void qc.invalidateQueries({ queryKey: key });
  };
  const edit = () => { setDraft({...displayed}); setEditVersion(updatedAt); setOpen(true); };
  const planAppointment = (type: string, title: string, day?: string | null) => {
    if (!readonly) setAppointmentPreset({type, title: title + (orderRef ? " · " + orderRef : ""), date: planningDay(day) || undefined});
  };
  const save = async () => {
    if (saving || readonly) return;
    const problem = validatePlanning(draft);
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      // work_*_time exists since pose_google_sync, but generated types lag the schema.
      let query = supabase.from("orders").update(draft as never).eq("id", orderId).eq("company_id", companyId!);
      if (editVersion) query = query.eq("updated_at", editVersion);
      const {data, error} = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Date non salvate: la commessa potrebbe essere cambiata. Riapri la pianificazione e riprova.");
      setSaved({fingerprint, dates: {...draft}});
      refresh(); setOpen(false);
      toast.success("Date della commessa salvate");
      // trg_orders_google_sync owns external sync and retries via its queue.
      // A second push here could race the queue and create duplicate events.
    } catch (error) {
      logger.error("Salvataggio pianificazione non riuscito", error);
      toast.error(error instanceof Error ? error.message : "Date non salvate. Riprova.");
    } finally { setSaving(false); }
  };
  const inconsistent = validatePlanning(displayed) ||
    (displayed.expected_date && displayed.work_start_date && displayed.work_end_date &&
      (displayed.expected_date < displayed.work_start_date || displayed.expected_date > displayed.work_end_date)
      ? "La posa prevista è fuori dal periodo lavori: verifica le date." : null);
  return <>
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-orange-500" />Date del cantiere</CardTitle>
        {!readonly && <Button type="button" aria-label="Modifica date" variant="outline" size="sm" onClick={edit} className="min-h-10"><Pencil className="mr-1.5 h-3.5 w-3.5" /><span className="hidden sm:inline">Modifica date</span><span className="sm:hidden">Modifica</span></Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {DATE_FIELDS.map(([field, label]) => {
            const day = planningDay(displayed[field]);
            const time = field === "work_start_date" ? displayed.work_start_time : field === "work_end_date" ? displayed.work_end_time : null;
            return <div key={field}><dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={"mt-1 text-sm " + (day ? "font-medium" : "text-muted-foreground")}>{day ? format(parseISO(day), "d MMM yyyy", {locale: it}) : displayed[field] ? "Data da verificare" : "Da definire"}{time && day ? " · " + time : ""}</dd></div>;
          })}
        </dl>
        {inconsistent && <p role="alert" className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{inconsistent}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          {!readonly && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" aria-label="Pianifica appuntamento" variant="outline" size="sm" className="min-h-10"><CalendarPlus className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">Pianifica appuntamento</span><span className="sm:hidden">Appuntamento</span><MoreHorizontal className="ml-1.5 h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => planAppointment("sopralluogo_preventivo", "Sopralluogo", displayed.work_start_date)}>Sopralluogo</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => planAppointment("rilievo_tecnico", "Rilievo misure", displayed.work_start_date)}>Rilievo misure</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => planAppointment("collaudo", "Collaudo lavori", displayed.work_end_date)}>Collaudo</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
          {onOpenSchedule && <Button type="button" variant="ghost" size="sm" onClick={onOpenSchedule}>Cronoprogramma</Button>}
          <Button asChild variant="ghost" size="sm"><Link to="/azienda/calendario" aria-label="Apri calendario"><span className="hidden sm:inline">Apri calendario</span><span className="sm:hidden">Calendario</span></Link></Button>
        </div>
      </CardContent>
    </Card>
    <AppointmentDialog open={!!appointmentPreset} onOpenChange={next => {if (!next) setAppointmentPreset(null);}}
      onSaved={() => {refresh(); setAppointmentPreset(null);}} defaultOrderId={orderId}
      defaultDate={appointmentPreset?.date} defaultAppointmentType={appointmentPreset?.type ?? "sopralluogo_preventivo"}
      defaultTitle={appointmentPreset?.title ?? ""} defaultAddress={defaultAddress} showOrderSelect={false} requireTime hideMarketingFields />
    <Dialog open={open} onOpenChange={next => {if (!saving) setOpen(next);}}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Modifica date del cantiere</DialogTitle><DialogDescription>Periodo generale della commessa. Le singole lavorazioni mantengono le proprie date.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DATE_FIELDS.map(([field, label]) => <div key={field} className="space-y-1.5"><Label htmlFor={orderId + "-" + field}>{label}</Label>
            <Input id={orderId + "-" + field} type="date" value={planningDay(draft[field])} disabled={saving}
              onChange={e => setDraft(previous => ({...previous, [field]: e.target.value || null,
                ...(field === "work_start_date" && !e.target.value ? {work_start_time: null} : {}),
                ...(field === "work_end_date" && !e.target.value ? {work_end_time: null} : {})}))} /></div>)}
          {([["work_start_time", "Ora inizio", "work_start_date"], ["work_end_time", "Ora fine", "work_end_date"]] as const).map(([field, label, day]) => <div key={field} className="space-y-1.5"><Label htmlFor={orderId + "-" + field}>{label} <span className="text-xs text-muted-foreground">facoltativa</span></Label>
            <Input id={orderId + "-" + field} type="time" value={draft[field] ?? ""} disabled={saving || !draft[day]} onChange={e => setDraft(previous => ({...previous, [field]: e.target.value || null}))} /></div>)}
        </div>
        <p className="text-xs text-muted-foreground">Senza orari, il lavoro è pianificato per l'intera giornata. I calendari esterni seguono le integrazioni configurate.</p>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button><Button onClick={save} disabled={saving || readonly}>{saving ? "Salvataggio…" : "Salva date"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

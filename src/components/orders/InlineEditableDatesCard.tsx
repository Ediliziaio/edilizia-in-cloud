import { useState } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, CalendarRange, Pencil, ArrowUpRight } from "lucide-react";
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
import { planningDay, planningTime, validatePlanning, type OrderPlanningDates } from "@/lib/orders/planning";
import { planningSchedule } from "@/lib/orders/planningSchedule";
import { usePlanningPhases } from "@/hooks/usePlanningPhases";

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
  dialogOpen?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
  onRequestEdit?: () => void;
  hideCard?: boolean;
}
const DATE_FIELDS = [
  ["work_start_date", "Inizio lavori previsto"], ["work_end_date", "Fine lavori prevista"],
  ["warehouse_arrival_date", "Arrivo materiali"], ["expected_date", "Posa prevista"],
] as const;
/** In lettura (31/10/2026): inizio e fine previsti sempre, l'arrivo materiali solo se c'è, la posa no. */
const DATE_VISIBILI = DATE_FIELDS.filter(([field]) => field !== "expected_date");

/** Read dates first, edit together. The order is already a calendar event:
 * never generate/delete a second pair of start/end appointments.
 * Appuntamenti, cronoprogramma e calendario hanno i loro posti: qui solo le date. */
export function InlineEditableDatesCard(props: InlineEditableDatesCardProps) {
  return <PlanningDatesPanel key={props.orderId} {...props} />;
}
function PlanningDatesPanel({orderId, expectedDate, warehouseArrivalDate, workStartDate, workEndDate,
  workStartTime, workEndTime, updatedAt, onOpenSchedule, dialogOpen, onDialogOpenChange, onRequestEdit, hideCard}: InlineEditableDatesCardProps) {
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
  const [internalOpen, setInternalOpen] = useState(false);
  const open = dialogOpen ?? internalOpen;
  const setOpen = (next: boolean) => { setInternalOpen(next); onDialogOpenChange?.(next); };
  const [draft, setDraft] = useState<OrderPlanningDates>(persisted);
  const [editVersion, setEditVersion] = useState(updatedAt);
  const [saving, setSaving] = useState(false);
  const phaseQuery = usePlanningPhases(orderId, companyId, open);
  const schedule = planningSchedule(phaseQuery.data ?? [], draft);
  const fmtDay = (value: string | null) => value ? format(parseISO(value), "dd/MM/yyyy", {locale: it}) : "Da definire";
  const refresh = () => {
    for (const key of [["order", orderId], ["orders", "detail", orderId], ["orders", "diary-header", orderId],
      ["calendar-orders"], ["appointments"], ["order-appointments", orderId], ["order-schedule-health", orderId],
      ["campo-lavoro", orderId], ["campo-lavori-assegnati"], ["order-conteggi-viste", orderId]])
      void qc.invalidateQueries({ queryKey: key });
  };
  const edit = () => { setDraft({...displayed}); setEditVersion(updatedAt); setOpen(true); };
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
  const inconsistent = validatePlanning(displayed);
  return <>
    {!hideCard && <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-orange-500" />Date del cantiere</CardTitle>
        {!readonly && <Button type="button" aria-label="Modifica date" variant="outline" size="sm" onClick={onRequestEdit ?? edit} className="min-h-10"><Pencil className="mr-1.5 h-3.5 w-3.5" /><span className="hidden sm:inline">Modifica date</span><span className="sm:hidden">Modifica</span></Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {DATE_VISIBILI.filter(([field]) => field !== "warehouse_arrival_date" || displayed[field]).map(([field, label]) => {
            const day = planningDay(displayed[field]);
            const time = field === "work_start_date" ? displayed.work_start_time : field === "work_end_date" ? displayed.work_end_time : null;
            return <div key={field}><dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={"mt-1 text-sm " + (day ? "font-medium" : "text-muted-foreground")}>{day ? format(parseISO(day), "d MMM yyyy", {locale: it}) : displayed[field] ? "Data da verificare" : "Da definire"}{time && day ? " · " + time : ""}</dd></div>;
          })}
        </dl>
        {inconsistent && <p role="alert" className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{inconsistent}</p>}
      </CardContent>
    </Card>}
    <Dialog open={open} onOpenChange={next => {if (!saving) setOpen(next);}}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Modifica date del cantiere</DialogTitle><DialogDescription>Definisci il periodo generale della commessa e confrontalo con le fasi del cronoprogramma.</DialogDescription></DialogHeader>
        <section aria-label="Periodo generale della commessa" className="space-y-3">
          <h3 className="text-sm font-semibold">Periodo lavori previsto</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DATE_FIELDS.slice(0, 2).map(([field, label]) => <div key={field} className="space-y-1.5"><Label htmlFor={orderId + "-" + field}>{label}</Label>
            <Input id={orderId + "-" + field} type="date" value={planningDay(draft[field])} disabled={saving}
              onChange={e => setDraft(previous => ({...previous, [field]: e.target.value || null,
                ...(field === "work_start_date" && !e.target.value ? {work_start_time: null} : {}),
                ...(field === "work_end_date" && !e.target.value ? {work_end_time: null} : {})}))} /></div>)}
          </div>
          {validatePlanning(draft) && <p role="alert" className="text-sm text-destructive">{validatePlanning(draft)}</p>}
        </section>
        <section aria-label="Confronto con il cronoprogramma" className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />Confronto con il cronoprogramma</h3>
          {phaseQuery.isError ? <div role="alert" className="text-sm text-destructive">Non è stato possibile leggere le date delle fasi. Non possiamo verificare la corrispondenza.<Button variant="ghost" size="sm" onClick={() => void phaseQuery.refetch()}>Riprova</Button></div>
            : phaseQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Lettura delle date delle fasi…</p>
            : schedule.rows.length === 0 ? <p className="text-sm text-muted-foreground">Non ci sono ancora fasi. Puoi impostare il periodo generale e pianificarle dal cronoprogramma.</p>
            : <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-sm font-medium">{schedule.start && schedule.end ? `${fmtDay(schedule.start)} → ${fmtDay(schedule.end)}` : "Periodo delle fasi da completare"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{schedule.rows.filter(row => row.complete).length} di {schedule.rows.length} fasi con entrambe le date previste</p></div>
                <Button variant="outline" size="sm" disabled={saving || phaseQuery.isFetching || !schedule.canAlign || schedule.samePeriod}
                  onClick={() => setDraft(previous => ({...previous, work_start_date: schedule.start, work_end_date: schedule.end}))}>
                  {schedule.samePeriod ? "Periodo allineato" : "Usa periodo delle fasi"}
                </Button>
              </div>
              {(schedule.outside > 0 || schedule.missing > 0 || schedule.invalid > 0) && <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                {schedule.outside > 0 && <li>{schedule.outside} {schedule.outside === 1 ? "fase fuori" : "fasi fuori"} dal periodo della commessa.</li>}
                {schedule.missing > 0 && <li>{schedule.missing} {schedule.missing === 1 ? "fase da pianificare" : "fasi da pianificare"}: completa inizio e fine prima di allineare il periodo.</li>}
                {schedule.invalid > 0 && <li>{schedule.invalid} {schedule.invalid === 1 ? "fase con date da correggere" : "fasi con date da correggere"} nel cronoprogramma.</li>}
              </ul>}
              {!schedule.outside && !schedule.missing && !schedule.invalid && !validatePlanning(draft) && draft.work_start_date && draft.work_end_date && <p className="text-xs text-emerald-700 dark:text-emerald-400">Tutte le fasi rientrano nel periodo lavori.</p>}
              <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Vedi le date delle fasi ({schedule.rows.length})</summary>
                <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-2">{schedule.rows.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b pb-2 last:border-0"><span className="font-medium">{row.name}</span><span className={row.invalid || row.outside ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground"}>{row.invalid ? "Date da correggere" : `${fmtDay(row.start || null)} → ${fmtDay(row.end || null)}`}</span></li>)}</ul>
              </details>
            </>}
          <p className="text-xs text-muted-foreground">“Usa periodo delle fasi” cambia solo inizio e fine qui sopra. Le date delle singole fasi e i dati reali restano quelli del cronoprogramma. Le modifiche si applicano con “Salva date”.</p>
          {onOpenSchedule && <Button type="button" variant="link" size="sm" className="h-auto p-0" disabled={saving} onClick={() => { setOpen(false); onOpenSchedule(); }}>Apri cronoprogramma<ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" /></Button>}
        </section>
        <details className="rounded-xl border p-4" open={!!(draft.expected_date || draft.warehouse_arrival_date || draft.work_start_time || draft.work_end_time)}>
          <summary className="cursor-pointer text-sm font-semibold">Materiali, consegna e orari</summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DATE_FIELDS.slice(2).map(([field, label]) => <div key={field} className="space-y-1.5"><Label htmlFor={orderId + "-" + field}>{field === "expected_date" ? "Consegna / posa prevista" : label}</Label>
            <Input id={orderId + "-" + field} type="date" value={planningDay(draft[field])} disabled={saving} onChange={e => setDraft(previous => ({...previous, [field]: e.target.value || null}))} /></div>)}
          {([["work_start_time", "Ora inizio", "work_start_date"], ["work_end_time", "Ora fine", "work_end_date"]] as const).map(([field, label, day]) => <div key={field} className="space-y-1.5"><Label htmlFor={orderId + "-" + field}>{label} <span className="text-xs text-muted-foreground">facoltativa</span></Label>
            <Input id={orderId + "-" + field} type="time" value={draft[field] ?? ""} disabled={saving || !draft[day]} onChange={e => setDraft(previous => ({...previous, [field]: e.target.value || null}))} /></div>)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">La consegna / posa è un traguardo distinto dalla fine lavori. Senza orari, il calendario considera l'intera giornata.</p>
        </details>
        {schedule.warnings.length > 0 && <ul role="status" className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">{schedule.warnings.map(message => <li key={message}>{message}</li>)}</ul>}
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button><Button onClick={save} disabled={saving || readonly}>{saving ? "Salvataggio…" : "Salva date"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

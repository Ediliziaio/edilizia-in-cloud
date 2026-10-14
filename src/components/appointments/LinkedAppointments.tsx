import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, CalendarClock, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AppointmentDialog, type AppointmentData } from "./AppointmentDialog";
import { APPOINTMENT_LABELS, comparePlanningAppointments, isArchivedAppointment, isLegacyPlanningMarker, planningDay, planningTime } from "@/lib/orders/planning";

interface LinkedAppointmentsProps {
  orderId: string;
  editable?: boolean;
  defaultAddress?: string | null;
}
export function LinkedAppointments({ orderId, editable = true, defaultAddress }: LinkedAppointmentsProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const readonly = !editable || !companyId;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentData | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { data: appointments = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["order-appointments", orderId, companyId],
    staleTime: 60_000, retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("appointments").select("*")
        .eq("company_id", companyId!).eq("order_id", orderId)
        .order("appointment_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && !!orderId,
  });
  const refresh = () => {
    for (const key of [["order-appointments", orderId], ["appointments"], ["calendar-orders"],
      ["orders", "detail", orderId], ["order", orderId], ["order-next-task", orderId]])
      void qc.invalidateQueries({queryKey: key});
  };
  const toggle = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      if (readonly) throw new Error("Appuntamento in sola lettura");
      const {data, error} = await supabase.from("appointments").update({is_completed: completed})
        .eq("id", id).eq("order_id", orderId).eq("company_id", companyId!)
        .select("id, is_completed").maybeSingle();
      if (error) throw error;
      if (!data || data.is_completed !== completed) throw new Error("Appuntamento non aggiornato");
    },
    onSuccess: refresh,
    onError: () => toast.error("Appuntamento non aggiornato. Riprova."),
  });
  const active = appointments.filter(a => !isArchivedAppointment(a)).sort(comparePlanningAppointments);
  const history = appointments.filter(isArchivedAppointment).sort((a, b) => comparePlanningAppointments(b, a));
  const today = format(new Date(), "yyyy-MM-dd");
  const edit = (apt: typeof appointments[number]) => {
    if (readonly) return;
    // Keep the full address, reminders and calendar references when editing.
    setEditing({...apt} as AppointmentData);
    setDialogOpen(true);
  };
  const row = (apt: typeof appointments[number]) => {
    const day = planningDay(apt.appointment_date);
    const time = planningTime(apt.appointment_time);
    const cancelled = apt.status === "annullato";
    const legacy = isLegacyPlanningMarker(apt);
    const overdue = !!day && day < today && !isArchivedAppointment(apt);
    return <div key={apt.id} className="flex items-start gap-2 py-2">
      <Checkbox className="mt-1" checked={!!apt.is_completed}
        disabled={readonly || cancelled || legacy || toggle.isPending}
        aria-label={"Completa appuntamento " + apt.title}
        onCheckedChange={value => {if (typeof value === "boolean") toggle.mutate({id: apt.id, completed: value});}} />
      <div className="min-w-0 flex-1">
        <button type="button" className={"block w-full break-words text-left text-sm font-medium " + (apt.is_completed || cancelled ? "text-muted-foreground" : "")}
          disabled={readonly} onClick={() => edit(apt)}>{apt.title}</button>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{APPOINTMENT_LABELS[apt.appointment_type] ?? apt.appointment_type}</span>
          <span>{day ? format(parseISO(day), "d MMM yyyy", {locale: it}) : "Data da verificare"}</span>
          {time && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{time}{planningTime(apt.appointment_end_time) ? "–" + planningTime(apt.appointment_end_time) : ""}</span>}
          {cancelled ? <span>Annullato</span> : legacy ? <span>Tappa automatica precedente</span> : apt.is_completed ? <span>Completato</span> : overdue ? <span className="text-amber-700">Da verificare</span> : null}
        </div>
      </div>
    </div>;
  };
  return <>
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-orange-500" />Appuntamenti
          {!isLoading && !isError && active.length > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{active.length}</span>}
        </CardTitle>
        {!readonly && <Button aria-label="Nuovo appuntamento" variant="outline" size="sm" className="min-h-10" onClick={() => {setEditing(null); setDialogOpen(true);}}><Plus className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Nuovo appuntamento</span><span className="sm:hidden">Nuovo</span></Button>}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? <p role="status" className="text-sm text-muted-foreground">Caricamento appuntamenti…</p>
          : isError ? <div role="alert" className="space-y-2 text-sm"><p>Non riesco a caricare gli appuntamenti. Non significa che siano assenti.</p><Button variant="outline" size="sm" onClick={() => refetch()}>Riprova appuntamenti</Button></div>
          : <>
            {active.length === 0 ? <p className="text-sm text-muted-foreground">Nessun appuntamento aperto.</p> : <div className="divide-y">{(showAll ? active : active.slice(0, 3)).map(row)}</div>}
            {active.length > 3 && <Button variant="ghost" size="sm" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? "Mostra meno" : "Mostra altri (" + (active.length - 3) + ")"}</Button>}
            {history.length > 0 && <details className="border-t pt-2"><summary className="cursor-pointer py-2 text-xs text-muted-foreground">Storico appuntamenti ({history.length})</summary><div className="divide-y">{history.map(row)}</div></details>}
          </>}
      </CardContent>
    </Card>
    <AppointmentDialog open={dialogOpen} onOpenChange={setDialogOpen} appointment={editing}
      onSaved={refresh} onDeleted={refresh} defaultOrderId={orderId} defaultAddress={defaultAddress}
      defaultAppointmentType="sopralluogo_preventivo" showOrderSelect={false} hideMarketingFields requireTime />
  </>;
}

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Calendar as CalendarLucide, CalendarPlus, CheckCircle2, Hammer, Ruler, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface InlineEditableDatesCardProps {
  orderId: string;
  expectedDate?: string | null;
  warehouseArrivalDate?: string | null;
  workStartDate?: string | null;
  workEndDate?: string | null;
  orderCode?: string | null;
  orderDescription?: string | null;
  defaultAddress?: string | null;
}

function InlineDatePicker({
  label,
  value,
  onSelect,
  disabled = false,
}: {
  label: string;
  value: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{label}</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal h-9 border-slate-200 hover:border-orange-300 hover:bg-orange-50/40",
              !value && "text-slate-400"
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5 text-orange-500" />
            {value ? format(value, "d MMM yyyy", { locale: it }) : "Non impostata"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onSelect}
            locale={it}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function InlineEditableDatesCard({
  orderId,
  expectedDate,
  warehouseArrivalDate,
  workStartDate,
  workEndDate,
  orderCode,
  orderDescription,
  defaultAddress,
}: InlineEditableDatesCardProps) {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();

  const parse = (v?: string | null) => (v ? parseISO(v) : undefined);
  const [expected, setExpected] = useState<Date | undefined>(parse(expectedDate));
  const [warehouse, setWarehouse] = useState<Date | undefined>(parse(warehouseArrivalDate));
  const [workStart, setWorkStart] = useState<Date | undefined>(parse(workStartDate));
  const [workEnd, setWorkEnd] = useState<Date | undefined>(parse(workEndDate));
  const [workPlanOpen, setWorkPlanOpen] = useState(false);
  const [workPlanStart, setWorkPlanStart] = useState<Date | undefined>(parse(workStartDate));
  const [workPlanEnd, setWorkPlanEnd] = useState<Date | undefined>(parse(workEndDate));
  const [savingWorkPlan, setSavingWorkPlan] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [appointmentPreset, setAppointmentPreset] = useState<{
    type: string;
    title: string;
    date?: string;
  } | null>(null);

  const orderRef = [orderCode, orderDescription].filter(Boolean).join(" - ");

  useEffect(() => {
    setExpected(parse(expectedDate));
    setWarehouse(parse(warehouseArrivalDate));
    setWorkStart(parse(workStartDate));
    setWorkEnd(parse(workEndDate));
    setWorkPlanStart(parse(workStartDate));
    setWorkPlanEnd(parse(workEndDate));
  }, [expectedDate, warehouseArrivalDate, workStartDate, workEndDate]);

  const syncWorkAppointment = useCallback(
    async (type: "inizio_lavori" | "fine_lavori", date: Date | undefined) => {
      if (!effectiveCompany?.id) return;

      const { data: existing, error: findError } = await supabase
        .from("appointments")
        .select("id")
        .eq("company_id", effectiveCompany.id)
        .eq("order_id", orderId)
        .eq("appointment_type", type)
        .limit(1)
        .maybeSingle();
      if (findError) throw findError;

      if (!date) {
        if (existing?.id) {
          const { error } = await supabase.from("appointments").delete().eq("id", existing.id);
          if (error) throw error;
        }
        return;
      }

      if (!user?.id && !existing?.id) return;

      const dateValue = format(date, "yyyy-MM-dd");
      const title = `${type === "inizio_lavori" ? "Inizio lavori" : "Fine lavori"}${orderRef ? ` · ${orderRef}` : ""}`;
      const payload = {
        company_id: effectiveCompany.id,
        order_id: orderId,
        title,
        description: type === "inizio_lavori"
          ? "Milestone operativo di avvio lavori collegato alla commessa."
          : "Milestone operativo di fine lavori collegato alla commessa.",
        appointment_date: dateValue,
        appointment_time: null,
        appointment_end_time: null,
        appointment_type: type,
        assigned_to: null,
        calendar_id: null,
        contact_id: null,
        status: "confermato",
        reminder_minutes: null,
        reminder_sent: false,
        formatted_address: defaultAddress || null,
        created_by: user?.id,
      };

      if (existing?.id) {
        const { created_by: _createdBy, company_id: _companyId, ...updatePayload } = payload;
        const { error } = await supabase.from("appointments").update(updatePayload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("appointments").insert(payload);
        if (error) throw error;
      }
    },
    [defaultAddress, effectiveCompany?.id, orderId, orderRef, user?.id]
  );

  const saveField = useCallback(
    async (field: string, date: Date | undefined) => {
      setSavingDates(true);
      try {
        const value = date ? format(date, "yyyy-MM-dd") : null;
        const { error } = await supabase
          .from("orders")
          .update({ [field]: value })
          .eq("id", orderId);
        if (error) {
          toast.error("Errore nel salvataggio della data");
          logger.error("Error saving date:", error);
        } else {
          if (field === "work_start_date") {
            await syncWorkAppointment("inizio_lavori", date);
          }
          if (field === "work_end_date") {
            await syncWorkAppointment("fine_lavori", date);
          }
          toast.success("Data aggiornata");
          queryClient.invalidateQueries({ queryKey: ["order", orderId] });
          queryClient.invalidateQueries({ queryKey: ["orders", "detail", orderId] });
          queryClient.invalidateQueries({ queryKey: ["calendar-orders"] });
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
        }
      } finally {
        setSavingDates(false);
      }
    },
    [orderId, queryClient, syncWorkAppointment]
  );

  const handleChange = (
    field: string,
    setter: (d: Date | undefined) => void,
    date: Date | undefined
  ) => {
    if (field === "work_start_date" && date && workEnd && date > workEnd) {
      toast.error("La data inizio lavori non può essere dopo la fine");
      return;
    }
    if (field === "work_end_date" && date && workStart && date < workStart) {
      toast.error("La data fine lavori non può essere prima dell'inizio");
      return;
    }
    setter(date);
    saveField(field, date);
  };

  const openPlanner = (type: string, label: string, date?: Date) => {
    setAppointmentPreset({
      type,
      title: `${label}${orderRef ? ` · ${orderRef}` : ""}`,
      date: date ? format(date, "yyyy-MM-dd") : undefined,
    });
    setAppointmentOpen(true);
  };

  const openWorkPlanner = () => {
    setWorkPlanStart(workStart);
    setWorkPlanEnd(workEnd);
    setWorkPlanOpen(true);
  };

  const saveWorkPlan = async () => {
    if (!workPlanStart || !workPlanEnd) {
      toast.error("Imposta data inizio e data fine lavori");
      return;
    }
    if (workPlanEnd < workPlanStart) {
      toast.error("La data fine lavori non può essere prima dell'inizio");
      return;
    }

    setSavingWorkPlan(true);
    try {
      const startValue = format(workPlanStart, "yyyy-MM-dd");
      const endValue = format(workPlanEnd, "yyyy-MM-dd");
      const { error } = await supabase
        .from("orders")
        .update({ work_start_date: startValue, work_end_date: endValue })
        .eq("id", orderId);
      if (error) throw error;

      await syncWorkAppointment("inizio_lavori", workPlanStart);
      await syncWorkAppointment("fine_lavori", workPlanEnd);

      setWorkStart(workPlanStart);
      setWorkEnd(workPlanEnd);
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", orderId] });
      queryClient.invalidateQueries({ queryKey: ["calendar-orders"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Pianificazione lavori aggiornata");
      setWorkPlanOpen(false);
    } catch (error) {
      logger.error("Error saving work plan:", error);
      toast.error("Errore nella pianificazione lavori");
    } finally {
      setSavingWorkPlan(false);
    }
  };

  return (
    <>
      <QuoteCard
        title="Tempistiche e calendario"
        icon={<CalendarLucide className="h-4 w-4" />}
      >
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <div className="mb-2 flex items-start gap-2">
            <CalendarPlus className="mt-0.5 h-4 w-4 text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Pianifica attività di commessa</p>
              <p className="text-xs text-slate-600">
                Gestisci appuntamenti, rilievi e pianificazione lavori nel Calendario Lavori.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start bg-white"
              onClick={openWorkPlanner}
            >
              <Hammer className="mr-2 h-4 w-4 text-orange-600" />
              Pianifica lavori
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start bg-white"
              onClick={() => openPlanner("sopralluogo_preventivo", "Sopralluogo", expected ?? workStart)}
            >
              <Search className="mr-2 h-4 w-4 text-blue-600" />
              Sopralluogo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start bg-white"
              onClick={() => openPlanner("rilievo_tecnico", "Rilievo misure", expected ?? workStart)}
            >
              <Ruler className="mr-2 h-4 w-4 text-emerald-600" />
              Rilievo misure
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start bg-white"
              onClick={() => openPlanner("collaudo", "Collaudo lavori", workEnd ?? expected)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4 text-orange-600" />
              Collaudo
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <InlineDatePicker
            label="Data Posa Prevista"
            value={expected}
            onSelect={(d) => handleChange("expected_date", setExpected, d)}
            disabled={savingDates}
          />
          <InlineDatePicker
            label="Arrivo Merce"
            value={warehouse}
            onSelect={(d) => handleChange("warehouse_arrival_date", setWarehouse, d)}
            disabled={savingDates}
          />
          <InlineDatePicker
            label="Inizio Lavori"
            value={workStart}
            onSelect={(d) => handleChange("work_start_date", setWorkStart, d)}
            disabled={savingDates}
          />
          <InlineDatePicker
            label="Fine Lavori"
            value={workEnd}
            onSelect={(d) => handleChange("work_end_date", setWorkEnd, d)}
            disabled={savingDates}
          />
        </div>
      </QuoteCard>

      <AppointmentDialog
        open={appointmentOpen}
        onOpenChange={setAppointmentOpen}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["order-appointments", orderId] });
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
          queryClient.invalidateQueries({ queryKey: ["calendar-orders"] });
          setAppointmentOpen(false);
        }}
        defaultOrderId={orderId}
        defaultDate={appointmentPreset?.date}
        defaultAppointmentType={appointmentPreset?.type ?? "sopralluogo_preventivo"}
        defaultTitle={appointmentPreset?.title ?? ""}
        defaultAddress={defaultAddress}
        showOrderSelect={false}
        requireTime
        hideMarketingFields
      />

      <Dialog open={workPlanOpen} onOpenChange={setWorkPlanOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pianifica lavori</DialogTitle>
            <DialogDescription>
              Imposta l'intervallo operativo della commessa. Le due milestone saranno visibili nel Calendario Lavori.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <InlineDatePicker
              label="Data inizio"
              value={workPlanStart}
              onSelect={setWorkPlanStart}
            />
            <InlineDatePicker
              label="Data fine"
              value={workPlanEnd}
              onSelect={setWorkPlanEnd}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkPlanOpen(false)} disabled={savingWorkPlan}>
              Annulla
            </Button>
            <Button onClick={saveWorkPlan} disabled={savingWorkPlan}>
              {savingWorkPlan ? "Salvataggio..." : "Salva pianificazione"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { CalendarOrder } from "@/types/calendar";

interface EditOrderDatesDialogProps {
  order: CalendarOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

interface DateFieldProps {
  label: string;
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
}

function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "d MMMM yyyy", { locale: it }) : "Seleziona data"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            locale={it}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function EditOrderDatesDialog({
  order,
  open,
  onOpenChange,
  onSave,
}: EditOrderDatesDialogProps) {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const [workStartDate, setWorkStartDate] = useState<Date | undefined>();
  const [workEndDate, setWorkEndDate] = useState<Date | undefined>();
  const [expectedDate, setExpectedDate] = useState<Date | undefined>();
  const [warehouseArrivalDate, setWarehouseArrivalDate] = useState<Date | undefined>();

  // Reset state when order changes or dialog opens
  useEffect(() => {
    if (open && order) {
      setWorkStartDate(order.work_start_date ? parseISO(order.work_start_date) : undefined);
      setWorkEndDate(order.work_end_date ? parseISO(order.work_end_date) : undefined);
      setExpectedDate(order.expected_date ? parseISO(order.expected_date) : undefined);
      setWarehouseArrivalDate(
        order.warehouse_arrival_date ? parseISO(order.warehouse_arrival_date) : undefined
      );
    }
  }, [open, order]);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          work_start_date: workStartDate ? format(workStartDate, "yyyy-MM-dd") : null,
          work_end_date: workEndDate ? format(workEndDate, "yyyy-MM-dd") : null,
          expected_date: expectedDate ? format(expectedDate, "yyyy-MM-dd") : null,
          warehouse_arrival_date: warehouseArrivalDate
            ? format(warehouseArrivalDate, "yyyy-MM-dd")
            : null,
        })
        .eq("id", order.id);

      if (error) throw error;

      toast.success("Date aggiornate con successo");
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      onSave?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Errore aggiornamento date:", error);
      toast.error("Errore durante l'aggiornamento delle date");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Modifica Date - {order.order_code || "Ordine"}</DialogTitle>
          <DialogDescription>
            {order.customer.first_name} {order.customer.last_name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <DateField
            label="Data Inizio Lavori"
            value={workStartDate}
            onChange={setWorkStartDate}
          />
          <DateField
            label="Data Fine Lavori"
            value={workEndDate}
            onChange={setWorkEndDate}
          />

          <Separator className="my-2" />

          <DateField
            label="Data Posa Prevista"
            value={expectedDate}
            onChange={setExpectedDate}
          />
          <DateField
            label="Arrivo Merce"
            value={warehouseArrivalDate}
            onChange={setWarehouseArrivalDate}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

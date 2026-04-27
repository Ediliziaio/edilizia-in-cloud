import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Calendar as CalendarLucide } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
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
}

function InlineDatePicker({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: Date | undefined;
  onSelect: (d: Date | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{label}</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
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
}: InlineEditableDatesCardProps) {
  const queryClient = useQueryClient();

  const parse = (v?: string | null) => (v ? parseISO(v) : undefined);
  const [expected, setExpected] = useState<Date | undefined>(parse(expectedDate));
  const [warehouse, setWarehouse] = useState<Date | undefined>(parse(warehouseArrivalDate));
  const [workStart, setWorkStart] = useState<Date | undefined>(parse(workStartDate));
  const [workEnd, setWorkEnd] = useState<Date | undefined>(parse(workEndDate));

  useEffect(() => {
    setExpected(parse(expectedDate));
    setWarehouse(parse(warehouseArrivalDate));
    setWorkStart(parse(workStartDate));
    setWorkEnd(parse(workEndDate));
  }, [expectedDate, warehouseArrivalDate, workStartDate, workEndDate]);

  const saveField = useCallback(
    async (field: string, date: Date | undefined) => {
      const value = date ? format(date, "yyyy-MM-dd") : null;
      const { error } = await supabase
        .from("orders")
        .update({ [field]: value })
        .eq("id", orderId);
      if (error) {
        toast.error("Errore nel salvataggio della data");
        logger.error("Error saving date:", error);
      } else {
        toast.success("Data aggiornata");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      }
    },
    [orderId, queryClient]
  );

  const handleChange = (
    field: string,
    setter: (d: Date | undefined) => void,
    date: Date | undefined
  ) => {
    setter(date);
    saveField(field, date);
  };

  return (
    <QuoteCard
      title="Tempistiche per il Cliente"
      icon={<CalendarLucide className="h-4 w-4" />}
    >
      <div className="grid grid-cols-1 gap-3">
        <InlineDatePicker
          label="Data Posa Prevista"
          value={expected}
          onSelect={(d) => handleChange("expected_date", setExpected, d)}
        />
        <InlineDatePicker
          label="Arrivo Merce"
          value={warehouse}
          onSelect={(d) => handleChange("warehouse_arrival_date", setWarehouse, d)}
        />
        <InlineDatePicker
          label="Inizio Lavori"
          value={workStart}
          onSelect={(d) => handleChange("work_start_date", setWorkStart, d)}
        />
        <InlineDatePicker
          label="Fine Lavori"
          value={workEnd}
          onSelect={(d) => handleChange("work_end_date", setWorkEnd, d)}
        />
      </div>
    </QuoteCard>
  );
}

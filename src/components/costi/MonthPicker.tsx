// Selettore mese compatto e condiviso dall'area Costi (Panoramica + Personale).
import { addMonths, format, isSameMonth, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MonthPicker({
  month,
  onChange,
}: {
  month: Date;
  onChange: (m: Date) => void;
}) {
  const now = new Date();
  const isCurrent = isSameMonth(month, now);
  const label = format(month, "MMMM yyyy", { locale: it });

  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(startOfMonth(addMonths(month, -1)))}
        aria-label="Mese precedente"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[130px] text-center text-sm font-semibold capitalize text-slate-900">
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onChange(startOfMonth(addMonths(month, 1)))}
        aria-label="Mese successivo"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!isCurrent && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onChange(startOfMonth(now))}
        >
          Oggi
        </Button>
      )}
    </div>
  );
}

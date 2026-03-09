import { useState, useCallback } from "react";
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";

export type DateRange = { from: Date; to: Date; label: string };

const PRESETS: { label: string; getRange: () => { from: Date; to: Date } }[] = [
  { label: "Ultimi 7 giorni", getRange: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
  { label: "Ultimi 30 giorni", getRange: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: "Ultimi 90 giorni", getRange: () => ({ from: subDays(new Date(), 90), to: new Date() }) },
  { label: "Mese corrente", getRange: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: "Mese scorso", getRange: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: "Anno corrente", getRange: () => ({ from: startOfYear(new Date()), to: new Date() }) },
  { label: "Ultimi 12 mesi", getRange: () => ({ from: subMonths(new Date(), 12), to: new Date() }) },
];

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DashboardDateFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Calendar className="h-4 w-4" />
          <span className="hidden sm:inline">{value.label}</span>
          <Badge variant="secondary" className="text-xs font-normal hidden md:inline-flex">
            {format(value.from, "dd MMM", { locale: it })} — {format(value.to, "dd MMM yy", { locale: it })}
          </Badge>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="border-r p-2 space-y-1 min-w-[160px]">
            <p className="text-xs font-medium text-muted-foreground px-2 py-1">Periodo</p>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className={`w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors hover:bg-muted ${
                  value.label === p.label ? "bg-primary/10 text-primary font-medium" : ""
                }`}
                onClick={() => {
                  const range = p.getRange();
                  onChange({ ...range, label: p.label });
                  setOpen(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="p-2">
            <CalendarPicker
              mode="range"
              selected={{ from: value.from, to: value.to }}
              onSelect={(range) => {
                if (range?.from && range?.to) {
                  onChange({
                    from: range.from,
                    to: range.to,
                    label: `${format(range.from, "dd/MM")} — ${format(range.to, "dd/MM")}`,
                  });
                  setOpen(false);
                }
              }}
              numberOfMonths={1}
              locale={it}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function getDefaultDateRange(): DateRange {
  return {
    from: subDays(new Date(), 30),
    to: new Date(),
    label: "Ultimi 30 giorni",
  };
}

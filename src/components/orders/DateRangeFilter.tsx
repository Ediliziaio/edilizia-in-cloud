import { useState } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface DateRangeFilterProps {
  label: string;
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
}

export function DateRangeFilter({ label, range, onRangeChange }: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasValue = range.from || range.to;

  const formatRange = () => {
    if (!range.from && !range.to) return label;
    
    const fromStr = range.from ? format(range.from, "dd/MM", { locale: it }) : "...";
    const toStr = range.to ? format(range.to, "dd/MM", { locale: it }) : "...";
    
    return `${fromStr} - ${toStr}`;
  };

  const setToday = () => {
    const today = new Date();
    onRangeChange({ from: startOfDay(today), to: endOfDay(today) });
    setIsOpen(false);
  };

  const setThisWeek = () => {
    const today = new Date();
    onRangeChange({ 
      from: startOfWeek(today, { locale: it }), 
      to: endOfWeek(today, { locale: it }) 
    });
    setIsOpen(false);
  };

  const setThisMonth = () => {
    const today = new Date();
    onRangeChange({ from: startOfMonth(today), to: endOfMonth(today) });
    setIsOpen(false);
  };

  const setNext7Days = () => {
    const today = new Date();
    onRangeChange({ from: startOfDay(today), to: endOfDay(addDays(today, 7)) });
    setIsOpen(false);
  };

  const clearRange = () => {
    onRangeChange({ from: undefined, to: undefined });
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full sm:w-[180px] justify-start text-left font-normal",
            hasValue && "border-primary"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className="truncate">{formatRange()}</span>
          {hasValue && (
            <X 
              className="ml-auto h-4 w-4 opacity-50 hover:opacity-100" 
              onClick={(e) => {
                e.stopPropagation();
                clearRange();
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3 space-y-2">
          <p className="text-sm font-medium text-muted-foreground mb-2">Filtri rapidi</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={setToday}>
              Oggi
            </Button>
            <Button size="sm" variant="ghost" onClick={setThisWeek}>
              Questa settimana
            </Button>
            <Button size="sm" variant="ghost" onClick={setThisMonth}>
              Questo mese
            </Button>
            <Button size="sm" variant="ghost" onClick={setNext7Days}>
              Prossimi 7 giorni
            </Button>
          </div>
        </div>
        <Separator />
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Da</p>
              <Calendar
                mode="single"
                selected={range.from}
                onSelect={(date) => onRangeChange({ ...range, from: date })}
                className="p-0 pointer-events-auto"
                locale={it}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">A</p>
              <Calendar
                mode="single"
                selected={range.to}
                onSelect={(date) => onRangeChange({ ...range, to: date })}
                className="p-0 pointer-events-auto"
                locale={it}
              />
            </div>
          </div>
          {hasValue && (
            <Button variant="outline" size="sm" className="w-full" onClick={clearRange}>
              Cancella filtro
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

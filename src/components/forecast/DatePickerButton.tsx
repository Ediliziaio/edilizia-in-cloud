import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerButtonProps {
  label?: string;
  placeholder?: string;
  date: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  onClear?: () => void;
  formatStr?: string;
}

export function DatePickerButton({ label, placeholder, date, onSelect, onClear, formatStr }: DatePickerButtonProps) {
  const displayFormat = formatStr || (onClear ? "MMM yyyy" : "dd/MM/yy");
  const displayText = date
    ? format(date, displayFormat, { locale: it })
    : (placeholder || label || "Seleziona data");

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              onClear ? "h-8 gap-1 text-xs font-normal" : "h-9 gap-2",
              date && !onClear && "border-primary",
              !date && onClear && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {displayText}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={onSelect}
            locale={it}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      {onClear && date && (
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClear}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

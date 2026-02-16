import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerButtonProps {
  label: string;
  date: Date | undefined;
  onSelect: (d: Date | undefined) => void;
}

export function DatePickerButton({ label, date, onSelect }: DatePickerButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 gap-2", date && "border-primary")}>
          <CalendarIcon className="h-3.5 w-3.5" />
          {date ? format(date, "dd/MM/yy", { locale: it }) : label}
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
  );
}

import { memo } from "react";
import { CalendarDays, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { CruscottoFiltersState, CruscottoDatePreset } from "@/hooks/useCruscottoData";

interface Props {
  filters: CruscottoFiltersState;
  onUpdate: (partial: Partial<CruscottoFiltersState>) => void;
}

const DATE_PRESETS: { value: CruscottoDatePreset; label: string }[] = [
  { value: "today", label: "Oggi" },
  { value: "yesterday", label: "Ieri" },
  { value: "last7", label: "7 giorni" },
  { value: "last30", label: "30 giorni" },
  { value: "month", label: "Mese" },
  { value: "quarter", label: "Trimestre" },
  { value: "custom", label: "Custom" },
];

export const CruscottoFilters = memo(function CruscottoFilters({ filters, onUpdate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-card overflow-x-auto">
      <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

      <div className="flex items-center gap-1 rounded-lg border bg-background p-1 shrink-0">
        {DATE_PRESETS.map(p => (
          <Button
            key={p.value}
            variant={filters.datePreset === p.value ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => onUpdate({ datePreset: p.value })}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {filters.datePreset === "custom" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              {format(filters.dateFrom, "dd MMM", { locale: it })} – {format(filters.dateTo, "dd MMM", { locale: it })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: filters.dateFrom, to: filters.dateTo }}
              onSelect={(range) => {
                if (range?.from) onUpdate({ dateFrom: range.from, dateTo: range.to || range.from });
              }}
              locale={it}
              numberOfMonths={2}
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
});

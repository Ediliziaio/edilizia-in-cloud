import { CalendarDays, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import type { DashboardFiltersState, DatePreset } from "@/hooks/useMarketingDashboard";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  filters: DashboardFiltersState;
  onUpdate: (partial: Partial<DashboardFiltersState>) => void;
}

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Oggi" },
  { value: "yesterday", label: "Ieri" },
  { value: "last7", label: "7 giorni" },
  { value: "last30", label: "30 giorni" },
  { value: "month", label: "Mese" },
  { value: "custom", label: "Personalizzato" },
];

export function DashboardFilters({ filters, onUpdate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <Filter className="h-4 w-4 text-muted-foreground" />

      {/* Date presets */}
      <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
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

      {/* Custom date range */}
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
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Active filters count */}
      {(filters.assignedUserIds.length > 0 || filters.sources.length > 0 || filters.pipelineId) && (
        <Badge variant="secondary" className="text-xs">
          {[filters.assignedUserIds.length > 0 && "Utente", filters.sources.length > 0 && "Fonte", filters.pipelineId && "Pipeline"].filter(Boolean).join(", ")}
        </Badge>
      )}
    </div>
  );
}

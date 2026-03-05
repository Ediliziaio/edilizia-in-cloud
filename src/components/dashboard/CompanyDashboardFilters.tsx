import { useState } from "react";
import { CalendarDays, Filter, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type DatePreset = "today" | "yesterday" | "last7" | "last30" | "month" | "year" | "custom";

export interface CompanyDashboardFiltersState {
  datePreset: DatePreset;
  dateFrom: Date;
  dateTo: Date;
  statusId: string | null;
}

interface Props {
  filters: CompanyDashboardFiltersState;
  onUpdate: (partial: Partial<CompanyDashboardFiltersState>) => void;
}

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "year", label: "Anno" },
  { value: "month", label: "Mese" },
  { value: "last30", label: "30 giorni" },
  { value: "last7", label: "7 giorni" },
  { value: "today", label: "Oggi" },
  { value: "yesterday", label: "Ieri" },
  { value: "custom", label: "Personalizzato" },
];

export function CompanyDashboardFilters({ filters, onUpdate }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Fetch order statuses
  const { data: orderStatuses } = useQuery({
    queryKey: ["dashboard-order-statuses", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_statuses")
        .select("id, name, color")
        .eq("company_id", companyId!)
        .order("position");
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 300_000,
  });

  const activeFilterCount = [
    !!filters.statusId,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <Filter className="h-4 w-4 text-muted-foreground" />

      {/* Date presets */}
      <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
        {DATE_PRESETS.map(p =>
          p.value === "custom" ? (
            <Popover key="custom" open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={filters.datePreset === "custom" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5 gap-1.5"
                  onClick={() => {
                    onUpdate({ datePreset: "custom" });
                    setCustomOpen(true);
                  }}
                >
                  {filters.datePreset === "custom" ? (
                    <>
                      <CalendarDays className="h-3.5 w-3.5" />
                      {format(filters.dateFrom, "dd MMM", { locale: it })} – {format(filters.dateTo, "dd MMM", { locale: it })}
                    </>
                  ) : (
                    p.label
                  )}
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
          ) : (
            <Button
              key={p.value}
              variant={filters.datePreset === p.value ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => onUpdate({ datePreset: p.value })}
            >
              {p.label}
            </Button>
          )
        )}
      </div>

      {/* Order status filter */}
      {orderStatuses && orderStatuses.length > 0 && (
        <Select
          value={filters.statusId || "all"}
          onValueChange={(v) => onUpdate({ statusId: v === "all" ? null : v })}
        >
          <SelectTrigger className="h-7 w-auto text-xs gap-1.5 border">
            <ListFilter className="h-3.5 w-3.5" />
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {orderStatuses.map(s => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Active filters count */}
      {activeFilterCount > 0 && (
        <span className="text-xs text-muted-foreground">
          {activeFilterCount} filtri attivi
        </span>
      )}
    </div>
  );
}

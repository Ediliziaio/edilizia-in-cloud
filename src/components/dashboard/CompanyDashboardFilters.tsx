import { CalendarDays, Filter, Users, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type DatePreset = "today" | "yesterday" | "last7" | "last30" | "month" | "custom";

export interface CompanyDashboardFiltersState {
  datePreset: DatePreset;
  dateFrom: Date;
  dateTo: Date;
  statusId: string | null;
  customerIds: string[];
}

interface Props {
  filters: CompanyDashboardFiltersState;
  onUpdate: (partial: Partial<CompanyDashboardFiltersState>) => void;
}

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Oggi" },
  { value: "yesterday", label: "Ieri" },
  { value: "last7", label: "7 giorni" },
  { value: "last30", label: "30 giorni" },
  { value: "month", label: "Mese" },
  { value: "custom", label: "Personalizzato" },
];

export function CompanyDashboardFilters({ filters, onUpdate }: Props) {
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

  // Fetch customers (distinct from orders)
  const { data: customers } = useQuery({
    queryKey: ["dashboard-customers", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("customer:profiles!orders_customer_id_fkey(id, first_name, last_name)")
        .eq("company_id", companyId!);
      
      const map = new Map<string, { id: string; first_name: string; last_name: string }>();
      (data || []).forEach((o: any) => {
        if (o.customer?.id) map.set(o.customer.id, o.customer);
      });
      return Array.from(map.values()).sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      );
    },
    enabled: !!companyId,
    staleTime: 300_000,
  });

  const toggleCustomer = useCallback((customerId: string) => {
    const current = filters.customerIds;
    const next = current.includes(customerId)
      ? current.filter(id => id !== customerId)
      : [...current, customerId];
    onUpdate({ customerIds: next });
  }, [filters.customerIds, onUpdate]);

  const activeFilterCount = [
    !!filters.statusId,
    filters.customerIds.length > 0,
  ].filter(Boolean).length;

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
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      )}

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

      {/* Customer filter */}
      {customers && customers.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Cliente
              {filters.customerIds.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{filters.customerIds.length}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <ScrollArea className="max-h-48">
              <div className="space-y-1">
                {customers.map(c => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox
                      checked={filters.customerIds.includes(c.id)}
                      onCheckedChange={() => toggleCustomer(c.id)}
                    />
                    {c.first_name} {c.last_name}
                  </label>
                ))}
              </div>
            </ScrollArea>
            {filters.customerIds.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => onUpdate({ customerIds: [] })}>
                Cancella filtro
              </Button>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* Active filters count */}
      {activeFilterCount > 0 && (
        <Badge variant="secondary" className="text-xs">
          {activeFilterCount} filtri attivi
        </Badge>
      )}
    </div>
  );
}

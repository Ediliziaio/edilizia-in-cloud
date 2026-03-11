import { CalendarDays, Filter, Users, Layers, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DashboardFiltersState, DatePreset } from "@/hooks/useMarketingDashboard";
import { format } from "date-fns";
import { useCallback } from "react";
import { it } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  filters: DashboardFiltersState;
  onUpdate: (partial: Partial<DashboardFiltersState>) => void;
  hideUserFilter?: boolean;
  compact?: boolean;
}

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Oggi" },
  { value: "yesterday", label: "Ieri" },
  { value: "last7", label: "7 giorni" },
  { value: "last30", label: "30 giorni" },
  { value: "month", label: "Mese" },
  { value: "custom", label: "Personalizzato" },
];

export function DashboardFilters({ filters, onUpdate, hideUserFilter, compact }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Fetch team members
  const { data: teamMembers } = useQuery({
    queryKey: ["dashboard-team-members", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!)
        .order("first_name");
      return data || [];
    },
    enabled: !!companyId && !hideUserFilter,
    staleTime: 300_000,
  });

  // Fetch distinct sources
  const { data: availableSources } = useQuery({
    queryKey: ["dashboard-sources", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_contacts")
        .select("source")
        .eq("company_id", companyId!)
        .not("source", "is", null)
        .limit(10000);
      const unique = [...new Set((data || []).map(d => d.source).filter(Boolean))] as string[];
      return unique.sort();
    },
    enabled: !!companyId,
    staleTime: 300_000,
  });

  // Fetch pipelines
  const { data: pipelines } = useQuery({
    queryKey: ["dashboard-pipelines", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_pipelines")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name");
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 300_000,
  });

  const toggleUser = useCallback((userId: string) => {
    const current = filters.assignedUserIds;
    const next = current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId];
    onUpdate({ assignedUserIds: next });
  }, [filters.assignedUserIds, onUpdate]);

  const toggleSource = useCallback((source: string) => {
    const current = filters.sources;
    const next = current.includes(source) ? current.filter(s => s !== source) : [...current, source];
    onUpdate({ sources: next });
  }, [filters.sources, onUpdate]);

  const activeFilterCount = [
    filters.assignedUserIds.length > 0,
    filters.sources.length > 0,
    !!filters.pipelineId,
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
            />
          </PopoverContent>
        </Popover>
      )}

      {/* User filter */}
      {!hideUserFilter && teamMembers && teamMembers.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Utente
              {filters.assignedUserIds.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{filters.assignedUserIds.length}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <ScrollArea className="max-h-48">
              <div className="space-y-1">
                {teamMembers.map(m => (
                  <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox
                      checked={filters.assignedUserIds.includes(m.id)}
                      onCheckedChange={() => toggleUser(m.id)}
                    />
                    {m.first_name} {m.last_name}
                  </label>
                ))}
              </div>
            </ScrollArea>
            {filters.assignedUserIds.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => onUpdate({ assignedUserIds: [] })}>
                Cancella filtro
              </Button>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* Source filter */}
      {availableSources && availableSources.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <Radio className="h-3.5 w-3.5" />
              Fonte
              {filters.sources.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{filters.sources.length}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <ScrollArea className="max-h-48">
              <div className="space-y-1">
                {availableSources.map(s => (
                  <label key={s} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox
                      checked={filters.sources.includes(s)}
                      onCheckedChange={() => toggleSource(s)}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </ScrollArea>
            {filters.sources.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => onUpdate({ sources: [] })}>
                Cancella filtro
              </Button>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* Pipeline filter */}
      {pipelines && pipelines.length > 0 && (
        <Select
          value={filters.pipelineId || "all"}
          onValueChange={(v) => onUpdate({ pipelineId: v === "all" ? null : v })}
        >
          <SelectTrigger className="h-7 w-auto text-xs gap-1.5 border">
            <Layers className="h-3.5 w-3.5" />
            <SelectValue placeholder="Pipeline" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le pipeline</SelectItem>
            {pipelines.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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

import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DashboardFiltersState, DatePreset } from "@/hooks/useMarketingDashboard";
import { format, isSameDay, isSameMonth } from "date-fns";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { it } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { getDateRange } from "@/lib/dateRangeUtils";

interface Props {
  filters: DashboardFiltersState;
  onUpdate: (partial: Partial<DashboardFiltersState>) => void;
  hideUserFilter?: boolean;
  compact?: boolean;
}

const DATE_PRESETS: { value: Exclude<DatePreset, "custom">; label: string }[] = [
  { value: "today", label: "Oggi" },
  { value: "yesterday", label: "Ieri" },
  { value: "last7", label: "Ultimi 7 giorni" },
  { value: "month", label: "Questo mese" },
  { value: "last30", label: "Ultimi 30 giorni" },
];

/** «1–21 ott», «28 set – 4 ott», «21 ott» */
function intervallo(da: Date, a: Date): string {
  if (isSameDay(da, a)) return format(da, "d MMM", { locale: it });
  if (isSameMonth(da, a)) return `${format(da, "d", { locale: it })}–${format(a, "d MMM", { locale: it })}`;
  return `${format(da, "d MMM", { locale: it })} – ${format(a, "d MMM", { locale: it })}`;
}

const btn = "h-8 gap-1.5 rounded-lg border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-none hover:bg-slate-50";

export function DashboardFilters({ filters, onUpdate, hideUserFilter }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [periodoAperto, setPeriodoAperto] = useState(false);

  const { data: teamMembers = [] } = useCompanyStaffUsers(!hideUserFilter ? companyId : null, "sales");

  const { data: availableSources = [] } = useQuery({
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

  const { data: pipelines = [] } = useQuery({
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
    onUpdate({ assignedUserIds: current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId] });
  }, [filters.assignedUserIds, onUpdate]);

  const toggleSource = useCallback((source: string) => {
    const current = filters.sources;
    onUpdate({ sources: current.includes(source) ? current.filter(s => s !== source) : [...current, source] });
  }, [filters.sources, onUpdate]);

  // Il periodo scelto e quello con cui si confronta: la funzione del database
  // prende lo stesso numero di giorni subito prima.
  const periodo = useMemo(() => {
    const r = getDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
    const durata = r.to.getTime() - r.from.getTime();
    const prevDa = new Date(r.from.getTime() - durata);
    const prevA = new Date(r.from.getTime() - 1);
    const preset = DATE_PRESETS.find(p => p.value === filters.datePreset);
    return {
      nome: preset?.label ?? "Personalizzato",
      date: intervallo(r.from, r.to),
      confronto: intervallo(prevDa, prevA),
    };
  }, [filters.datePreset, filters.dateFrom, filters.dateTo]);

  const nomeUtente = (id: string) => {
    const m = teamMembers.find(t => t.id === id);
    return m ? [m.first_name, m.last_name].filter(Boolean).join(" ") || "Senza nome" : "Utente";
  };
  const nomePipeline = pipelines.find(p => p.id === filters.pipelineId)?.name;


  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {/* Periodo: preimpostati e calendario nello stesso posto */}
      <Popover open={periodoAperto} onOpenChange={setPeriodoAperto}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={btn}>
            <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
            <span className="font-semibold text-slate-900">{periodo.nome}</span>
            <span className="text-slate-500 max-sm:hidden">· {periodo.date}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex max-sm:flex-col">
            <div className="flex flex-col gap-0.5 border-r border-slate-100 p-2 sm:w-44 max-sm:border-b max-sm:border-r-0">
              {DATE_PRESETS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { onUpdate({ datePreset: p.value }); setPeriodoAperto(false); }}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-slate-100",
                    filters.datePreset === p.value && "bg-slate-100 font-semibold text-slate-900",
                  )}
                >
                  {p.label}
                  {filters.datePreset === p.value && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
            <div className="max-sm:hidden">
              <Calendar
                mode="range"
                selected={{ from: filters.dateFrom, to: filters.dateTo }}
                onSelect={(range) => {
                  if (range?.from) onUpdate({ datePreset: "custom", dateFrom: range.from, dateTo: range.to || range.from });
                }}
                locale={it}
                numberOfMonths={2}
              />
            </div>
          </div>
          <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
            {periodo.date} · confronto con {periodo.confronto}
          </div>
        </PopoverContent>
      </Popover>

      {/* Commerciale, fonte e pipeline in vista: ognuno dice cosa è scelto.
          Sul telefono resta solo il commerciale (gli altri sono analisi da
          computer). */}
      {!hideUserFilter && teamMembers.length > 0 && (
        <FiltroMenu
          etichetta={filters.assignedUserIds.length === 0 ? "Tutti i commerciali"
            : filters.assignedUserIds.length === 1 ? nomeUtente(filters.assignedUserIds[0])
            : `${filters.assignedUserIds.length} commerciali`}
          attivo={filters.assignedUserIds.length > 0}
          onAzzera={() => onUpdate({ assignedUserIds: [] })}
        >
          {teamMembers.map(m => (
            <Voce key={m.id} checked={filters.assignedUserIds.includes(m.id)} onToggle={() => toggleUser(m.id)}>
              {[m.first_name, m.last_name].filter(Boolean).join(" ") || "Senza nome"}
            </Voce>
          ))}
        </FiltroMenu>
      )}
      {availableSources.length > 0 && (
        <FiltroMenu
          className="max-sm:hidden"
          etichetta={filters.sources.length === 0 ? "Tutte le fonti"
            : filters.sources.length === 1 ? filters.sources[0]
            : `${filters.sources.length} fonti`}
          attivo={filters.sources.length > 0}
          onAzzera={() => onUpdate({ sources: [] })}
        >
          {availableSources.map(s => (
            <Voce key={s} checked={filters.sources.includes(s)} onToggle={() => toggleSource(s)}>{s}</Voce>
          ))}
        </FiltroMenu>
      )}
      {pipelines.length > 1 && (
        <FiltroMenu
          className="max-sm:hidden"
          etichetta={nomePipeline ?? "Tutte le pipeline"}
          attivo={!!filters.pipelineId}
          onAzzera={() => onUpdate({ pipelineId: null })}
        >
          {[{ id: null as string | null, name: "Tutte le pipeline" }, ...pipelines].map(p => (
            <button
              key={p.id ?? "tutte"}
              type="button"
              onClick={() => onUpdate({ pipelineId: p.id })}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100"
            >
              <span className="truncate">{p.name}</span>
              {filters.pipelineId === p.id && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </FiltroMenu>
      )}
    </div>
  );
}

function FiltroMenu({ etichetta, attivo, onAzzera, className, children }: {
  etichetta: string; attivo: boolean; onAzzera: () => void; className?: string; children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn(btn, attivo && "border-slate-900 bg-slate-900 text-white hover:bg-slate-800 hover:text-white", className)}>
          <span className="max-w-[150px] truncate">{etichetta}</span>
          <ChevronDown className={cn("h-3.5 w-3.5", attivo ? "text-white/70" : "text-slate-400")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <ScrollArea className="max-h-72">
          <div className="space-y-0.5 p-2">{children}</div>
        </ScrollArea>
        {attivo && (
          <div className="border-t border-slate-100 p-1.5">
            <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={onAzzera}>Mostra tutti</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Voce({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-100">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="truncate">{children}</span>
    </label>
  );
}

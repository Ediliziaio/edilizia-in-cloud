import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Users, UserPlus, PhoneCall, CalendarCheck, CalendarDays, Trophy, Euro, Target } from "lucide-react";
import type { KpiData } from "@/hooks/useMarketingDashboard";
import { cn } from "@/lib/utils";

interface Props {
  kpi: KpiData | undefined;
  kpiPrev: KpiData | undefined;
  isLoading: boolean;
}

interface KpiCardDef {
  key: keyof KpiData;
  label: string;
  tooltip: string;
  icon: React.ElementType;
  format: "number" | "currency" | "percent";
}

const KPI_CARDS: KpiCardDef[] = [
  { key: "leads_total", label: "Lead Totali", tooltip: "Contatti totali nel periodo", icon: Users, format: "number" },
  { key: "leads_new", label: "Nuovi Lead", tooltip: "Lead creati nel periodo selezionato", icon: UserPlus, format: "number" },
  { key: "contacts_worked", label: "Lavorati", tooltip: "Contatti con almeno un'attività o opportunità", icon: PhoneCall, format: "number" },
  { key: "appointments_set", label: "App. Fissati", tooltip: "Appuntamenti programmati nel periodo", icon: CalendarDays, format: "number" },
  { key: "appointments_done", label: "App. Svolti", tooltip: "Appuntamenti completati", icon: CalendarCheck, format: "number" },
  { key: "show_rate", label: "Show Rate", tooltip: "Appuntamenti svolti / fissati × 100", icon: Target, format: "percent" },
  { key: "contracts_won", label: "Contratti Vinti", tooltip: "Opportunità con status 'vinta'", icon: Trophy, format: "number" },
  { key: "revenue", label: "Fatturato", tooltip: "Somma valori opportunità vinte", icon: Euro, format: "currency" },
  { key: "avg_ticket", label: "Ticket Medio", tooltip: "Fatturato / Contratti vinti", icon: Euro, format: "currency" },
  { key: "close_rate", label: "Tasso Chiusura", tooltip: "Contratti vinti / App. svolti × 100", icon: Target, format: "percent" },
];

function formatValue(value: number, fmt: "number" | "currency" | "percent"): string {
  if (fmt === "currency") return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
  if (fmt === "percent") return `${value}%`;
  return new Intl.NumberFormat("it-IT").format(value);
}

function calcDelta(curr: number, prev: number): { value: number; direction: "up" | "down" | "flat" } {
  if (prev === 0 && curr === 0) return { value: 0, direction: "flat" };
  if (prev === 0) return { value: 100, direction: "up" };
  const delta = ((curr - prev) / prev) * 100;
  return { value: Math.abs(Math.round(delta)), direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat" };
}

export function DashboardKPICards({ kpi, kpiPrev, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {KPI_CARDS.map(c => (
          <Card key={c.key} className="p-4">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-8 w-16" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {KPI_CARDS.map(c => {
          const value = kpi?.[c.key] ?? 0;
          const prevValue = kpiPrev?.[c.key] ?? 0;
          const delta = calcDelta(Number(value), Number(prevValue));
          const Icon = c.icon;

          return (
            <Tooltip key={c.key}>
              <TooltipTrigger asChild>
                <Card className="p-4 hover:shadow-md transition-shadow cursor-default">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground font-medium truncate">{c.label}</span>
                    <Icon className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight">{formatValue(Number(value), c.format)}</div>
                  <div className={cn("flex items-center gap-1 mt-1 text-xs font-medium",
                    delta.direction === "up" && "text-emerald-600 dark:text-emerald-400",
                    delta.direction === "down" && "text-red-600 dark:text-red-400",
                    delta.direction === "flat" && "text-muted-foreground"
                  )}>
                    {delta.direction === "up" && <TrendingUp className="h-3 w-3" />}
                    {delta.direction === "down" && <TrendingDown className="h-3 w-3" />}
                    {delta.direction === "flat" && <Minus className="h-3 w-3" />}
                    {delta.value}% vs periodo prec.
                  </div>
                </Card>
              </TooltipTrigger>
              <TooltipContent><p>{c.tooltip}</p></TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

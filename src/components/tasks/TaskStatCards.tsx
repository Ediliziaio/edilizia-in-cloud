import { ListTodo, AlertTriangle, Clock, CheckCircle2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskStatCardsProps {
  active: number;
  inReview?: number;
  expiring: number;
  overdue: number;
  completedThisWeek: number;
  onFilterClick?: (filter: "active" | "expiring" | "overdue" | "done") => void;
  onStatusClick?: (status: string) => void;
}

/*
 * I cinque numeri in una riga di pastiglie invece di cinque riquadri alti:
 * prima da soli occupavano quasi cento pixel e la tabella cominciava sotto la
 * piega. Restano filtri: un clic porta alla lista corrispondente.
 */
export function TaskStatCards({ active, inReview = 0, expiring, overdue, completedThisWeek, onFilterClick, onStatusClick }: TaskStatCardsProps) {
  const stats = [
    { label: "Attive", value: active, icon: ListTodo, color: "text-primary", filter: "active" as const },
    { label: "In revisione", value: inReview, icon: Eye, color: "text-amber-700", filter: "in_revisione" as const },
    { label: "In scadenza 48h", value: expiring, icon: Clock, color: "text-warning", filter: "expiring" as const },
    { label: "Scadute", value: overdue, icon: AlertTriangle, color: "text-destructive", filter: "overdue" as const },
    { label: "Completate settimana", value: completedThisWeek, icon: CheckCircle2, color: "text-success", filter: "done" as const },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {stats.map((stat) => {
        const clickable = stat.value > 0 && (stat.filter === "in_revisione" ? !!onStatusClick : !!onFilterClick);
        return (
          <button
            key={stat.label}
            type="button"
            disabled={!clickable}
            title={clickable ? `Mostra: ${stat.label.toLowerCase()}` : undefined}
            onClick={clickable ? () => {
              if (stat.filter === "in_revisione") onStatusClick?.("in_revisione");
              else onFilterClick?.(stat.filter);
            } : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-left shadow-sm transition-colors",
              clickable
                ? "cursor-pointer hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                : "cursor-default",
            )}
          >
            <stat.icon className={cn("h-4 w-4 shrink-0", stat.color)} />
            <span className="text-base font-bold tabular-nums leading-none">{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </button>
        );
      })}
    </div>
  );
}

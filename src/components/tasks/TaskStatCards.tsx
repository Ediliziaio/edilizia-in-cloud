import { Card, CardContent } from "@/components/ui/card";
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

export function TaskStatCards({ active, inReview = 0, expiring, overdue, completedThisWeek, onFilterClick, onStatusClick }: TaskStatCardsProps) {
  // Ogni card è un filtro: un click porta alla lista corrispondente.
  const stats = [
    { label: "Attive", value: active, icon: ListTodo, color: "text-primary", filter: "active" as const },
    { label: "In revisione", value: inReview, icon: Eye, color: "text-amber-700", filter: "in_revisione" as const },
    { label: "In scadenza (48h)", value: expiring, icon: Clock, color: "text-warning", filter: "expiring" as const },
    { label: "Scadute", value: overdue, icon: AlertTriangle, color: "text-destructive", filter: "overdue" as const },
    { label: "Completate (settimana)", value: completedThisWeek, icon: CheckCircle2, color: "text-success", filter: "done" as const },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
      {stats.map((stat) => {
        const clickable = stat.value > 0 && (stat.filter === "in_revisione" ? !!onStatusClick : !!onFilterClick);
        return (
          <Card
            key={stat.label}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            title={clickable ? `Mostra: ${stat.label.toLowerCase()}` : undefined}
            className={cn(clickable && "cursor-pointer hover:shadow-md hover:border-primary/40 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary")}
            onClick={clickable ? () => {
              if (stat.filter === "in_revisione") onStatusClick?.("in_revisione");
              else onFilterClick?.(stat.filter);
            } : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } } : undefined}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`rounded-lg p-2 bg-muted ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">
                  {stat.label}
                  {clickable && <span className="ml-1 opacity-60">↗</span>}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

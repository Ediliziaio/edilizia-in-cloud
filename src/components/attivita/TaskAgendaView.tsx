import { useMemo } from "react";
import { format, isToday, isTomorrow, isThisWeek, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, AlertTriangle, Clock, CalendarDays, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  bassa:   { label: "Bassa",   className: "bg-muted text-muted-foreground" },
  normale: { label: "Normale", className: "bg-primary/10 text-primary" },
  alta:    { label: "Alta",    className: "bg-warning/10 text-warning" },
  urgente: { label: "Urgente", className: "bg-destructive/10 text-destructive" },
};

const STATUS_LABELS: Record<string, string> = {
  da_fare: "Da fare",
  in_corso: "In corso",
  completata: "Completata",
};

interface AgendaTask {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_date?: string | null;
  category?: string;
  assigned_profile?: { first_name: string; last_name: string } | null;
}

interface TaskAgendaViewProps {
  tasks: AgendaTask[];
  onTaskSelect: (task: AgendaTask) => void;
}

function dateGroupLabel(dateStr: string): { label: string; sub: string; accent: boolean } {
  const d = new Date(dateStr);
  if (isToday(d))     return { label: "Oggi",   sub: format(d, "d MMMM", { locale: it }), accent: true };
  if (isTomorrow(d))  return { label: "Domani", sub: format(d, "d MMMM", { locale: it }), accent: false };
  if (isThisWeek(d, { weekStartsOn: 1 }))
    return { label: format(d, "EEEE", { locale: it }), sub: format(d, "d MMMM", { locale: it }), accent: false };
  return { label: format(d, "d MMMM", { locale: it }), sub: format(d, "yyyy"), accent: false };
}

function TaskRow({ task, overdue, onSelect }: { task: AgendaTask; overdue?: boolean; onSelect: () => void }) {
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.normale;
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors border-l-2",
        overdue ? "border-l-destructive" : "border-l-transparent",
        task.status === "completata" && "opacity-50",
      )}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <span className={cn("text-sm font-medium", task.status === "completata" && "line-through")}>
          {task.title}
        </span>
        {task.assigned_profile && (
          <span className="ml-2 text-xs text-muted-foreground">
            {task.assigned_profile.first_name} {task.assigned_profile.last_name}
          </span>
        )}
      </div>
      <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0", priority.className)}>
        {priority.label}
      </Badge>
      <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
        {STATUS_LABELS[task.status] ?? task.status}
      </span>
    </div>
  );
}

export function TaskAgendaView({ tasks, onTaskSelect }: TaskAgendaViewProps) {
  // Use YYYY-MM-DD string comparison to avoid UTC vs local timezone issues
  // (due_date is stored as a date-only string like "2026-03-30")
  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");

  const { overdue, byDate, noDate } = useMemo(() => {
    const overdue: AgendaTask[] = [];
    const noDate: AgendaTask[] = [];
    const map = new Map<string, AgendaTask[]>();

    for (const t of tasks) {
      if (!t.due_date) {
        noDate.push(t);
        continue;
      }
      const dateStr = t.due_date.slice(0, 10);
      if (dateStr < todayStr && t.status !== "completata") {
        overdue.push(t);
      } else {
        if (!map.has(dateStr)) map.set(dateStr, []);
        map.get(dateStr)!.push(t);
      }
    }

    // Sort keys chronologically
    const byDate = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    return { overdue, byDate, noDate };
  }, [tasks, todayStr]);

  if (tasks.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Overdue group */}
      {overdue.length > 0 && (
        <div className="rounded-lg border border-destructive/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-destructive/5 border-b border-destructive/20">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">Scadute</span>
            <span className="ml-auto text-xs text-muted-foreground">{overdue.length}</span>
          </div>
          {overdue.map((t) => (
            <TaskRow key={t.id} task={t} overdue onSelect={() => onTaskSelect(t)} />
          ))}
        </div>
      )}

      {/* Date groups */}
      {byDate.map(([dateStr, dateTasks]) => {
        const { label, sub, accent } = dateGroupLabel(dateStr);
        return (
          <div key={dateStr} className={cn("rounded-lg border overflow-hidden", accent && "border-primary/40")}>
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 border-b",
              accent ? "bg-primary/5 border-primary/20" : "bg-muted/30",
            )}>
              {accent
                ? <Clock className="h-4 w-4 text-primary" />
                : <CalendarDays className="h-4 w-4 text-muted-foreground" />
              }
              <span className={cn("text-sm font-semibold", accent && "text-primary")}>{label}</span>
              <span className="text-xs text-muted-foreground">{sub}</span>
              <span className="ml-auto text-xs text-muted-foreground">{dateTasks.length}</span>
            </div>
            {dateTasks.map((t) => (
              <TaskRow key={t.id} task={t} onSelect={() => onTaskSelect(t)} />
            ))}
          </div>
        );
      })}

      {/* No due date */}
      {noDate.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground">Senza scadenza</span>
            <span className="ml-auto text-xs text-muted-foreground">{noDate.length}</span>
          </div>
          {noDate.map((t) => (
            <TaskRow key={t.id} task={t} onSelect={() => onTaskSelect(t)} />
          ))}
        </div>
      )}

      {byDate.length === 0 && overdue.length === 0 && noDate.length > 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          <CalendarRange className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Tutte le attività sono senza scadenza
        </div>
      )}
    </div>
  );
}

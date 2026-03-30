import { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Priority colors ──────────────────────────────────────────────────────────
const PRIORITY_DOT: Record<string, string> = {
  urgente: "bg-destructive",
  alta: "bg-warning",
  normale: "bg-primary",
  bassa: "bg-muted-foreground",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TaskCalendarViewProps {
  tasks: any[];
  onTaskSelect: (task: any) => void;
  onNewTaskForDate: (date: Date) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TaskCalendarView({ tasks, onTaskSelect, onNewTaskForDate }: TaskCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Raggruppa tasks per due_date (chiave: 'yyyy-MM-dd')
  const tasksByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of tasks) {
      if (t.due_date) {
        const key = t.due_date.slice(0, 10); // normalizza anche timestamp
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }
    }
    return map;
  }, [tasks]);

  // Genera le celle del calendario (sempre da lunedì a domenica, 6 settimane max)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days: Date[] = [];
    let day = gridStart;
    while (day <= gridEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const WEEK_DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  return (
    <div className="space-y-3">
      {/* Header navigazione */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: it })}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
            className="text-xs h-8 px-2"
          >
            Oggi
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Griglia */}
      <div className="border rounded-lg overflow-hidden">
        {/* Intestazioni giorni */}
        <div className="grid grid-cols-7 bg-muted/50">
          {WEEK_DAYS.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Celle giorni */}
        <div className="grid grid-cols-7 divide-x divide-y border-t">
          {calendarDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDate.get(key) || [];
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isCurrentDay = isToday(day);
            const MAX_VISIBLE = 3;

            return (
              <div
                key={key}
                className={cn(
                  "min-h-[90px] p-1 cursor-pointer transition-colors hover:bg-muted/30 group",
                  !isCurrentMonth && "bg-muted/10",
                )}
                onClick={() => onNewTaskForDate(day)}
              >
                {/* Numero giorno */}
                <div
                  className={cn(
                    "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1",
                    isCurrentDay
                      ? "bg-primary text-primary-foreground"
                      : isCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground/50",
                  )}
                >
                  {format(day, "d")}
                </div>

                {/* Task del giorno */}
                <div className="space-y-0.5">
                  {dayTasks.slice(0, MAX_VISIBLE).map((task) => (
                    <button
                      key={task.id}
                      className={cn(
                        "w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate flex items-center gap-1",
                        "hover:opacity-80 transition-opacity",
                        task.status === "completata"
                          ? "line-through text-muted-foreground bg-muted/40"
                          : "bg-primary/10 text-primary",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTaskSelect(task);
                      }}
                      title={task.title}
                    >
                      <span
                        className={cn(
                          "shrink-0 w-1.5 h-1.5 rounded-full",
                          task.status === "completata"
                            ? "bg-muted-foreground/40"
                            : (PRIORITY_DOT[task.priority] ?? "bg-primary"),
                        )}
                      />
                      <span className="truncate">{task.title}</span>
                    </button>
                  ))}
                  {dayTasks.length > MAX_VISIBLE && (
                    <div className="text-[10px] text-muted-foreground px-1">
                      +{dayTasks.length - MAX_VISIBLE} altri
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda priorità */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
        {Object.entries(PRIORITY_DOT).map(([p, cls]) => (
          <span key={p} className="flex items-center gap-1">
            <span className={cn("w-2 h-2 rounded-full", cls)} />
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

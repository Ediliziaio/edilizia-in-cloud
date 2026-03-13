import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TaskCard } from "./TaskCard";

interface MyDayTimelineProps {
  title: string;
  tasks: any[];
  variant: "overdue" | "today" | "nodate";
  onTaskSelect: (task: any) => void;
  collapsible?: boolean;
}

const PRIORITY_ORDER: Record<string, number> = { urgente: 0, alta: 1, normale: 2, bassa: 3 };

export function MyDayTimeline({ title, tasks, variant, onTaskSelect, collapsible = false }: MyDayTimelineProps) {
  const [collapsed, setCollapsed] = useState(false);

  const sorted = [...tasks].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  const variantClass = variant === "overdue" ? "text-destructive" : variant === "today" ? "text-primary" : "text-muted-foreground";

  return (
    <div className="space-y-2">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => collapsible && setCollapsed(!collapsed)}
        disabled={!collapsible}
      >
        {collapsible && (collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
        <span className={`text-sm font-semibold ${variantClass}`}>{title}</span>
        <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">{tasks.length}</span>
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {sorted.map((task) => (
            <TaskCard key={task.id} task={task} onSelect={() => onTaskSelect(task)} />
          ))}
        </div>
      )}
    </div>
  );
}

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, CheckCircle2, ExternalLink, ChevronRight } from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { format, isBefore, isAfter, addHours } from "date-fns";
import { cn } from "@/lib/utils";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import {
  type TaskStatusDefinition,
  getNextTaskStatusForQuickAction,
  isTaskDoneStatus,
} from "@/lib/taskStatuses";

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  bassa:   { label: "Bassa",   className: "bg-muted text-muted-foreground" },
  normale: { label: "Normale", className: "bg-primary/10 text-primary" },
  alta:    { label: "Alta",    className: "bg-warning/10 text-warning" },
  urgente: { label: "Urgente", className: "bg-destructive/10 text-destructive" },
};

const ALL_CATEGORY_LABELS: Record<string, string> = {
  generale:   "Generale",
  ordini:     "Ordini",
  magazzino:  "Magazzino",
  pagamenti:  "Pagamenti",
  costi:      "Costi",
  marketing:  "Marketing",
  contatti:   "Contatti",
  opportunita: "Opportunità",
  assistenza: "Assistenza",
};

interface SortableTaskRowProps {
  task: any;
  isSelected: boolean;
  onToggleSelect: () => void;
  onSelect: () => void;
  onToggleComplete: () => void;
  dragDisabled?: boolean;
  statusOptions?: TaskStatusDefinition[];
}

export function SortableTaskRow({
  task, isSelected, onToggleSelect, onSelect, onToggleComplete, dragDisabled = false, statusOptions,
}: SortableTaskRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id, disabled: dragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const now = new Date();
  const in48h = addHours(now, 48);
  const isCompleted = isTaskDoneStatus(task.status, statusOptions);
  const nextStatus = getNextTaskStatusForQuickAction(task.status, statusOptions);
  const isOverdue = !isCompleted && task.due_date && isBefore(new Date(task.due_date), now);
  const isExpiring = !isOverdue && !isCompleted && task.due_date &&
    isAfter(new Date(task.due_date), now) && isBefore(new Date(task.due_date), in48h);
  const creatorName = task.creator_profile
    ? `${task.creator_profile.first_name ?? ""} ${task.creator_profile.last_name ?? ""}`.trim()
    : "";

  const renderCorrelation = () => {
    if (task.order) {
      return (
        <Link
          to={`/azienda/ordini/${task.order_id}`}
          className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          {task.order.order_code || task.order.description?.slice(0, 20)}
        </Link>
      );
    }
    if (task.contact) {
      return (
        <Link
          to={`/azienda/marketing/contatti/${task.contact_id}`}
          className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          {task.contact.first_name} {task.contact.last_name}
        </Link>
      );
    }
    if (task.opportunity) return <span className="text-sm text-muted-foreground">{task.opportunity.name}</span>;
    if (task.stock_item)  return <span className="text-sm text-muted-foreground">{task.stock_item.name}</span>;
    if (task.cost)        return <span className="text-sm text-muted-foreground">{task.cost.name}</span>;
    return "—";
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-pointer transition-colors",
        isDragging && "opacity-50 bg-muted z-50",
        isOverdue && "bg-destructive/5",
        isExpiring && "bg-warning/5",
        isCompleted && "opacity-60",
        isSelected && "bg-primary/5",
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <TableCell className="w-6 px-1" onClick={(e) => e.stopPropagation()}>
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "p-1 transition-colors",
            dragDisabled
              ? "cursor-not-allowed text-muted-foreground/20"
              : "cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground",
          )}
          title={dragDisabled ? "Rimuovi i filtri per riordinare" : "Trascina per riordinare"}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>

      {/* Checkbox */}
      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
      </TableCell>

      {/* Title */}
      <TableCell className="font-medium">
        <div className="min-w-[220px]">
          <div className="flex items-center gap-1.5">
            <span className={cn("line-clamp-1", isCompleted && "line-through")}>{task.title}</span>
            {task.is_recurring && (
              <span className="text-[10px] text-muted-foreground">↻</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-normal text-muted-foreground">
            {creatorName && <span>Creata da {creatorName}</span>}
            {task.notes && <span className="hidden max-w-[260px] truncate md:inline">{task.notes}</span>}
          </div>
        </div>
      </TableCell>

      {/* Assignee */}
      <TableCell className="text-muted-foreground">
        {task.assigned_profile
          ? `${task.assigned_profile.first_name} ${task.assigned_profile.last_name}`
          : "—"}
      </TableCell>

      {/* Correlation */}
      <TableCell>{renderCorrelation()}</TableCell>

      {/* Category */}
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {ALL_CATEGORY_LABELS[task.category] || task.category}
        </span>
      </TableCell>

      {/* Priority */}
      <TableCell>
        <Badge className={PRIORITY_CONFIG[task.priority]?.className || ""}>
          {PRIORITY_CONFIG[task.priority]?.label || task.priority}
        </Badge>
      </TableCell>

      {/* Due date */}
      <TableCell>
        {task.due_date ? (
          <span className={cn(
            "text-sm",
            isOverdue && "text-destructive font-medium",
            isExpiring && "text-warning font-medium",
          )}>
            {format(new Date(task.due_date), "dd/MM/yyyy")}
          </span>
        ) : "—"}
      </TableCell>

      {/* Status toggle */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted",
          )}
          onClick={onToggleComplete}
          title={`Porta a ${nextStatus.label}`}
        >
          <CheckCircle2 className={cn("h-4 w-4 text-muted-foreground", isCompleted && "text-emerald-600")} />
          <TaskStatusBadge status={task.status} statuses={statusOptions} compact />
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        </button>
      </TableCell>
    </TableRow>
  );
}

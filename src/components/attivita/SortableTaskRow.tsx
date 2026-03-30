import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, CheckCircle2, ExternalLink } from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { format, isBefore } from "date-fns";
import { cn } from "@/lib/utils";

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  bassa:   { label: "Bassa",   className: "bg-muted text-muted-foreground" },
  normale: { label: "Normale", className: "bg-primary/10 text-primary" },
  alta:    { label: "Alta",    className: "bg-warning/10 text-warning" },
  urgente: { label: "Urgente", className: "bg-destructive/10 text-destructive" },
};

const STATUS_LABELS: Record<string, string> = {
  da_fare:   "Da fare",
  in_corso:  "In corso",
  completata: "Completata",
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
}

export function SortableTaskRow({
  task, isSelected, onToggleSelect, onSelect, onToggleComplete,
}: SortableTaskRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const now = new Date();
  const isOverdue = task.status !== "completata" && task.due_date && isBefore(new Date(task.due_date), now);

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
        task.status === "completata" && "opacity-60",
        isSelected && "bg-primary/5",
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <TableCell className="w-6 px-1" onClick={(e) => e.stopPropagation()}>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-1"
          title="Trascina per riordinare"
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
        <span className={task.status === "completata" ? "line-through" : ""}>{task.title}</span>
        {task.is_recurring && (
          <span className="ml-1.5 text-[10px] text-muted-foreground">↻</span>
        )}
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
          <span className={cn("text-sm", isOverdue && "text-destructive font-medium")}>
            {format(new Date(task.due_date), "dd/MM/yyyy")}
          </span>
        ) : "—"}
      </TableCell>

      {/* Status toggle */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 text-sm rounded-md px-2 py-1 transition-colors",
            task.status === "completata"
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground hover:bg-muted",
          )}
          onClick={onToggleComplete}
        >
          <CheckCircle2 className={cn("h-4 w-4", task.status === "completata" && "text-primary")} />
          {STATUS_LABELS[task.status] || task.status}
        </button>
      </TableCell>
    </TableRow>
  );
}

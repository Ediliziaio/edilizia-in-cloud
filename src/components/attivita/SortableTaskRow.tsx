import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, CheckCircle2, Circle, ExternalLink, ChevronDown, MoreHorizontal, Check,
  UserPlus, CalendarClock, Copy, Trash2, Eye,
} from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "react-router-dom";
import { format, isBefore, isAfter, addHours, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import {
  type TaskStatusDefinition,
  TASK_STATUS_TONE_CLASSES,
  DEFAULT_TASK_STATUS_DEFINITIONS,
  getNextTaskStatusForQuickAction,
  isTaskDoneStatus,
} from "@/lib/taskStatuses";

import { PRIORITY_CONFIG, PRIORITY_ORDER } from "@/lib/taskPriorities";
import { TASK_CATEGORY_LABELS as ALL_CATEGORY_LABELS } from "@/lib/taskCategories";


/**
 * Azioni che la riga può chiedere al genitore. La riga non parla col DB:
 * espone solo i menu; chi la usa decide come applicare (e come annullare).
 */
export interface AzioniRiga {
  onChangeStatus: (status: string) => void;
  onChangePriority: (priority: string) => void;
  onChangeDueDate: (date: string | null) => void;
  /** undefined quando l'attività è già dell'utente corrente */
  onAssignToMe?: () => void;
  onDuplicate: () => void;
  onPostpone: (giorni: number) => void;
  onDelete: () => void;
}

interface SortableTaskRowProps {
  task: any;
  isSelected: boolean;
  onToggleSelect: () => void;
  onSelect: () => void;
  onToggleComplete: () => void;
  dragDisabled?: boolean;
  statusOptions?: TaskStatusDefinition[];
  azioni?: AzioniRiga;
}

function ScadenzaPopover({ value, onChange, children }: { value: string | null; onChange: (d: string | null) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(value ?? "");
  const oggi = new Date();
  const scegli = (d: string | null) => { onChange(d); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setData(value ?? ""); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium text-muted-foreground">Scadenza</p>
        <div className="flex gap-2">
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-8 text-sm" />
          <Button size="sm" className="h-8" onClick={() => scegli(data || null)}>Ok</Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => scegli(format(oggi, "yyyy-MM-dd"))}>Oggi</Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => scegli(format(addDays(oggi, 1), "yyyy-MM-dd"))}>Domani</Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => scegli(format(addDays(oggi, 7), "yyyy-MM-dd"))}>+1 settimana</Button>
          {value && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => scegli(null)}>Nessuna</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SortableTaskRow({
  task, isSelected, onToggleSelect, onSelect, onToggleComplete, dragDisabled = false, statusOptions, azioni,
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
  const stati = (statusOptions && statusOptions.length > 0 ? statusOptions : DEFAULT_TASK_STATUS_DEFINITIONS)
    .slice()
    .sort((a, b) => a.order - b.order);
  const isCompleted = isTaskDoneStatus(task.status, statusOptions);
  const nextStatus = getNextTaskStatusForQuickAction(task.status, statusOptions);
  const isOverdue = !isCompleted && task.due_date && isBefore(new Date(task.due_date), now);
  const isExpiring = !isOverdue && !isCompleted && task.due_date &&
    isAfter(new Date(task.due_date), now) && isBefore(new Date(task.due_date), in48h);
  const creatorName = task.creator_profile
    ? `${task.creator_profile.first_name ?? ""} ${task.creator_profile.last_name ?? ""}`.trim()
    : "";
  const ferma = (e: React.SyntheticEvent) => e.stopPropagation();

  const renderCorrelation = () => {
    if (task.order) {
      return (
        <Link
          to={`/azienda/ordini/${task.order_id}`}
          className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
          onClick={ferma}
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
          onClick={ferma}
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

  const badgePriorita = (
    <Badge className={cn(PRIORITY_CONFIG[task.priority]?.className || "", azioni && "cursor-pointer hover:ring-2 hover:ring-primary/30")}>
      {PRIORITY_CONFIG[task.priority]?.label || task.priority}
      {azioni && <ChevronDown className="ml-1 h-3 w-3 opacity-60" />}
    </Badge>
  );

  const testoScadenza = task.due_date ? (
    <span className={cn(
      "text-sm",
      isOverdue && "text-destructive font-medium",
      isExpiring && "text-warning font-medium",
    )}>
      {format(new Date(task.due_date), "dd/MM/yyyy")}
    </span>
  ) : <span className="text-sm text-muted-foreground">—</span>;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-pointer transition-colors group",
        isDragging && "opacity-50 bg-muted z-50",
        isOverdue && "bg-destructive/5",
        isExpiring && "bg-warning/5",
        isCompleted && "opacity-60",
        isSelected && "bg-primary/5",
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <TableCell className="w-6 px-1" onClick={ferma}>
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "p-1 transition-colors",
            dragDisabled
              ? "cursor-not-allowed text-muted-foreground/20"
              : "cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground",
          )}
          title={dragDisabled ? "Rimuovi filtri e ordinamento per riordinare" : "Trascina per riordinare"}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>

      {/* Checkbox */}
      <TableCell className="w-10" onClick={ferma}>
        <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} aria-label="Seleziona attività" />
      </TableCell>

      {/* Title */}
      <TableCell className="font-medium">
        <div className="min-w-[220px]">
          <div className="flex items-center gap-1.5">
            <span className={cn("line-clamp-1", isCompleted && "line-through")}>{task.title}</span>
            {task.is_recurring && (
              <span className="text-[10px] text-muted-foreground" title="Attività ricorrente">↻</span>
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

      {/* Priority: menu a scelta */}
      <TableCell onClick={ferma}>
        {azioni ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Cambia priorità">{badgePriorita}</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuLabel className="text-xs">Priorità</DropdownMenuLabel>
              {PRIORITY_ORDER.map((p) => (
                <DropdownMenuItem key={p} onSelect={() => azioni.onChangePriority(p)} className="text-sm">
                  <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", p === "urgente" ? "bg-destructive" : p === "alta" ? "bg-warning" : p === "normale" ? "bg-primary" : "bg-muted-foreground/50")} />
                  {PRIORITY_CONFIG[p].label}
                  {task.priority === p && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : badgePriorita}
      </TableCell>

      {/* Due date: popover con scorciatoie */}
      <TableCell onClick={ferma}>
        {azioni ? (
          <ScadenzaPopover value={task.due_date ? String(task.due_date).slice(0, 10) : null} onChange={azioni.onChangeDueDate}>
            <button type="button" className="rounded px-1 py-0.5 hover:bg-muted" aria-label="Cambia scadenza">{testoScadenza}</button>
          </ScadenzaPopover>
        ) : testoScadenza}
      </TableCell>

      {/* Status: cerchio = azione rapida, badge = SCELTA dello stato */}
      <TableCell onClick={ferma}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md p-1 transition-colors hover:bg-muted"
            onClick={onToggleComplete}
            title={isCompleted ? `Riapri (torna a ${nextStatus.label})` : `Segna come ${nextStatus.label}`}
            aria-label={isCompleted ? "Riapri attività" : `Segna come ${nextStatus.label}`}
          >
            {isCompleted
              ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              : <Circle className="h-4 w-4 text-muted-foreground group-hover:text-primary" />}
          </button>
          {azioni ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted" aria-label="Scegli lo stato" title="Scegli lo stato">
                  <TaskStatusBadge status={task.status} statuses={statusOptions} compact />
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">Sposta in</DropdownMenuLabel>
                {stati.map((s) => {
                  const tone = TASK_STATUS_TONE_CLASSES[s.tone] || TASK_STATUS_TONE_CLASSES.slate;
                  const corrente = s.value === task.status;
                  return (
                    <DropdownMenuItem key={s.value} disabled={corrente} onSelect={() => azioni.onChangeStatus(s.value)} className="text-sm">
                      <span className={cn("mr-2 h-2 w-2 rounded-full", tone.dot)} />
                      {s.label}
                      {corrente && <Check className="ml-auto h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <TaskStatusBadge status={task.status} statuses={statusOptions} compact />
          )}
        </div>
      </TableCell>

      {/* Menu azioni riga */}
      <TableCell className="w-10 pr-2" onClick={ferma}>
        {azioni && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded-md p-1.5 text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:opacity-100 group-hover:opacity-100" aria-label="Altre azioni" title="Altre azioni">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onSelect} className="text-sm"><Eye className="mr-2 h-4 w-4" /> Apri dettaglio</DropdownMenuItem>
              {azioni.onAssignToMe && (
                <DropdownMenuItem onSelect={azioni.onAssignToMe} className="text-sm"><UserPlus className="mr-2 h-4 w-4" /> Assegna a me</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Rimanda</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => azioni.onPostpone(1)} className="text-sm"><CalendarClock className="mr-2 h-4 w-4" /> A domani</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => azioni.onPostpone(7)} className="text-sm"><CalendarClock className="mr-2 h-4 w-4" /> Di una settimana</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={azioni.onDuplicate} className="text-sm"><Copy className="mr-2 h-4 w-4" /> Duplica</DropdownMenuItem>
              <DropdownMenuItem onSelect={azioni.onDelete} className="text-sm text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Elimina</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}


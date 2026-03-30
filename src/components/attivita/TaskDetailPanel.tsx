import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Calendar, Clock, Tag, FileText, User, ExternalLink, X, Link2,
  Briefcase, Users, TrendingUp, Package, DollarSign, Ticket,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TaskChecklist } from "./TaskChecklist";
import { TaskComments } from "./TaskComments";
import { TaskTagPicker } from "./TaskTagPicker";
import { TaskTagBadge } from "./TaskTagBadge";
import { TaskCorrelationPicker } from "./TaskCorrelationPicker";

const PRIORITY_CONFIG: Record<string, { label: string; emoji: string }> = {
  bassa: { label: "Bassa", emoji: "⚪" },
  normale: { label: "Normale", emoji: "🔵" },
  alta: { label: "Alta", emoji: "🟠" },
  urgente: { label: "Urgente", emoji: "🔴" },
};

const STATUS_LABELS: Record<string, string> = {
  da_fare: "Da fare",
  in_corso: "In corso",
  completata: "Completata",
};

const CATEGORY_LABELS: Record<string, string> = {
  generale: "Generale",
  ordini: "Ordini",
  magazzino: "Magazzino",
  pagamenti: "Pagamenti",
  costi: "Costi",
  marketing: "Marketing",
  contatti: "Contatti",
  opportunita: "Opportunità",
};

interface TaskDetailPanelProps {
  task: any | null;
  onClose: () => void;
}

// Inline editable field component
function EditableField({
  label,
  icon: Icon,
  value,
  type = "text",
  onSave,
}: {
  label: string;
  icon: React.ElementType;
  value: string | null;
  type?: "text" | "date" | "number" | "textarea";
  onSave: (val: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");

  const save = () => {
    onSave(val.trim() || null);
    setEditing(false);
  };

  const displayValue = value
    ? type === "date"
      ? format(new Date(value), "d MMMM yyyy", { locale: it })
      : value
    : null;

  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {label}
        </div>
        {editing ? (
          type === "textarea" ? (
            <Textarea
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onBlur={save}
              rows={3}
              autoFocus
              className="text-sm"
            />
          ) : (
            <Input
              type={type}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setVal(value ?? "");
                  setEditing(false);
                }
              }}
              autoFocus
              className="h-7 text-sm"
            />
          )
        ) : (
          <div
            className="text-sm cursor-pointer hover:text-primary transition-colors min-h-[20px] truncate"
            onClick={() => {
              setVal(value ?? "");
              setEditing(true);
            }}
          >
            {displayValue ?? (
              <span className="text-muted-foreground/50 italic">Aggiungi...</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const queryClient = useQueryClient();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task?.title ?? "");

  const { data: assignedTags = [], refetch: refetchTags } = useQuery({
    queryKey: ["task-tags-assigned", task?.id],
    queryFn: async () => {
      if (!task?.id) return [];
      const { data, error } = await supabase
        .from("task_tag_assignments")
        .select("tag:task_tags(id, name, color)")
        .eq("task_id", task.id);
      if (error) return [];
      return (data ?? []).map((r: any) => r.tag).filter(Boolean) as { id: string; name: string; color: string }[];
    },
    enabled: !!task?.id,
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase
        .from("task_tag_assignments")
        .delete()
        .eq("task_id", task.id)
        .eq("tag_id", tagId);
      if (error) throw error;
    },
    onSuccess: () => refetchTags(),
    onError: () => toast.error("Errore rimozione tag"),
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { error } = await supabase
        .from("tasks")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
    },
    onError: () => toast.error("Errore nel salvataggio"),
  });

  const saveField = (field: string) => (val: string | null) => {
    updateMutation.mutate({ [field]: val });
  };

  const saveTitle = () => {
    if (title.trim() && title !== task.title) {
      updateMutation.mutate({ title });
    }
    setEditingTitle(false);
  };

  // Build correlations list from FK fields
  const correlations = task
    ? [
        task.order && {
          icon: Briefcase,
          label: task.order.order_code || task.order.description?.slice(0, 25),
          tipo: "Ordine",
          to: `/azienda/ordini/${task.order_id}`,
          fkField: "order_id",
        },
        task.contact && {
          icon: Users,
          label: `${task.contact.first_name} ${task.contact.last_name}`,
          tipo: "Contatto",
          to: `/azienda/marketing/contatti/${task.contact_id}`,
          fkField: "contact_id",
        },
        task.opportunity && {
          icon: TrendingUp,
          label: task.opportunity.name,
          tipo: "Opportunità",
          to: `/azienda/marketing/opportunita`,
          fkField: "opportunity_id",
        },
        task.stock_item && {
          icon: Package,
          label: task.stock_item.name,
          tipo: "Magazzino",
          to: null,
          fkField: "stock_item_id",
        },
        task.cost && {
          icon: DollarSign,
          label: task.cost.name,
          tipo: "Costo",
          to: null,
          fkField: "cost_id",
        },
        task.ticket_id && {
          icon: Ticket,
          label: `Ticket #${task.ticket_id.slice(0, 8)}`,
          tipo: "Ticket",
          to: null,
          fkField: "ticket_id",
        },
      ].filter(Boolean)
    : [];

  if (!task) return null;

  return (
    <Sheet open={!!task} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b space-y-3">
          {/* Title */}
          <div className="pr-8">
            {editingTitle ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") {
                    setTitle(task.title);
                    setEditingTitle(false);
                  }
                }}
                className="text-lg font-semibold h-auto p-1"
                autoFocus
              />
            ) : (
              <h2
                className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors"
                onClick={() => {
                  setTitle(task.title);
                  setEditingTitle(true);
                }}
              >
                {task.title}
              </h2>
            )}
          </div>

          {/* Status & Priority dropdowns */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={task.status}
              onValueChange={(val) => updateMutation.mutate({
                status: val,
                completed_at: val === "completata" ? new Date().toISOString() : null,
              })}
            >
              <SelectTrigger className="h-8 w-auto text-xs gap-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={task.priority}
              onValueChange={(val) => updateMutation.mutate({ priority: val })}
            >
              <SelectTrigger className="h-8 w-auto text-xs gap-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
                  <SelectItem key={v} value={v}>{c.emoji} {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {task.status === "completata" && (
              <Badge variant="secondary" className="text-xs">
                ✓ Completata
              </Badge>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Assignee (read-only) */}
          <div className="flex items-start gap-3">
            <User className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Assegnato a
              </div>
              <div className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarFallback className="text-[10px]">
                    {(task.assigned_profile
                      ? task.assigned_profile.first_name?.[0]
                      : "?"
                    ).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">
                  {task.assigned_profile
                    ? `${task.assigned_profile.first_name} ${task.assigned_profile.last_name}`
                    : "Non assegnato"}
                </span>
              </div>
            </div>
          </div>

          {/* Due date */}
          <EditableField
            label="Scadenza"
            icon={Calendar}
            value={task.due_date ? task.due_date.split("T")[0] : null}
            type="date"
            onSave={saveField("due_date")}
          />

          {/* Stima ore */}
          <EditableField
            label="Stima (ore)"
            icon={Clock}
            value={task.estimated_hours != null ? String(task.estimated_hours) : null}
            type="number"
            onSave={(val) => updateMutation.mutate({ estimated_hours: val ? parseFloat(val) : null })}
          />

          {/* Category */}
          <div className="flex items-start gap-3">
            <Tag className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Categoria
              </div>
              <Select
                value={task.category || "generale"}
                onValueChange={(val) => updateMutation.mutate({ category: val })}
              >
                <SelectTrigger className="h-7 text-sm w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <EditableField
            label="Note"
            icon={FileText}
            value={task.notes}
            type="textarea"
            onSave={saveField("notes")}
          />

          {/* Correlations */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex-1">
                Correlazioni
              </span>
              <TaskCorrelationPicker
                task={task}
                onUpdate={(updates) => updateMutation.mutate(updates)}
              />
            </div>
            {correlations.length === 0 && (
              <p className="text-xs text-muted-foreground/60 italic pl-7">Nessuna correlazione</p>
            )}
            {correlations.map((c: any, i: number) => {
              const Icon = c.icon;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-muted-foreground">{c.tipo}</div>
                    <div className="text-sm font-medium truncate">{c.label}</div>
                  </div>
                  {c.to && (
                    <Link
                      to={c.to}
                      className="text-primary hover:text-primary/80"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  )}
                  <button
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => updateMutation.mutate({ [c.fkField]: null })}
                    title="Rimuovi correlazione"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Etichette */}
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Etichette
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-7">
              {assignedTags.map((tag) => (
                <TaskTagBadge
                  key={tag.id}
                  name={tag.name}
                  color={tag.color}
                  onRemove={() => removeTagMutation.mutate(tag.id)}
                />
              ))}
              <TaskTagPicker
                taskId={task.id}
                assignedTags={assignedTags}
                onChanged={() => refetchTags()}
              />
            </div>
          </div>

          {/* Checklist */}
          <Separator />
          <TaskChecklist taskId={task.id} />

          {/* Comments */}
          <Separator />
          <TaskComments taskId={task.id} />

          {/* Meta */}
          <Separator />
          <div className="text-xs text-muted-foreground space-y-1">
            {task.created_at && (
              <p>
                Creata il{" "}
                {format(new Date(task.created_at), "d MMM yyyy 'alle' HH:mm", {
                  locale: it,
                })}
              </p>
            )}
            {task.updated_at && (
              <p>
                Ultima modifica:{" "}
                {format(new Date(task.updated_at), "d MMM yyyy 'alle' HH:mm", {
                  locale: it,
                })}
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

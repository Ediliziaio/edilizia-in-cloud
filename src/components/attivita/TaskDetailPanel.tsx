import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { linkContatto, linkOpportunita } from "@/lib/marketing/linkCrm";
import { TASK_CATEGORY_LABELS as CATEGORY_LABELS } from "@/lib/taskCategories";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { TaskAllegati } from "@/components/attivita/TaskAllegati";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Calendar, Clock, Tag, FileText, User, ExternalLink, X, Link2,
  Briefcase, Users, TrendingUp, Package, DollarSign, Ticket,
  History,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { TaskChecklist } from "./TaskChecklist";
import { TaskComments } from "./TaskComments";
import { TaskTagPicker } from "./TaskTagPicker";
import { TaskTagBadge } from "./TaskTagBadge";
import { TaskCorrelationPicker } from "./TaskCorrelationPicker";
import { TaskDependencySection } from "./TaskDependencySection";
import { ChipIcona, SezioneCard } from "./SezioneCard";
import { describeTaskChanges, logTaskActivity, TASK_FIELD_LABELS } from "@/lib/taskActivityLog";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import {
  type TaskStatusDefinition,
  buildTaskStatusUpdate,
  getTaskStatusDefinition,
  getTaskStatusEventType,
  getTaskStatusTransitionDescription,
  isTaskDoneStatus,
  isTaskReviewStatus,
} from "@/lib/taskStatuses";

const PRIORITY_CONFIG: Record<string, { label: string; emoji: string }> = {
  bassa: { label: "Bassa", emoji: "⚪" },
  normale: { label: "Normale", emoji: "🔵" },
  alta: { label: "Alta", emoji: "🟠" },
  urgente: { label: "Urgente", emoji: "🔴" },
};


const TASK_EVENT_LABELS: Record<string, string> = {
  task_created: "ha creato l'attività",
  task_updated: "ha modificato l'attività",
  task_completed: "ha completato l'attività",
  task_reopened: "ha riaperto l'attività",
  task_review_requested: "ha mandato l'attività in revisione",
  task_status_changed: "ha cambiato stato",
  task_deleted: "ha eliminato l'attività",
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
      <ChipIcona icon={Icon} tono="blu" className="mt-0.5 hidden sm:inline-flex" />
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

function formatProfileName(profile: any, fallback = "Utente") {
  const name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
  return name || fallback;
}


function TaskActivityLog({
  task,
  companyId,
  creatorName,
  statusOptions,
}: {
  task: any;
  companyId: string;
  creatorName: string;
  statusOptions: TaskStatusDefinition[];
}) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["task-activity-log", companyId, task?.id],
    queryFn: async () => {
      if (!companyId || !task?.id) return [];
      const { data, error } = await supabase
        .from("company_activity_log")
        .select("id, created_at, actor_name, user_id, action, event_type, description, changes, before_snapshot, after_snapshot, details")
        .eq("company_id", companyId)
        .eq("target_id", task.id)
        .or("target_table.eq.tasks,target_type.eq.tasks,target_type.eq.task")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) return [];
      return (data || []) as any[];
    },
    enabled: !!companyId && !!task?.id,
    staleTime: 15_000,
  });

  const renderStatusTransition = (log: any) => {
    const beforeStatus = log.before_snapshot?.status;
    const afterStatus = log.after_snapshot?.status || log.changes?.status;
    if (!afterStatus || beforeStatus === afterStatus) return null;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {beforeStatus && <TaskStatusBadge status={beforeStatus} statuses={statusOptions} compact />}
        {beforeStatus && <span className="text-[10px] text-muted-foreground">verso</span>}
        <TaskStatusBadge status={afterStatus} statuses={statusOptions} compact />
      </div>
    );
  };

  const renderChangeBadges = (changes: unknown) => {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) return null;
    const fields = Object.keys(changes as Record<string, unknown>).filter((field) => field !== "updated_at");
    if (fields.length === 0) return null;
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {fields.slice(0, 4).map((field) => (
          <Badge key={field} variant="outline" className="h-5 px-1.5 text-[10px]">
            {TASK_FIELD_LABELS[field] ?? field}
          </Badge>
        ))}
        {fields.length > 4 && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            +{fields.length - 4}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ChipIcona icon={History} tono="neutro" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Cronologia
        </span>
        {logs.length > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground">{logs.length}</span>
        )}
      </div>

      <div className="rounded-lg border bg-muted/20">
        {isLoading ? (
          <div className="space-y-2 p-3">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ) : logs.length > 0 ? (
          <div className="divide-y">
            {logs.map((log: any) => {
              const eventType = log.event_type || log.action;
              const actor = log.actor_name || (log.user_id === task.created_by ? creatorName : "Utente");
              const description = log.description || TASK_EVENT_LABELS[eventType] || "ha aggiornato l'attività";
              const afterStatus = log.after_snapshot?.status || log.changes?.status;
              const statusTone = afterStatus ? getTaskStatusDefinition(afterStatus, statusOptions) : null;
              return (
                <div key={log.id} className="flex gap-3 p-3">
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${statusTone?.tone === "amber" ? "bg-amber-500" : statusTone?.tone === "emerald" ? "bg-emerald-500" : statusTone?.tone === "blue" ? "bg-blue-500" : "bg-primary/70"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{actor}</span>{" "}
                      <span className="text-muted-foreground">{description}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {format(new Date(log.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
                    </p>
                    {renderStatusTransition(log)}
                    {renderChangeBadges(log.changes)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2 p-3">
            <div className="flex gap-3">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/70" />
              <div>
                <p className="text-sm">
                  <span className="font-medium">{creatorName}</span>{" "}
                  <span className="text-muted-foreground">ha creato l'attività</span>
                </p>
                {task.created_at && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {format(new Date(task.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
                  </p>
                )}
              </div>
            </div>
            {task.updated_at && task.updated_at !== task.created_at && (
              <div className="flex gap-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                <div>
                  <p className="text-sm text-muted-foreground">Ultima modifica registrata</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {format(new Date(task.updated_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
                  </p>
                </div>
              </div>
            )}
            <p className="pl-5 text-[11px] text-muted-foreground">
              Le nuove modifiche compariranno qui con nome, data e campi cambiati.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const queryClient = useQueryClient();
  // Mobile: restano i campi e le sezioni che servono sul posto (chi, quando,
  // collegamenti, allegati, checklist, commenti); dipendenze, cronologia,
  // stima ore ed etichette vuote sono lavoro da scrivania.
  const isMobile = useIsMobile();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id ?? "";
  const { statuses: statusOptions } = useTaskStatuses(companyId, [task?.status].filter(Boolean));
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task?.title ?? "");

  // Sync title when a different task is selected.
  // NB: dipendiamo da `task?.id` (non `task?.title`) volutamente — vogliamo
  // fare il reset SOLO quando cambia il task selezionato, non ad ogni save
  // del titolo (che bumpa task.title nel parent → causerebbe overwrite del
  // valore digitato dall'utente).
   
  useEffect(() => {
    setTitle(task?.title ?? "");
    setEditingTitle(false);
  }, [task?.id]);

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

  const { data: creatorProfile } = useQuery({
    queryKey: ["task-creator-profile", task?.created_by],
    queryFn: async () => {
      if (!task?.created_by) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("id", task.created_by)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!task?.created_by && !task?.creator_profile,
    staleTime: 5 * 60_000,
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

      const statusChanged = typeof updates.status === "string";
      const eventType = statusChanged
        ? getTaskStatusEventType(task.status, String(updates.status), statusOptions)
        : "task_updated";

      await logTaskActivity({
        companyId,
        userId: user?.id,
        taskId: task.id,
        taskTitle: updates.title ? String(updates.title) : task.title,
        eventType,
        description: statusChanged
          ? getTaskStatusTransitionDescription(task.status, String(updates.status), statusOptions)
          : describeTaskChanges(updates),
        changes: updates,
        beforeSnapshot: task as any,
        afterSnapshot: { ...(task as any), ...updates },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
      queryClient.invalidateQueries({ queryKey: ["task-activity-log", companyId, task.id] });
    },
    onError: () => toast.error("Errore nel salvataggio"),
  });

  // Assegnatario modificabile da qui come stato, priorità e scadenza: prima
  // era l'unico campo in sola lettura del pannello.
  const { data: staff = [] } = useCompanyStaffUsers(companyId);
  const opzioniAssegnatario = useMemo(() => {
    const lista = staff.map((u) => ({ id: u.id, nome: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Utente" }));
    const attuale = task?.assigned_to as string | null | undefined;
    if (attuale && !lista.some((u) => u.id === attuale)) {
      const p = task.assigned_profile as { first_name?: string | null; last_name?: string | null } | null;
      lista.unshift({ id: attuale, nome: p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Utente" : "Utente non più attivo" });
    }
    return lista;
  }, [staff, task]);

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
          to: linkContatto("/azienda/marketing", task.contact_id),
          fkField: "contact_id",
        },
        task.opportunity && {
          icon: TrendingUp,
          label: task.opportunity.name,
          tipo: "Opportunità",
          to: linkOpportunita("/azienda/marketing", task.opportunity_id),
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

  const creatorName = formatProfileName(task.creator_profile || creatorProfile, "Utente");

  return (
    <Sheet open={!!task} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl lg:max-w-2xl p-0 flex flex-col">
        {/* Header: striscia nei colori del brand, poi titolo e stato */}
        <div className="h-1 w-full shrink-0 bg-gradient-to-r from-[#1E3A5F] via-[#1E3A5F] to-orange-500" />
        <div className="border-b bg-card p-4 space-y-3">
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
                className="text-lg font-semibold text-[#1E3A5F] dark:text-slate-100 cursor-pointer hover:text-orange-600 transition-colors"
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
                ...buildTaskStatusUpdate(val, statusOptions),
              })}
            >
              <SelectTrigger className="h-8 w-auto text-xs gap-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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

            {/* Mobile: lo stato lo dice gia' il menu qui accanto. */}
            <TaskStatusBadge status={task.status} statuses={statusOptions} className="hidden sm:inline-flex" />
            {isTaskReviewStatus(task.status, statusOptions) && (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs text-amber-800">
                Controllo responsabile
              </Badge>
            )}
            {isTaskDoneStatus(task.status, statusOptions) && (
              <Badge variant="secondary" className="text-xs">Chiusa</Badge>
            )}
          </div>
          <div className="hidden sm:flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span>Creata da <span className="font-medium text-foreground">{creatorName}</span></span>
            {task.created_at && (
              <span>
                il {format(new Date(task.created_at), "d MMM yyyy", { locale: it })}
              </span>
            )}
          </div>
        </div>

        {/* Body: fondo grigio chiaro, sezioni a card con barra brand alternata */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-3 space-y-3 dark:bg-slate-950/40">
          {/* Dettagli */}
          <SezioneCard titolo="Dettagli" icon={FileText} tono="blu">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-6 sm:gap-y-4">
              {/* Assignee: si cambia da qui */}
              <div className="flex items-start gap-3">
                <ChipIcona icon={User} tono="blu" className="mt-0.5 hidden sm:inline-flex" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Assegnato a
                  </div>
                  <div className="flex items-center gap-2">
                    <Avatar className="hidden sm:flex w-6 h-6">
                      <AvatarFallback className="text-[10px] bg-orange-500/15 text-orange-700 dark:text-orange-300">
                        {(task.assigned_profile
                          ? (task.assigned_profile.first_name?.[0] ?? "?")
                          : "?"
                        ).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <Select
                      value={(task.assigned_to as string | null | undefined) ?? "none"}
                      onValueChange={(val) => updateMutation.mutate({ assigned_to: val === "none" ? null : val })}
                    >
                      <SelectTrigger className="h-7 w-auto max-w-full text-sm" aria-label="Cambia assegnatario">
                        <SelectValue placeholder="Non assegnato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Non assegnato</SelectItem>
                        {opzioniAssegnatario.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
              {!isMobile && (
                <EditableField
                  label="Stima (ore)"
                  icon={Clock}
                  value={task.estimated_hours != null ? String(task.estimated_hours) : null}
                  type="number"
                  onSave={(val) => updateMutation.mutate({ estimated_hours: val ? parseFloat(val) : null })}
                />
              )}

              <EditableField
                label="Ore effettive"
                icon={Clock}
                value={task.actual_hours != null ? String(task.actual_hours) : null}
                type="number"
                onSave={(val) => updateMutation.mutate({ actual_hours: val ? parseFloat(val) : null })}
              />

              {/* Category */}
              <div className="flex items-start gap-3">
                <ChipIcona icon={Tag} tono="blu" className="mt-0.5 hidden sm:inline-flex" />
                <div className="flex-1 min-w-0">
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
              <div className="col-span-2">
                <EditableField
                  label="Note"
                  icon={FileText}
                  value={task.notes}
                  type="textarea"
                  onSave={saveField("notes")}
                />
              </div>
            </div>
          </SezioneCard>

          {/* Correlations */}
          <SezioneCard
            titolo="Correlazioni"
            icon={Link2}
            tono="arancio"
            azione={
              <TaskCorrelationPicker
                task={task}
                onUpdate={(updates) => updateMutation.mutate(updates)}
              />
            }
          >
            <div className="space-y-2">
              {correlations.length === 0 && (
                <p className="text-xs text-muted-foreground/70 italic">Nessuna correlazione</p>
              )}
              {correlations.map((c: any, i: number) => {
                const Icon = c.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-md border bg-orange-500/[0.04] px-3 py-2"
                  >
                    <Icon className="w-4 h-4 text-orange-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-muted-foreground">{c.tipo}</div>
                      <div className="text-sm font-medium truncate">{c.label}</div>
                    </div>
                    {c.to && (
                      <Link
                        to={c.to}
                        className="text-[#1E3A5F] hover:text-orange-600 dark:text-blue-300"
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
          </SezioneCard>

          {/* Etichette */}
          <TaskAllegati taskId={task.id} companyId={companyId} />

          {(!isMobile || assignedTags.length > 0) && (
          <SezioneCard titolo="Etichette" icon={Tag} tono="blu">
            <div className="flex flex-wrap gap-1.5">
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
          </SezioneCard>
          )}

          {/* Dipendenze */}
          {!isMobile && (
            <SezioneCard tono="arancio">
              <TaskDependencySection taskId={task.id} companyId={companyId} />
            </SezioneCard>
          )}

          {/* Checklist */}
          <SezioneCard tono="blu">
            <TaskChecklist taskId={task.id} companyId={companyId} taskTitle={task.title} />
          </SezioneCard>

          {/* Comments */}
          <SezioneCard tono="arancio">
            <TaskComments taskId={task.id} companyId={companyId} taskTitle={task.title} />
          </SezioneCard>

          {/* Cronologia */}
          {!isMobile && (
            <SezioneCard tono="neutro">
              <TaskActivityLog task={task} companyId={companyId} creatorName={creatorName} statusOptions={statusOptions} />
            </SezioneCard>
          )}

          {/* Meta */}
          <div className="px-1 pb-1 text-[11px] text-muted-foreground space-y-0.5">
            {task.created_at && (
              <p>
                Creata da {creatorName} il{" "}
                {format(new Date(task.created_at), "d MMM yyyy 'alle' HH:mm", {
                  locale: it,
                })}
              </p>
            )}
            {task.updated_at && !isMobile && (
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

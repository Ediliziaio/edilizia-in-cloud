/**
 * Pagina attività campo — gestione completa task per operai e subappaltatori.
 * Crea, modifica, cambia stato, filtra per priorità/stato.
 * Stile mobile-first coerente con il resto dell'area campo.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Plus, CheckCircle, Clock, Circle, Loader2, Calendar as CalendarIcon,
  X, HardHat, MapPin, ListChecks, PlayCircle,
  Eye,
} from "lucide-react";
import { DEFAULT_TASK_STATUS_DEFINITIONS, getNextTaskStatusForQuickAction } from "@/lib/taskStatuses";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

// ── Config ──
const PRIORITY_CONFIG: Record<string, { label: string; dot: string; badge: string; sort: number }> = {
  urgente: { label: "Urgente", dot: "bg-red-500",    badge: "bg-red-100 text-red-700 border-red-200",       sort: 4 },
  alta:    { label: "Alta",    dot: "bg-orange-500",  badge: "bg-orange-100 text-orange-700 border-orange-200", sort: 3 },
  normale: { label: "Normale", dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-700 border-blue-200",     sort: 2 },
  bassa:   { label: "Bassa",   dot: "bg-slate-400",   badge: "bg-muted text-muted-foreground border-border",  sort: 1 },
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; cls: string }> = {
  da_fare:     { label: "Da fare",     icon: Circle,      cls: "text-slate-500" },
  in_corso:    { label: "In corso",    icon: Clock,       cls: "text-blue-600" },
  in_revisione: { label: "In revisione", icon: Eye,       cls: "text-amber-600" },
  completata:  { label: "Completata",  icon: CheckCircle, cls: "text-green-600" },
};

const PRIORITIES = ["urgente", "alta", "normale", "bassa"];
const STATUSES = ["da_fare", "in_corso", "in_revisione", "completata"];

type StatusFilter = "tutte" | "da_fare" | "in_corso" | "in_revisione" | "completata";

export default function CampoAttivita() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const companyId = profile?.company_id;
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("tutte");
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  // ── Fetch tasks ──
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["campo-attivita", user?.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id, title, notes, priority, due_date, status, category,
          created_at, completed_at, assigned_to, order_id, created_by,
          order:orders!tasks_order_id_fkey(order_code, description, indirizzo_lavori, percentuale_avanzamento)
        `)
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 30_000,
  });

  // ── Filter + Sort ──
  const filteredTasks = useMemo(() => {
    let list = [...tasks];
    if (statusFilter !== "tutte") {
      list = list.filter((t: any) => t.status === statusFilter);
    }
    return list.sort((a: any, b: any) => {
      // Completate in fondo
      if (a.status === "completata" && b.status !== "completata") return 1;
      if (a.status !== "completata" && b.status === "completata") return -1;
      // Priorità decrescente
      const pa = PRIORITY_CONFIG[a.priority]?.sort ?? 2;
      const pb = PRIORITY_CONFIG[b.priority]?.sort ?? 2;
      return pb - pa;
    });
  }, [tasks, statusFilter]);

  // ── KPI ──
  const kpi = useMemo(() => ({
    totale: tasks.length,
    daFare: tasks.filter((t: any) => t.status === "da_fare").length,
    inCorso: tasks.filter((t: any) => t.status === "in_corso").length,
    completate: tasks.filter((t: any) => t.status === "completata").length,
    urgenti: tasks.filter((t: any) => t.priority === "urgente" && t.status !== "completata").length,
  }), [tasks]);

  const focusTask = useMemo(() => {
    // "In attesa" = passo del flusso commessa non ancora sbloccato: non puo'
    // essere il lavoro in evidenza di nessuno.
    return filteredTasks.find((t: any) => t.status !== "completata" && t.status !== "in_attesa") ?? null;
  }, [filteredTasks]);

  // ── Change status ──
  const statusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const payload: Record<string, unknown> = { status: newStatus };
      if (newStatus === "completata") payload.completed_at = new Date().toISOString();
      else payload.completed_at = null;
      const { error } = await supabase.from("tasks").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campo-attivita"] });
      queryClient.invalidateQueries({ queryKey: ["campo-my-tasks"] });
      toast.success("Stato aggiornato");
    },
    onError: (err: any) => toast.error(err.message ?? "Errore"),
  });

  // Stessa sequenza della Regia (da fare → in corso → in revisione → fatta):
  // prima "in revisione" non era in lista e il tap la riportava a "da fare".
  const cycleStatus = (task: any) => {
    const next = getNextTaskStatusForQuickAction(task.status, DEFAULT_TASK_STATUS_DEFINITIONS).value;
    statusMutation.mutate({ id: task.id, newStatus: next });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-3 pb-28 md:space-y-4 md:pb-6">
      {/* Header */}
      <div className="rounded-2xl border bg-background p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <ListChecks className="h-3.5 w-3.5" />
              Task operative
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Le mie attività</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Priorità, scadenze e cantieri collegati in un unico posto.
            </p>
          </div>
          <button
            onClick={() => { setEditingTask(null); setShowForm(true); }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 md:w-auto"
          >
            <Plus className="h-4 w-4" />
            Nuova attività
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {[
          { label: "Aperte", value: kpi.daFare + kpi.inCorso, cls: "bg-primary/10 text-primary" },
          { label: "Urgenti", value: kpi.urgenti, cls: "bg-red-50 text-red-700" },
          { label: "Da fare", value: kpi.daFare, cls: "bg-slate-100 text-slate-700" },
          { label: "In corso", value: kpi.inCorso, cls: "bg-blue-50 text-blue-700" },
          { label: "Fatte", value: kpi.completate, cls: "bg-green-50 text-green-700" },
        ].map((k) => (
          <div key={k.label} className={cn("rounded-xl border border-border p-3 text-center shadow-sm", k.cls)}>
            <p className="text-2xl font-black tabular-nums leading-none">{k.value}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide">{k.label}</p>
          </div>
        ))}
      </div>

      {focusTask && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-900 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-700">
                <PlayCircle className="h-4 w-4" />
                Prossima cosa da fare
              </p>
              <p className="truncate text-lg font-black">{focusTask.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-blue-800/80">
                {focusTask.order?.order_code && <span className="rounded-full bg-white/70 px-2 py-1 font-semibold">{focusTask.order.order_code}</span>}
                {focusTask.due_date && <span className="rounded-full bg-white/70 px-2 py-1 font-semibold">Scade {format(new Date(focusTask.due_date), "d MMM", { locale: it })}</span>}
                {focusTask.order?.indirizzo_lavori && <span className="truncate rounded-full bg-white/70 px-2 py-1 font-semibold">{focusTask.order.indirizzo_lavori}</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex">
              {focusTask.order_id && (
                <button
                  onClick={() => navigate(`/campo/lavoro/${focusTask.order_id}`)}
                  className="h-10 rounded-xl bg-white px-3 text-xs font-bold text-blue-700 shadow-sm"
                >
                  Apri lavoro
                </button>
              )}
              <button
                onClick={() => cycleStatus(focusTask)}
                className="h-10 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white shadow-sm"
              >
                Avanza stato
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="sticky top-2 z-10 flex gap-1.5 overflow-x-auto rounded-2xl border bg-background/95 p-2 shadow-sm backdrop-blur scrollbar-none md:static">
        {(["tutte", "da_fare", "in_corso", "completata"] as StatusFilter[]).map((f) => {
          const labels: Record<string, string> = {
            tutte: "Tutte", da_fare: "Da fare", in_corso: "In corso", completata: "Completate"
          };
          const isActive = statusFilter === f;
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3 text-center">
          <CheckCircle className="w-12 h-12 text-muted-foreground/30" />
          <div>
            <p className="font-medium text-muted-foreground">
              {statusFilter === "tutte" ? "Nessuna attività" : `Nessuna attività "${STATUS_CONFIG[statusFilter]?.label}"`}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Crea una nuova attività per iniziare
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filteredTasks.map((task: any) => {
            const pCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.normale;
            const sCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.da_fare;
            const StatusIcon = sCfg.icon;
            const isCompleted = task.status === "completata";

            return (
              <div
                key={task.id}
                className={cn(
                  "rounded-2xl border border-border bg-background p-4 shadow-sm transition-all",
                  isCompleted && "opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Status toggle */}
                  <button
                    onClick={() => cycleStatus(task)}
                    className={cn("mt-0.5 shrink-0 transition-colors", sCfg.cls)}
                    disabled={statusMutation.isPending}
                  >
                    <StatusIcon className="w-5 h-5" />
                  </button>

                  {/* Content */}
                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => { setEditingTask(task); setShowForm(true); }}
                  >
                    <p className={cn(
                      "text-base font-bold leading-snug",
                      isCompleted && "line-through text-muted-foreground"
                    )}>
                      {task.title}
                    </p>

                    {task.notes && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.notes}</p>
                    )}

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge className={cn("text-[11px] px-1.5 py-0 border", pCfg.badge)}>
                        {pCfg.label}
                      </Badge>

                      {task.order?.order_code && (
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <HardHat className="h-3 w-3" />
                          {task.order.order_code}
                        </span>
                      )}

                      {task.due_date && (
                        <span className={cn(
                          "text-[10px] flex items-center gap-0.5",
                          new Date(task.due_date) < new Date() && !isCompleted
                            ? "text-red-600 font-semibold" : "text-muted-foreground"
                        )}>
                          <CalendarIcon className="w-3 h-3" />
                          {format(new Date(task.due_date), "d MMM", { locale: it })}
                        </span>
                      )}
                    </div>

                    {task.order && (
                      <div className="mt-3 rounded-xl bg-muted/50 p-3">
                        <div className="flex items-start gap-2">
                          <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground">{task.order.description || task.order.order_code}</p>
                            {task.order.indirizzo_lavori && (
                              <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {task.order.indirizzo_lavori}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/campo/lavoro/${task.order_id}`);
                            }}
                            className="h-8 rounded-lg bg-primary/10 px-3 text-xs font-bold text-primary"
                          >
                            Apri lavoro
                          </button>
                          {task.order.indirizzo_lavori && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(task.order.indirizzo_lavori)}`, "_blank");
                              }}
                              className="h-8 rounded-lg border bg-background px-3 text-xs font-bold text-foreground"
                            >
                              Maps
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit form overlay */}
      {showForm && (
        <TaskFormCampo
          task={editingTask}
          companyId={companyId!}
          userId={user!.id}
          onClose={() => { setShowForm(false); setEditingTask(null); }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["campo-attivita"] });
            queryClient.invalidateQueries({ queryKey: ["campo-my-tasks"] });
            setShowForm(false);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}

// ── Task Form (create/edit) ──
function TaskFormCampo({
  task,
  companyId,
  userId,
  onClose,
  onSaved,
}: {
  task: any;
  companyId: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!task?.id;
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [priority, setPriority] = useState(task?.priority ?? "normale");
  const [status, setStatus] = useState(task?.status ?? "da_fare");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Inserisci un titolo");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        notes: notes.trim() || null,
        priority,
        status,
        due_date: dueDate || null,
        completed_at: status === "completata" ? new Date().toISOString() : null,
      };

      if (isEditing) {
        // In modifica NON tocchiamo assigned_to/category/company: salvare una
        // task creata dall'ufficio ne cancellava categoria e assegnatario.
        const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);
        if (error) throw error;
        toast.success("Attività aggiornata");
      } else {
        payload.company_id = companyId;
        payload.assigned_to = userId;
        payload.category = "generale";
        payload.created_by = userId;
        const { error } = await supabase.from("tasks").insert(payload as any);
        if (error) throw error;
        toast.success("Attività creata");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold flex-1">
          {isEditing ? "Modifica attività" : "Nuova attività"}
        </h2>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEditing ? "Salva" : "Crea"}
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Titolo */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Titolo *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Cosa devi fare?"
            autoFocus
            className="w-full bg-muted border border-border rounded-xl px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Note */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Descrizione
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Dettagli aggiuntivi..."
            rows={3}
            className="w-full bg-muted border border-border rounded-xl px-3.5 py-3 text-sm text-foreground resize-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Priorità */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Priorità
          </label>
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => {
              const cfg = PRIORITY_CONFIG[p];
              const isActive = priority === p;
              return (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "rounded-xl py-2.5 text-xs font-semibold border-2 transition-all active:scale-95",
                    isActive ? "border-primary bg-primary/5" : "border-border bg-muted"
                  )}
                >
                  <div className={cn("w-2.5 h-2.5 rounded-full mx-auto mb-1", cfg.dot)} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stato */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Stato
          </label>
          <div className="grid grid-cols-3 gap-2">
            {STATUSES.map((s) => {
              const cfg = STATUS_CONFIG[s];
              const Icon = cfg.icon;
              const isActive = status === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "rounded-xl py-2.5 text-xs font-semibold border-2 transition-all active:scale-95 flex items-center justify-center gap-1.5",
                    isActive ? "border-primary bg-primary/5" : "border-border bg-muted"
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5", cfg.cls)} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scadenza */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Scadenza
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-muted border border-border rounded-xl px-3.5 py-3 text-sm text-foreground"
          />
        </div>
      </div>
    </div>
  );
}

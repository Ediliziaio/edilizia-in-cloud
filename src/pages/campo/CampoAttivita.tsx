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
  Plus, CheckCircle, Clock, Circle, Loader2,
  AlertCircle, ChevronDown, Calendar as CalendarIcon,
  X, ArrowLeft, Filter,
} from "lucide-react";
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
  completata:  { label: "Completata",  icon: CheckCircle, cls: "text-green-600" },
};

const PRIORITIES = ["urgente", "alta", "normale", "bassa"];
const STATUSES = ["da_fare", "in_corso", "completata"];

type StatusFilter = "tutte" | "da_fare" | "in_corso" | "completata";

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
          order:orders!tasks_order_id_fkey(order_code, description)
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
    let list = tasks;
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
  }), [tasks]);

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

  const cycleStatus = (task: any) => {
    const order = ["da_fare", "in_corso", "completata"];
    const idx = order.indexOf(task.status);
    const next = order[(idx + 1) % order.length];
    statusMutation.mutate({ id: task.id, newStatus: next });
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Le mie attività</h1>
          <p className="text-xs text-muted-foreground">
            {kpi.daFare + kpi.inCorso} in corso, {kpi.completate} completate
          </p>
        </div>
        <button
          onClick={() => { setEditingTask(null); setShowForm(true); }}
          className="bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4" />
          Nuova
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Totale", value: kpi.totale, cls: "bg-muted text-foreground" },
          { label: "Da fare", value: kpi.daFare, cls: "bg-slate-100 text-slate-700" },
          { label: "In corso", value: kpi.inCorso, cls: "bg-blue-50 text-blue-700" },
          { label: "Fatte", value: kpi.completate, cls: "bg-green-50 text-green-700" },
        ].map((k) => (
          <div key={k.label} className={cn("rounded-xl p-2.5 text-center border border-border", k.cls)}>
            <p className="text-xl font-bold">{k.value}</p>
            <p className="text-[10px] mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
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
                "px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors",
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
        <div className="space-y-2">
          {filteredTasks.map((task: any) => {
            const pCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.normale;
            const sCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.da_fare;
            const StatusIcon = sCfg.icon;
            const isCompleted = task.status === "completata";

            return (
              <div
                key={task.id}
                className={cn(
                  "bg-background border border-border rounded-2xl p-3.5 transition-all",
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
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => { setEditingTask(task); setShowForm(true); }}
                  >
                    <p className={cn(
                      "text-sm font-medium",
                      isCompleted && "line-through text-muted-foreground"
                    )}>
                      {task.title}
                    </p>

                    {task.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.notes}</p>
                    )}

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge className={cn("text-[9px] px-1.5 py-0 border", pCfg.badge)}>
                        {pCfg.label}
                      </Badge>

                      {task.order?.order_code && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
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
        company_id: companyId,
        title: title.trim(),
        notes: notes.trim() || null,
        priority,
        status,
        due_date: dueDate || null,
        assigned_to: userId,
        category: "generale",
        completed_at: status === "completata" ? new Date().toISOString() : null,
      };

      if (isEditing) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);
        if (error) throw error;
        toast.success("Attività aggiornata");
      } else {
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

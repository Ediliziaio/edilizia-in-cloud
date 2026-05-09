/**
 * SilvioAdminHub — Hub centrale super_admin con 3 tab:
 *  - Approvazioni: card delle azioni outbound in attesa di OK Florin
 *  - Coda: action_queue scheduled / running / failed
 *  - Policies: configurazione modalità auto/notify/approval per ogni action_type
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Pencil, Inbox, ListTodo, Settings, Sparkles, Clock,
  RefreshCw, AlertTriangle, Brain, Plus, Trash2, Save, Zap,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface PendingApproval {
  id: string;
  action_id: string;
  preview_md: string;
  context: Record<string, unknown> | null;
  status: string;
  expires_at: string;
  created_at: string;
}

interface QueueAction {
  id: string;
  action_type: string;
  status: string;
  scheduled_for: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  workflow_run_id: string | null;
  initiated_by: string;
  created_at: string;
  payload: Record<string, unknown>;
}

interface Policy {
  action_type: string;
  mode: "auto" | "auto_notify" | "approval_required" | "blocked";
  display_label: string;
  description: string;
  approval_timeout_minutes: number | null;
  enabled: boolean;
}

const MODE_COLORS: Record<Policy["mode"], string> = {
  auto: "bg-emerald-100 text-emerald-700 border-emerald-300",
  auto_notify: "bg-amber-100 text-amber-700 border-amber-300",
  approval_required: "bg-rose-100 text-rose-700 border-rose-300",
  blocked: "bg-slate-100 text-slate-700 border-slate-300",
};
const MODE_LABELS: Record<Policy["mode"], string> = {
  auto: "🟢 Auto",
  auto_notify: "🟡 Auto+Notify",
  approval_required: "🔴 Approval",
  blocked: "⛔ Bloccato",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-blue-100 text-blue-700",
  awaiting_approval: "bg-amber-100 text-amber-700",
  running: "bg-violet-100 text-violet-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-700",
};

export default function SilvioAdminHub() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-8 w-8 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold">Silvio Admin Hub</h1>
          <p className="text-sm text-muted-foreground">
            Approvazioni, coda azioni outbound, policy automation
          </p>
        </div>
      </div>

      <Tabs defaultValue="approvals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="approvals" className="gap-2">
            <Inbox className="h-4 w-4" />
            Approvazioni
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <ListTodo className="h-4 w-4" />
            Coda azioni
          </TabsTrigger>
          <TabsTrigger value="policies" className="gap-2">
            <Settings className="h-4 w-4" />
            Policies
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-2">
            <Brain className="h-4 w-4" />
            Memoria personas
          </TabsTrigger>
          <TabsTrigger value="learning" className="gap-2">
            <Zap className="h-4 w-4" />
            Self-learning
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approvals">
          <ApprovalsTab />
        </TabsContent>
        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>
        <TabsContent value="policies">
          <PoliciesTab />
        </TabsContent>
        <TabsContent value="memory">
          <MemoryTab />
        </TabsContent>
        <TabsContent value="learning">
          <LearningTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── APPROVALS TAB ─────────────────────────────────────────────────────────

function ApprovalsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["silvio-pending-approvals"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_pending_approvals")
        .select("*")
        .eq("status", "awaiting")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendingApproval[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.rpc("silvio_admin_resolve_approval" as never, {
        p_approval_id: id,
        p_status: status,
        p_modified_payload: null,
        p_resolution_note: null,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(status === "approved" ? "Approvata: in esecuzione" : "Rifiutata");
      queryClient.invalidateQueries({ queryKey: ["silvio-pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data?.length ?? 0} azioni in attesa di approvazione
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            Nessuna azione in attesa. Silvio è in pari.
          </CardContent>
        </Card>
      ) : (
        data.map((a) => (
          <Card key={a.id} className="border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Approvazione richiesta
                </span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {format(new Date(a.created_at), "dd MMM HH:mm", { locale: it })}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/50 rounded p-3 text-xs whitespace-pre-wrap font-mono">
                {a.preview_md}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    if (window.confirm("Approvare questa azione e metterla in esecuzione?")) {
                      resolveMutation.mutate({ id: a.id, status: "approved" });
                    }
                  }}
                  disabled={resolveMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approva
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (window.confirm("Rifiutare questa azione Silvio? Non verra eseguita.")) {
                      resolveMutation.mutate({ id: a.id, status: "rejected" });
                    }
                  }}
                  disabled={resolveMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Rifiuta
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Scade: {format(new Date(a.expires_at), "dd MMM HH:mm", { locale: it })}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── QUEUE TAB ─────────────────────────────────────────────────────────────

function QueueTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["silvio-action-queue", statusFilter],
    refetchInterval: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("silvio_action_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as QueueAction[];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("silvio_admin_update_queue_action" as never, {
        p_action_id: id,
        p_operation: "cancel",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Azione cancellata");
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
    onError: (e) => toast.error("Errore cancellazione", { description: String(e) }),
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("silvio_admin_update_queue_action" as never, {
        p_action_id: id,
        p_operation: "retry",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Re-enqueued");
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
    onError: (e) => toast.error("Errore retry", { description: String(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtra status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="queued">In coda</SelectItem>
            <SelectItem value="awaiting_approval">In attesa approval</SelectItem>
            <SelectItem value="running">In esecuzione</SelectItem>
            <SelectItem value="done">Completate</SelectItem>
            <SelectItem value="failed">Fallite</SelectItem>
            <SelectItem value="cancelled">Cancellate</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            Coda vuota. Niente azioni schedulate.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Origine</th>
                    <th className="px-3 py-2 text-right">Tentativi</th>
                    <th className="px-3 py-2 text-left">Schedulato</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">{a.action_type}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[a.status] ?? ""}`}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{a.initiated_by}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{a.attempts}/{a.max_attempts}</td>
                      <td className="px-3 py-2 text-xs">{format(new Date(a.scheduled_for), "dd/MM HH:mm:ss", { locale: it })}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          {a.status === "failed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => {
                                if (window.confirm("Rimettere in coda questa azione fallita?")) retryMutation.mutate(a.id);
                              }}
                              disabled={retryMutation.isPending}
                            >
                              Retry
                            </Button>
                          )}
                          {(a.status === "queued" || a.status === "awaiting_approval") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-rose-600"
                              onClick={() => {
                                if (window.confirm("Cancellare questa azione dalla coda Silvio?")) cancelMutation.mutate(a.id);
                              }}
                              disabled={cancelMutation.isPending}
                            >
                              Cancella
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── POLICIES TAB ──────────────────────────────────────────────────────────

function PoliciesTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["silvio-automation-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_automation_policies")
        .select("*")
        .order("action_type");
      if (error) throw error;
      return (data ?? []) as Policy[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ action_type, mode }: { action_type: string; mode: Policy["mode"] }) => {
      const { error } = await supabase
        .from("silvio_automation_policies")
        .update({ mode })
        .eq("action_type", action_type);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Policy aggiornata");
      queryClient.invalidateQueries({ queryKey: ["silvio-automation-policies"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        🟢 <strong>Auto</strong>: Silvio agisce subito · 🟡 <strong>Auto+Notify</strong>: agisce + notifica con annulla 5min ·
        🔴 <strong>Approval</strong>: prepara bozza + attende OK · ⛔ <strong>Bloccato</strong>: solo Florin manualmente
      </p>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !data ? null : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Action type</th>
                    <th className="px-3 py-2 text-left">Label</th>
                    <th className="px-3 py-2 text-left">Modalità</th>
                    <th className="px-3 py-2 text-right">Timeout (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.action_type} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">{p.action_type}</td>
                      <td className="px-3 py-2">{p.display_label}</td>
                      <td className="px-3 py-2">
                        <Select
                          value={p.mode}
                          onValueChange={(v) => updateMutation.mutate({ action_type: p.action_type, mode: v as Policy["mode"] })}
                        >
                          <SelectTrigger className={`h-8 w-44 text-xs ${MODE_COLORS[p.mode]}`}>
                            <SelectValue>{MODE_LABELS[p.mode]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">🟢 Auto</SelectItem>
                            <SelectItem value="auto_notify">🟡 Auto+Notify</SelectItem>
                            <SelectItem value="approval_required">🔴 Approval</SelectItem>
                            <SelectItem value="blocked">⛔ Bloccato</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        {p.approval_timeout_minutes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── MEMORY TAB ────────────────────────────────────────────────────────────

interface PersonaOption {
  persona_key: string;
  display_name: string;
  emoji: string;
}

interface PersonaMemory {
  id: string;
  persona_key: string;
  memory_type: "fact" | "preference" | "decision" | "pattern" | "avoid";
  content: string;
  source: string | null;
  confidence: number | null;
  enabled: boolean;
  hits_count: number;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const MEMORY_TYPE_BADGE: Record<PersonaMemory["memory_type"], string> = {
  fact: "bg-sky-100 text-sky-700",
  preference: "bg-violet-100 text-violet-700",
  decision: "bg-amber-100 text-amber-700",
  pattern: "bg-emerald-100 text-emerald-700",
  avoid: "bg-rose-100 text-rose-700",
};
const MEMORY_TYPE_LABEL: Record<PersonaMemory["memory_type"], string> = {
  fact: "📌 Fatto",
  preference: "💭 Preferenza",
  decision: "🎯 Decisione",
  pattern: "✅ Pattern",
  avoid: "❌ Evita",
};

function MemoryTab() {
  const queryClient = useQueryClient();
  const [selectedPersona, setSelectedPersona] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState<PersonaMemory["memory_type"]>("fact");
  const [newContent, setNewContent] = useState("");
  const [newPersonaKey, setNewPersonaKey] = useState<string>("");

  const personasQuery = useQuery({
    queryKey: ["silvio-personas-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_admin_personas")
        .select("persona_key, display_name, emoji")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PersonaOption[];
    },
  });

  const memoryQuery = useQuery({
    queryKey: ["silvio-persona-memory", selectedPersona],
    queryFn: async () => {
      let q = supabase
        .from("silvio_persona_memory")
        .select("*")
        .order("hits_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (selectedPersona !== "all") q = q.eq("persona_key", selectedPersona);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PersonaMemory[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!newPersonaKey || !newContent.trim()) throw new Error("Compila tutti i campi");
      const { error } = await supabase
        .from("silvio_persona_memory")
        .insert({
          persona_key: newPersonaKey,
          memory_type: newType,
          content: newContent.trim(),
          source: "florin_explicit",
          confidence: 1.0,
          enabled: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria aggiunta");
      setNewContent("");
      setShowAddForm(false);
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("silvio_persona_memory")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from("silvio_persona_memory")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria aggiornata");
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("silvio_persona_memory")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memoria eliminata");
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
  });

  const personas = personasQuery.data ?? [];
  const memories = memoryQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={selectedPersona} onValueChange={setSelectedPersona}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filtra persona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le personas</SelectItem>
              {personas.map((p) => (
                <SelectItem key={p.persona_key} value={p.persona_key}>
                  {p.emoji} {p.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {memories.length} memorie
          </span>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddForm((v) => !v)}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="h-4 w-4 mr-1" />
          Nuova memoria
        </Button>
      </div>

      {showAddForm && (
        <Card className="border-orange-200">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Persona</label>
                <Select value={newPersonaKey} onValueChange={setNewPersonaKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona persona…" />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((p) => (
                      <SelectItem key={p.persona_key} value={p.persona_key}>
                        {p.emoji} {p.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                <Select value={newType} onValueChange={(v) => setNewType(v as PersonaMemory["memory_type"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fact">📌 Fatto</SelectItem>
                    <SelectItem value="preference">💭 Preferenza</SelectItem>
                    <SelectItem value="decision">🎯 Decisione</SelectItem>
                    <SelectItem value="pattern">✅ Pattern vincente</SelectItem>
                    <SelectItem value="avoid">❌ Da evitare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Contenuto</label>
              <Textarea
                placeholder="Es: ARPU Pro = €127/mese. Lead industriali rispondono meglio a linguaggio tecnico."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setNewContent("");
                }}
              >
                Annulla
              </Button>
              <Button
                size="sm"
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !newPersonaKey || !newContent.trim()}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Save className="h-4 w-4 mr-1" />
                Salva
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {memoryQuery.isLoading ? (
        <Skeleton className="h-40" />
      ) : memories.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            Nessuna memoria. Aggiungi la prima per arricchire le risposte di Silvio.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <MemoryCard
              key={m.id}
              memory={m}
              personas={personas}
              onToggle={(enabled) => toggleMutation.mutate({ id: m.id, enabled })}
              onUpdate={(content) => updateMutation.mutate({ id: m.id, content })}
              onDelete={() => deleteMutation.mutate(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemoryCard({
  memory,
  personas,
  onToggle,
  onUpdate,
  onDelete,
}: {
  memory: PersonaMemory;
  personas: PersonaOption[];
  onToggle: (enabled: boolean) => void;
  onUpdate: (content: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const persona = personas.find((p) => p.persona_key === memory.persona_key);

  return (
    <Card className={memory.enabled ? "" : "opacity-60"}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">
                {persona ? `${persona.emoji} ${persona.display_name}` : memory.persona_key}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${MEMORY_TYPE_BADGE[memory.memory_type]}`}>
                {MEMORY_TYPE_LABEL[memory.memory_type]}
              </Badge>
              {memory.source && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  src: {memory.source}
                </span>
              )}
              {memory.hits_count > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  · {memory.hits_count} usi
                </span>
              )}
            </div>
            {editing ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="text-sm"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words">{memory.content}</p>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <div className="flex items-center gap-1">
              <Switch
                checked={memory.enabled}
                onCheckedChange={onToggle}
                aria-label="Attiva memoria"
              />
              {editing ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      onUpdate(draft);
                      setEditing(false);
                    }}
                    title="Salva"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setDraft(memory.content);
                      setEditing(false);
                    }}
                    title="Annulla"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => setEditing(true)}
                    title="Modifica"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                    onClick={() => {
                      if (confirm("Eliminare questa memoria?")) onDelete();
                    }}
                    title="Elimina"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── LEARNING TAB ──────────────────────────────────────────────────────────

interface LearningLog {
  id: string;
  run_at: string;
  period_start: string;
  period_end: string;
  runs_analyzed: number;
  gold_added: number;
  avoid_added: number;
  promoted_to_memory: number;
  duration_ms: number;
  ok: boolean;
  errors: unknown;
}

function LearningTab() {
  const queryClient = useQueryClient();

  const logsQuery = useQuery({
    queryKey: ["silvio-self-improvement-log"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_self_improvement_log")
        .select("*")
        .order("run_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as LearningLog[];
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("silvio-self-improvement", {
        body: { source: "manual_hub", days: 7 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const d = data as { gold_added?: number; avoid_added?: number; promoted_to_memory?: number };
      toast.success(
        `Self-improvement completato — +${d?.gold_added ?? 0} gold, +${d?.avoid_added ?? 0} avoid, ${d?.promoted_to_memory ?? 0} promossi a memoria`,
      );
      queryClient.invalidateQueries({ queryKey: ["silvio-self-improvement-log"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
    },
    onError: (e) => toast.error("Errore self-improvement", { description: String(e) }),
  });

  const logs = logsQuery.data ?? [];
  const last = logs[0];

  return (
    <div className="space-y-3">
      <Card className="border-orange-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            Self-improvement loop
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Cron settimanale (Domenica 03:00 UTC): analizza le risposte rated 👍/👎 degli ultimi 7gg,
            aggiunge gold standard e avoid pattern alla KB, promuove pattern usati a memoria persona.
          </p>
          {last && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] text-muted-foreground">Gold last run</div>
                <div className="font-bold text-emerald-700">+{last.gold_added}</div>
              </div>
              <div className="p-2 rounded bg-rose-50 border border-rose-200">
                <div className="text-[10px] text-muted-foreground">Avoid last run</div>
                <div className="font-bold text-rose-700">+{last.avoid_added}</div>
              </div>
              <div className="p-2 rounded bg-violet-50 border border-violet-200">
                <div className="text-[10px] text-muted-foreground">Promossi a memoria</div>
                <div className="font-bold text-violet-700">{last.promoted_to_memory}</div>
              </div>
              <div className="p-2 rounded bg-sky-50 border border-sky-200">
                <div className="text-[10px] text-muted-foreground">Run analizzati</div>
                <div className="font-bold text-sky-700">{last.runs_analyzed}</div>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Zap className={`h-4 w-4 mr-1 ${runMutation.isPending ? "animate-pulse" : ""}`} />
              {runMutation.isPending ? "In esecuzione…" : "Esegui ora"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Storico run</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsQuery.isLoading ? (
            <Skeleton className="h-32" />
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nessuna run effettuata. Premi "Esegui ora" o aspetta il cron settimanale.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-right">Analizzati</th>
                    <th className="px-3 py-2 text-right">Gold</th>
                    <th className="px-3 py-2 text-right">Avoid</th>
                    <th className="px-3 py-2 text-right">Promossi</th>
                    <th className="px-3 py-2 text-right">Durata</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs">
                        {format(new Date(l.run_at), "dd MMM yyyy HH:mm", { locale: it })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{l.runs_analyzed}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">+{l.gold_added}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-rose-700">+{l.avoid_added}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-violet-700">{l.promoted_to_memory}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                        {(l.duration_ms / 1000).toFixed(1)}s
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[10px] ${l.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                          {l.ok ? "✓ ok" : "✗ errors"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

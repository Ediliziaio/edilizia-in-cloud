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
  RefreshCw, AlertTriangle,
} from "lucide-react";
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
      // Approve → l'action_queue viene auto-processed dal runner.
      // Reject → l'action_queue.status diventa cancelled.
      const { data: approval } = await supabase
        .from("silvio_pending_approvals")
        .select("action_id")
        .eq("id", id)
        .single();
      if (!approval) throw new Error("Approval non trovata");

      // Update approval
      await supabase
        .from("silvio_pending_approvals")
        .update({
          status,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id);

      // Update underlying action
      if (status === "approved") {
        await supabase
          .from("silvio_action_queue")
          .update({ status: "queued", scheduled_for: new Date().toISOString() })
          .eq("id", approval.action_id);
      } else {
        await supabase
          .from("silvio_action_queue")
          .update({ status: "cancelled" })
          .eq("id", approval.action_id);
      }
    },
    onSuccess: (_, { status }) => {
      toast.success(status === "approved" ? "Approvata: in esecuzione" : "Rifiutata");
      queryClient.invalidateQueries({ queryKey: ["silvio-pending-approvals"] });
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
                  onClick={() => resolveMutation.mutate({ id: a.id, status: "approved" })}
                  disabled={resolveMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approva
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolveMutation.mutate({ id: a.id, status: "rejected" })}
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
      const { error } = await supabase
        .from("silvio_action_queue")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Azione cancellata");
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("silvio_action_queue")
        .update({ status: "queued", scheduled_for: new Date().toISOString(), attempts: 0 })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Re-enqueued");
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
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
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => retryMutation.mutate(a.id)}>
                              Retry
                            </Button>
                          )}
                          {(a.status === "queued" || a.status === "awaiting_approval") && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" onClick={() => cancelMutation.mutate(a.id)}>
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

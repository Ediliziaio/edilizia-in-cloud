/**
 * SilvioApprovalsPage — Coda di azioni in attesa di approvazione Florin.
 *
 * Letto da `silvio_pending_approvals` con status='awaiting'.
 * Per ogni card: Approva / Modifica / Rifiuta (+ countdown expires_at).
 *
 * Le risoluzioni passano da RPC transazionali: approval card e action queue
 * vengono aggiornate insieme, con audit log e guardia super_admin.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldCheck, Check, X, Pencil, Clock, ChevronsRight, Inbox } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface PendingApproval {
  id: string;
  action_id: string;
  preview_md: string;
  context: Record<string, unknown> | null;
  status: "awaiting" | "approved" | "rejected" | "modified" | "expired";
  expires_at: string;
  created_at: string;
}

interface ActionQueueItem {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
}

export default function SilvioApprovalsPage() {
  const queryClient = useQueryClient();
  const [editingApproval, setEditingApproval] = useState<PendingApproval | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: approvals, isLoading } = useQuery({
    queryKey: ["silvio-pending-approvals", "awaiting"],
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

  const { data: actionQueueMap } = useQuery({
    queryKey: ["silvio-action-queue-for-approvals", approvals?.map((a) => a.action_id)],
    enabled: !!approvals && approvals.length > 0,
    queryFn: async () => {
      if (!approvals?.length) return new Map<string, ActionQueueItem>();
      const ids = approvals.map((a) => a.action_id);
      const { data, error } = await supabase
        .from("silvio_action_queue")
        .select("id, action_type, payload")
        .in("id", ids);
      if (error) throw error;
      const map = new Map<string, ActionQueueItem>();
      for (const item of (data ?? []) as ActionQueueItem[]) {
        map.set(item.id, item);
      }
      return map;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["silvio-pending-approvals", "history"],
    enabled: historyOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_pending_approvals")
        .select("*")
        .neq("status", "awaiting")
        .order("resolved_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PendingApproval[];
    },
  });

    const approveMutation = useMutation({
      mutationFn: async ({ id, modifiedPayload }: { id: string; modifiedPayload?: unknown }) => {
        const { error } = await supabase.rpc("silvio_admin_resolve_approval" as never, {
          p_approval_id: id,
          p_status: modifiedPayload ? "modified" : "approved",
          p_modified_payload: modifiedPayload ?? null,
          p_resolution_note: null,
        } as never);
        if (error) throw error;
      },
    onSuccess: () => {
      toast.success("Approvato — Silvio eseguirà l'azione");
      queryClient.invalidateQueries({ queryKey: ["silvio-pending-approvals"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const rejectMutation = useMutation({
      mutationFn: async ({ id, note }: { id: string; note?: string }) => {
        const { error } = await supabase.rpc("silvio_admin_resolve_approval" as never, {
          p_approval_id: id,
          p_status: "rejected",
          p_modified_payload: null,
          p_resolution_note: note ?? null,
        } as never);
        if (error) throw error;
      },
    onSuccess: () => {
      toast.info("Rifiutato — l'azione non sarà eseguita");
      queryClient.invalidateQueries({ queryKey: ["silvio-pending-approvals"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return (
    <div className="space-y-4 max-w-4xl mx-auto p-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
          Approvazioni Silvio
        </h1>
        <p className="text-sm text-muted-foreground">
          Azioni outbound (email/WhatsApp/chiamate) che Silvio ha preparato e aspettano il tuo OK.
        </p>
      </div>

      {/* Status banner V1 */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="p-3 flex items-start gap-2">
          <Inbox className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-blue-900 dark:text-blue-200">
              V1 — Pronto, in attesa che le azioni outbound vengano attivate
            </p>
            <p className="text-blue-800 dark:text-blue-300 mt-0.5">
              Quando il workflow engine sarà online (Sprint successivo), le azioni con policy
              <code className="mx-1 px-1 rounded bg-blue-100">approval_required</code>
              (sollecito pagamento, chiamate vocali, risposta ticket lamentela) appariranno qui.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Lista awaiting */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          In attesa
          <Badge variant="outline" className="ml-2">{approvals?.length ?? 0}</Badge>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setHistoryOpen(!historyOpen)}
        >
          <Clock className="h-3.5 w-3.5" />
          {historyOpen ? "Nascondi storico" : "Mostra storico"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : !approvals || approvals.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nessuna azione in attesa di approvazione.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Silvio ti notificherà qui quando avrà bisogno del tuo OK.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => {
            const queueItem = actionQueueMap?.get(a.action_id);
            return (
              <ApprovalCard
                key={a.id}
                approval={a}
                queueItem={queueItem}
                onApprove={() => approveMutation.mutate({ id: a.id })}
                onReject={(note) => rejectMutation.mutate({ id: a.id, note })}
                onEdit={() => setEditingApproval(a)}
                isLoading={approveMutation.isPending || rejectMutation.isPending}
              />
            );
          })}
        </div>
      )}

      {/* Storico */}
      {historyOpen && (
        <div className="space-y-2 mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Storico (ultimi 50)
          </h2>
          {!history || history.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Nessuna risoluzione storica.</p>
              </CardContent>
            </Card>
          ) : (
            history.map((h) => (
              <Card key={h.id} className="opacity-70">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{h.preview_md.slice(0, 100)}…</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(h.created_at), "dd MMM HH:mm", { locale: it })}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      h.status === "approved" ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                      : h.status === "rejected" ? "border-rose-300 text-rose-700 bg-rose-50"
                      : h.status === "modified" ? "border-blue-300 text-blue-700 bg-blue-50"
                      : "border-muted text-muted-foreground"
                    }
                  >
                    {h.status}
                  </Badge>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Modal modifica */}
      {editingApproval && (
        <EditApprovalDialog
          queueItem={actionQueueMap?.get(editingApproval.action_id)}
          onClose={() => setEditingApproval(null)}
          onSaved={(modifiedPayload) => {
            approveMutation.mutate({ id: editingApproval.id, modifiedPayload });
            setEditingApproval(null);
          }}
        />
      )}
    </div>
  );
}

function ApprovalCard({
  approval, queueItem, onApprove, onReject, onEdit, isLoading,
}: {
  approval: PendingApproval;
  queueItem: ActionQueueItem | undefined;
  onApprove: () => void;
  onReject: (note?: string) => void;
  onEdit: () => void;
  isLoading: boolean;
}) {
  const expiresIn = formatDistanceToNow(new Date(approval.expires_at), {
    locale: it,
    addSuffix: true,
  });
  const isExpiringSoon =
    new Date(approval.expires_at).getTime() - Date.now() < 60 * 60 * 1000; // <1h

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <ChevronsRight className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="truncate">
              {queueItem?.action_type ?? "Azione"}
            </span>
          </span>
          <Badge
            variant="outline"
            className={isExpiringSoon
              ? "border-amber-300 text-amber-700 bg-amber-50 shrink-0"
              : "shrink-0"}
          >
            <Clock className="h-3 w-3 mr-1" />
            scade {expiresIn}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Preview */}
        <div className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
          {approval.preview_md}
        </div>

        {/* Context (se presente) */}
        {approval.context && Object.keys(approval.context).length > 0 && (
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">Contesto</summary>
            <pre className="mt-1 p-2 rounded bg-muted/50 overflow-x-auto">
              {JSON.stringify(approval.context, null, 2)}
            </pre>
          </details>
        )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => {
                if (window.confirm("Approvare questa azione e metterla in coda di esecuzione?")) onApprove();
              }}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
            <Check className="h-4 w-4 mr-1.5" />
            Approva
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit} disabled={isLoading}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Modifica
          </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm("Rifiutare questa azione? Non verra eseguita.")) onReject();
              }}
              disabled={isLoading}
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
            >
            <X className="h-4 w-4 mr-1.5" />
            Rifiuta
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EditApprovalDialog({
  queueItem, onClose, onSaved,
}: {
  queueItem: ActionQueueItem | undefined;
  onClose: () => void;
  onSaved: (modifiedPayload: unknown) => void;
}) {
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(queueItem?.payload ?? {}, null, 2)
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(payloadText);
      setParseError(null);
      onSaved(parsed);
    } catch (e) {
      setParseError(`JSON non valido: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifica azione</DialogTitle>
          <DialogDescription>
            Modifica il payload JSON. Verrà eseguito con questi parametri al posto dell'originale.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            rows={16}
            className="font-mono text-xs"
          />
          {parseError && (
            <p className="text-xs text-rose-600 mt-1">{parseError}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave}>Approva con modifiche</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

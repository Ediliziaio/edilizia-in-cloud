/**
 * SilvioActionProposals — Lista bozze azioni Silvio in attesa di conferma.
 *
 * Mostra ai_action_proposals con status='pending', con bottoni:
 *   - Conferma e applica → invoca silvio-execute-action edge function
 *   - Modifica payload → apre dialog editor
 *   - Annulla → status='dismissed'
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Sparkles, CheckCircle2, X, Pencil, Mail, Wallet, Package, Send, Loader2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Proposal {
  id: string;
  action_type: string;
  summary: string;
  payload: Record<string, unknown>;
  status: string;
  risk_level: string;
  expires_at: string;
  created_at: string;
}

const ACTION_ICON: Record<string, typeof Send> = {
  send_overdue_reminder: Wallet,
  send_quote_followup: Mail,
  mark_payment_received: CheckCircle2,
  create_purchase_order: Package,
  generic_email: Mail,
};

const ACTION_LABEL: Record<string, string> = {
  send_overdue_reminder: "Invia sollecito pagamento",
  send_quote_followup: "Follow-up preventivo",
  mark_payment_received: "Segna pagamento ricevuto",
  create_purchase_order: "Crea ordine fornitore (bozza)",
  generic_email: "Invia email",
};

export function SilvioActionProposals({ compact = false }: { compact?: boolean }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Proposal | null>(null);

  const { data: proposals, isLoading } = useQuery({
    queryKey: ["silvio_action_proposals_pending", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("ai_action_proposals" as never)
        .select("id, action_type, summary, payload, status, risk_level, expires_at, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Proposal[];
    },
    enabled: !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const dismissMut = useMutation({
    mutationFn: async (proposalId: string) => {
      const { error } = await supabase
        .from("ai_action_proposals" as never)
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("id", proposalId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["silvio_action_proposals_pending"] });
      toast.success("Proposta annullata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const executeMut = useMutation({
    mutationFn: async ({ proposalId, overridePayload }: { proposalId: string; overridePayload?: Record<string, unknown> }) => {
      const { data, error } = await supabase.functions.invoke("silvio-execute-action", {
        body: { proposal_id: proposalId, override_payload: overridePayload },
      });
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any).context;
        if (ctx) {
          try {
            const body = await ctx.json?.();
            throw new Error(body?.error ?? body?.message ?? error.message);
          } catch (parseErr) {
            if (parseErr instanceof Error) throw parseErr;
          }
        }
        throw new Error(error.message);
      }
      return data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["silvio_action_proposals_pending"] });
      qc.invalidateQueries({ queryKey: ["silvio_alerts_open"] });
      qc.invalidateQueries({ queryKey: ["silvio_alerts_stats"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      if (r?.ok) toast.success(`✅ ${r.message}`);
      else toast.error(`❌ ${r?.message ?? "Esecuzione fallita"}`);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Azioni proposte</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24" /></CardContent>
      </Card>
    );
  }

  if (!proposals || proposals.length === 0) return null;

  return (
    <>
      <Card className="border-violet-200 bg-violet-50/30">
        <CardHeader className={cn("pb-3", compact && "py-3")}>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            Azioni proposte da Silvio
          </CardTitle>
          <CardDescription className="text-xs">
            {proposals.length} {proposals.length === 1 ? "bozza" : "bozze"} in attesa di conferma. Verifica e applica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {proposals.map(p => (
            <ProposalRow
              key={p.id}
              proposal={p}
              onConfirm={() => executeMut.mutate({ proposalId: p.id })}
              onEdit={() => setEditing(p)}
              onDismiss={() => dismissMut.mutate(p.id)}
              isApplying={executeMut.isPending && executeMut.variables?.proposalId === p.id}
              isDismissing={dismissMut.isPending && dismissMut.variables === p.id}
            />
          ))}
        </CardContent>
      </Card>

      {editing && (
        <ProposalEditDialog
          proposal={editing}
          onClose={() => setEditing(null)}
          onApply={(override) => executeMut.mutate({ proposalId: editing.id, overridePayload: override })}
          isApplying={executeMut.isPending}
        />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function ProposalRow({
  proposal, onConfirm, onEdit, onDismiss, isApplying, isDismissing,
}: {
  proposal: Proposal;
  onConfirm: () => void;
  onEdit: () => void;
  onDismiss: () => void;
  isApplying: boolean;
  isDismissing: boolean;
}) {
  const Icon = ACTION_ICON[proposal.action_type] ?? Send;
  const label = ACTION_LABEL[proposal.action_type] ?? proposal.action_type;
  const isHighRisk = proposal.risk_level === "red";
  const expiresIn = Math.max(0, Math.floor((new Date(proposal.expires_at).getTime() - Date.now()) / (1000 * 60 * 60)));

  const recipient =
    (proposal.payload as { client_name?: string; client_email?: string; to?: string }).client_name ??
    (proposal.payload as { client_email?: string }).client_email ??
    (proposal.payload as { to?: string }).to;

  return (
    <div className="rounded-lg border border-violet-200 bg-white p-3 space-y-2">
      <div className="flex items-start gap-2.5">
        <div className="rounded-md ring-1 ring-violet-200 bg-violet-50 p-1.5 shrink-0">
          <Icon className="h-3.5 w-3.5 text-violet-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium leading-tight">{label}</div>
            {isHighRisk && <Badge variant="destructive" className="text-[10px]">RISCHIO ALTO</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{proposal.summary}</p>
          {recipient && (
            <p className="text-[10px] text-muted-foreground mt-1">
              <span className="font-medium">→</span> {recipient}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> Scade in {expiresIn}h
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button
          size="sm" className="h-7 px-2 text-xs gap-1"
          onClick={onConfirm}
          disabled={isApplying || isDismissing}
        >
          {isApplying
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Applico…</>
            : <><CheckCircle2 className="h-3 w-3" /> Conferma e applica</>
          }
        </Button>
        <Button
          size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
          onClick={onEdit}
          disabled={isApplying || isDismissing}
        >
          <Pencil className="h-3 w-3" /> Modifica
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-rose-600 hover:bg-rose-50"
          onClick={onDismiss}
          disabled={isApplying || isDismissing}
        >
          <X className="h-3 w-3" /> Annulla
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function ProposalEditDialog({
  proposal, onClose, onApply, isApplying,
}: {
  proposal: Proposal;
  onClose: () => void;
  onApply: (override: Record<string, unknown>) => void;
  isApplying: boolean;
}) {
  // Genera form basato sul tipo di azione
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initial = (proposal.payload ?? {}) as any;

  const [to, setTo] = useState<string>(initial.client_email ?? initial.to ?? "");
  const [subject, setSubject] = useState<string>(initial.subject ?? "");
  const [body, setBody] = useState<string>(initial.body ?? "");
  const [reorderQty, setReorderQty] = useState<string>(String(initial.reorder_qty ?? ""));

  const isEmail = ["send_overdue_reminder", "send_quote_followup", "generic_email"].includes(proposal.action_type);
  const isPO = proposal.action_type === "create_purchase_order";

  const handleApply = () => {
    const override: Record<string, unknown> = { ...initial };
    if (isEmail) {
      if (to) override.client_email = to;
      if (to) override.to = to;
      if (subject) override.subject = subject;
      if (body) override.body = body;
    }
    if (isPO) {
      if (reorderQty) override.reorder_qty = Number(reorderQty);
    }
    onApply(override);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifica proposta</DialogTitle>
          <DialogDescription>
            {ACTION_LABEL[proposal.action_type] ?? proposal.action_type}: {proposal.summary}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isEmail && (
            <>
              <div>
                <Label>Destinatario</Label>
                <Input value={to} onChange={(e) => setTo(e.target.value)} type="email" placeholder="cliente@email.it" />
              </div>
              <div>
                <Label>Oggetto</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Sollecito pagamento" />
              </div>
              <div>
                <Label>Testo (HTML)</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  placeholder="(lascia vuoto per usare il template predefinito)"
                  className="text-xs font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lasciato vuoto: Silvio userà il template predefinito basato sul payload.
                </p>
              </div>
            </>
          )}
          {isPO && (
            <div>
              <Label>Quantità riordino</Label>
              <Input value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} type="number" min="1" />
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Vedi payload completo (debug)</summary>
            <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-auto">
              {JSON.stringify(proposal.payload, null, 2)}
            </pre>
          </details>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleApply} disabled={isApplying} className="gap-1">
            {isApplying
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applico…</>
              : <><CheckCircle2 className="h-3.5 w-3.5" /> Conferma e applica</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

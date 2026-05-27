/**
 * SilvioActionProposals — Lista bozze azioni Silvio in attesa di conferma.
 *
 * Mostra ai_action_proposals con status='pending', con bottoni:
 *   - Conferma e applica → invoca silvio-execute-action edge function
 *   - Modifica payload → apre dialog editor
 *   - Rifiuta → invoca RPC auditata
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
  create_quote_draft: Send,
  create_invoice_draft: Wallet,
  generic_email: Mail,
  // Aliases italiani (proposal storiche o generate da silvioTools.create_action_draft)
  preventivo_bozza: Send,
  bozza_preventivo: Send,
  sollecito_pagamento: Wallet,
  email_recupero_crediti: Wallet,
  follow_up_preventivo: Mail,
  followup_preventivo: Mail,
  riordino_materiale: Package,
  ordine_fornitore: Package,
  bozza_fattura: Wallet,
  fattura_bozza: Wallet,
};

const ACTION_LABEL: Record<string, string> = {
  send_overdue_reminder: "Invia sollecito pagamento",
  send_quote_followup: "Follow-up preventivo",
  mark_payment_received: "Segna pagamento ricevuto",
  create_purchase_order: "Crea ordine fornitore (bozza)",
  create_quote_draft: "Crea bozza preventivo",
  create_invoice_draft: "Crea bozza fattura",
  generic_email: "Invia email",
  // Aliases italiani
  preventivo_bozza: "Crea bozza preventivo",
  bozza_preventivo: "Crea bozza preventivo",
  sollecito_pagamento: "Invia sollecito pagamento",
  email_recupero_crediti: "Email recupero crediti",
  follow_up_preventivo: "Follow-up preventivo",
  followup_preventivo: "Follow-up preventivo",
  riordino_materiale: "Crea ordine fornitore (bozza)",
  ordine_fornitore: "Crea ordine fornitore (bozza)",
  bozza_fattura: "Crea bozza fattura",
  fattura_bozza: "Crea bozza fattura",
};

const STRONG_CONFIRM_ACTIONS = new Set(["mark_payment_received", "generic_email"]);

function requiresStrongConfirmation(proposal: Proposal) {
  return proposal.risk_level === "red" || STRONG_CONFIRM_ACTIONS.has(proposal.action_type);
}

function confirmationPhrase(proposal: Proposal) {
  return `CONFERMO ${proposal.action_type}`;
}

function getActionPayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (
    payload?.input &&
    typeof payload.input === "object" &&
    !Array.isArray(payload.input)
  ) {
    return payload.input as Record<string, unknown>;
  }
  return payload ?? {};
}

function sanitizePayloadForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePayloadForDisplay);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("token") ||
        normalizedKey.includes("secret") ||
        normalizedKey.includes("password") ||
        normalizedKey.includes("api_key") ||
        normalizedKey.includes("apikey")
      ) {
        return [key, "••••••••"];
      }
      return [key, sanitizePayloadForDisplay(nestedValue)];
    }),
  );
}

export function SilvioActionProposals({ compact = false }: { compact?: boolean }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Proposal | null>(null);
  const [confirming, setConfirming] = useState<Proposal | null>(null);

  const { data: proposals, isLoading } = useQuery({
    queryKey: ["silvio_action_proposals_pending", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      // FIX TENANT ISOLATION: filtro company_id esplicito (super_admin RLS
      // bypass + get_my_company_id non rispetta impersonation).
      const { data, error } = await supabase
        .from("ai_action_proposals" as never)
        .select("id, action_type, summary, payload, status, risk_level, expires_at, created_at")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Proposal[];
    },
    enabled: !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const dismissMut = useMutation({
    mutationFn: async (proposalId: string) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { error } = await supabase.rpc("silvio_tool_reject_proposal" as never, {
        p_company_id: companyId,
        p_proposal_id: proposalId,
        p_reason: "Rifiutata dalla UI Silvio",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["silvio_action_proposals_pending"] });
      toast.success("Proposta annullata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const executeMut = useMutation({
    mutationFn: async ({
      proposalId,
      overridePayload,
      confirmationText,
    }: {
      proposalId: string;
      overridePayload?: Record<string, unknown>;
      confirmationText?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("silvio-execute-action", {
        body: { proposal_id: proposalId, override_payload: overridePayload, confirmation_text: confirmationText },
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
      setConfirming(null);
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
      <Card className={cn("border-orange-200 bg-orange-50/35", compact && "shadow-none")}>
        <CardHeader className={cn("pb-3", compact && "px-3 py-3")}>
          <CardTitle className={cn("flex items-center gap-2", compact ? "text-sm" : "text-base")}>
            <Sparkles className="h-4 w-4 text-orange-500" />
            Azioni proposte da Silvio
          </CardTitle>
          <CardDescription className="text-xs">
            {proposals.length} {proposals.length === 1 ? "bozza" : "bozze"} in attesa di conferma. Verifica e applica.
          </CardDescription>
        </CardHeader>
        <CardContent className={cn("space-y-2", compact && "px-3 pb-3")}>
          {proposals.map(p => (
            <ProposalRow
              key={p.id}
              proposal={p}
              onConfirm={() => {
                if (requiresStrongConfirmation(p)) {
                  setConfirming(p);
                } else {
                  executeMut.mutate({ proposalId: p.id });
                }
              }}
              onEdit={() => setEditing(p)}
              onDismiss={() => dismissMut.mutate(p.id)}
              isApplying={executeMut.isPending && executeMut.variables?.proposalId === p.id}
              isDismissing={dismissMut.isPending && dismissMut.variables === p.id}
              compact={compact}
            />
          ))}
        </CardContent>
      </Card>

      {editing && (
        <ProposalEditDialog
          proposal={editing}
          onClose={() => setEditing(null)}
          onApply={(override, confirmationText) => executeMut.mutate({
            proposalId: editing.id,
            overridePayload: override,
            confirmationText,
          })}
          isApplying={executeMut.isPending}
        />
      )}

      {confirming && (
        <StrongConfirmDialog
          proposal={confirming}
          onClose={() => setConfirming(null)}
          onConfirm={(confirmationText) => executeMut.mutate({
            proposalId: confirming.id,
            confirmationText,
          })}
          isApplying={executeMut.isPending}
        />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function ProposalRow({
  proposal, onConfirm, onEdit, onDismiss, isApplying, isDismissing, compact,
}: {
  proposal: Proposal;
  onConfirm: () => void;
  onEdit: () => void;
  onDismiss: () => void;
  isApplying: boolean;
  isDismissing: boolean;
  compact: boolean;
}) {
  const Icon = ACTION_ICON[proposal.action_type] ?? Send;
  const label = ACTION_LABEL[proposal.action_type] ?? proposal.action_type;
  const isHighRisk = proposal.risk_level === "red";
  const needsStrongConfirmation = requiresStrongConfirmation(proposal);
  const expiresIn = Math.max(0, Math.floor((new Date(proposal.expires_at).getTime() - Date.now()) / (1000 * 60 * 60)));
  const actionPayload = getActionPayload(proposal.payload);

  const recipient =
    (actionPayload as { client_name?: string; client_email?: string; to?: string }).client_name ??
    (actionPayload as { client_email?: string }).client_email ??
    (actionPayload as { to?: string }).to;

  return (
    <div className={cn("rounded-lg border border-orange-200 bg-white shadow-sm", compact ? "p-2.5 space-y-2" : "p-3 space-y-2")}>
      <div className="flex items-start gap-2.5">
        <div className="rounded-md ring-1 ring-orange-200 bg-orange-50 p-1.5 shrink-0">
          <Icon className="h-3.5 w-3.5 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium leading-tight">{label}</div>
            {isHighRisk && <Badge variant="destructive" className="text-[10px]">RISCHIO ALTO</Badge>}
          </div>
          <p className={cn("text-xs text-muted-foreground mt-0.5", compact ? "line-clamp-1" : "line-clamp-2")}>{proposal.summary}</p>
          {needsStrongConfirmation && (
            <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800">
              Richiede conferma forte prima dell'esecuzione.
            </p>
          )}
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
      <div className={cn("gap-1.5 pt-1", compact ? "grid grid-cols-[1fr_auto_auto]" : "flex flex-wrap")}>
        <Button
          size="sm" className={cn("h-7 px-2 text-xs gap-1", compact && "min-w-0")}
          onClick={onConfirm}
          disabled={isApplying || isDismissing}
        >
          {isApplying
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Applico…</>
            : <><CheckCircle2 className="h-3 w-3" /> {needsStrongConfirmation ? "Conferma forte" : "Conferma e applica"}</>
          }
        </Button>
        <Button
          size="sm" variant={compact ? "ghost" : "outline"} className="h-7 px-2 text-xs gap-1"
          onClick={onEdit}
          disabled={isApplying || isDismissing}
        >
          <Pencil className="h-3 w-3" /> <span className={cn(compact && "sr-only")}>Modifica</span>
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-rose-600 hover:bg-rose-50"
          onClick={onDismiss}
          disabled={isApplying || isDismissing}
        >
          <X className="h-3 w-3" /> <span className={cn(compact && "sr-only")}>Annulla</span>
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
  onApply: (override: Record<string, unknown>, confirmationText?: string) => void;
  isApplying: boolean;
}) {
  // Genera form basato sul tipo di azione
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initial = getActionPayload(proposal.payload) as any;

  const [to, setTo] = useState<string>(initial.client_email ?? initial.to ?? "");
  const [subject, setSubject] = useState<string>(initial.subject ?? "");
  const [body, setBody] = useState<string>(initial.body ?? "");
  const [reorderQty, setReorderQty] = useState<string>(String(initial.reorder_qty ?? ""));
  const [confirmation, setConfirmation] = useState("");

  const isEmail = ["send_overdue_reminder", "send_quote_followup", "generic_email"].includes(proposal.action_type);
  const isPO = proposal.action_type === "create_purchase_order";
  const needsStrongConfirmation = requiresStrongConfirmation(proposal);
  const expectedConfirmation = confirmationPhrase(proposal);
  const confirmationOk = !needsStrongConfirmation || confirmation.trim() === expectedConfirmation;

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
    onApply(override, needsStrongConfirmation ? confirmation.trim() : undefined);
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
          {needsStrongConfirmation && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <Label>Conferma forte</Label>
              <p className="mb-2 text-xs text-amber-800">
                Per applicare questa azione scrivi: <strong>{expectedConfirmation}</strong>
              </p>
              <Input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={expectedConfirmation}
              />
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Vedi dati tecnici usati da Silvio</summary>
            <pre className="mt-2 p-2 bg-muted rounded text-[10px] overflow-auto">
              {JSON.stringify(sanitizePayloadForDisplay(proposal.payload), null, 2)}
            </pre>
          </details>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleApply} disabled={isApplying || !confirmationOk} className="gap-1">
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

function StrongConfirmDialog({
  proposal, onClose, onConfirm, isApplying,
}: {
  proposal: Proposal;
  onClose: () => void;
  onConfirm: (confirmationText: string) => void;
  isApplying: boolean;
}) {
  const [confirmation, setConfirmation] = useState("");
  const expected = confirmationPhrase(proposal);
  const label = ACTION_LABEL[proposal.action_type] ?? proposal.action_type;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Conferma forte richiesta</DialogTitle>
          <DialogDescription>
            {label}: {proposal.summary}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Questa azione modifica dati economici o invia comunicazioni esterne. Scrivi esattamente:
          <div className="mt-2 rounded bg-white px-2 py-1 font-mono text-xs">{expected}</div>
        </div>
        <Input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={expected}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => onConfirm(confirmation.trim())}
            disabled={isApplying || confirmation.trim() !== expected}
            className="gap-1"
          >
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

/**
 * ApprovalsTab — pending approvals da Silvio
 *
 * v2 (2026-05-25) — bug fix profondo:
 *   - window.confirm rimosso, sostituito con dialog modali stilizzati
 *   - risk_level mostrato con badge colorato
 *   - action_type visibile in cima alla card
 *   - countdown live alla scadenza
 *   - input motivazione su reject (alimenta self-learning)
 *   - preview_md renderizzato con prose styling
 *   - filtri per risk_level + sort by priority
 *   - re-auth password obbligatoria per critical/red
 *   - audit log esplicito client-side (forensics)
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, formatDistanceStrict } from "date-fns";
import { it } from "date-fns/locale";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmWithPasswordDialog } from "@/components/admin/ConfirmWithPasswordDialog";
import { logAdminAuditAction } from "@/lib/admin/auditLog";
import type { PendingApproval, ApprovalRiskLevel } from "./shared";

const RISK_LABEL: Record<string, string> = {
  low: "Basso",
  medium: "Medio",
  yellow: "Medio",
  high: "Alto",
  red: "Alto",
  critical: "Critico",
};

const RISK_BADGE: Record<string, string> = {
  low: "border-slate-200 bg-slate-50 text-slate-700",
  medium: "border-blue-200 bg-blue-50 text-blue-700",
  yellow: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
  critical: "border-rose-300 bg-rose-100 text-rose-900",
};

// Risk weight per ordinamento priorità (più alto = più urgente)
const RISK_WEIGHT: Record<string, number> = {
  critical: 100,
  red: 80,
  high: 70,
  yellow: 50,
  medium: 40,
  low: 10,
};

const STATUS_LITERALS = {
  approved: "approved",
  rejected: "rejected",
} as const;

type ResolveStatus = (typeof STATUS_LITERALS)[keyof typeof STATUS_LITERALS];

function normalizeRisk(value: string | null | undefined): ApprovalRiskLevel | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v in RISK_LABEL) return v as ApprovalRiskLevel;
  return null;
}

function isCritical(risk: ApprovalRiskLevel | null): boolean {
  return risk === "critical" || risk === "red" || risk === "high";
}

export function ApprovalsTab() {
  const queryClient = useQueryClient();
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [confirmTarget, setConfirmTarget] = useState<
    | { approval: PendingApproval; status: ResolveStatus; needsPasswordAuth: boolean }
    | null
  >(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["silvio-pending-approvals"],
    refetchInterval: 30_000,
    // refetchIntervalInBackground default false → niente refetch quando il
    // tab del browser non è focused (battery + cost saver)
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

  // Ordinamento: prima per risk_level (critical → low), poi per created_at desc.
  const sortedFiltered = useMemo(() => {
    const list = data ?? [];
    const filtered = riskFilter === "all" ? list : list.filter((a) => normalizeRisk(a.risk_level) === riskFilter);
    return [...filtered].sort((a, b) => {
      const aWeight = RISK_WEIGHT[normalizeRisk(a.risk_level) ?? "low"] ?? 0;
      const bWeight = RISK_WEIGHT[normalizeRisk(b.risk_level) ?? "low"] ?? 0;
      if (aWeight !== bWeight) return bWeight - aWeight;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [data, riskFilter]);

  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: data?.length ?? 0 };
    (data ?? []).forEach((a) => {
      const r = normalizeRisk(a.risk_level) ?? "low";
      counts[r] = (counts[r] ?? 0) + 1;
    });
    return counts;
  }, [data]);

  const resolveMutation = useMutation({
    mutationFn: async ({
      approval,
      status,
      note,
    }: {
      approval: PendingApproval;
      status: ResolveStatus;
      note?: string;
    }) => {
      // Type-safe RPC call (no più `as never` workaround).
      // I types in supabase/types.ts ora rispecchiano la funzione DB.
      const { error } = await supabase.rpc("silvio_admin_resolve_approval", {
        p_approval_id: approval.id,
        p_status: status,
        // `p_modified_payload` accetta Json | null — passiamo undefined per
        // delegare il default DB (NULL).
        p_resolution_note: note ?? undefined,
      });
      if (error) throw error;
      // Audit log esplicito client-side (oltre a quello DB-level dell'RPC).
      // Forensics ridondante = good practice per azioni distruttive.
      void logAdminAuditAction({
        action: status === "approved" ? "silvio_approval.approve" : "silvio_approval.reject",
        targetType: "silvio_pending_approval",
        targetId: approval.id,
        details: {
          action_id: approval.action_id,
          action_type: approval.action_type ?? null,
          risk_level: approval.risk_level ?? null,
          company_id: approval.company_id ?? null,
          resolution_note: note ?? null,
        },
      });
    },
    onSuccess: (_, { status }) => {
      toast.success(
        status === "approved" ? "Approvata · in esecuzione" : "Rifiutata · feedback registrato",
      );
      queryClient.invalidateQueries({ queryKey: ["silvio-pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
      queryClient.invalidateQueries({ queryKey: ["ai-operate-counters"] });
      setConfirmTarget(null);
      setRejectNote("");
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const openConfirm = (approval: PendingApproval, status: ResolveStatus) => {
    const risk = normalizeRisk(approval.risk_level);
    const needsPasswordAuth = status === "approved" && isCritical(risk);
    setConfirmTarget({ approval, status, needsPasswordAuth });
    setRejectNote("");
  };

  const executeResolve = (note?: string) => {
    if (!confirmTarget) return;
    resolveMutation.mutate({
      approval: confirmTarget.approval,
      status: confirmTarget.status,
      note,
    });
  };

  return (
    <div className="space-y-3">
      {/* Toolbar: filter + counter + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {sortedFiltered.length}/{data?.length ?? 0} azioni
            {riskFilter !== "all" ? ` · filtro: ${RISK_LABEL[riskFilter]}` : " in attesa"}
          </p>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Filtra rischio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti ({riskCounts.all ?? 0})</SelectItem>
              {(["critical", "red", "high", "yellow", "medium", "low"] as const).map((r) =>
                riskCounts[r] ? (
                  <SelectItem key={r} value={r}>
                    {RISK_LABEL[r]} ({riskCounts[r]})
                  </SelectItem>
                ) : null,
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Aggiorna lista approvazioni"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          Aggiorna
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="p-2">
            <EmptyState
              icon={CheckCircle2}
              tone="success"
              size="md"
              title="Nessuna azione in attesa"
              description="Silvio è in pari · le approvazioni nuove appariranno qui in tempo reale"
            />
          </CardContent>
        </Card>
      ) : sortedFiltered.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          size="sm"
          title="Nessuna approvazione con questo filtro"
          action={{ label: "Mostra tutte", onClick: () => setRiskFilter("all"), variant: "ghost" }}
        />
      ) : (
        sortedFiltered.map((a) => <ApprovalCard key={a.id} approval={a} onResolve={openConfirm} />)
      )}

      {/* ─── Confirm dialog (no più window.confirm nativo) ───────────────── */}
      {confirmTarget && !confirmTarget.needsPasswordAuth && (
        <ConfirmApprovalDialog
          open={!!confirmTarget}
          target={confirmTarget}
          rejectNote={rejectNote}
          onRejectNoteChange={setRejectNote}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => executeResolve(rejectNote.trim() || undefined)}
          busy={resolveMutation.isPending}
        />
      )}

      {/* ─── Re-auth password per critical/red approvals ─────────────────── */}
      {confirmTarget?.needsPasswordAuth && (
        <ConfirmWithPasswordDialog
          open={!!confirmTarget}
          onOpenChange={(o) => !o && setConfirmTarget(null)}
          title={`Approvare azione ${normalizeRisk(confirmTarget.approval.risk_level)?.toUpperCase()} risk?`}
          description={
            <>
              Stai approvando un&apos;azione classificata come <strong>{RISK_LABEL[normalizeRisk(confirmTarget.approval.risk_level) ?? "critical"]}</strong> risk.
              {confirmTarget.approval.action_type ? (
                <> Tipo: <code className="rounded bg-muted px-1 text-[11px]">{confirmTarget.approval.action_type}</code>.</>
              ) : null}{" "}
              Una volta approvata sarà eseguita immediatamente da Silvio.
            </>
          }
          destructiveLabel="Approva con re-auth"
          onConfirmed={() => executeResolve()}
        />
      )}
    </div>
  );
}

// ─── Card singola approvazione ──────────────────────────────────────────────

function ApprovalCard({
  approval,
  onResolve,
}: {
  approval: PendingApproval;
  onResolve: (a: PendingApproval, status: ResolveStatus) => void;
}) {
  const risk = normalizeRisk(approval.risk_level);
  const riskBadgeClass = risk ? RISK_BADGE[risk] : RISK_BADGE.low;

  // Countdown alla scadenza — live update via re-render naturali (il parent
  // refetcha ogni 30s, quindi UI è always fresh ±30s)
  const expiresAt = new Date(approval.expires_at).getTime();
  const now = Date.now();
  const msToExpire = expiresAt - now;
  const minToExpire = Math.round(msToExpire / 60_000);
  const isUrgent = msToExpire > 0 && msToExpire < 15 * 60_000; // < 15 min
  const isExpired = msToExpire <= 0;

  const borderClass =
    risk === "critical" || risk === "red"
      ? "border-rose-300"
      : risk === "high" || risk === "yellow"
        ? "border-amber-300"
        : "border-slate-200";

  return (
    <Card className={cn("transition-all", borderClass, isUrgent && "ring-1 ring-amber-200")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle
                className={cn(
                  "h-4 w-4",
                  risk === "critical" || risk === "red" ? "text-rose-600" : "text-amber-600",
                )}
              />
              <span className="font-semibold">Approvazione richiesta</span>
              {approval.action_type ? (
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700">
                  {approval.action_type}
                </code>
              ) : null}
              {risk ? (
                <Badge variant="outline" className={cn("text-[10px]", riskBadgeClass)}>
                  <ShieldAlert className="h-3 w-3 mr-1" />
                  {RISK_LABEL[risk]} risk
                </Badge>
              ) : null}
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">
              {format(new Date(approval.created_at), "dd MMM HH:mm", { locale: it })}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Preview markdown — manteniamo whitespace ma con typography migliore */}
        <div className="bg-muted/40 rounded-md p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
          {approval.preview_md}
        </div>

        {/* Context aggiuntivo (se il backend lo popola) */}
        {approval.context && Object.keys(approval.context).length > 0 && (
          <details className="rounded-md border border-slate-200 bg-slate-50/50 text-[11px]">
            <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700 hover:bg-slate-100/50">
              Mostra contesto tecnico ({Object.keys(approval.context).length} chiavi)
            </summary>
            <pre className="overflow-x-auto px-3 py-2 font-mono text-[10px] text-slate-600">
              {JSON.stringify(approval.context, null, 2)}
            </pre>
          </details>
        )}

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => onResolve(approval, STATUS_LITERALS.approved)}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Approva
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onResolve(approval, STATUS_LITERALS.rejected)}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Rifiuta
          </Button>
          {/* Spazio per countdown */}
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 text-[10px]",
              isExpired
                ? "text-rose-600 font-semibold"
                : isUrgent
                  ? "text-amber-700 font-medium"
                  : "text-muted-foreground",
            )}
          >
            <Clock className="h-3 w-3" />
            {isExpired
              ? "scaduta"
              : msToExpire < 60_000
                ? "scade in <1 min"
                : `scade in ${formatDistanceStrict(new Date(approval.expires_at), new Date(), { locale: it })}`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dialog conferma (sostituto di window.confirm) ──────────────────────────

function ConfirmApprovalDialog({
  open,
  target,
  rejectNote,
  onRejectNoteChange,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  target: { approval: PendingApproval; status: ResolveStatus };
  rejectNote: string;
  onRejectNoteChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const isApprove = target.status === STATUS_LITERALS.approved;

  if (isApprove) {
    return (
      <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Approvare questa azione?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Silvio metterà l&apos;azione{" "}
              {target.approval.action_type ? (
                <code className="rounded bg-muted px-1 text-[11px]">{target.approval.action_type}</code>
              ) : (
                "selezionata"
              )}{" "}
              in esecuzione immediata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approva ed esegui
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // Reject: dialog con textarea per motivazione (alimenta self-learning loop)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-rose-600" />
            Rifiutare questa azione?
          </DialogTitle>
          <DialogDescription>
            L&apos;azione non verrà eseguita. Il feedback testuale viene salvato e
            alimenta il self-learning loop di Silvio (lo migliora nel tempo).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-note" className="text-sm">
            Motivazione (consigliata)
          </Label>
          <Textarea
            id="reject-note"
            placeholder="Es: il claim non è verificabile, il contesto è incompleto, troppo aggressivo per il tono brand…"
            value={rejectNote}
            onChange={(e) => onRejectNoteChange(e.target.value)}
            rows={3}
            disabled={busy}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={busy}
            className="gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Rifiuta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

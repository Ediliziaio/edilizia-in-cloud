/**
 * ActionProposalCard — MP-AIE-02 v2
 *
 * Card singola per visualizzare/confermare/rifiutare una proposta di azione
 * (`ai_action_proposals`) generata da un tool con riskLevel='yellow'|'red'.
 *
 * Sostituisce il vecchio SilvioActionProposals (che resta come wrapper di
 * back-compat). Funziona per Silvio + 18 personas + WhatsApp + Telegram +
 * voice — il payload è uguale per tutti, l'apply usa silvio-execute-action.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

interface ProposalRow {
  id: string;
  company_id: string;
  user_id: string;
  persona_key: string | null;
  action_type: string;
  summary: string;
  payload: Record<string, unknown> | null;
  status: "pending" | "confirmed" | "rejected" | "expired" | "applied" | "failed";
  risk_level: "yellow" | "red";
  expires_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  applied_at: string | null;
  applied_result: Record<string, unknown> | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "In attesa",
  confirmed: "Confermata",
  rejected: "Rifiutata",
  expired: "Scaduta",
  applied: "Applicata",
  failed: "Fallita",
};

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

export function ActionProposalCard({ proposalId }: { proposalId: string }) {
  const [proposal, setProposal] = useState<ProposalRow | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<string>("");

  // Initial fetch + realtime subscription
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ai_action_proposals" as never)
        .select("*")
        .eq("id", proposalId)
        .maybeSingle();
      if (!cancelled && data) setProposal(data as unknown as ProposalRow);
    })();

    const channel = supabase
      .channel(`proposal-${proposalId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ai_action_proposals",
          filter: `id=eq.${proposalId}`,
        },
        (payload) => {
          if (!cancelled && payload.new) setProposal(payload.new as unknown as ProposalRow);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [proposalId]);

  // Countdown TTL
  useEffect(() => {
    if (!proposal?.expires_at) {
      setCountdown("");
      return;
    }
    const tick = () => {
      const ms = new Date(proposal.expires_at!).getTime() - Date.now();
      if (ms <= 0) { setCountdown("scaduta"); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setCountdown(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [proposal?.expires_at]);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      const confirmationText = proposal?.risk_level === "red"
        ? window.prompt(`Conferma forte richiesta. Scrivi: CONFERMO ${proposal.action_type}`) ?? ""
        : undefined;
      const { error: invokeErr } = await supabase.functions.invoke("silvio-execute-action", {
        body: { proposal_id: proposalId, action: "confirm", confirmation_text: confirmationText },
      });
      if (invokeErr) throw new Error(invokeErr.message);
      toast.success("Azione applicata con successo");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!proposal?.company_id) return;
    setIsProcessing(true);
    try {
      const { error: dbErr } = await supabase.rpc("silvio_tool_reject_proposal" as never, {
        p_company_id: proposal.company_id,
        p_proposal_id: proposalId,
        p_reason: "Rifiutata dalla UI",
      } as never);
      if (dbErr) throw new Error(dbErr.message);
      toast.info("Azione rifiutata");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Errore: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!proposal) {
    return (
      <Card className="mt-3">
        <CardContent className="p-3 text-xs text-muted-foreground">
          Caricamento proposta…
        </CardContent>
      </Card>
    );
  }

  const isPending = proposal.status === "pending";
  const isRed = proposal.risk_level === "red";
  const labelTitle = isRed ? "Conferma OBBLIGATORIA" : "Conferma azione";

  return (
    <Card className={`mt-3 border-l-4 ${isRed ? "border-l-destructive" : "border-l-amber-500"}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className={`h-4 w-4 ${isRed ? "text-destructive" : "text-amber-500"}`} />
          <span>{labelTitle}</span>
          <Badge variant={isPending ? "default" : "outline"} className="ml-auto text-[10px]">
            {STATUS_LABEL[proposal.status] ?? proposal.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{proposal.summary}</p>

        {proposal.payload && Object.keys(proposal.payload).length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Dettagli payload</summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px]">
              {JSON.stringify(getActionPayload(proposal.payload), null, 2)}
            </pre>
          </details>
        )}

        {isPending && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {countdown ? `Scade tra ${countdown}` : "Senza scadenza"}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleReject} disabled={isProcessing}>
                <XCircle className="mr-1 h-3 w-3" />
                Rifiuta
              </Button>
              <Button size="sm" onClick={handleConfirm} disabled={isProcessing}>
                <CheckCircle className="mr-1 h-3 w-3" />
                Conferma
              </Button>
            </div>
          </div>
        )}

        {!isPending && proposal.resolution_note && (
          <p className="text-xs text-muted-foreground">{proposal.resolution_note}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default ActionProposalCard;

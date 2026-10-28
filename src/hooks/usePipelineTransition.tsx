import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { savePipelineTransition } from "@/lib/api/pipelineTransitions";
import {
  planPipelineTransition,
  type PipelineDocument,
  type PipelineKind,
  type PipelineTransition,
} from "@/lib/orders/pipelineTransitions";
import { queryKeys } from "@/lib/queryKeys";

export function usePipelineTransition({
  kind,
  enabled,
  onPlan,
}: {
  kind: PipelineKind;
  enabled: boolean;
  onPlan?: (id: string) => void;
}) {
  const [pending, setPending] = useState<PipelineTransition | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sopralluoghi-bacheca"] }),
      queryClient.invalidateQueries({ queryKey: ["sopralluoghi-list"] }),
      queryClient.invalidateQueries({
        queryKey: ["sopralluogo", pending?.document.id],
      }),
      queryClient.invalidateQueries({ queryKey: ["supplier-rfqs"] }),
      queryClient.invalidateQueries({
        queryKey: ["supplier-rfq-detail", pending?.document.id],
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.ddtRicezione.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.purchaseOrders.detail(pending?.document.id),
      }),
    ]);
  };
  const request = (document: PipelineDocument, target: string) => {
    if (!enabled || saving || lock.current) return;
    const plan = planPipelineTransition(kind, document, target);
    if (plan?.action === "plan" && onPlan) {
      onPlan(document.id);
      return;
    }
    setPending(plan);
  };
  const confirm = async () => {
    if (!pending || !enabled || saving || lock.current) return;
    if (pending.action !== "save") {
      navigate(pending.document.href);
      setPending(null);
      return;
    }
    if (!companyId || !user) {
      toast.error("Sessione non disponibile. Accedi di nuovo.");
      return;
    }
    lock.current = true;
    setSaving(true);
    try {
      await savePipelineTransition(pending, companyId, user.id);
      await refresh();
      toast.success("Fase aggiornata");
      setPending(null);
    } catch (error) {
      toast.error("Spostamento non salvato", {
        description: error instanceof Error ? error.message : "Riprova",
      });
      await refresh();
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const dialog = (
    <Dialog
      open={!!pending && enabled}
      onOpenChange={(open) => {
        if (!open && !saving) setPending(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          <DialogDescription>{pending?.document.label}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{pending?.description}</p>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setPending(null)}
          >
            Annulla
          </Button>
          <Button disabled={saving || !enabled} onClick={() => void confirm()}>
            {saving
              ? "Salvataggio…"
              : pending?.action === "save"
                ? "Conferma spostamento"
                : "Apri e completa il passaggio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { request, saving, dialog };
}

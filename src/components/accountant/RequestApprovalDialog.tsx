/**
 * Dialog reusable per il commercialista in modalità approval_required.
 *
 * Invece di scrivere direttamente sul DB, il commercialista invia una
 * richiesta che l'azienda dovrà approvare. Questo wrapper permette a
 * qualsiasi pulsante "Salva/Crea/Modifica/Elimina" di intercettare
 * l'azione e mostrare il dialog di conferma.
 *
 * Uso:
 *   const submit = useSubmitChangeRequest();
 *   <RequestApprovalDialog
 *     trigger={<Button>Salva</Button>}
 *     resourceType="prima_nota"
 *     operation="create"
 *     payload={formValues}
 *     companyId={companyId}
 *   />
 */

import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import {
  useSubmitChangeRequest,
  type ChangeRequestOperation,
} from "@/hooks/accountant/useAccountantChangeRequests";

interface RequestApprovalDialogProps {
  trigger: ReactNode;
  companyId: string;
  companyName?: string;
  resourceType: string;
  resourceId?: string;
  operation: ChangeRequestOperation;
  payload: Record<string, unknown>;
  /** Callback chiamata al success della submission */
  onSuccess?: () => void;
}

function operationVerb(op: ChangeRequestOperation): string {
  if (op === "create") return "creare";
  if (op === "update") return "modificare";
  return "eliminare";
}

export function RequestApprovalDialog({
  trigger,
  companyId,
  companyName,
  resourceType,
  resourceId,
  operation,
  payload,
  onSuccess,
}: RequestApprovalDialogProps) {
  const [open, setOpen] = useState(false);
  const submit = useSubmitChangeRequest();

  async function handleSubmit() {
    try {
      await submit.mutateAsync({
        companyId,
        resourceType,
        resourceId,
        operation,
        payload,
      });
      setOpen(false);
      onSuccess?.();
    } catch {
      // toast già mostrato dall'hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Richiedi approvazione
          </DialogTitle>
          <DialogDescription>
            Operi su {companyName ?? "questa azienda"} in modalità{" "}
            <Badge variant="outline" className="mx-0.5 font-mono text-[10px]">
              approval_required
            </Badge>{" "}
            : la tua azione non verrà eseguita subito ma inviata all'azienda per
            approvazione.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <p>
            Stai per chiedere di <strong>{operationVerb(operation)}</strong> una
            risorsa di tipo <strong>{resourceType}</strong>.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Mostra dettagli payload
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-card p-2 text-[10px]">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
          <p className="text-xs text-muted-foreground">
            L'azienda ha 7 giorni per approvare o rifiutare. Vedrai lo stato in
            "Le mie richieste".
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submit.isPending}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={submit.isPending} className="gap-2">
            {submit.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Invio...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Invia richiesta
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

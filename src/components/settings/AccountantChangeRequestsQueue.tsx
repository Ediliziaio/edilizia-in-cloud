/**
 * Coda di richieste di approvazione (per access_mode='approval_required').
 *
 * Mostrata in Impostazioni → Persone → Commercialista quando ci sono
 * richieste pendenti del commercialista.
 *
 * Per ogni richiesta: tipo risorsa + operazione + payload preview + 2
 * pulsanti Approva/Rifiuta con dialog di conferma + nota opzionale.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Clock, ListChecks, Loader2, XCircle } from "lucide-react";
import {
  useCompanyPendingChangeRequests,
  useDecideChangeRequest,
  type ChangeRequestRow,
} from "@/hooks/accountant/useAccountantChangeRequests";
import { useAuth } from "@/contexts/AuthContext";
import { previewPayload } from "@/lib/commercialista/anteprimaRichiesta";

function operationLabel(op: string) {
  if (op === "create") return "Crea";
  if (op === "update") return "Modifica";
  if (op === "delete") return "Elimina";
  return op;
}

function resourceLabel(t: string) {
  const map: Record<string, string> = {
    prima_nota: "Prima nota",
    scadenza: "Scadenza",
    costo: "Costo",
    doc_fiscale: "Documento fiscale",
    work_log: "Giornale lavori",
    ticket: "Ticket",
    foto_cantiere: "Foto cantiere",
    bank_transaction: "Movimento bancario",
  };
  return map[t] ?? t;
}

export function AccountantChangeRequestsQueue() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const { data: requests = [], isLoading } = useCompanyPendingChangeRequests(companyId);
  const decide = useDecideChangeRequest();
  const [dialogState, setDialogState] = useState<
    { req: ChangeRequestRow; decision: "approved" | "rejected" } | null
  >(null);
  const [note, setNote] = useState("");

  if (isLoading) {
    return (
      <Card>
        <CardContent role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Caricamento delle richieste…
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return null; // niente badge se non ci sono richieste
  }

  async function confirmDecision() {
    if (!dialogState) return;
    await decide.mutateAsync({
      requestId: dialogState.req.id,
      decision: dialogState.decision,
      note: note.trim() || undefined,
    });
    setDialogState(null);
    setNote("");
  }

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-amber-700" aria-hidden="true" />
          Richieste di modifica da approvare
          <Badge variant="secondary" className="ml-1">
            {requests.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          Il tuo commercialista ha proposto queste modifiche. Approva o rifiuta ognuna entro 7 giorni da quando è arrivata.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((req) => (
          <div
            key={req.id}
            className="rounded-lg border bg-white p-3 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {operationLabel(req.operation)}
                </Badge>
                <Badge variant="default" className="gap-1">
                  {resourceLabel(req.resource_type)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(req.created_at).toLocaleDateString("it-IT", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  aria-label={`Rifiuta: ${operationLabel(req.operation)} ${resourceLabel(req.resource_type).toLowerCase()}`}
                  onClick={() => {
                    setDialogState({ req, decision: "rejected" });
                    setNote("");
                  }}
                >
                  <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Rifiuta
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  aria-label={`Approva: ${operationLabel(req.operation)} ${resourceLabel(req.resource_type).toLowerCase()}`}
                  onClick={() => {
                    setDialogState({ req, decision: "approved" });
                    setNote("");
                  }}
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Approva
                </Button>
              </div>
            </div>
            <p className="mt-2 line-clamp-2 break-words text-xs text-muted-foreground">
              {previewPayload(req.payload)}
            </p>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!dialogState} onOpenChange={(o) => !o && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState?.decision === "approved" ? "Approvare la richiesta?" : "Rifiutare la richiesta?"}
            </DialogTitle>
            <DialogDescription>
              {dialogState?.decision === "approved"
                ? "Il commercialista vedrà che l'hai approvata. La modifica non si applica da sola: va registrata a mano nei dati dell'azienda."
                : "Scrivi al commercialista perché la rifiuti: lo vedrà accanto alla richiesta."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Nota per il commercialista"
            placeholder={
              dialogState?.decision === "approved"
                ? "Nota opzionale per il commercialista"
                : "Spiega il motivo del rifiuto (consigliato)"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogState(null)} disabled={decide.isPending}>
              Annulla
            </Button>
            <Button
              onClick={confirmDecision}
              disabled={decide.isPending}
              className={
                dialogState?.decision === "approved"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-red-600 hover:bg-red-700"
              }
            >
              {decide.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Salvataggio…
                </>
              ) : dialogState?.decision === "approved" ? (
                "Approva la richiesta"
              ) : (
                "Rifiuta la richiesta"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

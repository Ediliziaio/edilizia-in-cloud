/**
 * Approvare e rifiutare un rapportino: la stessa regola dalla commessa, dal popup
 * di Attività e dall'elenco dei rapportini.
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { notifyRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import { messaggioApprovazione } from "@/lib/campo/erroreApprovazione";
import { recheckLaborApproval } from "@/lib/campo/loadLaborReview";
import { validateReportPhaseLinks } from "@/lib/campo/validateReportPhaseLinks";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { LaborApprovalDialog } from "@/components/orders/LaborApprovalDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Originale = { stato?: string | null; approvato?: boolean | null; updated_at?: string | null };

export function useDecisioneRapportino(orderId: string, opzioni: { onApprovato?: () => void; onRifiutato?: () => void; onAnnullato?: () => void } = {}) {
  const qc = useQueryClient();
  const { role, effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const { canEditOrders, canViewCosts } = usePermissions();
  const canApprove = canEditOrders && (role === "company_admin" || role === "company_staff" || role === "super_admin");
  // Il proprio rapportino lo decide un altro dell'ufficio (salvo il titolare): come nel database.
  const puoDecidereSu = (autore: string | null | undefined) =>
    canApprove && (role === "company_admin" || role === "super_admin" || !autore || autore !== user?.id);

  const approvaMutation = useMutation({
    mutationFn: async ({rapportinoId, fingerprint, acknowledged}: {rapportinoId: string; fingerprint: string; acknowledged: boolean}) => {
      if (!canApprove || !companyId) throw new Error("Non hai il permesso di approvare rapportini");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessione scaduta, riaccedi");
      const reviewed = await recheckLaborApproval({companyId, orderId, reportId: rapportinoId, showCosts: canViewCosts}, fingerprint, acknowledged);
      // Prima di rendere il rapporto economicamente efficace, verifica tutti i
      // riferimenti. Una fase estranea non va ignorata DOPO l'approvazione.
      const { data: rapp, error: reportError } = await supabase.from("campo_rapportini")
        .select("fasi_lavorate, materiali_usati, percentuale_avanzamento, lavoro_completato, firma_cliente_url")
        .eq("id", rapportinoId).eq("order_id", orderId).eq("company_id", companyId)
        .eq("updated_at", reviewed.updated_at).single();
      if (reportError) throw reportError;
      if (!rapp) throw new Error("Rapportino cambiato: aggiorna il controllo prima di approvare.");
      await validateReportPhaseLinks(companyId, orderId, rapp);
      const approvalQuery = supabase
        .from("campo_rapportini")
        .update({
          stato: "approvato",
          approvato: true,
          approvato_da: user.id,
          approvato_at: new Date().toISOString(),
          motivo_rifiuto: null,
          pdf_url: null,
        })
        .eq("id", rapportinoId)
        .eq("order_id", orderId)
        .eq("company_id", companyId);
      const { data: updated, error } = await (reviewed.stato == null ? approvalQuery.is("stato", null) : approvalQuery.eq("stato", reviewed.stato))
        .eq("updated_at", reviewed.updated_at)
        .select("id").maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error("Rapportino non aggiornato: potrebbe essere già cambiato. Aggiorna il controllo e verifica i permessi.");

      // L'avanzamento delle fasi dichiarate lo applica il database nella stessa operazione
      // dell'approvazione (trigger campo_rapportino_avanzamento_approvato): o tutto o niente.
      return { rapportinoId };
    },
    onSuccess: ({ rapportinoId }) => {
      toast.success("Rapportino approvato: ore e avanzamento aggiornati");
      refreshWorkQueries(qc, orderId, companyId);
      void notifyRapportinoPdf(rapportinoId, orderId, qc);
      opzioni.onApprovato?.();
    },
    onError: (error: unknown) => toast.error(messaggioApprovazione(error)),
  });

  const rifiutaMutation = useMutation({
    mutationFn: async ({ id, motivo, originale: original }: { id: string; motivo: string; originale?: Originale }) => {
      if (!canApprove || !companyId) throw new Error("Non hai il permesso di rifiutare rapportini");
      if (!original || (original.stato ?? (original.approvato ? "approvato" : "inviato")) !== "inviato") throw new Error("Rapportino cambiato: ricarica prima di rifiutare");
      const rejectionQuery = supabase
        .from("campo_rapportini")
        .update({
          stato: "rifiutato",
          approvato: false,
          motivo_rifiuto: motivo.trim() || null,
          pdf_url: null,
        })
        .eq("id", id)
        .eq("order_id", orderId)
        .eq("company_id", companyId)
        .eq("updated_at", original.updated_at);
      const { data: updated, error } = await (original.stato == null ? rejectionQuery.is("stato", null) : rejectionQuery.eq("stato", original.stato))
        .select("id").maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error("Rapportino non aggiornato: verifica i permessi e ricarica");
    },
    onSuccess: (_result, { id }) => {
      toast.success("Rapportino rifiutato");
      refreshWorkQueries(qc, orderId, companyId);
      void notifyRapportinoPdf(id, orderId, qc);
      opzioni.onRifiutato?.();
    },
    onError: () => toast.error("Errore durante il rifiuto"),
  });

  const annullaMutation = useMutation({
    mutationFn: async ({ id, updatedAt, motivo }: { id: string; updatedAt: string; motivo: string }) => {
      if (!canApprove) throw new Error("Non hai il permesso di annullare rapportini");
      // La funzione non è ancora nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("campo_rapportino_annulla", { p_id: id, p_updated_at: updatedAt, p_motivo: motivo.trim() });
      if (error) throw error;
    },
    onSuccess: (_r, { id }) => {
      toast.success("Rapportino annullato: ore e costo sono tornati indietro");
      refreshWorkQueries(qc, orderId, companyId);
      void notifyRapportinoPdf(id, orderId, qc);
      opzioni.onAnnullato?.();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Annullamento non riuscito"),
  });

  return { canApprove, puoDecidereSu, approvaMutation, rifiutaMutation, annullaMutation };
}

/** Annullare è definitivo: il motivo è obbligatorio e resta sul rapportino. */
export function AnnullaRapportinoDialog({ motivo, onMotivo, busy, onClose, onConferma }: {
  motivo: string; onMotivo: (v: string) => void; busy: boolean; onClose: () => void; onConferma: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annulla rapportino</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Ore, costo e avanzamento tornano indietro e il rapportino sparisce dagli elenchi. Resta consultabile con «Mostra annullati», ma non si può riaprire. Non si può annullare se è già in una pagina di giornale firmata o in un rendiconto non più in bozza.
          </p>
          <Textarea placeholder="Perché lo annulli? Es: inserito sulla commessa sbagliata" value={motivo} onChange={(e) => onMotivo(e.target.value)} rows={3} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Non annullare</Button>
          <Button variant="destructive" onClick={onConferma} disabled={busy || !motivo.trim()}>
            {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
            Annulla rapportino
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RifiutaRapportinoDialog({ motivo, onMotivo, busy, onClose, onConferma }: {
  motivo: string; onMotivo: (v: string) => void; busy: boolean; onClose: () => void; onConferma: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rifiuta rapportino</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Specifica il motivo del rifiuto (opzionale). Il tecnico verrà notificato.
          </p>
          <Textarea
            placeholder="Es: Descrizione insufficiente, mancano le foto del cantiere..."
            value={motivo}
            onChange={(e) => onMotivo(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button variant="destructive" onClick={onConferma} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
            Conferma rifiuto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Un popup solo: dettagli del rapportino, controllo delle ore, Approva e Rifiuta. */
export function ApprovaRapportinoPopup({ orderId, reportId, originale, testata, onClose, onDeciso }: {
  orderId: string; reportId: string; originale: Originale; testata?: ReactNode; onClose: () => void;
  /** Dopo la decisione: di norma si passa al rapportino successivo da approvare. */
  onDeciso?: () => void;
}) {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const { canViewCosts } = usePermissions();
  const [rifiuta, setRifiuta] = useState(false);
  const [motivo, setMotivo] = useState("");
  const chiudi = () => { void qc.invalidateQueries({ queryKey: ["commesse-rapportini"] }); (onDeciso ?? onClose)(); };
  const { approvaMutation, rifiutaMutation } = useDecisioneRapportino(orderId, { onApprovato: chiudi, onRifiutato: chiudi });
  const companyId = effectiveCompany?.id;
  if (!companyId) return null;
  if (rifiuta) {
    return <RifiutaRapportinoDialog motivo={motivo} onMotivo={setMotivo} busy={rifiutaMutation.isPending}
      onClose={() => setRifiuta(false)} onConferma={() => rifiutaMutation.mutate({ id: reportId, motivo, originale })} />;
  }
  return <LaborApprovalDialog key={reportId} companyId={companyId} orderId={orderId} reportId={reportId} showCosts={canViewCosts}
    testata={testata} busy={approvaMutation.isPending} onClose={onClose} onReject={() => setRifiuta(true)}
    onApprove={(fingerprint, acknowledged) => approvaMutation.mutate({ rapportinoId: reportId, fingerprint, acknowledged })} />;
}

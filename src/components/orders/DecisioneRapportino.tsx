/**
 * Approvare e rifiutare un rapportino: la stessa regola dalla commessa, dal popup
 * di Attività e dall'elenco dei rapportini.
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { notifyRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import { messaggioApprovazione } from "@/lib/campo/erroreApprovazione";
import { messaggioAnnullamento } from "@/lib/campo/erroreAnnullamento";
import { recheckLaborApproval } from "@/lib/campo/loadLaborReview";
import { validateReportPhaseLinks } from "@/lib/campo/validateReportPhaseLinks";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { LaborApprovalDialog } from "@/components/orders/LaborApprovalDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

type Originale = { stato?: string | null; approvato?: boolean | null; updated_at?: string | null };
const chiaveAnteprima = (id?: string, updatedAt?: string) => ["rapportino-anteprima-annullo", id, updatedAt];

export function useDecisioneRapportino(orderId: string, opzioni: { onApprovato?: () => void; onRifiutato?: () => void; onAnnullato?: () => void } = {}) {
  const t = useT();
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
      if (!canApprove || !companyId) throw new Error(t("Non hai il permesso di approvare rapportini"));
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("Sessione scaduta, riaccedi"));
      const reviewed = await recheckLaborApproval({companyId, orderId, reportId: rapportinoId, showCosts: canViewCosts}, fingerprint, acknowledged);
      // Prima di rendere il rapporto economicamente efficace, verifica tutti i
      // riferimenti. Una fase estranea non va ignorata DOPO l'approvazione.
      const { data: rapp, error: reportError } = await supabase.from("campo_rapportini")
        .select("fasi_lavorate, materiali_usati, percentuale_avanzamento, lavoro_completato, firma_cliente_url")
        .eq("id", rapportinoId).eq("order_id", orderId).eq("company_id", companyId)
        .eq("updated_at", reviewed.updated_at).single();
      if (reportError) throw reportError;
      if (!rapp) throw new Error(t("Rapportino cambiato: aggiorna il controllo prima di approvare."));
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
      if (!updated) throw new Error(t("Rapportino non aggiornato: potrebbe essere già cambiato. Aggiorna il controllo e verifica i permessi."));

      // L'avanzamento delle fasi dichiarate lo applica il database nella stessa operazione
      // dell'approvazione (trigger campo_rapportino_avanzamento_approvato): o tutto o niente.
      return { rapportinoId };
    },
    onSuccess: ({ rapportinoId }) => {
      toast.success(t("Rapportino approvato: ore e avanzamento aggiornati"));
      refreshWorkQueries(qc, orderId, companyId);
      void notifyRapportinoPdf(rapportinoId, orderId, qc);
      opzioni.onApprovato?.();
    },
    onError: (error: unknown) => toast.error(messaggioApprovazione(error)),
  });

  const rifiutaMutation = useMutation({
    mutationFn: async ({ id, motivo, originale: original }: { id: string; motivo: string; originale?: Originale }) => {
      if (!canApprove || !companyId) throw new Error(t("Non hai il permesso di rifiutare rapportini"));
      if (!original || (original.stato ?? (original.approvato ? "approvato" : "inviato")) !== "inviato") throw new Error(t("Rapportino cambiato: ricarica prima di rifiutare"));
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
      if (!updated) throw new Error(t("Rapportino non aggiornato: verifica i permessi e ricarica"));
    },
    onSuccess: (_result, { id }) => {
      toast.success(t("Rapportino rifiutato"));
      refreshWorkQueries(qc, orderId, companyId);
      void notifyRapportinoPdf(id, orderId, qc);
      opzioni.onRifiutato?.();
    },
    onError: (e: unknown) => toast.error((e as { message?: string } | null)?.message || t("Errore durante il rifiuto")),
  });

  const annullaMutation = useMutation({
    mutationFn: async ({ id, updatedAt, motivo, anteprima }: { id: string; updatedAt: string; motivo: string; anteprima?: string }) => {
      if (!canApprove) throw new Error(t("Non hai il permesso di annullare rapportini"));
      const args = { p_id: id, p_updated_at: updatedAt, p_motivo: motivo.trim() };
      const { error } = anteprima
        ? await supabase.rpc("campo_rapportino_conferma_annullo", { ...args, p_anteprima: anteprima })
        : await supabase.rpc("campo_rapportino_annulla", args);
      if (error) throw error;
    },
    onSuccess: (_r, { id }) => {
      toast.success(t("Rapportino annullato: ore e costo sono tornati indietro"));
      refreshWorkQueries(qc, orderId, companyId);
      void notifyRapportinoPdf(id, orderId, qc);
      opzioni.onAnnullato?.();
    },
    onError: (e: unknown, variables) => {
      if ((e as { code?: string } | null)?.code === "PT409" && variables.anteprima) {
        void qc.invalidateQueries({ queryKey: chiaveAnteprima(variables.id, variables.updatedAt) });
      }
      toast.error(messaggioAnnullamento(e));
    },
  });

  return { canApprove, puoDecidereSu, approvaMutation, rifiutaMutation, annullaMutation };
}

/** Annullare è definitivo: il motivo è obbligatorio e resta sul rapportino. */
type StimaRevoca = { prima: number | null; dopo: number | null; esito: string };
type AnteprimaRevoca = {
  versione: string;
  fasi: (StimaRevoca & { id: string; name: string })[];
  voci: (StimaRevoca & { id: string; name: string; unita: string | null; percentuale_prima: number; percentuale_dopo: number })[];
  commessa: StimaRevoca | null;
};

const formatoMisura = { format: (n: number) => new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 3 }).format(n) };
const percentuale = (p: number | null) => p === null ? "—" : `${formatoMisura.format(p)}%`;

function MisuraRevoca({ nome, prima, dopo, esito }: { nome: string; prima: string; dopo: string; esito: string }) {
  const t = useT();
  return (
    <li className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <span className="min-w-0 break-words font-medium">{nome}</span>
      <span className="tabular-nums text-muted-foreground">
        {prima === dopo ? dopo : <>{prima} <span aria-hidden>→</span><span className="sr-only"> {t("diventa")} </span> <strong className="text-foreground">{dopo}</strong></>}
      </span>
      {esito === "verifica" && (
        <span className="text-xs text-amber-800 dark:text-amber-300 sm:col-span-2">{t("Valore mantenuto. Potrebbe includere una rettifica manuale.")}</span>
      )}
      {esito === "altri_rapportini" && (
        <span className="text-xs text-muted-foreground sm:col-span-2">{t("La voce risulta completata anche in un altro rapportino.")}</span>
      )}
    </li>
  );
}

export function AnnullaRapportinoDialog({ motivo, onMotivo, busy, onClose, onConferma, elimina = false, rapportino }: {
  motivo: string; onMotivo: (v: string) => void; busy: boolean; onClose: () => void;
  onConferma: (versione?: string) => void; elimina?: boolean; rapportino?: { id: string; updatedAt: string };
}) {
  const t = useT();
  const anteprima = useQuery({
    queryKey: chiaveAnteprima(rapportino?.id, rapportino?.updatedAt),
    enabled: !elimina && !!rapportino,
    retry: false,
    queryFn: async () => {
      if (!rapportino) throw new Error(t("Rapportino non disponibile"));
      const { data, error } = await supabase.rpc("campo_rapportino_anteprima_annullo", {
        p_id: rapportino.id, p_updated_at: rapportino.updatedAt,
      });
      if (error) throw error;
      const risultato = data as unknown as AnteprimaRevoca | null;
      if (!risultato?.versione || !Array.isArray(risultato?.fasi) || !Array.isArray(risultato?.voci)) {
        throw new Error(t("Impossibile leggere l’anteprima dell’annullamento."));
      }
      return risultato;
    },
  });
  const dati = anteprima.data;
  const pronto = elimina || (!!dati && !anteprima.isError && !anteprima.isFetching);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{elimina ? t("Elimina rapportino") : t("Annulla rapportino")}</DialogTitle>
          <DialogDescription>
            {elimina ? t("Il rapportino resta consultabile in «Mostra annullati».") : t("Controlla come cambiano le lavorazioni. L’annullamento rettifica anche le ore e i costi collegati.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {!elimina && (
            <section aria-label={t("Anteprima avanzamento")} aria-busy={anteprima.isFetching} className="rounded-lg border bg-muted/25">
              <h3 className="border-b px-3 py-2 text-sm font-semibold">{t("Avanzamento dopo la revoca")}</h3>
              {anteprima.isFetching && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">{t("Calcolo delle variazioni…")}</p>}
              {anteprima.isError && !anteprima.isFetching && (
                <div className="space-y-2 px-3 py-2 text-sm">
                  <p role="alert" className="text-destructive">{messaggioAnnullamento(anteprima.error)}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => void anteprima.refetch()}>{t("Riprova")}</Button>
                </div>
              )}
              {dati && !anteprima.isFetching && !anteprima.isError && (
                dati.voci.length || dati.fasi.length || dati.commessa ? (
                  <ul className="max-h-60 divide-y overflow-y-auto">
                    {dati.commessa && <MisuraRevoca nome={t("Intera commessa")} prima={percentuale(dati.commessa.prima)} dopo={percentuale(dati.commessa.dopo)} esito={dati.commessa.esito} />}
                    {dati.fasi.map((f) => <MisuraRevoca key={f.id} nome={f.name} prima={percentuale(f.prima)} dopo={percentuale(f.dopo)} esito={f.esito} />)}
                    {dati.voci.map((v) => {
                      const unita = v.unita === "mq" ? "m²" : v.unita === "mc" ? "m³" : v.unita;
                      const misura = !!unita && (v.prima !== null || v.dopo !== null);
                      return <MisuraRevoca key={v.id} nome={v.name}
                        prima={misura ? `${formatoMisura.format(v.prima ?? 0)} ${unita}` : percentuale(v.percentuale_prima)}
                        dopo={misura ? `${formatoMisura.format(v.dopo ?? 0)} ${unita}` : percentuale(v.percentuale_dopo)}
                        esito={v.esito} />;
                    })}
                  </ul>
                ) : <p className="px-3 py-2 text-sm text-muted-foreground">{t("L’avanzamento delle lavorazioni resta invariato.")}</p>
              )}
            </section>
          )}
          <label htmlFor="motivo-annullo-rapportino" className="block text-sm font-medium">{t("Motivo della rimozione")}</label>
          <Textarea id="motivo-annullo-rapportino" placeholder={t("Indica perché lo rimuovi")} value={motivo} onChange={(e) => onMotivo(e.target.value)} rows={3} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>{t("Torna indietro")}</Button>
          <Button variant="destructive" onClick={() => onConferma(dati?.versione)} disabled={busy || !motivo.trim() || !pronto}>
            {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
            {elimina ? t("Elimina rapportino") : t("Annulla rapportino")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RifiutaRapportinoDialog({ motivo, onMotivo, busy, onClose, onConferma }: {
  motivo: string; onMotivo: (v: string) => void; busy: boolean; onClose: () => void; onConferma: () => void;
}) {
  const t = useT();
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Rifiuta rapportino")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {t("Specifica il motivo del rifiuto (opzionale). Il tecnico verrà notificato.")}
          </p>
          <Textarea
            placeholder={t("Es: Descrizione insufficiente, mancano le foto del cantiere...")}
            value={motivo}
            onChange={(e) => onMotivo(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>{t("Annulla")}</Button>
          <Button variant="destructive" onClick={onConferma} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
            {t("Conferma rifiuto")}
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

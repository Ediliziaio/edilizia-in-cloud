import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { loadLaborReview, type LaborReviewRequest } from "@/lib/campo/loadLaborReview";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AvanzamentoDaApprovare } from "@/components/orders/AvanzamentoDaApprovare";
import { DettagliRapportino } from "@/components/orders/DettagliRapportino";
import { QuadroEconomicoRapportino } from "@/components/orders/QuadroEconomicoRapportino";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const eur = (n: number) => n.toLocaleString(intlCampo(), {style:"currency",currency:"EUR",useGrouping:true});
interface Props extends LaborReviewRequest {
  busy: boolean; onClose: () => void;
  onInspect?: (reportId: string) => void;
  onApprove: (fingerprint: string, acknowledged: boolean) => void;
  /** Rifiuta dallo stesso popup, dopo aver letto i dettagli. */
  onReject?: () => void;
  /** Precedente/Successivo quando il popup scorre un elenco. */
  testata?: ReactNode;
}
export function LaborApprovalDialog({busy, onClose, onApprove, onInspect, onReject, testata, ...request}: Props) {
  const t = useT();
  const [acknowledgedFingerprint, setAcknowledgedFingerprint] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["campo-labor-review", request.companyId, request.orderId, request.reportId, request.showCosts],
    queryFn: () => loadLaborReview(request), staleTime: 0, retry: false, refetchOnWindowFocus: false,
  });
  const review = query.data;
  const acknowledged = !!review && acknowledgedFingerprint === review.fingerprint;
  const ready = !!review && !query.isFetching && !query.isError && !review.blockers.length && (!review.warnings.length || acknowledged);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
      {testata}
      <DialogHeader>
        <DialogTitle className="max-md:text-base">{t("Controlla e approva il rapportino")}</DialogTitle>
        <DialogDescription className="max-md:hidden">{t("Verifica persone, ore e possibili sovrapposizioni prima di registrare il consuntivo.")}</DialogDescription>
      </DialogHeader>
      <DettagliRapportino companyId={request.companyId} orderId={request.orderId} reportId={request.reportId} onRimosso={onClose} />
      {request.showCosts && <QuadroEconomicoRapportino rapportinoId={request.reportId} puoModificare />}
      {query.isPending && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>{t("Controllo della giornata…")}</p>}
      {query.isError && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">
        {t("Controllo non disponibile. Nessuna approvazione è stata eseguita.")}
        {query.error instanceof Error && <span className="mt-1 block">{query.error.message}</span>}
      </p>}
      {review && !query.isError && <div className="space-y-4">
        {!request.showCosts && <p className="text-xs text-muted-foreground">{t("Il tuo profilo può verificare le presenze, ma non visualizzare le tariffe o gli importi.")}</p>}
        <div className="space-y-2">
          {review.rows.map((row,index) => <div key={row.key+index} className="rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="break-words font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.kind === "external" ? t("Presenza esterna · costo da contratto/SAL") : row.kind === "employee" ? t("Dipendente") : t("Identità da verificare")}</p>
              </div>
              <span className="shrink-0 font-semibold">{row.hours == null ? t("Ore da verificare") : row.hours.toLocaleString(intlCampo())+" h"}</span>
            </div>
            {row.otherHours > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("Altri rapportini della giornata: {ore} h", { ore: row.otherHours.toLocaleString(intlCampo()) })}</p>}
            {/* Con la tariffa nota i numeri stanno nel riquadro dei costi: qui resta solo se manca. */}
            {request.showCosts && row.kind === "employee" && <div className={row.rate?.amount != null ? "hidden" : "mt-2 border-t pt-2 text-xs"}>
              <p>{row.rate?.amount != null ? eur(row.rate.amount)+"/h" : t("Tariffa da completare")} · {row.rate?.note}</p>
              <p className="mt-1 font-medium">{t("Costo stimato: {importo}", { importo: row.cost == null ? t("Non determinabile") : eur(row.cost) })}</p>
            </div>}
          </div>)}
        </div>
        <AvanzamentoDaApprovare orderId={request.orderId} reportId={request.reportId} />
        {request.showCosts && <div className="rounded-xl bg-muted/50 p-3">
          {review.budget && <dl className="mb-3 grid grid-cols-1 gap-2 border-b pb-3 text-sm max-md:hidden sm:grid-cols-2">
            <div><dt className="text-muted-foreground">{t("Costo previsto manodopera interna")}</dt><dd className="font-semibold">{review.budget.planned == null ? t("Non disponibile") : eur(review.budget.planned)}</dd></div>
            <div><dt className="text-muted-foreground">{t("Costo consuntivo già registrato")}</dt><dd className="font-semibold">{review.budget.registered == null ? t("Non disponibile") : eur(review.budget.registered)}</dd></div>
          </dl>}
          <p className="text-sm font-semibold">{review.complete ? t("Manodopera interna stimata") : t("Manodopera interna: importo parziale")} · {review.complete || review.knownCost > 0 ? eur(review.knownCost) : t("Non determinabile")}</p>
          {review.budget?.planned === 0 && <p className="mt-1 text-xs text-amber-800">{t("Costo previsto a zero: verifica che sia stato compilato.")}</p>}
          {review.budget && review.budget.planned != null && review.budget.planned > 0 && review.budget.registered != null &&
            review.complete && !review.overlaps.length && review.budget.registered + review.knownCost > review.budget.planned &&
            <p className="mt-1 text-xs text-amber-800">{t("Con questo rapporto, la stima supera il costo previsto di {importo}.", { importo: eur(review.budget.registered + review.knownCost - review.budget.planned) })}</p>}
          <p className="mt-1 text-xs text-muted-foreground max-md:hidden">{t("È una stima alle tariffe attuali, non il costo previsto né un pagamento. Esclude trasferte, mezzi e subappalti. Le ore extra usano la tariffa base nel percorso attuale.")}</p>
          {review.rows.some(r => r.rate?.source === "calcolato") && <p className="mt-1 text-xs text-muted-foreground">{t("La formula attuale usa lordo, aliquota INPS e ore mensili: non stima TFR, INAIL o altri oneri.")}</p>}
        </div>}
        {!!review.overlaps.length && <div className="rounded-xl border border-amber-300 p-3 text-sm">
          <p className="font-semibold">{t("Possibile doppio conteggio")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">{review.overlaps.map((o,i) => <li key={o.reportId+i}>
            {t(o.status === "approvato" ? "{persona}: {ore} h in un altro rapportino già approvato." : "{persona}: {ore} h in un altro rapportino da approvare.", { persona: o.participant, ore: o.hours.toLocaleString(intlCampo()) })}
            {onInspect && <button type="button" disabled={busy} onClick={() => onInspect(o.reportId)} className="ml-2 min-h-11 text-primary underline">{t("Apri rapportino")}</button>}
          </li>)}</ul>
          <p className="mt-2 text-xs">{t("Stesso giorno non significa necessariamente stesse ore: non eliminiamo o sommiamo automaticamente le prestazioni.")}</p>
        </div>}
        {review.blockers.map((message,i) => <p key={i} role="alert" className="text-sm text-destructive">{message}</p>)}
        {!!review.warnings.length && <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/30 p-3">
          {!(review.overlaps.length > 0 && review.warnings.length === 1) && review.warnings.map((message,i) => <p key={i} className="text-sm">{message}</p>)}
          <label className="flex min-h-11 cursor-pointer items-start gap-2 pt-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={acknowledged} disabled={busy || query.isFetching}
              onChange={e => setAcknowledgedFingerprint(e.target.checked ? review.fingerprint : null)}/>
            {t("Ho verificato gli avvisi: le ore sono distinte e accetto gli eventuali costi ancora da completare.")}
          </label>
        </div>}
      </div>}
      <DialogFooter className="flex-wrap gap-2">
        <Button variant="outline" className="max-md:hidden" disabled={busy || query.isFetching} onClick={() => { setAcknowledgedFingerprint(null); void query.refetch(); }}>{t("Aggiorna controllo")}</Button>
        <Button variant="outline" className={onReject ? "hidden" : undefined} disabled={busy} onClick={onClose}>{t("Annulla")}</Button>
        {onReject && <Button variant="destructive" disabled={busy} onClick={onReject}>{t("Rifiuta")}</Button>}
        <Button disabled={!ready || busy} onClick={() => review && onApprove(review.fingerprint, acknowledged)}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{t("Conferma approvazione")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

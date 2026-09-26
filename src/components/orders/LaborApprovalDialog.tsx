import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { loadLaborReview, type LaborReviewRequest } from "@/lib/campo/loadLaborReview";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const eur = (n: number) => n.toLocaleString("it-IT", {style:"currency",currency:"EUR",useGrouping:true});
interface Props extends LaborReviewRequest {
  busy: boolean; onClose: () => void;
  onInspect?: (reportId: string) => void;
  onApprove: (fingerprint: string, acknowledged: boolean) => void;
}
export function LaborApprovalDialog({busy, onClose, onApprove, onInspect, ...request}: Props) {
  const [acknowledgedFingerprint, setAcknowledgedFingerprint] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["campo-labor-review", request.companyId, request.orderId, request.reportId, request.showCosts],
    queryFn: () => loadLaborReview(request), staleTime: 0, retry: false, refetchOnWindowFocus: false,
  });
  const review = query.data;
  const acknowledged = !!review && acknowledgedFingerprint === review.fingerprint;
  const ready = !!review && !query.isFetching && !query.isError && !review.blockers.length && (!review.warnings.length || acknowledged);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Controlla e approva il rapportino</DialogTitle>
        <DialogDescription>Verifica persone, ore e possibili sovrapposizioni prima di registrare il consuntivo.</DialogDescription>
      </DialogHeader>
      {query.isPending && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Controllo della giornata…</p>}
      {query.isError && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">
        Controllo non disponibile. Nessuna approvazione è stata eseguita.
        {query.error instanceof Error && <span className="mt-1 block">{query.error.message}</span>}
      </p>}
      {review && !query.isError && <div className="space-y-4">
        {!request.showCosts && <p className="text-xs text-muted-foreground">Il tuo profilo può verificare le presenze, ma non visualizzare le tariffe o gli importi.</p>}
        <div className="space-y-2">
          {review.rows.map((row,index) => <div key={row.key+index} className="rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="break-words font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.kind === "external" ? "Presenza esterna · costo da contratto/SAL" : row.kind === "employee" ? "Dipendente" : "Identità da verificare"}</p>
              </div>
              <span className="shrink-0 font-semibold">{row.hours == null ? "Ore da verificare" : row.hours.toLocaleString("it-IT")+" h"}</span>
            </div>
            {row.otherHours > 0 && <p className="mt-1 text-xs text-muted-foreground">Altri rapportini della giornata: {row.otherHours.toLocaleString("it-IT")} h</p>}
            {request.showCosts && row.kind === "employee" && <div className="mt-2 border-t pt-2 text-xs">
              <p>{row.rate?.amount != null ? eur(row.rate.amount)+"/h" : "Tariffa da completare"} · {row.rate?.note}</p>
              <p className="mt-1 font-medium">Costo stimato: {row.cost == null ? "Non determinabile" : eur(row.cost)}</p>
            </div>}
          </div>)}
        </div>
        {request.showCosts && <div className="rounded-xl bg-muted/50 p-3">
          {review.budget && <dl className="mb-3 grid grid-cols-1 gap-2 border-b pb-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Budget manodopera interna</dt><dd className="font-semibold">{review.budget.planned == null ? "Non disponibile" : eur(review.budget.planned)}</dd></div>
            <div><dt className="text-muted-foreground">Già registrato sulla commessa</dt><dd className="font-semibold">{review.budget.registered == null ? "Non disponibile" : eur(review.budget.registered)}</dd></div>
          </dl>}
          <p className="text-sm font-semibold">{review.complete ? "Manodopera interna stimata" : "Manodopera interna: importo parziale"} · {review.complete || review.knownCost > 0 ? eur(review.knownCost) : "Non determinabile"}</p>
          {review.budget?.planned === 0 && <p className="mt-1 text-xs text-amber-800">Budget registrato a zero: verifica che sia stato compilato.</p>}
          {review.budget && review.budget.planned != null && review.budget.planned > 0 && review.budget.registered != null &&
            review.complete && !review.overlaps.length && review.budget.registered + review.knownCost > review.budget.planned &&
            <p className="mt-1 text-xs text-amber-800">Con questo rapporto, la stima supera il budget di {eur(review.budget.registered + review.knownCost - review.budget.planned)}.</p>}
          <p className="mt-1 text-xs text-muted-foreground">È una stima alle tariffe attuali, non il budget né un pagamento. Esclude trasferte, mezzi e subappalti. Le ore extra usano la tariffa base nel percorso attuale.</p>
          {review.rows.some(r => r.rate?.source === "calcolato") && <p className="mt-1 text-xs text-muted-foreground">La formula attuale usa lordo, aliquota INPS e ore mensili: non stima TFR, INAIL o altri oneri.</p>}
        </div>}
        {!!review.overlaps.length && <div className="rounded-xl border border-amber-300 p-3 text-sm">
          <p className="font-semibold">Possibile doppio conteggio</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">{review.overlaps.map((o,i) => <li key={o.reportId+i}>
            {o.participant}: {o.hours.toLocaleString("it-IT")} h in un altro rapportino {o.status === "approvato" ? "già approvato" : "da approvare"}.
            {onInspect && <button type="button" disabled={busy} onClick={() => onInspect(o.reportId)} className="ml-2 min-h-11 text-primary underline">Apri rapportino</button>}
          </li>)}</ul>
          <p className="mt-2 text-xs">Stesso giorno non significa necessariamente stesse ore: non eliminiamo o sommiamo automaticamente le prestazioni.</p>
        </div>}
        {review.blockers.map((message,i) => <p key={i} role="alert" className="text-sm text-destructive">{message}</p>)}
        {!!review.warnings.length && <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/30 p-3">
          {!(review.overlaps.length > 0 && review.warnings.length === 1) && review.warnings.map((message,i) => <p key={i} className="text-sm">{message}</p>)}
          <label className="flex min-h-11 cursor-pointer items-start gap-2 pt-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={acknowledged} disabled={busy || query.isFetching}
              onChange={e => setAcknowledgedFingerprint(e.target.checked ? review.fingerprint : null)}/>
            Ho verificato gli avvisi: le ore sono distinte e accetto gli eventuali costi ancora da completare.
          </label>
        </div>}
      </div>}
      <DialogFooter className="flex-wrap gap-2">
        <Button variant="outline" disabled={busy || query.isFetching} onClick={() => { setAcknowledgedFingerprint(null); void query.refetch(); }}>Aggiorna controllo</Button>
        <Button variant="outline" disabled={busy} onClick={onClose}>Annulla</Button>
        <Button disabled={!ready || busy} onClick={() => review && onApprove(review.fingerprint, acknowledged)}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Conferma approvazione
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

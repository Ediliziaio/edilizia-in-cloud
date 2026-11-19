import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { stornaPagamentiCosto } from "@/lib/costi/annulloCosto";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { eseguiPerRiga, messaggioErroreOperazione } from "@/lib/operazioniPerRiga";
import type { PrimaNotaEntry } from "@/hooks/usePrimaNota";

/** Lo storno è del costo intero: non va presentato come cancellazione della sola riga scelta. */
function puoStornareCosto(e: PrimaNotaEntry) {
  return !!e.cost_id && e.direction === "uscita" && e.auto_source === "company_cost_payment"
    && !e.bank_transaction_id && !e.sal_sub_id && !e.reversal_of && !e.stornata;
}

export function StornaPagamentiCosto({ righe, onFatto }: { righe: PrimaNotaEntry[]; onFatto?: () => void }) {
  const confirm = useConfirm();
  const invio = useRef(false);
  const qc = useQueryClient();
  const costi = [...new Set(righe.filter(puoStornareCosto).map(e => e.cost_id!))];
  const storna = useMutation({
    mutationFn: (ids: string[]) => eseguiPerRiga(ids.map(id => ({ id })), r => stornaPagamentiCosto(r.id)),
    onSuccess: ({ completate, errori }) => {
      refreshFinancialQueries(qc);
      if (completate.length) { toast.success(`Pagamenti stornati per ${completate.length} costi`); onFatto?.(); }
      if (errori.length) toast.error(`${errori.length} costi non stornati`, { description: errori.map(e => e.motivo).join(" · "), duration: 10000 });
    },
    onError: e => toast.error("Storno non riuscito", { description: messaggioErroreOperazione(e) }),
  });
  if (!costi.length) return null;
  return <Button size="sm" variant="outline" disabled={storna.isPending} onClick={async () => {
    if (invio.current) return;
    invio.current = true;
    const ids = [...costi];
    try { if (await confirm({ title: `Stornare i pagamenti di ${costi.length} costi?`,
      description: "Verranno stornati TUTTI i pagamenti non ancora stornati di ciascun costo selezionato, compresi gli acconti fuori da questa pagina. Il costo torna da pagare e resta invariato. In prima nota resta lo storico con una riga di storno. I pagamenti collegati alla banca o a un SAL richiedono prima la gestione del collegamento nella schermata di origine.",
      confirmLabel: "Storna tutti i pagamenti dei costi", variant: "destructive" })) await storna.mutateAsync(ids);
    } catch { /* La mutation mostra il motivo. */ } finally { invio.current = false; }
  }}>{storna.isPending ? "Storno in corso…" : "Storna pagamenti dei costi"}</Button>;
}

/**
 * «Come faccio a togliere il pagamento? Ricordo che c'era un tasto ma non lo trovo più»
 * (26/11/2026, Impresa Vulcano).
 *
 * Il tasto che l'azienda ricorda è la pastiglia verde «Pagata <data>» dell'elenco delle fatture
 * ricevute, che si vede solo quando il pagamento NON passa dal pannello. Dentro il pannello
 * «Pagamenti e residuo» non c'era niente: la tabella sapeva dire «Pagamento annullato», ma non
 * c'era un modo per annullarlo.
 *
 * Qui c'è, una riga alla volta. La strada giusta la sceglie il database
 * (`pagamento_costo_annulla`): un «Segna pagata» torna indietro tutto insieme — fattura, rate e
 * scadenze — mentre un pagamento registrato a mano si elimina riallineando il costo. `versione`
 * è il controllo di concorrenza: se qualcuno ha toccato il pagamento nel frattempo, il comando
 * si rifiuta invece di cancellare un'altra cosa.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/formatters";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function TogliPagamentoCosto({ pagamentoId, versione, importo, data }: {
  pagamentoId: string;
  /** `prima_nota_entries.updated_at`, come l'ha letto il pannello. */
  versione: string;
  importo: number;
  data: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [conferma, setConferma] = useState(false);

  const togli = useMutation({
    mutationFn: async () => {
      const { data: esito, error } = await (supabase.rpc.bind(supabase) as unknown as (
        f: string, a: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)("pagamento_costo_annulla", {
        p_movimento: pagamentoId, p_versione: versione,
      });
      if (error) throw new Error(error.message);
      return (esito ?? {}) as { via?: string };
    },
    onSuccess: (esito) => {
      toast.success(t("Pagamento tolto"), {
        description: esito.via === "saldo_rapido"
          ? t("La fattura torna da pagare, con le sue rate e le sue scadenze.")
          : t("Il residuo della fattura è stato ricalcolato."),
      });
      refreshFinancialQueries(qc);
      setConferma(false);
    },
    onError: (e: Error) => toast.error(t("Pagamento non tolto"), { description: e.message }),
  });

  return <>
    <Button size="sm" variant="ghost" className="h-auto px-1.5 py-1 text-xs text-muted-foreground hover:text-destructive"
      onClick={() => setConferma(true)}>
      <Undo2 className="h-3.5 w-3.5 sm:mr-1" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{t("Togli")}</span>
    </Button>
    <AlertDialog open={conferma} onOpenChange={setConferma}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Togliere il pagamento di {importo}?", { importo: formatCurrency(importo) })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("Il pagamento del {data} non risulterà più versato: la fattura torna da pagare per quella quota, e tornano indietro anche le rate e le scadenze che si erano chiuse. Resta nello storico della contabilità.", { data: data.split("-").reverse().join("/") })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
          <AlertDialogAction disabled={togli.isPending} onClick={(e) => { e.preventDefault(); togli.mutate(); }}>
            {togli.isPending ? t("Lo toglio…") : t("Togli il pagamento")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

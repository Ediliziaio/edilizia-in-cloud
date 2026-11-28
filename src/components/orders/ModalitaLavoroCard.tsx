/**
 * ModalitaLavoroCard — come si misura e si fattura questa commessa.
 *
 * `orders.modalita_lavoro` (migrazione 20290630180000): acconto e saldo, a computo, in economia,
 * computo più extra in economia. La scelta decide quali documenti l'app propone — il SAL verbale,
 * il rendiconto del periodo — e si può cambiare finché la commessa non ha documenti emessi (un SAL
 * non più in bozza, un rendiconto non più in bozza, una fattura che non sia bozza o annullata):
 * quella regola la tiene il database, qui si spiega soltanto.
 *
 * `commessa_modalita_quadro` dice anche che cosa i dati suggeriscono — «ha un computo», «ha
 * tariffe» — così una commessa rimasta al valore di partenza non resta muta.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ruler } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { MODALITA_LAVORO, etichettaModalita, modalitaValida, type ModalitaLavoro } from "@/lib/orders/modalitaLavoro";

type Quadro = {
  modalita: string;
  suggerita: string;
  ha_computo: boolean;
  ha_economia: boolean;
  si_puo_cambiare: boolean;
};

/**
 * `src/integrations/supabase/types.ts` nel repository è indietro di circa 13.500 righe rispetto al
 * database vero, e rigenerarlo fa emergere una catena di TS2589 («tipo troppo profondo») nelle
 * select con più embed di aree che non c'entrano con questa — tesoreria, prima nota. È un lavoro a
 * sé, non di questo lotto: finché non è fatto, la colonna `modalita_lavoro` e la funzione
 * `commessa_modalita_quadro` non sono nei tipi, e i due accessi stanno qui, scritti una volta.
 * Quando i tipi saranno rigenerati, queste due righe si cancellano.
 */
// Il cast è sul client, non sul metodo: `supabase.rpc` staccato dall'istanza perde il suo oggetto
// e la chiamata va in errore (visto in app il 28/11/2026 — la card spariva senza dire niente,
// perché va in errore la query; i test non lo prendono, lì il client è finto).
const clienteTipato = supabase as unknown as {
  rpc: (nome: string, args: Record<string, unknown>) => Promise<{ data: Quadro | null; error: { message: string } | null }>;
};

const scriviLaModalita = (orderId: string, modalita: ModalitaLavoro) =>
  (supabase.from("orders") as unknown as {
    update: (valori: Record<string, unknown>) => {
      eq: (colonna: string, valore: string) => {
        select: (colonne: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  }).update({ modalita_lavoro: modalita }).eq("id", orderId).select("id");

export function ModalitaLavoroCard({ orderId, puoModificare }: { orderId: string; puoModificare: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const quadro = useQuery({
    queryKey: ["commessa-modalita", orderId],
    queryFn: async () => {
      const { data, error } = await clienteTipato.rpc("commessa_modalita_quadro", { p_order: orderId });
      if (error) throw error;
      return data as Quadro;
    },
  });
  const salva = useMutation({
    mutationFn: async (modalita: ModalitaLavoro) => {
      // Colonne esplicite nella select dopo la scrittura: su `orders` un `.select()` vuoto
      // tornerebbe tutto, e su altre tabelle del progetto non passa nemmeno.
      const { error } = await scriviLaModalita(orderId, modalita);
      if (error) throw error;
      return modalita;
    },
    onSuccess: (modalita) => {
      toast.success(t("Da ora questa commessa si misura così: {modo}").replace("{modo}", t(etichettaModalita(modalita))));
      queryClient.invalidateQueries({ queryKey: ["commessa-modalita", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    },
    onError: (err) => toast.error(messaggioErrore(err)),
  });

  if (quadro.isError || !quadro.data) return null;
  const q = quadro.data;
  const scelta = modalitaValida(q.modalita);
  const suggerita = modalitaValida(q.suggerita);
  const descrizione = MODALITA_LAVORO.find((m) => m.value === scelta)?.description ?? "";
  const suggerimentoDaMostrare = suggerita !== scelta && q.si_puo_cambiare && puoModificare;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ruler className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("Come si misura e si fattura")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 text-sm">
        {puoModificare && q.si_puo_cambiare ? (
          <Select value={scelta} onValueChange={(v) => salva.mutate(modalitaValida(v))} disabled={salva.isPending}>
            <SelectTrigger className="h-9" aria-label={t("Come si misura e si fattura")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODALITA_LAVORO.map((m) => (
                <SelectItem key={m.value} value={m.value}>{t(m.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="font-semibold">{t(etichettaModalita(scelta))}</p>
        )}
        <p className="text-muted-foreground">{t(descrizione)}</p>
        {!q.si_puo_cambiare && (
          <p className="text-xs text-muted-foreground">
            {t("Non si cambia più: la commessa ha già documenti emessi, e rileggerli con un'altra regola cambierebbe numeri già mandati al committente.")}
          </p>
        )}
        {suggerimentoDaMostrare && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <span>
              {q.ha_computo && q.ha_economia
                ? t("Questa commessa ha un computo e un listino: di solito si lavora col SAL sul computo e il rendiconto per gli extra.")
                : q.ha_computo
                  ? t("Questa commessa ha un computo: di solito si misura sulle sue voci.")
                  : t("Questa commessa ha un listino o un contratto d'appalto: di solito si rendiconta a listino.")}
            </span>
            <Button size="sm" variant="outline" className="h-7" disabled={salva.isPending} onClick={() => salva.mutate(suggerita)}>
              {t("Passa a {modo}").replace("{modo}", t(etichettaModalita(suggerita)))}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

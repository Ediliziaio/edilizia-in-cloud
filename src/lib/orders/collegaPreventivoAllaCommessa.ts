/**
 * Dopo che «Nuova commessa» ha creato la commessa partendo da un preventivo (?quote_id, o «Importa da preventivo»):
 * il legame sulla commessa (quote_id, quote_number), il «blocca prezzo» versato sul preventivo che la segue, e la
 * notizia alla pagina del preventivo che adesso una commessa c'è.
 *
 * Quella notizia è la parte che mancava (07/10/2026): la pagina del preventivo non offre una seconda commessa se ne
 * trova già una, ma la leggeva da una copia che l'app tiene fresca per 5 minuti. «Crea commessa (rivedi)» non cambia lo
 * stato del preventivo («accettata»), quindi tornando sul preventivo entro 5 minuti si rivedevano i due pulsanti con la
 * commessa già fatta, e un secondo clic ne creava un'altra.
 *
 * Se il legame non si scrive (errore, o nessuna riga aggiornata perché la commessa non è visibile a chi l'ha creata) lo
 * si dice a chi chiama: senza legame la pagina del preventivo non può accorgersi della commessa.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export interface EsitoCollegamento {
  /** La commessa porta il legame col preventivo (quote_id scritto su almeno una riga). */
  collegata: boolean;
}

export async function collegaPreventivoAllaCommessa(params: {
  queryClient: QueryClient;
  orderId: string;
  quoteId: string;
  quoteNumber: string | null;
  customerId: string | null;
}): Promise<EsitoCollegamento> {
  const { queryClient, orderId, quoteId, quoteNumber, customerId } = params;

  const { data: righe, error: linkErr } = await supabase
    .from("orders")
    .update({ quote_id: quoteId, quote_number: quoteNumber })
    .eq("id", orderId)
    .select("id");
  if (linkErr) console.error("[CreateOrder] collegamento preventivo non riuscito:", linkErr.message);
  const collegata = !linkErr && (righe?.length ?? 0) > 0;
  if (!linkErr && !collegata) {
    console.error("[CreateOrder] collegamento preventivo: nessuna riga aggiornata (la commessa non è visibile a chi l'ha creata?)");
  }

  // Il blocca prezzo versato sul preventivo segue la commessa: senza questo aggancio resterebbe orfano sul preventivo e
  // nessuno si ricorderebbe di restituirlo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: bpErr } = await (supabase as any)
    .from("blocca_prezzo")
    .update({ order_id: orderId, customer_id: customerId })
    .eq("quote_id", quoteId)
    .is("order_id", null);
  if (bpErr) console.warn("[CreateOrder] aggancio blocca prezzo alla commessa fallito:", bpErr.message);

  // La pagina del preventivo rilegge la commessa collegata (anche se in cache è «fresca»).
  await queryClient.invalidateQueries({ queryKey: queryKeys.quotes.linkedOrder(quoteId) });
  return { collegata };
}

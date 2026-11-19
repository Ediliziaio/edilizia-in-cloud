import { supabase } from "@/integrations/supabase/client";
import type { OrderItem } from "@/components/orders/OrderItemsList";

/** Un'unica transazione idempotente; nessun ripiego su inserimenti parziali. */
export async function salvaPreparazioneForniture(orderId: string, righe: OrderItem[], richiesta: string) {
  if (!orderId || !richiesta || !righe.length) throw new Error("Commessa o preparazione mancanti.");
  const { data, error } = await supabase.rpc("commessa_prepara_forniture" as never, { p_commessa: orderId, p_voci: righe, p_richiesta: richiesta } as never);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") throw new Error("Il servizio di salvataggio delle forniture deve essere aggiornato. La preparazione resta qui: nessun articolo è stato inserito.");
    throw new Error(`Salvataggio non confermato. Riprova senza ricreare la preparazione: ${error.message}`);
  }
  const esito = data as unknown as { ids?: unknown; voci_inserite?: unknown } | null;
  if (!esito || !Array.isArray(esito.ids) || esito.ids.length !== righe.length || esito.ids.some(id => typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id)) || new Set(esito.ids).size !== esito.ids.length || esito.voci_inserite !== righe.length) throw new Error("Salvataggio non confermato: verifica e riprova la stessa preparazione.");
  return esito.ids as string[];
}

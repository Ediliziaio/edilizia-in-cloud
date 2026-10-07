/**
 * «Converti in Cantiere» dal dettaglio di un preventivo classico accettato (edge function `converti-preventivo-cantiere`).
 *
 * La funzione risponde `{ success, order_id, avviso }`: `avviso` è pieno quando la commessa è nata ma le righe del
 * preventivo no («Righe non copiate: …»), e la pagina lo ignorava: «convertito con successo» davanti a una commessa
 * vuota. Anche i rifiuti (nessun permesso, preventivo già convertito, non ancora accettato) arrivano nel corpo della
 * risposta: `error.context` è una Response, non un oggetto, e il vecchio `context.json.error` non leggeva mai il motivo
 * vero: si vedeva sempre «Edge Function returned a non-2xx status code».
 */
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";

export interface EsitoConversionePreventivo {
  orderId: string;
  /** Cosa non è andato a buon fine pur avendo creato la commessa (oggi: «Righe non copiate: …»). */
  avviso: string | null;
}

export async function convertiPreventivoInCantiere(quoteId: string): Promise<EsitoConversionePreventivo> {
  const { data, error } = await supabase.functions.invoke("converti-preventivo-cantiere", {
    body: { quote_id: quoteId },
  });
  if (error) throw new Error(await edgeErrorMessage(error, "Errore durante la conversione"));
  const risposta = (data ?? {}) as { order_id?: unknown; avviso?: unknown };
  if (typeof risposta.order_id !== "string" || risposta.order_id === "") {
    throw new Error("La conversione non ha restituito la commessa");
  }
  const avviso = typeof risposta.avviso === "string" ? risposta.avviso.trim() : "";
  return { orderId: risposta.order_id, avviso: avviso === "" ? null : avviso };
}

/** Conversione dei moduli: anteprima e salvataggio usano lo stesso motore PostgreSQL.
 * Materiali, lavorazioni, importi e collegamenti vengono ricavati dal preventivo.
 */
import { supabase } from "@/integrations/supabase/client";
import { avviaCommessa } from "@/lib/orders/avviaCommessa";

export interface AnteprimaConversioneModulo {
  materiali: Array<{ name: string; description: string | null; quantity: number; unit_price: number }>;
  fasi: Array<{ name: string; notes: string }>;
  imponibile: number;
  aliquota: number;
  totale: number;
  impronta: string;
  esclusi: number;
  descrizione: string;
}
export interface EsitoConversione {
  orderId: string;
  righe: number;
  lavorazioni: number;
  avviso?: string | null;
}

type Modulo = "fv" | "rst";
async function chiamaConversione(modulo: Modulo, progettoId: string, raggruppa: boolean, impronta?: string) {
  const { data, error } = await supabase.rpc("converti_modulo_commessa_atomic" as never, {
    p_modulo: modulo,
    p_progetto_id: progettoId,
    p_raggruppa_capitoli: raggruppa,
    p_anteprima: !impronta,
    p_impronta: impronta ?? null,
  } as never);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Il riepilogo della conversione non è disponibile. Riprova.");
  return data as unknown as AnteprimaConversioneModulo & { id?: string };
}

export async function anteprimaConversioneModulo(modulo: Modulo, progettoId: string, raggruppa = false): Promise<AnteprimaConversioneModulo> {
  return chiamaConversione(modulo, progettoId, raggruppa);
}

async function converti(modulo: Modulo, progettoId: string, userId: string, raggruppa: boolean, impronta?: string): Promise<EsitoConversione> {
  if (!userId) throw new Error("Sessione scaduta: accedi di nuovo.");
  const riepilogo = impronta ? { impronta } : await anteprimaConversioneModulo(modulo, progettoId, raggruppa);
  const esito = await chiamaConversione(modulo, progettoId, raggruppa, riepilogo.impronta);
  if (!esito.id) throw new Error("La commessa non è stata creata.");
  // La transazione principale ha già salvato tutte le fasi. Applica le rate
  // predefinite dell'azienda; i modelli non duplicano le fasi presenti.
  const avvio = await avviaCommessa(esito.id);
  return {
    orderId: esito.id,
    righe: esito.materiali.length,
    lavorazioni: esito.fasi.length,
    avviso: avvio ? null : "Commessa creata. Verifica le rate e le impostazioni di avvio dalla commessa.",
  };
}
export function convertiFvInCommessa(progettoId: string, userId: string, impronta?: string) {
  return converti("fv", progettoId, userId, false, impronta);
}
export function convertiRstInCommessa(progettoId: string, userId: string, opzioni: { fasiDaCapitoli?: boolean; impronta?: string } = {}) {
  return converti("rst", progettoId, userId, !!opzioni.fasiDaCapitoli, opzioni.impronta);
}

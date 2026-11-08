/** Conversione dei moduli: anteprima e salvataggio usano lo stesso motore PostgreSQL.
 * Materiali, lavorazioni, importi, rate e collegamenti vengono ricavati dal preventivo.
 *
 * Dal 31/10/2026 vale per tutti i preventivatori, e solo per un preventivo FIRMATO: il preventivo
 * firmato è il contratto, e un contratto è una commessa (converti_modulo_commessa_atomic).
 */
import { supabase } from "@/integrations/supabase/client";
import { avviaCommessa } from "@/lib/orders/avviaCommessa";

export interface AnteprimaConversioneModulo {
  materiali: Array<{ name: string; description: string | null; quantity: number; unit_price: number; misure_testo?: string | null }>;
  fasi: Array<{ name: string; notes: string; sottofasi?: Array<{ name: string; peso: number }> }>;
  imponibile: number;
  aliquota: number;
  totale: number;
  impronta: string;
  esclusi: number;
  descrizione: string;
  /** Le rate del piano di pagamento del preventivo; vuoto = le rate di partenza dell'azienda. */
  rate?: Array<{ label: string; type: string; amount: number; trigger_evento: string }>;
}

/** I preventivatori che diventano commessa. Le chiavi sono quelle del ponte delle firme (quoteBridge). */
export type ModuloCommessa = "fv" | "sr" | "rst" | "bagni" | "tetti" | "clm" | "ele" | "idr" | "pav" | "pis";

/** Il contratto dietro al preventivo: firmato o no, come, e la commessa (sua o di un'altra copia). */
export interface ContrattoModulo {
  firmato: boolean;
  modo: string | null;
  quote_id: string | null;
  quote_status: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  contratto_firmato: unknown;
  ordine_id: string | null;
  /** Un'altra copia o revisione dello stesso preventivo è già commessa: questo è una variante. */
  famiglia: { order_id: string; order_code: string | null; preventivo: string | null } | null;
}

export async function leggiContrattoModulo(modulo: ModuloCommessa, progettoId: string): Promise<ContrattoModulo> {
  const { data, error } = await supabase.rpc("modulo_contratto" as never, { p_modulo: modulo, p_progetto_id: progettoId } as never);
  if (error) throw new Error(error.message);
  return data as unknown as ContrattoModulo;
}
export interface EsitoConversione {
  orderId: string;
  righe: number;
  lavorazioni: number;
  avviso?: string | null;
}

export const chiaveContrattoModulo = (modulo: ModuloCommessa, progettoId: string) => ["modulo-contratto", modulo, progettoId] as const;

/** Perché non si può ancora creare la commessa, dal contratto; null se si può. */
export function bloccoDelContratto(contratto: Pick<ContrattoModulo, "firmato" | "famiglia"> | undefined): string | null {
  if (!contratto) return null;
  if (contratto.famiglia) {
    return `Il preventivo ${contratto.famiglia.preventivo ?? ""} è già la commessa ${contratto.famiglia.order_code ?? ""}: le modifiche di questo vanno registrate come variante di quella commessa.`.replace(/\s+/g, " ");
  }
  if (!contratto.firmato) {
    return "Serve il preventivo firmato: è il contratto da cui nasce la commessa. Mandalo in firma o, se il cliente l'ha firmato su carta, registra la scansione.";
  }
  return null;
}

type Modulo = ModuloCommessa;
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
  // La transazione principale ha già salvato fasi e rate del piano. Se il preventivo non ne aveva,
  // applica quelle di partenza dell'azienda: i modelli non toccano fasi e rate già presenti.
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
/** Serramenti e i 7 edili (bagni, tetti, clima, elettrico, termoidraulico, pavimenti, piscine). */
export function convertiModuloInCommessa(modulo: Exclude<ModuloCommessa, "fv" | "rst">, progettoId: string, userId: string, opzioni: { fasiDaCapitoli?: boolean; impronta?: string } = {}) {
  return converti(modulo, progettoId, userId, !!opzioni.fasiDaCapitoli, opzioni.impronta);
}
export function convertiRstInCommessa(progettoId: string, userId: string, opzioni: { fasiDaCapitoli?: boolean; impronta?: string } = {}) {
  return converti("rst", progettoId, userId, !!opzioni.fasiDaCapitoli, opzioni.impronta);
}

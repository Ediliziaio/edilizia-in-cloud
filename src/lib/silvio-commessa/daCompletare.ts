/**
 * Quanto è completa una commessa (31/10/2026, fase 2): il punteggio e cosa manca, per la riga
 * «Completa con Silvio» sulla sua pagina. Vedi docs/piano-silvio-commessa-ai.md, Fase 2.
 *
 * Il conto lo fa il database (`commesse_da_completare`, migrazione 20281112120000) con le
 * stesse espressioni di completezza.ts: una chiamata, al massimo 200 righe, già in ordine.
 */
import { oggiInItalia } from "../../../shared/silvio-commessa/date.ts";
import { supabase } from "@/integrations/supabase/client";
import { variabile } from "../../../shared/silvio-commessa/registro.ts";
import { ErroreBozza, messaggioErrore } from "./bozze";

export interface CommessaDaCompletare {
  order_id: string;
  order_code: string | null;
  titolo: string | null;
  cliente: string | null;
  /** Inizio lavori, AAAA-MM-GG. */
  inizio: string | null;
  /** Consegna prevista, AAAA-MM-GG: conta per l'urgenza quando l'inizio manca. */
  consegna: string | null;
  /** Null per chi non vede gli importi. */
  importo: number | null;
  punteggio: number;
  /** Chiavi del registro, dalla più pesante. */
  mancano: string[];
  /** Quante commesse da completare in tutto (anche oltre il tetto). */
  totale: number;
}

interface ClientRpc {
  rpc: (nome: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}
// La funzione è nuova: non è nei tipi generati.
const clientVero = supabase as unknown as ClientRpc;

/** Le commesse da completare, in ordine d'urgenza; con `orderId` solo quella (anche se è al 100 %). */
export async function leggiDaCompletare(
  companyId: string,
  opz: { orderId?: string | null; limite?: number } = {},
  db: ClientRpc = clientVero,
): Promise<CommessaDaCompletare[]> {
  const { data, error } = await db.rpc("commesse_da_completare", {
    p_company_id: companyId, p_order_id: opz.orderId ?? null, p_limite: opz.limite ?? 50,
  });
  if (error) throw new ErroreBozza(messaggioErrore(error), error.code ?? null);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    order_id: String(r.order_id),
    order_code: (r.order_code as string | null) ?? null,
    titolo: (r.titolo as string | null) ?? null,
    cliente: (r.cliente as string | null) ?? null,
    inizio: (r.inizio as string | null) ?? null,
    consegna: (r.consegna as string | null) ?? null,
    importo: r.importo == null ? null : Number(r.importo),
    punteggio: Number(r.punteggio) || 0,
    mancano: Array.isArray(r.mancano) ? (r.mancano as string[]) : [],
    totale: Number(r.totale) || 0,
  }));
}

/**
 * AAAA-MM-GG di oggi a Roma, come la funzione SQL (che dal 1/11/2026 usa l'ora italiana e non
 * `current_date`, in UTC): lo stesso giorno anche da un browser con un altro fuso.
 */
export const oggiIso = (d = new Date()) => oggiInItalia(d);

/** Il solo «cliente» sembra un errore: il nome c'è, manca il collegamento all'anagrafica. */
const NOMI_NELLA_RIGA: Record<string, string> = { "cliente.customer_id": "cliente in anagrafica" };

/** «fasi, rate, inizio lavori e altre 3»: cosa manca, in parole, le più pesanti prima. */
export function cosaManca(chiavi: readonly string[], quante = 3): string {
  const nomi = chiavi.map((k) => NOMI_NELLA_RIGA[k] ?? variabile(k)?.etichetta.toLowerCase() ?? k);
  if (!nomi.length) return "niente";
  const primi = nomi.slice(0, quante);
  const resto = nomi.length - primi.length;
  return resto > 0 ? `${primi.join(", ")} e altre ${resto}` : primi.length === 1 ? primi[0]
    : `${primi.slice(0, -1).join(", ")} e ${primi[primi.length - 1]}`;
}

/**
 * «Da completare» (31/10/2026, fase 2, lotto 2.3): le commesse aperte con il punteggio di
 * completezza e cosa manca, e la sequenza «Completa le prossime 5».
 * Vedi docs/piano-silvio-commessa-ai.md, Fase 2.
 *
 * Il conto lo fa il database (`commesse_da_completare`, migrazione 20281112120000) con le
 * stesse espressioni di completezza.ts: una chiamata, al massimo 200 righe, già in ordine.
 * Qui ci sono la lettura, l'ordine scritto anche in TypeScript (per i test e per rimettere in
 * fila dopo un completamento) e la sequenza, tutte funzioni pure tranne la lettura.
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

const giorno = (data: string) => Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10)));
/**
 * AAAA-MM-GG di oggi a Roma, come la funzione SQL (che dal 1/11/2026 usa l'ora italiana e non
 * `current_date`, in UTC): lo stesso giorno anche da un browser con un altro fuso.
 */
export const oggiIso = (d = new Date()) => oggiInItalia(d);

/** La data che decide l'urgenza: l'inizio lavori, o la consegna prevista. */
export const dataUrgenza = (c: Pick<CommessaDaCompletare, "inizio" | "consegna">) => c.inizio ?? c.consegna ?? null;

/**
 * L'ordine dell'elenco, lo stesso della funzione SQL: prima chi ha una data, dalla più vicina
 * a oggi (prima o dopo che sia); poi chi non ce l'ha; a parità, l'importo più alto.
 */
export function ordinaPerUrgenza<T extends Pick<CommessaDaCompletare, "inizio" | "consegna" | "importo">>(
  righe: readonly T[], oggi: string = oggiIso(),
): T[] {
  const zero = giorno(oggi);
  const distanza = (c: T) => {
    const d = dataUrgenza(c);
    return d ? Math.abs(giorno(d) - zero) : Number.POSITIVE_INFINITY;
  };
  return righe
    .map((c, i) => ({ c, i }))
    .sort((a, b) => distanza(a.c) - distanza(b.c) || (b.c.importo ?? -1) - (a.c.importo ?? -1) || a.i - b.i)
    .map((x) => x.c);
}

/** «fasi, rate, inizio lavori e altre 3»: cosa manca, in parole, le più pesanti prima. */
export function cosaManca(chiavi: readonly string[], quante = 3): string {
  const nomi = chiavi.map((k) => variabile(k)?.etichetta.toLowerCase() ?? k);
  if (!nomi.length) return "niente";
  const primi = nomi.slice(0, quante);
  const resto = nomi.length - primi.length;
  return resto > 0 ? `${primi.join(", ")} e altre ${resto}` : primi.length === 1 ? primi[0]
    : `${primi.slice(0, -1).join(", ")} e ${primi[primi.length - 1]}`;
}

/** Quando è la data dell'urgenza, detta in breve: «tra 3 giorni», «oggi», «da 5 giorni». */
export function quando(c: Pick<CommessaDaCompletare, "inizio" | "consegna">, oggi: string = oggiIso()): string | null {
  const d = dataUrgenza(c);
  if (!d) return null;
  const n = Math.round((giorno(d) - giorno(oggi)) / 86_400_000);
  const cosa = c.inizio ? "inizio" : "consegna";
  if (n === 0) return `${cosa} oggi`;
  if (n === 1) return `${cosa} domani`;
  if (n > 0) return `${cosa} tra ${n} giorni`;
  if (c.inizio) return n === -1 ? "iniziata ieri" : `iniziata da ${-n} giorni`;
  return n === -1 ? "consegna era ieri" : `consegna scaduta da ${-n} giorni`;
}

// ── «Completa le prossime 5» ────────────────────────────────────────────────

export interface Sequenza {
  /** Le commesse in fila, in ordine. */
  coda: string[];
  /** Quella aperta adesso (indice in `coda`); `coda.length` = finita. */
  indice: number;
  completate: string[];
  saltate: string[];
}

export const PROSSIME = 5;

/** Le prime `n` commesse dell'elenco (già in ordine d'urgenza). */
export function avviaSequenza(righe: readonly Pick<CommessaDaCompletare, "order_id">[], n = PROSSIME): Sequenza {
  return { coda: righe.slice(0, n).map((r) => r.order_id), indice: 0, completate: [], saltate: [] };
}

/** Dopo «Completa» o «Salta» si passa alla prossima, senza tornare all'elenco. */
export function avanza(s: Sequenza, come: "completata" | "saltata"): Sequenza {
  const attuale = s.coda[s.indice];
  if (attuale === undefined) return s;
  return {
    ...s,
    indice: s.indice + 1,
    completate: come === "completata" ? [...s.completate, attuale] : s.completate,
    saltate: come === "saltata" ? [...s.saltate, attuale] : s.saltate,
  };
}

/** La commessa aperta adesso, o null a sequenza finita. */
export const attuale = (s: Sequenza | null): string | null => (s ? s.coda[s.indice] ?? null : null);

/** Il messaggio di un errore della lettura, per l'elenco. */
export function erroreElenco(e: unknown): string {
  return e instanceof ErroreBozza ? e.message : messaggioErrore(e);
}

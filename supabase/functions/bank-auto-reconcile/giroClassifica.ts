/**
 * Il giro del mattino: quali aziende guardare e come classificarne i movimenti (28/11/2026).
 *
 * PERCHÉ A LOTTI
 * Classificare un movimento costa circa 0,4 secondi, e PostgREST dà a ogni chiamata 8 secondi
 * (`statement_timeout` del ruolo `authenticator`; quello che la funzione imposta dentro vale solo
 * dall'istruzione dopo). Con `p_limite: 100` il giro moriva ogni mattina dopo 8 secondi con
 * 57014 e tornava indietro per intero: niente esiti, nemmeno per l'unica azienda collegata.
 * Dieci movimenti stanno in circa 4 secondi. Il classificatore prende per primi quelli senza
 * esito e poi i più vecchi da ricalcolare, quindi ogni lotto va avanti dal punto giusto.
 *
 * PERCHÉ TUTTE LE AZIENDE
 * Prima le aziende venivano solo da `bank_connections` attive: chi carica l'estratto a mano non
 * era mai classificato. Ora l'elenco lo dà il database (`tesoreria_aziende_da_classificare`):
 * chi ha movimenti aperti recenti, prima chi ne ha senza esito, poi chi è stato guardato meno di
 * recente. Le aziende collegate senza movimenti aperti restano in coda all'elenco, per le
 * conferme e i riallineamenti arretrati.
 *
 * Nessun import: lo prova src/test/logic/bankGiroClassifica.test.ts.
 */

/**
 * Movimenti per chiamata, sotto gli 8 s di PostgREST. Misurato il 28/11: 10 movimenti fra 3,9 e
 * 6,8 s secondo il carico, troppo vicino al tetto; 5 restano sotto anche nel caso peggiore.
 */
export const LOTTO_CLASSIFICA = 5;
/** Movimenti al massimo per azienda in un giro: il resto il giorno dopo, o dalla coda dei caricamenti. */
export const TETTO_MOVIMENTI_AZIENDA = 60;
/** Aziende al massimo per giro, a rotazione. */
export const TETTO_AZIENDE_GIRO = 20;
/** Tempo totale di classificazione per giro: le conferme e i riallineamenti vengono dopo. */
export const TEMPO_GIRO_MS = 90_000;

export interface AziendaDaClassificare {
  company_id: string;
  aperti?: number;
  senza_esito?: number;
}

/** Prima l'ordine del database, poi le collegate che non ci sono; senza doppioni, con un tetto. */
export function aziendeDelGiro(
  daClassificare: readonly AziendaDaClassificare[] | null | undefined,
  collegate: readonly (string | null | undefined)[],
  tetto = TETTO_AZIENDE_GIRO,
): string[] {
  const elenco: string[] = [];
  for (const id of [...(daClassificare ?? []).map((a) => a?.company_id), ...collegate]) {
    if (typeof id !== "string" || !id || elenco.includes(id)) continue;
    elenco.push(id);
  }
  return elenco.slice(0, Math.max(1, tetto));
}

export interface EsitoLotto {
  analizzati?: number;
  cambiati?: number;
  per_esito?: Record<string, number>;
}

export type ChiamaClassifica = (
  limite: number,
) => PromiseLike<{ data: EsitoLotto | null; error: { message: string } | null }>;

export interface RiepilogoClassifica {
  analizzati: number;
  cambiati: number;
  per_esito: Record<string, number>;
  chiamate: number;
  /** Perché ci si è fermati prima di finire: tetto, tempo o errore. */
  fermato?: "tetto" | "tempo";
  errore?: string;
}

/**
 * Chiama il classificatore a lotti finché un lotto torna più corto del limite (non c'è altro),
 * finché si raggiunge il tetto dell'azienda o finisce il tempo del giro. Un errore ferma solo
 * questa azienda: ciò che i lotti precedenti hanno scritto resta.
 */
export async function classificaALotti(
  chiama: ChiamaClassifica,
  opzioni: { lotto?: number; tetto?: number; tempoScaduto?: () => boolean } = {},
): Promise<RiepilogoClassifica> {
  const lotto = Math.max(1, Math.floor(opzioni.lotto ?? LOTTO_CLASSIFICA));
  const tetto = Math.max(lotto, Math.floor(opzioni.tetto ?? TETTO_MOVIMENTI_AZIENDA));
  const riepilogo: RiepilogoClassifica = { analizzati: 0, cambiati: 0, per_esito: {}, chiamate: 0 };
  while (riepilogo.analizzati < tetto) {
    if (opzioni.tempoScaduto?.()) {
      riepilogo.fermato = "tempo";
      break;
    }
    const limite = Math.min(lotto, tetto - riepilogo.analizzati);
    const { data, error } = await chiama(limite);
    riepilogo.chiamate += 1;
    if (error) {
      riepilogo.errore = error.message;
      break;
    }
    const analizzati = Number(data?.analizzati ?? 0);
    riepilogo.analizzati += analizzati;
    riepilogo.cambiati += Number(data?.cambiati ?? 0);
    for (const [esito, n] of Object.entries(data?.per_esito ?? {})) {
      riepilogo.per_esito[esito] = (riepilogo.per_esito[esito] ?? 0) + Number(n ?? 0);
    }
    if (analizzati < limite) return riepilogo;
  }
  if (!riepilogo.errore && !riepilogo.fermato && riepilogo.analizzati >= tetto) riepilogo.fermato = "tetto";
  return riepilogo;
}

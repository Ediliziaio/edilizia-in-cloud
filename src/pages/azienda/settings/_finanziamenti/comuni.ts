/**
 * Pezzi in comune alle pagine dei finanziamenti (elenco, dettaglio, nuova tabella, calcolatore):
 * chi può cosa, la data all'italiana, se una tabella vale oggi, i numeri e le frasi d'errore.
 *
 * Niente JSX qui (i componenti stanno in `pezzi.tsx`): così il file si prova da solo.
 */
import type { ButtonHTMLAttributes } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { isNetworkError, isTransientTimeoutError, sembraErrorePostgresGrezzo, userErrorMessage } from "@/lib/userErrorMessage";

// ─── Chi può cosa ─────────────────────────────────────────────────────────────

/** Sopra l'elenco, sopra il dettaglio, in testa alla procedura: perché i comandi sono spenti. */
export const FRASE_SOLA_LETTURA =
  "Stai consultando i finanziamenti: li modifica chi ha il permesso «Finanziamenti» in modifica.";

/** Al posto della pagina, per chi non può nemmeno vederla. */
export const FRASE_ACCESSO_NEGATO = "Per vedere i finanziamenti serve il permesso «Finanziamenti». Chiedilo al titolare.";

/** L'avviso porta questo id e ogni comando spento lo cita con `aria-describedby`. */
export const ID_AVVISO_SOLA_LETTURA = "finanziamenti-sola-lettura";

/**
 * Vedere = «Finanziamenti» in vista (o «Listino & Prezzi»); modificare = lo stesso in modifica.
 * Gli amministratori ci rientrano da soli (`usePermissions` dà loro tutti i permessi), e la rotta
 * «nuova tabella» chiede già `canEditSettingsFinanziamenti`: la pagina ora segue la stessa regola,
 * invece di guardare il ruolo globale (che non dice nulla dell'azienda scelta né di «Visualizza come»).
 */
export function useAccessoFinanziamenti() {
  const permessi = usePermissions();
  const puoModificare = permessi.canEditSettingsFinanziamenti;
  const puoVedere = puoModificare || permessi.canViewSettingsFinanziamenti;
  return { puoVedere, puoModificare };
}

type ProprietaSpento = Pick<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "aria-describedby">;

/**
 * Da spargere su un comando che scrive: per chi non può modificare porta la frase che spiega perché
 * (anche per il lettore di schermo). `disabled` lo scrive chi chiama, insieme ad altre ragioni (salvataggio in corso…).
 */
export function proprietaComandoSpento(puoModificare: boolean): ProprietaSpento {
  return puoModificare ? {} : { title: FRASE_SOLA_LETTURA, "aria-describedby": ID_AVVISO_SOLA_LETTURA };
}

// ─── Date ─────────────────────────────────────────────────────────────────────

/**
 * Il giorno di oggi nel fuso del computer, come `aaaa-mm-gg`. `toISOString()` darebbe quello UTC:
 * tra mezzanotte e le due di notte, d'estate, sarebbe ancora «ieri» e una tabella scaduta oggi risulterebbe valida.
 */
export function oggiLocale(adesso: Date = new Date()): string {
  const anno = adesso.getFullYear();
  const mese = String(adesso.getMonth() + 1).padStart(2, "0");
  const giorno = String(adesso.getDate()).padStart(2, "0");
  return `${anno}-${mese}-${giorno}`;
}

/**
 * `2026-10-01` (anche con l'ora dopo) → `01/10/2026`. Senza `new Date`: una data senza ora, letta come UTC,
 * può slittare di un giorno. Se non è una data, un trattino.
 */
export function dataItaliana(valore: string | null | undefined): string {
  const pezzi = /^(\d{4})-(\d{2})-(\d{2})/.exec(valore ?? "");
  return pezzi ? `${pezzi[3]}/${pezzi[2]}/${pezzi[1]}` : "—";
}

type StatoValidita = "valida" | "scaduta" | "futura" | "aperta";

/** Dove sta la tabella rispetto alle sue date: già scaduta, non ancora iniziata, in vigore, senza date. */
export function statoValidita(
  decorrenza: string | null | undefined,
  scadenza: string | null | undefined,
  oggi: string = oggiLocale(),
): StatoValidita {
  if (decorrenza && decorrenza.slice(0, 10) > oggi) return "futura";
  if (scadenza && scadenza.slice(0, 10) < oggi) return "scaduta";
  if (decorrenza || scadenza) return "valida";
  return "aperta";
}

function giorniTra(da: string, a: string): number {
  const [anno1, mese1, giorno1] = da.slice(0, 10).split("-").map(Number);
  const [anno2, mese2, giorno2] = a.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(anno2, mese2 - 1, giorno2) - Date.UTC(anno1, mese1 - 1, giorno1)) / 86_400_000);
}

/** Scade oggi o nei prossimi `giorni` giorni (una già scaduta non conta). */
export function scadeEntro(scadenza: string | null | undefined, giorni = 30, oggi: string = oggiLocale()): boolean {
  if (!scadenza) return false;
  const distanza = giorniTra(oggi, scadenza);
  return distanza >= 0 && distanza <= giorni;
}

// ─── Numeri all'italiana ──────────────────────────────────────────────────────

/** `30000` → `30.000`, `140` con 2 decimali → `140,00` (l'italiano mette il punto delle migliaia da cinque cifre in su). Il simbolo € lo mette chi chiama. */
export function formattaEuro(n: number, decimali = 0): string {
  const valore = Number.isFinite(n) ? n : 0;
  return valore.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
}

/** `8.875` → `8,88%`. */
export function formattaPercentuale(n: number, decimali = 2): string {
  return `${formattaEuro(n, decimali)}%`;
}

// ─── Frasi d'errore ───────────────────────────────────────────────────────────

/** L'errore di `functions.invoke()` dice solo «non-2xx»: il perché sta nello stato della risposta. */
function conStatoDellaRisposta(errore: unknown): unknown {
  const stato = (errore as { context?: { status?: unknown } } | null)?.context?.status;
  if (typeof stato !== "number") return errore;
  return { message: errore instanceof Error ? errore.message : "", status: stato };
}

/**
 * La frase da mostrare per un errore, mai il testo tecnico. Le frasi che scrivono queste pagine e
 * `lib/finanziamenti/queries.ts` («La data di scadenza non può essere precedente…», «Questa tabella è già usata
 * in progetti…») sono `Error` semplici già in italiano e passano così come sono. Tutto il resto (database,
 * archivio dei file, rete, funzioni) passa da `userErrorMessage`, che in mancanza di meglio dà `ripiego`.
 */
export function erroreComprensibile(errore: unknown, ripiego: string): string {
  const sembraTecnico =
    isNetworkError(errore) ||
    isTransientTimeoutError(errore) ||
    (errore instanceof Error && sembraErrorePostgresGrezzo(errore.message));
  if (errore instanceof Error && errore.constructor === Error && errore.message.trim() && !sembraTecnico) {
    return errore.message;
  }
  return userErrorMessage(conStatoDellaRisposta(errore), ripiego);
}

// ─── Parole ───────────────────────────────────────────────────────────────────

/** `1 tabella`, `3 tabelle`. */
export function conteggio(n: number, singolare: string, plurale: string): string {
  return `${n} ${n === 1 ? singolare : plurale}`;
}

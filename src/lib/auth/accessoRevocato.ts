/**
 * L'accesso di questo dispositivo esiste ancora? (24/09/2026)
 *
 * «Revoca» e «Blocca» cancellano l'accesso in auth.sessions. Da lì il rinnovo
 * del token fallisce e supabase-js butta fuori da solo — ma solo alla scadenza
 * del token di accesso, fino a un'ora dopo, e intanto l'app continua a
 * lavorare. Qui si chiede a GoTrue (`GET /auth/v1/user`) se l'accesso c'è
 * ancora: se risponde `session_not_found`, supabase-js toglie la sessione ed
 * emette SIGNED_OUT (auth-js, `_getUser`), e l'app torna al login come dopo
 * un'uscita.
 *
 * Si chiede a GoTrue e non alla propria riga di user_sessions: la riga è la
 * traccia per l'elenco, l'accesso è la cosa vera. Così vale per ogni modo in
 * cui un accesso finisce — revoca, blocco, «Esci» su un altro dispositivo
 * (in supabase-js l'uscita è globale), una cancellazione a mano come quella
 * del 24/09 — e non dipende da una riga che si può chiudere senza chiudere
 * l'accesso, cioè il difetto che questa correzione chiude.
 */
import { isAuthSessionMissingError } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ogni quanto si chiede, a scheda visibile. Il token di accesso dura un'ora. */
export const INTERVALLO_CONTROLLO_ACCESSO_MS = 2 * 60 * 1000;

/** Al ritorno sulla scheda si controlla subito, ma non più di così spesso. */
export const DISTANZA_MINIMA_CONTROLLI_MS = 30 * 1000;

/**
 * L'accesso (auth.sessions.id) scritto nel token: il claim `session_id`.
 * Non verifica la firma: serve a riconoscere l'accesso, non a fidarsene.
 */
export function idAccessoDalToken(token: string | null | undefined): string | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const id = claims?.session_id;
    return typeof id === "string" && UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * La scheda deve (ri)registrare la sua sessione in user_sessions? Sì se non ne
 * ha una, o se quella salvata è di un altro accesso: dopo un nuovo login nella
 * stessa scheda o un «Accedi come», l'id in sessionStorage era dell'accesso di
 * prima, e il nuovo non compariva nell'elenco né si poteva revocare da lì.
 */
export function sessioneDaRegistrare(
  accessToken: string,
  rigaSalvata: string | null,
  accessoSalvato: string | null,
): boolean {
  if (!rigaSalvata) return true;
  const accesso = idAccessoDalToken(accessToken);
  return accesso !== null && accesso !== accessoSalvato;
}

/**
 * GoTrue ha risposto che l'accesso non esiste più. Non lo sono: rete assente,
 * token scaduto (lo rinnova supabase-js), server lento o in errore.
 */
export function accessoChiusoDalServer(error: unknown): boolean {
  return isAuthSessionMissingError(error);
}

export interface ControlloAccesso {
  /** Da chiamare a ogni evento auth: il token da controllare, o null da fuori. */
  aggiornaToken(token: string | null): void;
  /** Chiede se l'accesso c'è ancora. True se il server l'ha dato per chiuso. */
  controlla(): Promise<boolean>;
}

export function creaControlloAccesso(opzioni: {
  /** `supabase.auth.getUser(token)`: col token esplicito non prende il lock dello storage. */
  chiediUtente: (token: string) => Promise<{ error: unknown }>;
  /** L'accesso è stato chiuso mentre questo token era quello in uso. */
  quandoChiuso: () => void;
  adesso?: () => number;
}): ControlloAccesso {
  const adesso = opzioni.adesso ?? Date.now;
  let token: string | null = null;
  let ultimo = Number.NEGATIVE_INFINITY;
  let inCorso = false;

  return {
    aggiornaToken(nuovo) {
      token = nuovo;
    },
    async controlla() {
      const ora = adesso();
      if (!token || inCorso || ora - ultimo < DISTANZA_MINIMA_CONTROLLI_MS) return false;
      inCorso = true;
      ultimo = ora;
      const controllato = token;
      try {
        const { error } = await opzioni.chiediUtente(controllato);
        if (!accessoChiusoDalServer(error)) return false;
        // Il SIGNED_OUT di supabase-js arriva prima della risposta, e il token
        // qui è già null. Un token DIVERSO invece è un nuovo accesso fatto nel
        // frattempo: l'avviso non lo riguarda.
        if (token === null || token === controllato) opzioni.quandoChiuso();
        return true;
      } catch {
        return false; // si riprova al prossimo giro
      } finally {
        inCorso = false;
      }
    },
  };
}

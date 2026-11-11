/**
 * Silvio fermo per carta, abbonamento o credito: dice il motivo vero (11/11/2026).
 *
 * Prima, quando il router lanciava il blocco della carta (o dell'abbonamento, o
 * del credito dell'azienda), Silvio scriveva in chat «⚠️ C'è stato un problema
 * tecnico: Registra una carta…»; e quando era silvio-extract-pdf a rispondere
 * 402 payment_method_required, il PDF finiva nel prompt come «ERRORE TECNICO»
 * e il modello chiedeva di controllare la password del file.
 *
 * Qui, a partire dalla classificazione di erroriAi.ts (bloccoAiPerUtente):
 *   · la frase che Silvio scrive in chat, col link a dove si risolve;
 *   · l'esito JSON per il browser, che apre la finestra della carta o della
 *     ricarica (src/lib/creditoEsaurito.ts → segnalaBloccoSilvio).
 * Modulo puro: si prova con vitest senza il router.
 */
import { bloccoAiPerUtente, erroreDaCorpo, type ErroreAiPerUtente } from "./erroriAi.ts";

const ABBONAMENTO = "[Impostazioni → Abbonamento](/azienda/impostazioni/abbonamento)";
const CREDITI = "[Impostazioni → Crediti](/azienda/impostazioni/crediti)";

/** I codici che fermano Silvio finché qualcuno non interviene (carta, abbonamento, credito). */
const CODICI_BLOCCO = new Set(["payment_method_required", "insufficient_credits", "servizio_non_disponibile"]);

/** Cosa Silvio non è riuscito a fare: la risposta in chat, la lettura di un allegato, uno strumento. */
export type AzioneBloccata =
  | { tipo: "risposta" }
  | { tipo: "documento"; nomeFile: string }
  | { tipo: "strumento"; cosa: string };

function perFare(azione: AzioneBloccata): string {
  if (azione.tipo === "documento") return `leggere il documento «${azione.nomeFile}»`;
  if (azione.tipo === "strumento") return azione.cosa;
  return "rispondere";
}

/**
 * Il risultato di uno strumento fermo per un blocco: il modello lo legge e lo
 * riferisce così com'è, invece di parlare di «errore tecnico».
 */
export function erroreStrumentoBloccato(blocco: ErroreAiPerUtente, cosa: string): { error: string; code: string } {
  return {
    error: `${messaggioBloccoSilvio(blocco, { tipo: "strumento", cosa })} ` +
      "[Riferisci all'utente questo motivo con queste parole: non è un errore tecnico e riprovare non serve.]",
    code: blocco.body.code,
  };
}

/**
 * Gli inizi delle frasi qui sotto: silvioAnswerQuality.ts li tiene fuori dallo
 * storico, come gli altri messaggi d'errore (non sono risposte da ricordare).
 */
export const INIZI_BLOCCO_SILVIO =
  "serve una carta di pagamento registrata|l['’]abbonamento è sospeso o scaduto|il credito ai dell['’]azienda è finito|il tetto mensile di spesa ai|l['’]ai della piattaforma è momentaneamente ferma";

/** La frase per chi legge la chat. */
export function messaggioBloccoSilvio(blocco: ErroreAiPerUtente, azione: AzioneBloccata): string {
  const fare = perFare(azione);
  const { code, error } = blocco.body;
  if (code === "payment_method_required") {
    if (/abbonamento sospeso o scaduto/i.test(error)) {
      return `⛔ L'abbonamento è sospeso o scaduto: per ${fare} va rinnovato da ${ABBONAMENTO}.`;
    }
    return `💳 Serve una carta di pagamento registrata per ${fare}: aggiungila da ${ABBONAMENTO}, poi riprova.`;
  }
  if (code === "insufficient_credits") {
    const motivo = blocco.body.motivo;
    if (motivo === "budget_piano" || motivo === "hard_cap_exceeded") {
      return `⛔ Il tetto mensile di spesa AI dell'azienda è stato raggiunto: per ${fare} va alzato da ${CREDITI}, oppure si riparte il mese prossimo.`;
    }
    return `💳 Il credito AI dell'azienda è finito: per ${fare} ricarica il portafoglio da ${CREDITI}.`;
  }
  // servizio_non_disponibile: è finito il credito del provider, non quello dell'azienda.
  return "⚠️ L'AI della piattaforma è momentaneamente ferma (non dipende dal vostro credito). " +
    "Il team è già avvisato: riprova tra qualche minuto.";
}

/** Il blocco dentro un errore lanciato (router, strumenti), oppure `null`. */
export const bloccoSilvioDaErrore = bloccoAiPerUtente;

/** Il blocco dentro il corpo JSON che un'altra funzione ha già risposto (silvio-extract-pdf), oppure `null`. */
export function bloccoSilvioDaCorpo(corpo: unknown): ErroreAiPerUtente | null {
  const e = erroreDaCorpo(corpo);
  return e && CODICI_BLOCCO.has(e.body.code) ? e : null;
}

/**
 * Il corpo di un errore di `functions.invoke` (FunctionsHttpError porta la
 * Response in `context`). Non lancia: se non si legge, `null`.
 */
export async function corpoErroreInvoke(err: unknown): Promise<unknown> {
  const context = (err as { context?: unknown } | null)?.context;
  if (!context || typeof (context as Response).clone !== "function") return null;
  try {
    return await (context as Response).clone().json();
  } catch {
    return null;
  }
}

/**
 * L'esito per il browser (risposta 200, come per il credito già controllato
 * all'ingresso): `error` resta «credito_esaurito» per il credito, così i client
 * che già lo riconoscono non cambiano; `code` dice quale finestra aprire.
 */
export function esitoBloccoSilvio(blocco: ErroreAiPerUtente): Record<string, unknown> {
  const { code, error } = blocco.body;
  return {
    ok: false,
    error: code === "insufficient_credits" ? "credito_esaurito" : code,
    code,
    messaggio: error,
  };
}

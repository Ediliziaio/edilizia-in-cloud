/**
 * Quale modello e quanti token per il turno del bot operativo (28/09/2026).
 *
 * Il problema: un turno da amministratore usava sempre Sonnet con ~24.000 token
 * di prompt (tutte le aree di strumenti caricate), anche per un «segna fatto».
 * Ora si sceglie in base a CHI scrive e COSA chiede:
 *  - operai e sconosciuti → modello economico, pochi token, niente Silvio;
 *  - l'AMMINISTRATORE (il titolare) → SEMPRE Silvio, con tutti i suoi strumenti
 *    dati: è il proprietario e quando chiede una situazione o dei numeri deve
 *    avere la risposta vera (mai «vai sull'app»). Sono pochi messaggi: la qualità
 *    conta più del risparmio;
 *  - l'ufficio → economico solo per le AZIONI semplici e inequivocabili (segna
 *    fatto, annulla, presenze, foto, DDT); per tutto il resto (una domanda, un
 *    rapportino, una segnalazione) apre Silvio, così una domanda sui dati non
 *    finisce per sbaglio sul percorso economico senza strumenti.
 *
 * NB storico (28/09): un audio del titolare che chiedeva i dati era stato
 * classificato «rapportino» e col vecchio instradamento finiva sul modello
 * economico SENZA Silvio → rispondeva «per i dati ti serve l'app». Da qui la
 * regola: l'amministratore ha sempre Silvio.
 */

export type TipoUtente = "operaio" | "ufficio" | "admin" | "unknown";

/** Azioni semplici e inequivocabili: non servono i dati, basta il bot economico. */
const INTENT_AZIONI_SEMPLICI = new Set([
  "ddt",
  "foto_cantiere",
  "presenze",
  "conferma",
  "annulla",
]);

export interface PianoModello {
  /** Config in ai_model_config: titolare = forte (Sonnet), operaio = economico. */
  taskKind: "bot_operativo_titolare" | "bot_operativo_operaio";
  maxTokens: number;
  /** Aprire il ponte verso gli strumenti di Silvio per questo turno. */
  usaSilvio: boolean;
  /** true = risposta approfondita attesa (lo dice anche il prompt). */
  approfondito: boolean;
}

export function pianoModello(kind: TipoUtente, intent: string): PianoModello {
  // Operai e sconosciuti: sempre economico e stringato.
  if (kind === "operaio" || kind === "unknown") {
    return { taskKind: "bot_operativo_operaio", maxTokens: 700, usaSilvio: false, approfondito: false };
  }
  // L'amministratore (il titolare) ha SEMPRE Silvio: mai deviarlo sul percorso
  // economico, anche se l'intent sembra operativo (spesso è un audio classificato
  // male). È lui che chiede «dammi i dati».
  if (kind === "admin") {
    return { taskKind: "bot_operativo_titolare", maxTokens: 2500, usaSilvio: true, approfondito: true };
  }
  // Ufficio: economico solo per le azioni semplici e sicure.
  if (INTENT_AZIONI_SEMPLICI.has(intent)) {
    return { taskKind: "bot_operativo_operaio", maxTokens: 800, usaSilvio: false, approfondito: false };
  }
  // Ufficio, tutto il resto (domande, rapportini, segnalazioni): Silvio.
  return { taskKind: "bot_operativo_titolare", maxTokens: 2500, usaSilvio: true, approfondito: true };
}

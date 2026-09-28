/**
 * Quale modello e quanti token per il turno del bot operativo (28/09/2026).
 *
 * Il problema: un turno da amministratore usava sempre Sonnet con ~24.000 token
 * di prompt (tutte le aree di strumenti caricate), anche per un «segna fatto».
 * Ora si sceglie in base a COSA chiede:
 *  - operai e azioni operative (rapportino, DDT, foto, presenze, conferme) →
 *    modello economico, pochi token, solo gli strumenti del bot (niente Silvio):
 *    la risposta dev'essere brevissima;
 *  - domande sui numeri e sulla situazione aziendale (ufficio/amministratore) →
 *    modello forte, più token, strumenti di Silvio: risposta approfondita.
 */

export type TipoUtente = "operaio" | "ufficio" | "admin" | "unknown";

/** Gli intent operativi (da operationalTriage): azioni, non analisi. */
const INTENT_OPERATIVI = new Set([
  "rapportino",
  "ddt",
  "foto_cantiere",
  "presenze",
  "segnalazione",
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
  // Ufficio/amministratore su un'AZIONE operativa: economico, solo strumenti bot.
  if (INTENT_OPERATIVI.has(intent)) {
    return { taskKind: "bot_operativo_operaio", maxTokens: 800, usaSilvio: false, approfondito: false };
  }
  // Ufficio/amministratore che CHIEDE dati/analisi: forte e approfondito.
  return { taskKind: "bot_operativo_titolare", maxTokens: 2500, usaSilvio: true, approfondito: true };
}

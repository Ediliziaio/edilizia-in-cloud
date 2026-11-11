// Che cosa rispondere su WhatsApp quando il turno del bot finisce in errore (11/11/2026).
//
// Prima una regex sola, `aiFerma`, riconosceva il credito AI finito e la chiave
// rifiutata; la carta mancante e l'abbonamento sospeso o scaduto (il gate di
// _shared/requirePaymentMethod.ts, che arriva qui dalla lettura delle foto e dei
// documenti via aiRouterComplete) cadevano nel «Ho avuto un problema. Riprova tra
// un momento»: un riprova che non può riuscire finché l'azienda non sistema.
//
// Chi scrive non deve leggere della carta o dell'abbonamento dell'azienda: riceve
// una frase neutra, e il motivo vero va all'ufficio con un ticket (uno al giorno
// per numero, ticketUfficio.ts).

import { BLOCCO_PAGAMENTO, bloccoAiPerUtente } from "../_shared/erroriAi.ts";

export type ErroreBot =
  /** Carta mancante o abbonamento sospeso/scaduto: lo sistema l'azienda, non chi scrive. */
  | { tipo: "blocco_azienda"; motivo: string }
  /** Credito AI finito o chiave rifiutata: l'allarme del credito AI ha già avvisato il titolare. */
  | { tipo: "ai_ferma" }
  | { tipo: "generico" };

const AI_FERMA = /provider_credits_exhausted|insufficient[_ ]credits|\b402\b|credito|quota|api[_ ]key|unauthori[sz]ed|\b401\b/i;

export function classificaErroreBot(err: unknown): ErroreBot {
  const messaggio = err instanceof Error ? err.message : String(err);
  const blocco = bloccoAiPerUtente(err);
  if (blocco?.body.code === "payment_method_required" || BLOCCO_PAGAMENTO.test(messaggio)) {
    const motivo = (messaggio.match(/(Registra una carta di pagamento[^\n]*|Abbonamento sospeso o scaduto[^\n]*)/i)?.[1] ?? messaggio).slice(0, 300);
    return { tipo: "blocco_azienda", motivo };
  }
  if (blocco || AI_FERMA.test(messaggio)) return { tipo: "ai_ferma" };
  return { tipo: "generico" };
}

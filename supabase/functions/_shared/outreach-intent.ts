/**
 * outreach-intent — classificazione intento delle risposte cold (Unibox NLP).
 * Etichette fisse + normalizzazione robusta dell'output AI + prompt. Pura.
 */

export const INTENT_LABELS = [
  "interested",
  "not_interested",
  "out_of_office",
  "unsubscribe",
  "auto_reply",
  "question",
  "other",
] as const;
export type IntentLabel = typeof INTENT_LABELS[number];

const SYNONYMS: Record<string, IntentLabel> = {
  interested: "interested", interest: "interested", positive: "interested", yes: "interested", interessato: "interested",
  not_interested: "not_interested", notinterested: "not_interested", negative: "not_interested", no: "not_interested", noninteressato: "not_interested",
  out_of_office: "out_of_office", ooo: "out_of_office", outofoffice: "out_of_office", vacation: "out_of_office", assente: "out_of_office",
  auto_reply: "auto_reply", autoreply: "auto_reply", automatic: "auto_reply", noreply: "auto_reply",
  unsubscribe: "unsubscribe", optout: "unsubscribe", opt_out: "unsubscribe", remove: "unsubscribe", cancellami: "unsubscribe", disiscrivi: "unsubscribe",
  question: "question", info: "question", domanda: "question", info_request: "question",
  other: "other", neutral: "other",
};

/** Mappa l'output (possibilmente sporco) del modello su un'etichetta valida. */
export function normalizeIntent(raw: unknown): IntentLabel {
  const s = String(raw ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if ((INTENT_LABELS as readonly string[]).includes(s)) return s as IntentLabel;
  return SYNONYMS[s] ?? "other";
}

/** Confidenza 0-1 robusta (accetta numeri o stringhe; default 0). */
export function normalizeConfidence(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export const INTENT_SYSTEM_PROMPT =
  `Sei un classificatore di risposte a email cold B2B in italiano. ` +
  `Leggi oggetto + estratto della risposta e assegna UNA etichetta di intento tra: ` +
  `interested (vuole saperne di più / disponibile a sentirsi), ` +
  `not_interested (rifiuto / non ora), ` +
  `out_of_office (fuori sede / risponditore automatico di assenza), ` +
  // 22/09/2026: una conferma standard di un'azienda («vi ringraziamo per
  // l'interesse, compilate il modulo sul sito») era passata per interessata.
  `auto_reply (messaggio automatico o standard, non scritto da una persona per noi: conferma di ricezione, ticket, orari d'ufficio, ` +
  `rimando generico a un modulo del sito o a un numero, casella dismessa o indirizzo cambiato), ` +
  `unsubscribe (chiede di non essere più contattato), ` +
  `question (fa una domanda specifica prima di decidere), ` +
  `other (tutto il resto). ` +
  `Rispondi SOLO con JSON: {"intent":"<etichetta>","confidence":<0-1>}.`;

export function buildIntentUserPrompt(subject: string, snippet: string): string {
  return [
    `Oggetto: ${subject || "—"}`,
    `Estratto risposta: ${(snippet || "—").slice(0, 600)}`,
  ].join("\n");
}

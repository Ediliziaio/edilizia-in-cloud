export const QUOTE_STARTING_POINT_REQUEST = 'Prepara un budget preliminare per il progetto che abbiamo descritto, con una prima struttura delle lavorazioni. Proponi ipotesi esplicite da confermare per i dati mancanti, non presentarle come misure reali. Se una stima non ha basi motivate, lasciala da definire. Fammi una sola domanda prioritaria e proponi scelte. Non modificare il computo verificato, le esclusioni o i valori manuali.';

/** This only prepares an editable user message; it never sends or changes quote rows. */
export function quoteStartingPointDraft(current: string): string | null {
  const next = current.includes(QUOTE_STARTING_POINT_REQUEST) ? current : current.trim() ? `${current}\n\n${QUOTE_STARTING_POINT_REQUEST}` : QUOTE_STARTING_POINT_REQUEST;
  return next.length <= 3000 ? next : null;
}

/** Recognize the exact reviewed local request even after pre-existing draft text. */
export function isQuoteStartingPointRequest(userText: string): boolean {
  return userText.trim().endsWith(QUOTE_STARTING_POINT_REQUEST);
}

/** The UI's generic request must not turn the user's preceding facts into hypotheses. */
export function quoteStartingPointUserFacts(userText: string): string {
  return isQuoteStartingPointRequest(userText) ? userText.trim().slice(0, -QUOTE_STARTING_POINT_REQUEST.length).trim() : userText;
}

/** Public failure categories only. Never expose provider messages, prompts or keys. */
export const QUOTE_FAILURES = {
  AI_REQUEST_UNCERTAIN: 'La richiesta AI ha un esito incerto. Bozza intatta; non viene ripetuta automaticamente. Verifica lo stato del servizio prima di riprovare.',
  AI_TIMEOUT: 'Il tempo disponibile per questa risposta è terminato. Bozza intatta; nessun nuovo tentativo automatico.',
  AI_TURN_LIMIT: 'Questa richiesta ha raggiunto il limite di elaborazione. Bozza intatta; nessun nuovo tentativo automatico. Prosegui con una lavorazione alla volta.',
  // Il saldo dell'AZIENDA (non quello del provider): serve una ricarica. La frase «crediti … insufficienti» è quella che la
  // finestra di ricarica dell'app riconosce in ogni risposta.
  AI_COMPANY_CREDIT: 'I crediti AI dell’azienda sono insufficienti. Bozza intatta, nessuna proposta applicata e nessun addebito. Ricarica i crediti per continuare.',
  // La risposta del modello c'è stata ma l'addebito all'azienda non è riuscito: per non dare AI non addebitata la risposta
  // viene scartata. È un guasto nostro, non dell'utente: riprovare di solito basta.
  AI_BILLING_UNAVAILABLE: 'L’addebito dei crediti AI non è riuscito: nessuna proposta applicata e bozza intatta. Riprova tra poco; se succede ancora, avvisa l’assistenza.',
  AI_PROVIDER_CREDIT: 'Il servizio AI non ha credito disponibile. Bozza intatta; nessun nuovo tentativo automatico. Serve verificare il credito del servizio.',
  AI_RESPONSE_INVALID: 'Operazione AI interrotta o risposta non verificabile. Bozza intatta; nessun nuovo tentativo automatico.',
} as const;
export type QuoteFailureCode = keyof typeof QUOTE_FAILURES;
export function publicQuoteFailure(code: unknown) {
  const safe: QuoteFailureCode = typeof code === 'string' && Object.hasOwn(QUOTE_FAILURES, code)
    ? code as QuoteFailureCode : 'AI_RESPONSE_INVALID';
  return { code: safe, message: QUOTE_FAILURES[safe] };
}
export function classifyQuoteFailure(error: unknown) {
  // DOMException may come from a different browser/runtime realm than Error.
  if (error && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError') return publicQuoteFailure('AI_TIMEOUT');
  if (error instanceof Error) {
    if (error.name === 'AiProviderCreditError') return publicQuoteFailure('AI_PROVIDER_CREDIT');
    if (error.name === 'AiCompanyCreditError') return publicQuoteFailure('AI_COMPANY_CREDIT');
    if (error.name === 'AiRouterBillingError') return publicQuoteFailure('AI_BILLING_UNAVAILABLE');
    if (error.name === 'AiRequestGuardError' && 'code' in error && [
      'provider_outcome_unknown', 'uncertain', 'reconciliation_required',
      'checkpoint_unavailable', 'completion_unavailable', 'tool_replay_requires_recovery',
    ].includes(String(error.code))) return publicQuoteFailure('AI_REQUEST_UNCERTAIN');
    if (error.name === 'AiTurnLimitError' && 'reason' in error) {
      if (error.reason === 'time') return publicQuoteFailure('AI_TIMEOUT');
      if (['attempts', 'tokens', 'cost'].includes(String(error.reason))) return publicQuoteFailure('AI_TURN_LIMIT');
    }
  }
  return publicQuoteFailure('AI_RESPONSE_INVALID');
}

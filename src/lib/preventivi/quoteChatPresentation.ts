/** Hide only automatic technical receipts, including those saved by older UI versions. */
export function isQuoteProviderNotice(message: { role: string; text: string; diagnostic?: boolean }) {
  return message.role === 'assistant' && message.diagnostic === true && /^\s*\*\*Riscontro OpenRouter\*\*/.test(message.text);
}

// Modelli, fornitori e costi dell'AI restano al laboratorio di sviluppo: chi usa
// l'azienda non li vede, nemmeno nei messaggi salvati da versioni precedenti.
const STRUMENTI_AI = /\b(?:sonnet|haiku|gpt[- ]?\d|openrouter|openai|anthropic|whisper)\b|\bUSD\b|strumenti ai|costi (?:dei )?modelli|confronta (?:i )?modelli/i;

export function isAzioneStrumentiAI(azione: string) {
  return STRUMENTI_AI.test(azione);
}

export function isMessaggioStrumentiAI(message: { role: string; text: string; diagnostic?: boolean }) {
  return message.diagnostic === true && STRUMENTI_AI.test(message.text);
}

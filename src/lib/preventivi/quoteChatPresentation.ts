/** Hide only automatic technical receipts, including those saved by older UI versions. */
export function isQuoteProviderNotice(message: { role: string; text: string; diagnostic?: boolean }) {
  return message.role === 'assistant' && message.diagnostic === true && /^\s*\*\*Riscontro OpenRouter\*\*/.test(message.text);
}

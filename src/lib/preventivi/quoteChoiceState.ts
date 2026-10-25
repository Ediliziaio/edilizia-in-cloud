/** Diagnostic warnings/searches do not consume an unanswered conversational
 * choice. A new real turn or a document revision still invalidates it. */
export function latestQuoteConversationAssistant(messages: Array<{ role: 'user' | 'assistant'; diagnostic?: boolean }>): number {
  return messages.reduce((last, m, i) => m.diagnostic ? last : m.role === 'assistant' ? i : -1, -1);
}

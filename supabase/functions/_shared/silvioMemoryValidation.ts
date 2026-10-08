export interface ExtractedMemory {
  facts: Array<{ key: string; value: unknown; confidence: number; reason?: string }>;
  summary: string; topics: string[]; key_decisions: string[];
}

export function parseExtractedMemory(content: string): ExtractedMemory {
  const value = JSON.parse(content);
  if (!value || typeof value !== 'object' || !Array.isArray(value.facts)
    || typeof value.summary !== 'string' || !value.summary.trim()) {
    throw new Error('Risposta memoria non valida: estrazione da riprovare.');
  }
  const strings = (v: unknown) => Array.isArray(v)
    ? v.filter((s): s is string => typeof s === 'string').slice(0, 5).map(s => s.slice(0, 300)) : [];
  return {
    facts: value.facts.filter((f: ExtractedMemory['facts'][number]) => f
      && typeof f.key === 'string' && /^[a-z][a-z0-9_]{1,79}$/.test(f.key)
      && typeof f.confidence === 'number' && Number.isFinite(f.confidence)
      && f.confidence >= 0.7 && f.confidence <= 1 && f.value !== undefined)
      .slice(0, 20).map((f: ExtractedMemory['facts'][number]) => ({
        key: f.key, value: f.value, confidence: f.confidence,
        reason: typeof f.reason === 'string' ? f.reason.slice(0, 500) : undefined,
      })),
    summary: value.summary.trim().slice(0, 500),
    topics: strings(value.topics), key_decisions: strings(value.key_decisions),
  };
}

/** A partial message stays pending at its UTF-16 offset; never mark its tail processed. */
export function memoryBatch<T extends { content: string; created_at: string }>(
  messages: T[], maxChars = 12000, firstMessageOffset = 0,
): Array<T & { start_offset: number; end_offset: number; complete: boolean }> {
  if (!Number.isInteger(maxChars) || maxChars < 2 || !Number.isInteger(firstMessageOffset) || firstMessageOffset < 0) {
    throw new Error('Limiti batch memoria non validi');
  }
  const batch: Array<T & { start_offset: number; end_offset: number; complete: boolean }> = [];
  let size = 0;
  for (const [index, message] of messages.entries()) {
    const start = index === 0 ? firstMessageOffset : 0;
    if (start > message.content.length) throw new Error('Messaggio modificato durante estrazione memoria');
    if (batch.length && size + message.content.length - start + 20 > maxChars) break;
    let end = Math.min(message.content.length, start + maxChars - size);
    // Do not split an emoji / Unicode surrogate pair across requests.
    if (end < message.content.length && /[\uD800-\uDBFF]/.test(message.content[end - 1] ?? '')) end--;
    const content = message.content.slice(start, end);
    batch.push({ ...message, content, start_offset: start, end_offset: end, complete: end === message.content.length });
    size += content.length + 20;
    if (end < message.content.length || size >= maxChars) break;
  }
  return batch;
}

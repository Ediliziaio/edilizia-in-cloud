/** Inert chat replies, never commands, URLs, prices or document mutations. */
export type QuoteChatChoice = { id: string; label: string; reply: string };
export function readQuoteChatChoices(raw: unknown): QuoteChatChoice[] {
  if (!Array.isArray(raw) || raw.length > 4 || raw.length === 1) throw new Error("Alternative non valide: servono da due a quattro scelte.");
  const choices = raw.map(v => {
    const c = v as QuoteChatChoice;
    if (!c || typeof c.id !== "string" || !/^[a-z\d_-]{1,40}$/i.test(c.id) || typeof c.label !== "string" || !c.label.trim() || c.label.length > 90 || typeof c.reply !== "string" || !c.reply.trim() || c.reply.length > 600) throw new Error("Scelta della conversazione non valida.");
    return { id: c.id, label: c.label.trim(), reply: c.reply.trim() };
  });
  if (new Set(choices.map(c => c.id)).size !== choices.length || new Set(choices.map(c => c.label.toLowerCase())).size !== choices.length) throw new Error("Alternative duplicate.");
  return choices;
}

/** Compatibility for already-saved replies: only explicit A/B (not arbitrary
 * prose, questions, prices, generic bullet lists or untrusted user messages). */
export function legacyQuoteChoices(text: string): QuoteChatChoice[] {
  const choices: QuoteChatChoice[] = [];
  for (const line of text.slice(0, 6000).split(/\r?\n/)) {
    const match = /^\s*(?:[-*•]\s+|#{1,4}\s*)?(?:\*\*)?Alternativa\s+([A-D])\s*:\s*(.+?)(?:\*\*)?\s*$/i.exec(line);
    if (!match) continue;
    const detail = match[2].replace(/\*\*|__/g, "").trim();
    if (!detail || detail.length > 360 || /https?:|<|>|€|\beuro\b/i.test(detail)) return [];
    const label = `${match[1].toUpperCase()} · ${detail}`;
    choices.push({ id: `legacy-${match[1].toLowerCase()}`, label: label.length > 90 ? `${label.slice(0, 87)}…` : label,
      reply: `Scelgo l’alternativa ${match[1].toUpperCase()}: ${detail}. Chiarisci i dati mancanti prima di aggiornare le lavorazioni; non includere automaticamente importi nel totale.` });
  }
  if (choices.length < 2 || choices.length > 4 || new Set(choices.map(c => c.id)).size !== choices.length) return [];
  return readQuoteChatChoices(choices);
}

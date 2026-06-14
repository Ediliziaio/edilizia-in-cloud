/**
 * outreach-warmup-engage — engagement del warm-up PURO (niente Deno/Supabase).
 * Per costruire reputazione non basta inviare: serve conversazione a due vie.
 * La casella che RICEVE una email di warm-up risponde a una frazione di esse
 * (la risposta è un segnale forte, e non richiede IMAP: è un altro invio in
 * uscita dal pool). Qui decidiamo, in modo deterministico, a quali rispondere.
 * Testato in vitest.
 */

/** Vero se l'i-esima email di warm-up deve ricevere una risposta, dato il tasso. */
export function shouldReply(index: number, replyRate: number): boolean {
  if (replyRate <= 0) return false;
  if (replyRate >= 1) return true;
  const everyN = Math.max(1, Math.round(1 / replyRate));
  return index % everyN === 0;
}

/** Indici (sul totale delle coppie di warm-up) che ricevono una risposta. */
export function selectReplyIndexes(count: number, replyRate: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (shouldReply(i, replyRate)) out.push(i);
  return out;
}

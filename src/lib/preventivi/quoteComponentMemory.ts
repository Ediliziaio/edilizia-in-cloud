import { quoteDecisionClauses, quoteTurnIsReadOnly } from '../../../supabase/functions/_shared/quoteScopeMemory';
import { quoteMentionedRooms } from '../../../supabase/functions/_shared/quoteRoomMemory';
import { outsideSupportingDocuments } from './quoteSupportingDocuments';
import { assessQuoteRequest } from './quoteRequestContext';

const parts = {
  scaldasalviette: /\b(?:scaldasalviette|termoarredo)\b/i,
  box_doccia: /\bbox\s+doccia\b/i,
  piatto_doccia: /\bpiatto\s+doccia\b/i,
  mobile_bagno: /\bmobile\s+(?:del\s+)?bagno\b/i,
  rubinetteria: /\b(?:rubinetteria|miscelatori?)\b/i,
  batteria: /\b(?:batteria|batterie|accumulo)\b/i,
  zanzariere: /\bzanzariere?\b/i,
  cassonetti: /\bcassonett[oi]\b/i,
} as const;
export type QuoteComponentDecision = { room: string; component: keyof typeof parts; state: 'excluded' | 'included' | 'preserved'; evidence: string };
const key = (d: QuoteComponentDecision) => `${d.room}:${d.component}`;
export function readQuoteComponentDecisions(raw: unknown): QuoteComponentDecision[] {
  if (!Array.isArray(raw) || raw.length > 32) throw new Error('Memoria componenti oltre il limite.');
  const result = raw.map((d: QuoteComponentDecision) => {
    if (!d || !Object.hasOwn(parts, d.component) || !['included', 'excluded', 'preserved'].includes(d.state)
      || typeof d.room !== 'string' || !d.room.trim() || d.room.length > 80 || /[<>\r\n]/.test(d.room)
      || typeof d.evidence !== 'string' || !d.evidence.trim() || d.evidence.length > 600) throw new Error('Decisione sul componente non valida.');
    return { room: d.room, component: d.component, state: d.state, evidence: d.evidence };
  });
  if (new Set(result.map(key)).size !== result.length) throw new Error('Componenti duplicati nella memoria.');
  return result;
}
/** Only explicit user decisions, never OCR, quoted documents or AI summaries.
 * An exclusion from a price is not a decision to omit a physical component. */
export function updateQuoteComponentDecisions(previous: QuoteComponentDecision[], message: string): QuoteComponentDecision[] {
  const result = new Map(readQuoteComponentDecisions(previous).map(d => [key(d), d]));
  const user = outsideSupportingDocuments(message);
  if (quoteTurnIsReadOnly(user) || assessQuoteRequest(user).intent === 'information') return [...result.values()];
  const clauses = quoteDecisionClauses(user).flatMap(c => c.split(/,(?!\d)|\s+(?:ma|mentre)\s+/i));
  const allRooms = quoteMentionedRooms(user);
  for (const clause of clauses) {
    if (clause.length > 600 || /\b(?:se|forse|valutiamo|non ho deciso|non abbiamo deciso)\b/i.test(clause)
      || /\b(?:esclus[oaie]|non compres[oaie])\s+(?:dal|dalla|nel|nella)\s+(?:prezzo|tariffa|codice|voce|importo)\b/i.test(clause)
      || /\b(?:solo|sola|soltanto)\s+(?:la\s+|il\s+)?(?:posa|montaggio|fornitura|predisposizione)\b/i.test(clause)) continue;
    const include = /\b(?:includi|includiamo|reinserisci|aggiungi|voglio|inclus[oaie])\b/i.test(clause) && !/\bnon\s+(?:voglio|includ|inclus)/i.test(clause);
    const exclude = /\b(?:escludi|esclus[oaie]|senza|non voglio)\b/i.test(clause) && !/\bnon\s+(?:[eè]\s+|sono\s+)?esclus/i.test(clause);
    const preserve = /\b(?:mantieni|conserva|lascia invariat[oaie])\b/i.test(clause);
    if (Number(include) + Number(exclude) + Number(preserve) !== 1) continue;
    const rooms = quoteMentionedRooms(clause);
    const targets = rooms.length ? rooms : allRooms.length === 1 ? allRooms : ['*'];
    for (const [component, pattern] of Object.entries(parts)) if (pattern.test(clause)) {
      for (const room of targets) {
        const d: QuoteComponentDecision = { room, component: component as QuoteComponentDecision['component'], state: exclude ? 'excluded' : preserve ? 'preserved' : 'included', evidence: clause };
        if (result.has(key(d)) || result.size < 32) result.set(key(d), d);
      }
    }
  }
  return [...result.values()];
}
export function quoteComponentBlocked(title: string, decisions: QuoteComponentDecision[]) {
  const rooms = quoteMentionedRooms(title);
  return Object.entries(parts).some(([component, pattern]) => {
    if (!pattern.test(title)) return false;
    const matched = rooms.length ? rooms.map(room => decisions.find(d => d.room === room && d.component === component) ?? decisions.find(d => d.room === '*' && d.component === component)).filter(Boolean)
      : decisions.filter(d => d.component === component);
    // A proposal without a room cannot bypass a room-specific restriction.
    return matched.some(d => d?.state === 'excluded' || d?.state === 'preserved');
  });
}
export function describeQuoteComponents(decisions: QuoteComponentDecision[]) {
  return decisions.map(d => `- ${d.room === '*' ? 'Tutta la commessa' : d.room} · ${d.component.replaceAll('_', ' ')}: ${d.state === 'excluded' ? 'escluso' : d.state === 'preserved' ? 'da conservare' : 'richiesto'}.`).join('\n');
}

import type { ChatDocument, ChatLine } from "./quoteChatDocument";
import { quoteMentionedRooms } from "../../../supabase/functions/_shared/quoteRoomMemory";
import { catalogueUnit } from "../../../supabase/functions/_shared/quoteCatalogue";
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function sameQuoteLineIdentity(a: Pick<ChatLine, "title" | "unit" | "description" | "quantity" | "quantityBasis">, b: Pick<ChatLine, "title" | "unit" | "description" | "quantity" | "quantityBasis">) {
  return norm(a.title) === norm(b.title) && catalogueUnit(a.unit) === catalogueUnit(b.unit) && norm(a.description) === norm(b.description) && a.quantity === b.quantity && norm(a.quantityBasis) === norm(b.quantityBasis);
}
export const sameQuoteLineTitle = (a: string, b: string) => norm(a) === norm(b);
export type QuoteOverlap = { parentId: string; childIds: string[]; reason: string };
/** Bounded warning, not semantic equivalence. Never removes/merges line contents. */
export function quoteLineOverlaps(doc: ChatDocument): QuoteOverlap[] {
  const active = doc.lines.filter(l => !l.supersededBy?.length);
  const groups: QuoteOverlap[] = [];
  const titles = new Map<string, ChatLine[]>();
  for (const l of active) { const key = `${norm(l.title)}:${catalogueUnit(l.unit)}`; titles.set(key, [...(titles.get(key) ?? []), l]); }
  for (const same of titles.values()) if (same.length > 1) groups.push({ parentId: same[0].id, childIds: same.slice(1).map(l => l.id), reason: "Stesso titolo e unità su più righe. Se sono opere distinte, rinominale; altrimenti scegli la sostituzione, senza sommarle automaticamente." });
  // Composite headings and newly generated details can carry different IDs.
  // Offer an explicit replacement, never sum or silently delete the parent.
  for (const parent of active) {
    const title = norm(parent.title), rooms = quoteMentionedRooms(parent.title);
    const families: RegExp[] | null = /idrico.*scarich|impianto.*acqua.*scarich/.test(title) ? [/tubazion.*acqua|acqua.*(?:fredda|calda)/, /tubazion.*scaric|scarich/]
      : /^(?:elettrico nuovo bagno|impianto elettrico(?: bagno)?)$/.test(title) ? [/prese|punt.*presa/, /punt.*luce/, /punt.*comando|comando (?:elettric|luce)|interruttor/]
      : /preparazione.*support.*(?:e|formazione).*letto/.test(title) ? [/preparazione.*support/, /letto.*posa/] : null;
    if (!families) continue;
    const children = active.filter(l => l.id !== parent.id && !families.every(f => f.test(norm(l.title))) && families.some(f => f.test(norm(l.title))) && !/rimozione|demolizione/.test(norm(l.title)));
    const named = [...new Set(children.flatMap(l => quoteMentionedRooms(l.title)))];
    const compatible = children.filter(l => { const r = quoteMentionedRooms(l.title); return !rooms.length ? named.length <= 1 : !r.length || r.length === 1 && r[0] === rooms[0]; });
    if (families.every(f => compatible.some(l => f.test(norm(l.title))))) groups.push({ parentId: parent.id, childIds: compatible.map(l => l.id), reason: 'Voce composita e dettagli delle sue componenti: sostituisci la generica solo dopo aver verificato che il perimetro sia coperto, senza sommare entrambi.' });
  }
  for (const parent of active) {
    const title = norm(parent.title);
    if (!/\bsanitari\b/.test(title) || /\b(?:rimozione|demolizione|trasporto|smaltimento|sigillature|sigillatura|raccordi|silicone|collaudo|prove|wc|bidet|lavabo|doccia)\b/.test(title)) continue;
    const rooms = quoteMentionedRooms(parent.title);
    const children = active.filter(l => l.id !== parent.id && /\b(?:wc|bidet|lavabo|doccia)\b/.test(norm(l.title)) && !/rimozione|demolizione|smaltimento/.test(norm(l.title)));
    const childRooms = [...new Set(children.flatMap(l => quoteMentionedRooms(l.title)))];
    if (!rooms.length && childRooms.length > 1) continue;
    const compatible = children.filter(l => { const r = quoteMentionedRooms(l.title); return !rooms.length ? !r.length || childRooms.length <= 1 : r.length === 1 && r[0] === rooms[0]; });
    // Explicit installation-only labour is not a generic bundle of fixtures.
    // Only exempt it when the details are clearly supply-only; uncertain or
    // supply-and-install descriptions still require a scope review.
    const service = /\b(?:montaggio|collegamento|installazione|posa)\b/.test(title) && !/\bfornitura\b/.test(title);
    const labour = compatible.filter(l => /\b(?:montaggio|collegamento|installazione|posa)\b/.test(norm(l.title)) && !/\bfornitura\b/.test(norm(l.title)));
    if (service && labour.length >= 2) { groups.push({ parentId: parent.id, childIds: labour.map(l => l.id), reason: 'Montaggio generico e montaggi dei singoli apparecchi: sostituzione da confermare. Le forniture separate non appartengono a questo gruppo.' }); continue; }
    const suppliesOnly = compatible.length >= 2 && compatible.every(l => /\bfornitura\b/.test(norm(l.title)) && !/\b(?:posa|montaggio|collegamento|installazione)\b/.test(norm(`${l.title} ${l.description}`)));
    const suppliesFixtures = /\bfornitura\s+(?:di\s+)?(?:sanitari|apparecchi|wc|bidet|lavabo)\b/.test(norm(parent.description));
    if (service && suppliesOnly && !suppliesFixtures) continue;
    if (compatible.length >= 2 && !groups.some(g => g.parentId === parent.id)) groups.push({ parentId: parent.id, childIds: compatible.map(l => l.id), reason: "Sanitari generici e singoli apparecchi: verifica cosa comprende la voce generica prima di sommarli." });
  }
  return groups;
}
/** Explicit, revision-bound replacement. Original data is retained and recoverable. */
export function replaceQuoteLine(doc: ChatDocument, parentId: string, childIds: string[], expectedRevision: number): ChatDocument {
  if (doc.revision !== expectedRevision) throw new Error("Proposta di sostituzione superata: richiedi di nuovo Mostra doppioni.");
  const group = quoteLineOverlaps(doc).find(g => g.parentId === parentId && g.childIds.length === childIds.length && g.childIds.every(id => childIds.includes(id)));
  if (!group) throw new Error("Le voci non corrispondono alla sovrapposizione verificata.");
  return { ...doc, revision: doc.revision + 1, lines: doc.lines.map(l => l.id === parentId ? { ...l, included: false, supersededBy: [...childIds] } : l) };
}

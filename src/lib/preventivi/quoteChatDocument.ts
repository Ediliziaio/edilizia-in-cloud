import { unitaCompatibili } from "@/lib/prezzario/confronto";
import { readQuoteChatResult, type QuoteChatProposal, type QuoteChatReference, type QuoteChatResult } from "../../../supabase/functions/_shared/quoteConversation";
import type { QuoteItemPro } from "@/types/quoteItem";
import { assessCatalogueMatch } from "../../../supabase/functions/_shared/quoteCatalogue";
import { sameQuoteLineIdentity, sameQuoteLineTitle, quoteLineOverlaps } from "./quoteLineDuplicates";
import type { QuotePriceProvenance } from './quoteProposalReview';
import { calculateQuoteQuantity, readIndicativeEstimate, proposedQuantityFormula, type QuoteQuantityCalculation, type QuoteIndicativeEstimate, type QuoteFormulaProposal } from './quoteCalculations';
export type ChatLine = QuoteChatProposal & { price: number | null; included: boolean; manual: boolean; reference: QuoteChatReference | null; original: QuoteChatProposal; pricing?: QuotePriceProvenance; supersededBy?: string[]; calculation?: QuoteQuantityCalculation; estimate?: QuoteIndicativeEstimate; proposedCalculation?: QuoteFormulaProposal };
export type ChatDocument = { revision: number; title: string; lines: ChatLine[] };
export const emptyChatDocument = (): ChatDocument => ({ revision: 0, title: "Preventivo in composizione", lines: [] });
/** Unpriced/manual rows do not lock the source. Existing catalogue references do,
 * including excluded rows, so restoring them cannot silently mix editions. */
export function canSelectChatSource(doc: ChatDocument, sourceId: string): boolean {
  return doc.lines.every(l => (!l.referenceId && !l.reference || l.reference?.sourceId === sourceId) && (!l.estimate?.sourceId || l.estimate.sourceId === sourceId));
}
/** Read already acquired evidence without another model/provider request. */
export function chatReferenceInfo(doc: ChatDocument, index: number): string {
  const row = doc.lines[index];
  if (!row) return "La voce non esiste nella bozza corrente. Nessuna ricerca o modifica eseguita.";
  const ref = row.reference;
  if (!ref || ref.id !== row.referenceId) return "Questa voce non ha un riferimento di prezzario verificato. Il prezzo manuale non diventa un prezzo regionale. Nessuna ricerca AI eseguita.";
  const money = (n: number | null) => n == null ? "da definire" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
  return `Voce ${index + 1}: ${row.title}\nFonte: ${ref.sourceName}\nCodice ufficiale: ${ref.code}\nUnità originale: ${ref.unit || "non disponibile"}\nPrezzo originale di listino: ${money(ref.price)}\nPrezzo nella bozza: ${money(row.price)}\nDescrizione originale${ref.description.length > 2400 ? " (estratto)" : ""}: ${ref.description.slice(0, 2400)}\nRiferimento acquisito nell’ultima ricerca, non una nuova verifica del catalogo. Nessuna chiamata AI, inclusione o modifica. Corrispondenza tecnica ancora da verificare.`;
}
export function chatLineIssue(row: ChatLine): string | null {
  if (row.supersededBy?.length) return "Voce sostituita dai dettagli: conservata nello storico, esclusa dal totale.";
  if (!row.title.trim() || !row.unit.trim()) return "Completa titolo e unità.";
  if (row.proposedCalculation && !row.included) return 'Formula proposta dall’AI: controlla misure e confermala in chat.';
  if (row.quantity == null) return "Quantità da misurare o confermare.";
  if (row.price == null) return row.estimate ? 'Stima indicativa presente, non un prezzo confermato: resta fuori dal documento.' : "Prezzo non disponibile: scegli un riferimento o inseriscilo manualmente.";
  return null;
}
/** Atomic application against the current revision. No field is sourced from LLM prices. */
export function applyChatResult(doc: ChatDocument, raw: unknown, turnId: string, sourceId: string | null) {
  const result = readQuoteChatResult(raw);
  if (result.turnId !== turnId || result.revision !== doc.revision) throw new Error("Risposta superata: le modifiche successive restano conservate.");
  const refs = new Map(result.references.map(r => [r.id, r])); const notices: string[] = [];
  const next = doc.lines.map(r => ({ ...r }));
  for (const p of result.turn.proposals) {
    if (next.some(r => r.supersededBy?.length && (r.id === p.id || sameQuoteLineTitle(r.title, p.title)))) { notices.push(`«${p.title}»: voce sostituita non ricreata dall’AI.`); continue; }
    let i = next.findIndex(r => r.id === p.id);
    if (i < 0) i = next.findIndex(r => !r.supersededBy?.length && sameQuoteLineIdentity(r, p));
    const old = next[i];
    if (old?.supersededBy?.length) { notices.push(`«${old.title}»: voce storica non riattivata dall’AI.`); continue; }
    let proposedCalculation: QuoteFormulaProposal | null;
    try { proposedCalculation = proposedQuantityFormula(p.quantityBasis, p.unit); }
    catch { notices.push(`«${p.title}»: formula AI non valida, proposta scartata senza cambiare la voce.`); continue; }
    if (old && proposedCalculation) {
      if (unitaCompatibili(old.unit, proposedCalculation.unit)) {
        next[i] = { ...old, proposedCalculation: { ...proposedCalculation, unit: old.unit } };
        notices.push(`«${old.title}»: formula proposta soltanto da confermare; quantità, prezzo e inclusione conservati.`);
      } else notices.push(`«${old.title}»: formula non applicabile, unità diversa. Voce conservata.`);
      continue;
    }
    if (old?.manual) {
      notices.push(`«${old.title}»: mantenute le tue modifiche manuali.`); continue;
    }
    const ref = p.referenceId ? refs.get(p.referenceId) : undefined;
    if (p.referenceId && (!ref || ref.sourceId !== sourceId)) throw new Error("Riferimento non verificato per l’edizione scelta.");
    const compatible = ref && unitaCompatibili(ref.unit, p.unit);
    const issues = ref ? assessCatalogueMatch(p, ref) : [];
    const stable = old ? { ...p, id: old.id } : p;
    if (old && old.id !== p.id) notices.push(`«${old.title}»: riutilizzata la voce esistente, nessun doppione creato.`);
    // Il prezzo che l'utente ha scritto in chat (il server ha già controllato che la frase sia sua).
    // Si usa solo senza un riferimento di listino e se l'unità della frase non contraddice la voce.
    const dettato = !ref && p.userPrice ? prezzoDettato(p.userPrice, p.unit) : null;
    if (!ref && p.userPrice && !dettato) notices.push(`«${p.title}»: il prezzo che hai scritto è per un'altra unità di misura, lasciato da definire.`);
    // La stima di mercato (il server l'ha tenuta solo se l'utente l'ha chiesta): il prezzo medio dell'intervallo, dichiarato come stima.
    const stima = !ref && !dettato && p.marketPrice ? prezzoStimato(p.marketPrice, p.unit) : null;
    const row: ChatLine = { ...stable, ...(proposedCalculation ? { quantity: old && unitaCompatibili(old.unit, p.unit) ? old.quantity : null, proposedCalculation } : {}),
      price: compatible && !issues.length ? ref.price : dettato?.price ?? stima?.price ?? null, included: false, manual: false,
      ...(dettato ? { pricing: dettato.pricing } : stima ? { pricing: stima.pricing } : {}),
      reference: ref ?? null, original: { ...stable } };
    if (ref && !compatible) notices.push(`«${p.title}»: unità non compatibile, prezzo lasciato da definire.`);
    else if (issues.length) notices.push(`«${p.title}»: prezzo non applicato: ${issues.join("; ")}.`);
    if (i >= 0) next[i] = row; else next.push(row);
  }
  if (next.length > 100) throw new Error("Al massimo 100 voci per questa prova: suddividi il progetto.");
  const title = doc.title && doc.title !== "Preventivo in composizione" ? doc.title : result.turn.title || doc.title;
  const unchanged = title === doc.title && JSON.stringify(next) === JSON.stringify(doc.lines);
  return { document: unchanged ? doc : { revision: doc.revision + 1, title, lines: next }, result, notices };
}
/** «12 euro al mc»: l'unità scritta accanto al prezzo, quando c'è. */
const UNITA_DETTATE: Array<[RegExp, string]> = [
  [/\b(?:al|a|per)\s+(?:mq|m2|m²|metro quadr[oa]|metri quadr[ai])\b/i, "m²"],
  [/\b(?:al|a|per)\s+(?:mc|m3|m³|metro cub[oa]|metri cubi)\b/i, "m³"],
  [/\b(?:al|a|per)\s+(?:ml|m|metro|metro lineare|metri lineari)\b/i, "m"],
  [/\b(?:al|a|per)\s+(?:kg|chilo|chilogrammo)\b/i, "kg"],
  [/\b(?:cad|cadauno|cadauna|l'uno|ciascuno|al pezzo|a pezzo)\b/i, "cad"],
  [/\ba\s+corpo\b/i, "corpo"],
  [/\b(?:all'ora|l'ora|ora|orari[oa])\b/i, "h"],
];
function prezzoDettato(prezzo: { amount: number; quote: string }, unita: string): { price: number; pricing: QuotePriceProvenance } | null {
  const scritta = UNITA_DETTATE.find(([re]) => re.test(prezzo.quote))?.[1];
  // «a corpo» e «corpo» sono la stessa unità, ma `unitaCompatibili` non lo sa.
  const unitaVoce = unita.trim().replace(/^a\s+/i, "");
  if (scritta && unitaVoce && !unitaCompatibili(scritta, unitaVoce)) return null;
  return { price: prezzo.amount, pricing: { origin: "manual", basis: `Prezzo scritto da te in chat: «${prezzo.quote.slice(0, 300)}». Non è un prezzo di listino.` } };
}
function prezzoStimato(m: { low: number; high: number; basis: string }, unita: string): { price: number; pricing: QuotePriceProvenance } {
  const euro = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const u = unita.trim() || "unità";
  return { price: Math.round((m.low + m.high) / 2 * 100) / 100,
    pricing: { origin: "ai-estimate", low: m.low, high: m.high, basis: `Stima di mercato di Silvio, da verificare: ${euro(m.low)}-${euro(m.high)} €/${u}. ${m.basis}`.slice(0, 1000) } };
}
export function patchChatLine(doc: ChatDocument, id: string, patch: Partial<Pick<ChatLine, "title" | "description" | "quantity" | "unit" | "price" | "included">>): ChatDocument {
  const numeric = (v: number | null | undefined) => v == null || !Number.isFinite(v) || v < 0.01 || v > 1_000_000 ? null : v;
  return { ...doc, revision: doc.revision + 1, lines: doc.lines.map(row => {
    if (row.id !== id) return row;
    const next = { ...row, ...patch, manual: true };
    if (patch.included && quoteLineOverlaps(doc).some(g => g.parentId === id || g.childIds.includes(id))) next.included = false;
    if (Object.hasOwn(patch, "quantity")) next.quantity = numeric(patch.quantity);
    if (Object.hasOwn(patch, "price")) next.price = numeric(patch.price);
    next.title = next.title.slice(0, 200); next.description = next.description.slice(0, 6000); next.unit = next.unit.slice(0, 24);
    if (patch.quantity !== undefined || patch.unit !== undefined || patch.title !== undefined || patch.description !== undefined) { delete next.calculation; delete next.proposedCalculation; }
    if (patch.price !== undefined || patch.unit !== undefined || patch.title !== undefined || patch.description !== undefined) delete next.estimate;
    if (Object.hasOwn(patch, 'price')) next.pricing = { origin: 'manual', basis: 'Prezzo modificato esplicitamente dall’utente; non certifica una tariffa regionale.' };
    if (patch.unit != null && !unitaCompatibili(patch.unit, row.unit)) { next.price = null; next.quantity = null; next.included = false; next.quantityBasis = "Unità modificata manualmente: quantità da ridefinire."; }
    else if (Object.hasOwn(patch, "quantity")) next.quantityBasis = next.quantity == null ? "Quantità cancellata manualmente: da misurare." : `Quantità inserita manualmente: ${next.quantity} ${next.unit}.`;
    if (chatLineIssue(next)) next.included = false;
    return next;
  }) };
}
export function attachChatReference(doc: ChatDocument, index: number, ref: QuoteChatReference, expectedRevision: number): ChatDocument {
  if (expectedRevision !== doc.revision) throw new Error("Risultato superato: ripeti la ricerca sulla bozza corrente.");
  const row = doc.lines[index];
  if (!row || row.supersededBy?.length || !canSelectChatSource(doc, ref.sourceId)) throw new Error("Voce non attiva o fonte incompatibile con la bozza.");
  const issues = assessCatalogueMatch(row, ref);
  if (issues.length) throw new Error(`Riferimento non collegato: ${issues.join("; ")}.`);
  return { ...doc, revision: doc.revision + 1, lines: doc.lines.map((l, i) => i === index ? { ...l, estimate: undefined, referenceId: ref.id, reference: ref,
    price: l.manual && l.price != null ? l.price : ref.price, included: false, original: { ...l.original, referenceId: ref.id } } : l) };
}
export function resetChatLine(doc: ChatDocument, id: string): ChatDocument {
  return { ...doc, revision: doc.revision + 1, lines: doc.lines.map(row => row.id !== id ? row : {
    ...row, ...row.original, pricing: undefined, calculation: undefined, proposedCalculation: undefined, estimate: undefined, price: row.reference && unitaCompatibili(row.reference.unit, row.original.unit) ? row.reference.price : null, manual: false, included: false,
  }) };
}
/** Explicit user calculation; revision-bound, no row is included automatically. */
export function setChatQuantityFormula(doc: ChatDocument, id: string, expression: string, revision: number): ChatDocument {
  const row = doc.lines.find(r => r.id === id && !r.supersededBy?.length);
  if (!row || revision !== doc.revision) throw new Error('Voce o revisione superata: rivedi la formula.');
  const result = calculateQuoteQuantity(expression);
  const next = patchChatLine(doc, id, { quantity: result, included: false });
  const provenance = row.proposedCalculation?.expression === expression ? row.proposedCalculation.assumptions : 'Misure e detrazioni dichiarate dall’utente.';
  return { ...next, lines: next.lines.map(r => r.id === id ? { ...r, calculation: { expression, result, unit: row.unit }, quantityBasis: `Calcolo software confermato: ${expression} = ${result} ${row.unit}. ${provenance}` } : r) };
}
/** An estimate never becomes row.price or a catalogue reference. */
export function setChatIndicativeEstimate(doc: ChatDocument, id: string, raw: QuoteIndicativeEstimate, revision: number): ChatDocument {
  const row = doc.lines.find(r => r.id === id && !r.supersededBy?.length); const estimate = readIndicativeEstimate(raw);
  if (!row || revision !== doc.revision || !unitaCompatibili(row.unit, estimate.unit) || row.price != null) throw new Error('Stima non applicata: revisione, unità o prezzo già presente da verificare.');
  return { ...doc, revision: doc.revision + 1, lines: doc.lines.map(r => r.id === id ? { ...r, estimate, manual: true, included: false } : r) };
}
export function chatEstimateTotals(doc: ChatDocument) {
  const lines = doc.lines.filter(r => !r.supersededBy?.length && !r.included && r.price == null && r.estimate && r.quantity != null);
  return { count: lines.length, low: Math.round(lines.reduce((n, r) => n + r.quantity! * r.estimate!.low, 0) * 100) / 100, high: Math.round(lines.reduce((n, r) => n + r.quantity! * r.estimate!.high, 0) * 100) / 100,
    unquantified: doc.lines.filter(r => !r.supersededBy?.length && r.estimate && r.quantity == null).length };
}
export function chatQuoteItems(doc: ChatDocument): QuoteItemPro[] {
  return doc.lines.filter(r => r.included && !chatLineIssue(r)).map((r, i): QuoteItemPro => ({ client_temp_id: r.id,
    item_type: "service", item_category: "posa", name: r.title, description: r.description, quantity: r.quantity!, unit_of_measure: r.unit,
    unit_price: r.price!, discount_percent: 0, vat_rate: 0, sort_order: i, prezzo_acquisto: null,
    mostra_nel_pdf: true, is_optional: false,
  }));
}
export type QuoteChatTransport = (request: import("../../../supabase/functions/_shared/quoteConversation").QuoteChatRequest, signal: AbortSignal, onProgress?: (event: import('../../../supabase/functions/_shared/quoteStream').QuoteStreamEvent) => void) => Promise<QuoteChatResult>;

import type { ChatDocument } from "./quoteChatDocument";
import type { QuoteChatTurn } from "../../../supabase/functions/_shared/quoteConversation";

/** The receipt comes from applied document deltas, never from model prose. */
export function quoteActionReceipt(before: ChatDocument, after: ChatDocument, turn: QuoteChatTurn, blocked = 0) {
  const old = new Map(before.lines.map(l => [l.id, l]));
  const created = after.lines.filter(l => !old.has(l.id));
  const updated = after.lines.filter(l => old.has(l.id) && JSON.stringify(old.get(l.id)) !== JSON.stringify(l));
  const formulasOnly = !created.length && updated.length > 0 && updated.every(l => l.proposedCalculation && JSON.stringify({ ...l, proposedCalculation: undefined }) === JSON.stringify({ ...old.get(l.id), proposedCalculation: undefined }));
  const protectedRows = turn.proposals.filter(p => old.get(p.id)?.manual);
  const pending = [...new Set(turn.excludeIds ?? [])].map(id => after.lines.find(l => l.id === id && l.included)).filter(l => !!l);
  const lines: string[] = [];
  if (created.length || updated.length) {
    lines.push(formulasOnly ? `Salvate ${updated.length} proposte di formula da confermare. Quantità, prezzi e inclusioni precedenti conservati: nessuna nuova quantità applicata.` : `Applicato alla bozza locale: ${created.length} nuove voci, ${updated.length} voci aggiornate. Le proposte modificate sono da confermare prima di includerle nel parziale.`);
    for (const row of updated.slice(0, 3)) lines.push(`«${row.title}»: quantità ${row.quantity == null ? "da definire" : `${row.quantity} ${row.unit}`}; ${row.included ? "inclusa" : "non inclusa"}.`);
  } else lines.push("Nessuna modifica alle voci o al parziale applicata in questo turno.");
  const included = after.lines.filter(l => l.included);
  lines.push(included.length ? `Incluse adesso nel parziale: ${included.slice(0, 4).map(l => `«${l.title}»`).join(", ")}${included.length > 4 ? ` e altre ${included.length - 4} voci` : ""}. Le altre voci non entrano nel parziale.` : "Nessuna voce inclusa adesso nel parziale.");
  if (protectedRows.length) lines.push(`${protectedRows.length} voci manuali conservate: le proposte AI non le hanno sovrascritte.`);
  if (blocked) lines.push(`${blocked} proposte non applicate perché non coerenti con memoria, dati o controlli del turno.`);
  if (pending.length) lines.push(`Esclusione dal totale ancora da confermare: ${pending.slice(0, 4).map(l => `«${l!.title}»`).join(", ")}${pending.length > 4 ? ` e altre ${pending.length - 4}` : ""}. Usa i pulsanti «Escludi voce»: queste voci sono ancora incluse.`);
  return lines.join("\n").slice(0, 2400);
}

/** Remove unsupported completed-action claims; preserve explanations and formulas.
 * The authoritative receipt is always rendered separately, including on no-op turns. */
export function coherentQuoteReply(text: string) {
  const completed = /\b(?:ho|abbiamo)\s+(?:gia\s+|già\s+)?(?:esclus|inclus|rimoss|tolt|aggiornat|modificat|applicat)|\b(?:esce|escono|uscit[oaie]|rimoss[oaie]|tolt[oaie])\s+dal\s+totale|\b(?:quantit[aà]|voce|voci|prezzo|prezzi|riga|righe)\b[^\n.!?]{0,70}\b(?:aggiornat[oaie]|modificat[oaie]|esclus[oaie]|inclus[oaie])\b|\b(?:rimozion[ei]|fornitura|posa|paviment[oi]|tinteggiatur[ae]|battiscop[ai])\b[^\n.!?]{0,150}\b(?:esclus[oaie]|inclus[oaie]|confermat[oaie])\b|\b(?:[eè]|sono|risulta|risultano)\s+(?:gi[aà]\s+)?(?:esclus[oaie]|inclus[oaie])\s+(?:dal|nel)\s+(?:totale|preventivo)/i;
  const created = /\b(?:ho|abbiamo)\s+(?:gia\s+)?(?:creat|inserit|compilat)|\b(?:voc[ei]|righ[ae])\b[^\n.!?]{0,70}\b(?:creat[oaie]|inserit[oaie])\b/i;
  const safe = text.split(/\n\s*\n/).filter(paragraph => { const normalized = paragraph.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); return !completed.test(normalized) && !created.test(normalized); }).join("\n\n").trim();
  return safe || "Ho elaborato la richiesta. Nel riepilogo qui sotto trovi cosa è stato effettivamente applicato e cosa richiede ancora conferma.";
}

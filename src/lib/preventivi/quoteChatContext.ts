import type { QuoteChatContext, QuoteChatMessage } from "../../../supabase/functions/_shared/quoteConversation";
import type { ChatDocument } from "./quoteChatDocument";
import type { PlanAttachment, PlanRectangle, PlanRoom } from "./planReading";
import { refreshQuoteScopeFacts, type QuoteScopeFact } from "../../../supabase/functions/_shared/quoteScopeMemory";
import { quoteRoomBrief, roomDecisionsFromLegacy, type QuoteRoomDecision } from "../../../supabase/functions/_shared/quoteRoomMemory";
import { coherentQuoteReply } from "./quoteActionReceipt";
import { quoteProjectBrief, type QuoteProject } from './quoteProject';
export function buildQuoteChatContext(document: ChatDocument, brief: string, plan: PlanAttachment | null, rooms: PlanRoom[], selectedRoom: string | null, rectangle: PlanRectangle | null, scopeFacts: QuoteScopeFact[] = [], roomDecisions: QuoteRoomDecision[] = [], project?: QuoteProject): QuoteChatContext {
  const selected = rooms.find(r => r.id === selectedRoom);
  const chosen = rooms.slice(0, 40); if (selected && !chosen.some(r => r.id === selected.id)) chosen.push(selected);
  const texts = plan?.reading?.lines.slice(0, 40) ?? [];
  if (plan?.reading && selected && selected.line >= 40 && plan.reading.lines[selected.line]) texts.splice(39, 1, plan.reading.lines[selected.line]);
  // Old deployed readers know only global facts: omit a global restriction from
  // that legacy field when a room-specific exception must be read from the brief.
  const legacyFacts = refreshQuoteScopeFacts(scopeFacts).filter(f => {
    if (/\b(?:posizion[ei]|quantit[aà]|prezz[oi]|import[oi]|titolo)\b/i.test(f.evidence) && /invariat/i.test(f.evidence)) return false;
    const old = roomDecisionsFromLegacy([f])[0];
    return !roomDecisions.some(d => d.room !== "*" && d.state !== old.state
      && (old.room === "*" || old.room === d.room)
      && (old.work === d.work || old.work === "ambito"));
  });
  const legacyRoomDecisions = roomDecisions.filter(d => d.state !== "undecided" && !(d.room === "*" && roomDecisions.some(p => p.room !== "*" && p.state === "undecided" && (p.work === d.work || d.work === "ambito"))));
  const estimateBrief = document.lines.filter(r => r.estimate && !r.supersededBy?.length).slice(0, 5).map(r => `${r.id}: ${r.estimate!.low}–${r.estimate!.high} EUR/${r.unit}, origine ${r.estimate!.origin}, quantità ${r.quantity ?? 'ignota'}, solo STIMA, FUORI dal totale confermato`).join('; ');
  const roomBrief = quoteRoomBrief(project ? `${quoteProjectBrief(project)}\n${brief}`.slice(0, 3000) : brief, roomDecisions);
  return { brief: estimateBrief ? `${roomBrief.slice(0, 1900)}\nRISCONTRO STIME LOCALI (non prezzi approvati né codici certificati): ${estimateBrief}`.slice(0, 3000) : roomBrief, protectedLineIds: document.lines.filter(r => r.manual).map(r => r.id),
    scopeFacts: legacyFacts, ...(legacyRoomDecisions.length ? { roomDecisions: legacyRoomDecisions } : {}), includedLineIds: document.lines.filter(r => r.included).map(r => r.id), currentTitle: document.title,
    plan: plan?.reading ? { attachmentId: plan.id, page: plan.reading.page, pages: plan.reading.pages,
      totalTexts: plan.reading.lines.length, texts: texts.map(l => ({ ...l, text: l.text.slice(0, 120), bbox: l.bbox.map(n => Math.round(n * 1000) / 1000) })),
      rooms: chosen.map(r => ({ id: r.id, label: r.label, manual: !!r.manual })), selectedRoom: selected?.id ?? null,
      rectangle: rectangle && rectangle.roomId === selected?.id ? rectangle : null } : null };
}
/** Keep the last user turn intact; older turns are bounded, never silently trim the latest request. */
export function quoteChatHistory(history: Array<QuoteChatMessage & { diagnostic?: boolean; benchmarkRaw?: unknown; receipt?: string }>, latest: string): QuoteChatMessage[] {
  const result: QuoteChatMessage[] = [{ role: "user", text: latest }]; let chars = latest.length;
  const project = history.filter(m => !m.diagnostic && !m.benchmarkRaw && !/^(?:Confronta (?:i )?modelli|Avvia confronto sintetico modelli|Posso confrontare Haiku 5\.5 e Sonnet 5\.5|Confronto (?:completato|interrotto))/i.test(m.text));
  for (const message of project.slice(-7).reverse()) {
    const text = (message.role === "assistant" && message.receipt ? coherentQuoteReply(message.text) : message.text).slice(0, 3000).trim(); if (!text || chars + text.length > 10_000) break;
    result.unshift({ role: message.role, text }); chars += text.length;
  }
  return result;
}
/** Keep all current evidence and the latest user message intact. Only old chat
 * turns may be removed to meet the already-deployed endpoint's limits. */
export function quoteEvidenceMessages(history: QuoteChatMessage[], evidence: string[]): QuoteChatMessage[] {
  const latest = history.at(-1);
  if (!latest || latest.role !== 'user' || evidence.some(t => t.length > 3000)) throw new Error('Contesto locale non valido.');
  const current: QuoteChatMessage[] = [...evidence.filter(Boolean).map(text => ({ role: 'assistant' as const, text })), latest];
  const length = (rows: QuoteChatMessage[]) => rows.reduce((n, m) => n + m.text.length, 0);
  if (current.length > 20 || length(current) > 24000) throw new Error('Memoria corrente troppo ampia: suddividi il progetto. Nessuna decisione viene troncata.');
  const older = history.slice(0, -1);
  while (older.length && (older.length + current.length > 20 || length(older) + length(current) > 24000)) older.shift();
  return [...older, ...current];
}

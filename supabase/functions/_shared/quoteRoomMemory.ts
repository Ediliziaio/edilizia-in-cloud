/** User-authored scope, independent of model summaries and monetary inclusion.
 * Conservative language adapter: ambiguous references require clarification. */
import { quoteTurnIsReadOnly, quoteTurnIsExplanationOnly, quoteTurnIsHypothetical, quoteClauseNeedsScopeClarification, quoteHasSpecificSystem, quoteBookkeepingScope, quoteDecisionClauses, quoteRoomTopicIsContext, updateQuoteScopeFacts, type QuoteScopeFact } from "./quoteScopeMemory.ts";
import type { QuoteChatProposal } from "./quoteConversation.ts";

export const ROOM_WORKS = ["ambito", "pavimento", "demolizione", "tinteggiatura", "soffitto", "battiscopa", "impianti", "impianto_termico", "impianto_elettrico", "impianto_idrico", "serramenti"] as const;
export type RoomWork = typeof ROOM_WORKS[number];
export type QuoteRoomDecision = { room: string; work: RoomWork; state: "excluded" | "included" | "preserved" | "undecided"; evidence: string; detail?: string };
export const ROOM_MEMORY_LIMIT = 32;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const key = (d: QuoteRoomDecision) => `${d.room}:${d.work}`;
const stateLabel = { excluded: "escluso dall’ambito", included: "richiesto nell’ambito", preserved: "da mantenere invariato", undecided: "scelta ancora aperta, non autorizzata" };
const roomPattern = /\b(?:cucin[ae]|camer[ae](?: da letto)?|camerett[ae]|bagn[oi]|wc|soggiorno|salotto|corridoio|disimpegno|garage|terrazzo|terrazzi|balcone|locale tecnico)(?:\s+(?:\d{1,2}(?![\d.,]|\s*(?:m[²³23]?|mq|metri)\b)|matrimoniale|singola|principale|piccolo|grande|in alto a sinistra|in alto a destra|in basso a sinistra|in basso a destra))?\b/g;
function roomName(s: string) { return norm(s).replace(/^camere? da letto/, "camera").replace(/^wc$/, "bagno").replace(/^cucine$/, "cucina").replace(/^terrazzo$/, "terrazzi"); }
export function quoteMentionedRooms(s: string): string[] { return [...new Set((norm(s).match(roomPattern) ?? []).map(roomName))]; }
function works(s: string): RoomWork[] {
  const out: RoomWork[] = []; const n = norm(s);
  if (/\bpaviment/.test(n)) out.push("pavimento");
  if (/demolizion|rimozion|rimuov|demolir/.test(n)) out.push("demolizione");
  if (/soffitt|controsoffitt/.test(n)) out.push("soffitto");
  if (/tintegg|pittur|pareti/.test(n) && !/soffitt/.test(n) || /pareti/.test(n)) out.push("tinteggiatura");
  if (/battiscop|zoccolin/.test(n)) out.push("battiscopa");
  if (/\b(?:impiant[oi]\s+termic[oi]|riscaldamento)\b/.test(n)) out.push('impianto_termico');
  if (/\belettric[oaie]\b/.test(n)) out.push('impianto_elettrico');
  if (/\b(?:idric[oaie]|idraulic[oaie])\b/.test(n)) out.push('impianto_idrico');
  if (/impiant|idraulic|elettric|riscaldament/.test(n) && !quoteHasSpecificSystem(n)) out.push("impianti");
  if (/serrament|infiss/.test(n)) out.push("serramenti");
  return out;
}
export function readQuoteRoomDecisions(raw: unknown): QuoteRoomDecision[] {
  if (!Array.isArray(raw) || raw.length > ROOM_MEMORY_LIMIT) throw new Error("Memoria ambienti oltre il limite consentito.");
  const out = raw.map((d: QuoteRoomDecision) => {
    if (!d || typeof d.room !== "string" || !d.room.trim() || d.room.length > 80 || /[<>\n\r]/.test(d.room) || !ROOM_WORKS.includes(d.work) || !["excluded", "included", "preserved", "undecided"].includes(d.state) || typeof d.evidence !== "string" || !d.evidence.trim() || d.evidence.length > 600 || d.detail != null && (!["conservazione", "sovrapposizione", "opaca", "satinata"].includes(d.detail))) throw new Error("Decisione per ambiente non valida.");
    return { room: roomName(d.room), work: d.work, state: d.state, evidence: d.evidence.trim(), ...(d.detail ? { detail: d.detail } : {}) };
  });
  if (new Set(out.map(key)).size !== out.length) throw new Error("Decisioni per ambiente duplicate.");
  return out;
}
export function roomDecisionsFromLegacy(facts: QuoteScopeFact[]): QuoteRoomDecision[] {
  const decisions: QuoteRoomDecision[] = facts.map(f => ({ room: f.topic === "bagno" || f.topic === "terrazzi" ? f.topic : "*", work: f.topic === "bagno" || f.topic === "terrazzi" ? "ambito" : f.topic === "infissi" ? "serramenti" : f.topic as RoomWork, state: f.state, evidence: f.evidence }));
  return [...new Map(decisions.map(d => [key(d), d])).values()];
}
export function updateQuoteRoomDecisions(previous: QuoteRoomDecision[], message: string, knownRooms: string[] = []) {
  const memory = new Map(refreshQuoteRoomDecisions(previous).map(d => [key(d), d]));
  const notices: string[] = []; const global: string[] = [];
  const clauses = quoteRoomClauses(message);
  for (const raw of clauses) {
    const clause = raw.trim(); const n = norm(clause); if (!n) continue;
    const rooms = quoteMentionedRooms(clause); const work = works(clause);
    // Mixed general lists ("impianti, soffitto, bagno e terrazzi esclusi")
    // belong to the legacy whole-project ledger, not to every named room.
    const generalList = rooms.length > 0 && rooms.every(r => (r === "bagno" || r === "terrazzi") && !quoteRoomTopicIsContext(r, clause)) && work.length > 0 && /,|\se\s/.test(n) && !/:/.test(n) && !/\b(?:della|del|nella|nel|rifai|rifacciamo|tinteggia|sostituiamo|sostituisci)\b/.test(n);
    if (quoteTurnIsExplanationOnly(message)) continue;
    if (clause.length > 600) continue;
    if (quoteClauseNeedsScopeClarification(clause)) continue;
    if (quoteTurnIsHypothetical(clause)) {
      for (const room of rooms.length ? rooms : ["*"]) for (const w of work) {
        const d: QuoteRoomDecision = { room, work: w, state: "undecided", evidence: clause };
        if (!memory.has(key(d)) && memory.size < ROOM_MEMORY_LIMIT) memory.set(key(d), d);
      }
      continue;
    }
    if (!generalList && rooms.length > 1 && work.length > 1) {
      notices.push("Indica separatamente ambiente e lavorazione: non applico tutte le opere a tutte le stanze della frase."); continue;
    }
    if (/\b(?:quello|quella|qui|questa stanza|questo ambiente|come prima|come sopra)\b/.test(n) && !rooms.length) {
      if (/esclud|includ|rifai|mantieni|conserv/.test(n)) notices.push("Specifica l’ambiente: non trasferisco automaticamente una scelta da una stanza all’altra.");
      continue;
    }
    const included = /\b(?:includi|includiamo|inclus[oaie]|reinserisci|rifai|rifacciamo|da rifare|sostituiamo|da tinteggiare|tinteggia|scelgo|scelgo di)\b/.test(n) && !/\bnon\s+(?:(?:e|sono|piu|ancora|voglio|vogliamo|devi)\s+)*(?:includ|inclus|rifa|tintegg|conferm)/.test(n);
    const excluded = /\b(?:esclus[oaie]|escludi|fuori ambito|senza (?:lavori|interventi|opere)|non rifare)\b/.test(n) && !/\bnon\s+(?:(?:e|sono|piu)\s+)*esclus/.test(n);
    // Keeping a price/quantity/row unchanged is NOT physical conservation.
    const ledgerOnly = quoteBookkeepingScope(n);
    const preserved = !excluded && !ledgerOnly && !/\bnon\s+(?:(?:voglio|vogliamo|devi|deve|dobbiamo)\s+)?(?:mantien|mantene|conserv)/.test(n) && (/\b(?:mantieni|mantenere|mantenendo|conserva|conservare|mantenut[oaie])\b/.test(n)
      || rooms.length === 1 && !work.length && /^(?:(?:il|la) )?[a-z ]+(?:resta |rimane )?invariat[oa]$/.test(n));
    if (Number(included) + Number(excluded) + Number(preserved) !== 1) {
      if (rooms.length && included && (excluded || preserved)) notices.push("Indica separatamente la scelta per ciascuna lavorazione: la frase contiene decisioni diverse.");
      continue;
    }
    if (generalList) { global.push(clause); for (const d of roomDecisionsFromLegacy(updateQuoteScopeFacts([], clause))) {
      if (memory.size < ROOM_MEMORY_LIMIT || memory.has(key(d))) memory.set(key(d), d);
    } continue; }
    if (!work.length && !rooms.length) continue;
    if (!work.length && rooms.length) {
      let remainder = n;
      for (const room of rooms) remainder = remainder.replaceAll(room, " ");
      remainder = remainder.replace(/\b(?:includi|includiamo|reinserisci|rifai|rifacciamo|mantieni|mantenere|mantenendo|conserva|conservare|inclus[oaie]|esclus[oaie]|escludi|invariat[oaie]|mantenut[oaie]|resta|restano|rimane|rimangono|e|sono|il|la|i|le|un|una|tutto|tutta|tutti|tutte|completo|completa|completamente|interamente|ora|solo|ambito|fuori|da)\b/g, " ").replace(/[.,:]/g, "").trim();
      if (remainder) { notices.push("La lavorazione specifica non è riconosciuta dalla memoria: non estendo la scelta all’intero ambiente. La richiesta resta nel messaggio per l’AI."); continue; }
    }
    // Only validated explicit decisions reach the legacy ledger too. A bare
    // "posizioni impianti invariate" must not preserve the whole system.
    if (!rooms.length) global.push(clause);
    const state = included ? "included" : excluded ? "excluded" : "preserved";
    const targets = rooms.length ? rooms : ["*"];
    for (const room of targets) {
      const known = knownRooms.map(roomName).filter(label => label === room || label.startsWith(`${room} `));
      if (known.length > 1 && !known.includes(room)) { notices.push(`Ci sono più ambienti «${room}»: indica quale. Nessuna scelta è stata estesa a tutti.`); continue; }
      for (const w of work.length ? work : ["ambito" as const]) {
        const overlay = /\b(?:posa|posare|pavimento|pavimentazione|gres)\b[^.;,]{0,45}\b(?:in\s+)?sovrapposizione\b/.test(n)
          && !/\b(?:evita\w*|senza|non|nessuna)\b[^.;,]{0,35}\bsovrapposizion/.test(n);
        const detail = w === "pavimento" && overlay ? "sovrapposizione" : w === "pavimento" && preserved ? "conservazione" : w === "tinteggiatura" && /opac[oa]/.test(n) ? "opaca" : w === "tinteggiatura" && /satinat[oa]/.test(n) ? "satinata" : undefined;
        const decision: QuoteRoomDecision = { room, work: w, state, evidence: clause, ...(detail ? { detail } : {}) };
        if (memory.size >= ROOM_MEMORY_LIMIT && !memory.has(key(decision))) { notices.push("Memoria ambienti piena: nessuna decisione precedente è stata cancellata."); continue; }
        memory.set(key(decision), decision);
      }
    }
  }
  return { decisions: [...memory.values()], notices: [...new Set(notices)], globalText: global.join(". ") };
}
/** Re-read evidence from older experimental adapters; do not turn bookkeeping
 * invariance into conservation. Unknown/manual evidence is retained verbatim. */
export function refreshQuoteRoomDecisions(previous: QuoteRoomDecision[]) {
  const result = new Map<string, QuoteRoomDecision>();
  const previousKeys = new Set(previous.map(key));
  for (const d of readQuoteRoomDecisions(previous)) {
    if (quoteClauseNeedsScopeClarification(d.evidence)) continue;
    if (d.state === 'preserved' && quoteBookkeepingScope(d.evidence)) continue;
    if (d.work === 'impianti' && quoteHasSpecificSystem(d.evidence)) {
      for (const n of updateQuoteRoomDecisions([], d.evidence).decisions.filter(n => n.work.startsWith('impianto_') && n.room === d.room)) result.set(key(n), n);
      continue;
    }
    const reparsed = updateQuoteRoomDecisions([], d.evidence).decisions;
    // Older readers narrowed a bare list ("soffitto e terrazzi esclusi") to
    // "ceiling of the terrace". Restore missing list targets, never replace a
    // separate explicit decision already stored for one of those targets.
    if (reparsed.some(n => n.room === '*' && n.work !== 'ambito') && reparsed.some(n => n.room !== '*' && n.work === 'ambito')) {
      for (const n of reparsed) if (!previousKeys.has(key(n)) && !result.has(key(n))) result.set(key(n), n);
    }
    const candidates = reparsed.filter(n => n.work === d.work);
    const same = candidates.find(n => n.room === d.room);
    const corrected = same ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (corrected) result.set(key(corrected), corrected);
    else if (!(d.work === 'ambito' && quoteRoomTopicIsContext(d.room, d.evidence)) && !(quoteDecisionClauses(d.evidence).length > 1 && works(d.evidence).includes(d.work)) && !/invariat|\bquantit[aà]\b|\bprezz[oi]\b/i.test(d.evidence)) result.set(key(d), d);
  }
  return [...result.values()];
}
export function quoteRoomDecisionFor(decisions: QuoteRoomDecision[], room: string, work: RoomWork) {
  return decisions.find(d => d.room === roomName(room) && d.work === work)
    ?? (work.startsWith('impianto_') ? decisions.find(d => d.room === roomName(room) && d.work === 'impianti') : undefined)
    ?? decisions.find(d => d.room === roomName(room) && d.work === "ambito")
    ?? decisions.find(d => d.room === "*" && d.work === work)
    ?? (work.startsWith('impianto_') ? decisions.find(d => d.room === '*' && d.work === 'impianti') : undefined)
    ?? decisions.find(d => d.room === "*" && d.work === "ambito");
}
export function quoteRoomProposalBlocked(p: QuoteChatProposal, decisions: QuoteRoomDecision[], previous?: QuoteChatProposal) {
  const named = quoteMentionedRooms(p.title); const oldRooms = previous ? quoteMentionedRooms(previous.title) : [];
  // An existing ID cannot silently move to another room, or shed its room label
  // to bypass a constraint. Direct manual editing is a separate user action.
  if (named.length && oldRooms.length && named.some(room => !oldRooms.includes(room))) return true;
  const rooms = named.length ? named : oldRooms; const requestedWorks = works(p.title); const oldWorks = previous ? works(previous.title) : []; const work: RoomWork[] = requestedWorks.length ? requestedWorks : oldWorks.length ? oldWorks : ["ambito"];
  if (work.includes("pavimento") && /\bsenza\s+(?:la\s+)?(?:rimozione|demolizione)\b/i.test(p.description) && (rooms.length ? rooms : ["*"]).some(room => quoteRoomDecisionFor(decisions, room, "demolizione")?.state === "included")) return true;
  return (rooms.length ? rooms : ["*"]).some(room => work.some(w => {
    const d = quoteRoomDecisionFor(decisions, room, w); return d?.state === "excluded" || d?.state === "preserved" || d?.state === "undecided";
  }));
}
export function quoteRoomQuestions(questions: string[], decisions: QuoteRoomDecision[]) {
  return questions.filter(q => !/vuoi|desideri|includ|rifa|tintegg|interven/i.test(q) || !quoteRoomProposalBlocked({ id: "question", title: q, description: "", unit: "", quantity: null, quantityBasis: "", referenceId: null }, decisions.filter(d => d.state !== "undecided")));
}
export function quoteRoomClauses(message: string) {
  return message.split(/;|\n|[.!?](?!\d)/).flatMap(sentence => {
    const parts = quoteDecisionClauses(sentence); const context = quoteMentionedRooms(parts[0] ?? '');
    return parts.map((part, index) => index > 0 && context.length === 1 && !quoteMentionedRooms(part).length && works(part).length && !/\b(?:ovunque|tutta la commessa|tutto il progetto|tutti gli ambienti)\b/i.test(part)
      ? `Nel ${context[0]}: ${part}` : part);
  });
}
/** Explicit follow-up offered in chat; never silently rewrites the original turn. */
export function quoteConfirmedWorkReply(message: string): string | null {
  if (!quoteTurnIsHypothetical(message) || quoteTurnIsExplanationOnly(message)) return null;
  const clauses = quoteRoomClauses(message);
  const confirmed = clauses.filter(c => !quoteTurnIsReadOnly(c) && works(c).length && /\b(?:rifai|rifacciamo|confermo|includi|tinteggia)\b/i.test(c));
  if (!confirmed.length || !clauses.some(c => quoteTurnIsHypothetical(c) && works(c).length)) return null;
  return `Componi soltanto le lavorazioni qui esplicitamente richieste: ${confirmed.join(". ")}. Mantieni le altre decisioni salvate; nessuna inclusione monetaria automatica.`.slice(0, 2800);
}
export function describeQuoteRoomDecisions(decisions: QuoteRoomDecision[]) {
  return decisions.map(d => `- **${d.room === "*" ? "Tutta la commessa" : d.room} · ${d.work}**: ${stateLabel[d.state]}${d.detail ? ` (${d.detail})` : ""}.\n  Dalla tua indicazione: «${d.evidence}»`).join("\n");
}
/** Bridge to the already deployed endpoint: older readers ignore roomDecisions.
 * Never silently truncate a confirmed fact to fit the legacy brief. */
export function quoteRoomBrief(brief: string, decisions: QuoteRoomDecision[]) {
  if (!decisions.length) return brief;
  const facts = JSON.stringify(decisions.map(d => [d.room, d.work, d.state, d.detail ?? ""]));
  const ledger = `MEMORIA UTENTE PER AMBIENTE [ambiente, lavorazione, decisione, dettaglio]: ${facts}. * = tutta la commessa; regola specifica prevale sulla generale. Decisioni di ambito, NON inclusioni nel totale.`;
  if (ledger.length > 2700) throw new Error("Memoria per ambiente troppo ampia per il backend attuale. Le decisioni restano salvate; suddividi il progetto prima di continuare con l’AI.");
  return `${ledger}\nRiepilogo AI non autorevole: ${brief.slice(0, Math.max(0, 2960 - ledger.length))}`;
}

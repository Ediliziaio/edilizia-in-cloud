/** Small user-authored scope ledger. Never populated from model/OCR/catalogue prose. */
export type QuoteScopeFact = { topic: string; state: "excluded" | "included" | "preserved"; evidence: string };
const topics: Array<[string, RegExp]> = [
  ["soffitto", /\bsoffitt[oi]\b/i], ["terrazzi", /\bterrazz[oi]\b/i], ["bagno", /\bbagn[oi]\b/i],
  ["impianti", /\bimpiant[oi]\b/i], ["serramenti", /\bserrament[oi]\b/i], ["infissi", /\binfiss[oi]\b/i],
  ['impianto_termico', /\b(?:impiant[oi]\s+termic[oi]|riscaldamento)\b/i],
  ['impianto_elettrico', /\belettric[oaie]\b/i], ['impianto_idrico', /\b(?:idric[oaie]|idraulic[oaie])\b/i],
];
export function quoteHasSpecificSystem(text: string) { return topics.some(([topic, pattern]) => topic.startsWith('impianto_') && pattern.test(text)); }
export function quoteBookkeepingScope(text: string) { return /\b(?:righ[ae]|voc[ei]|titolo|descrizion[ei]|prezz[oi]|quantit[aà]|import[oi]|inclusion[ei]|posizion[ei]|disposizion[ei])\b/i.test(text); }
export function readQuoteScopeFacts(raw: unknown): QuoteScopeFact[] {
  if (!Array.isArray(raw) || raw.length > 16) throw new Error("Memoria ambito non valida.");
  const facts = raw.map(v => {
    const f = v as QuoteScopeFact;
    if (!f || !topics.some(([topic]) => topic === f.topic)) throw new Error(`Decisione di ambito non valida: argomento non supportato (${String(f?.topic).replace(/[^a-z_]/g, '').slice(0, 40)}).`);
    if (!["excluded", "included", "preserved"].includes(f.state)) throw new Error('Decisione di ambito non valida: stato non riconosciuto.');
    if (typeof f.evidence !== 'string' || !f.evidence.trim() || f.evidence.length > 600) throw new Error('Decisione di ambito non valida: evidenza vuota o oltre 600 caratteri.');
    return { topic: f.topic, state: f.state, evidence: f.evidence };
  });
  if (new Set(facts.map(f => f.topic)).size !== facts.length) throw new Error("Decisioni duplicate.");
  return facts;
}
export function quoteTurnIsHypothetical(text: string): boolean {
  // Explicitly executable proposals may contain assumptions without turning
  // the entire turn into a hypothetical discussion. Undecided choices remain
  // guarded clause-by-clause by the room ledger.
  const executable = /\b(?:crea|aggiungi|componi|inserisci|aggiorna|applica)\b/i.test(text)
    && !/\b(?:non|senza)\s+(?:creare|aggiungere|comporre|inserire|aggiornare|applicare)\b/i.test(text);
  const uncertainty = /\b(?:forse|ipotetico|ipotetica|sto (?:solo )?valutando|non (?:ho|abbiamo) (?:ancora )?deciso|non (?:ho |abbiamo )?conferm(?:o|ato)|non [eè] una conferma)\b/i.test(text);
  return uncertainty || /\bipotesi\b/i.test(text) && !executable;
}
export function quoteTurnIsReadOnly(text: string): boolean {
  return quoteTurnIsHypothetical(text) || quoteTurnIsExplanationOnly(text);
}
export function quoteTurnIsExplanationOnly(text: string): boolean {
  return /\b(?:(?:non|senza) (?:modificare|cambiare|aggiornare|toccare)\s+(?:alcuna voce|nessuna voce|le voci|la bozza|il preventivo|il configuratore|l[’']impianto|righe|voci)|solo (?:spiegazione|un riepilogo)|non cambiare righe)\b/i.test(text);
}
/** A price exclusion/conditional is not a decision to omit physical work.
 * Also avoid broadening a restriction on one component (e.g. screed demolition)
 * to every demolition or floor in the project. Keep that detail in chat. */
export function quoteClauseNeedsScopeClarification(text: string): boolean {
  return /\bse\s+(?:(?:[eè]|sono|risulta|risultano)\s+)?esclus[oaie]\b/i.test(text)
    || /\besclus[oaie]\s+(?:dal(?:la|le|lo|l’|l')?|dai|nel(?:la|le|lo)?|nei)\s*(?:codic[ei]|prezz[oi]|tariff[ae]|voc[ei]|import[oi]|computo|totale|preventivo)\b/i.test(text)
    || /\b(?:nessuna|non)\s+demolizione\s+del\s+massetto\b/i.test(text)
    || /\bdemolizione\s+del\s+massetto\s+(?:esclusa|non autorizzata)\b/i.test(text)
    // A restriction on a component is never a decision about the entire system.
    || /\b(?:terminale|montaggio\s+(?:degli\s+)?apparecchi|colonn[ae]\s+condominiali)\b[^.;\n]{0,80}\besclus[oaie]\b/i.test(text)
    || /\besclus[oaie]\s+(?:solo\s+)?(?:il\s+|la\s+|le\s+)?(?:terminale|montaggio\s+(?:degli\s+)?apparecchi|colonn[ae]\s+condominiali)\b/i.test(text);
}
/** Keep bare lists together, but separate an actual request from a later
 * restriction. “Posa bagno 12 m², impianti esclusi” is not “bagno escluso”. */
export function quoteDecisionClauses(message: string): string[] {
  return message.split(/;|\n|[.!?](?!\d)|,\s*(?=(?:ma|invece|per[oò]|escludi|includi|rifai|mantieni|conserva)\b)|\s+(?:ma|mentre|invece|per[oò])\s+/i).flatMap(sentence => {
    const parts = sentence.split(/,(?!\d)\s*/); const result: string[] = []; let pending = '';
    const action = /\b(?:posa|rinnovo|ristrutturazion\w*|rifai|rifacciamo|includi|includiamo|inclus[oaie]|sostitu\w*|installazion\w*|tintegg\w*|confermat\w*|richiest\w*)\b|\d\s*(?:m²|mq|m2)\b/i;
    const restriction = /\b(?:esclus[oaie]|escludi|non rifare|fuori ambito|mantieni|conserva|invariat[oaie])\b/i;
    for (const part of parts) {
      if (pending && restriction.test(part) && (action.test(pending) || restriction.test(pending))) { result.push(pending.trim()); pending = part; }
      else pending += `${pending ? ', ' : ''}${part}`;
    }
    if (pending.trim()) result.push(pending.trim());
    return result;
  }).map(clause => clause.trim()).filter(Boolean);
}
/** A room mentioned as the location of a work is not an entire-room decision. */
export function quoteRoomTopicIsContext(topic: string, text: string): boolean {
  if (topic !== 'bagno' && topic !== 'terrazzi') return false;
  const room = topic === 'bagno' ? 'bagn[oi]' : 'terrazz[oi]';
  if (new RegExp(`\\b(?:del|della|nel|nella|sul|sulla|al|alla)\\s+(?:${room})\\b|\\b${room}\\s*:`, 'i').test(text)) return true;
  const physicalWork = /\b(?:impiant\w*|elettric\w*|idric\w*|idraulic\w*|paviment\w*|soffitt\w*|demolizion\w*|rimozion\w*|tintegg\w*|serrament\w*)\b/i.test(text);
  const listMember = new RegExp(`(?:^|,|\\be\\s+)(?:\\s*(?:il|i|la|le)\\s+)?\\s*${room}\\s*(?=,|\\be\\b|(?:(?:sono|restano|resta)\\s+)?(?:esclus|inclus|invariat))`, 'i').test(text);
  return physicalWork && !listMember;
}
export function refreshQuoteScopeFacts(previous: QuoteScopeFact[]): QuoteScopeFact[] {
  const corrected = previous.filter(f => !quoteClauseNeedsScopeClarification(f.evidence) && !quoteRoomTopicIsContext(f.topic, f.evidence) && !(f.state === 'preserved' && quoteBookkeepingScope(f.evidence))).flatMap(f => f.topic === 'impianti' && quoteHasSpecificSystem(f.evidence)
    ? updateQuoteScopeFacts([], f.evidence).filter(s => s.topic.startsWith('impianto_')) : [f]);
  return [...new Map(corrected.map(f => [f.topic, f])).values()];
}
export function updateQuoteScopeFacts(previous: QuoteScopeFact[], message: string): QuoteScopeFact[] {
  const facts = new Map(refreshQuoteScopeFacts(previous).map(f => [f.topic, f]));
  for (const clause of quoteDecisionClauses(message.replace(/\s+e\s+(?=(?:includi|includiamo|mantieni|conserva|reinserisci)\b)/gi, '; '))) {
    if (!clause.trim() || clause.length > 600 || quoteTurnIsHypothetical(clause) || quoteClauseNeedsScopeClarification(clause)) continue;
    const excluded = /\b(?:esclus[oaie]|fuori ambito|senza (?:lavori|interventi|opere))\b/i.test(clause) && !/\bnon\s+(?:(?:[eè]|sono|pi[uù])\s+)*esclus/i.test(clause);
    const preserved = !quoteBookkeepingScope(clause) && /\b(?:manten(?:ere|iamo|endo|uti|ute)|mantieni|invariat[oaie]|conserv(?:a|are|ati|ate))\b/i.test(clause);
    const included = /\b(?:includi|includiamo|reinserisci|ora (?:rifacciamo|rifai)|non (?:[eè]|sono) pi[uù] esclus)/i.test(clause);
    if (!excluded && !preserved && !included) continue;
    for (const [topic, pattern] of topics) if (pattern.test(clause)) {
      if (quoteRoomTopicIsContext(topic, clause)) continue;
      if (topic === 'impianti' && quoteHasSpecificSystem(clause)) continue;
      facts.set(topic, { topic, state: included ? "included" : excluded ? "excluded" : "preserved", evidence: clause.trim() });
    }
  }
  return [...facts.values()];
}
export function quoteScopeQuestions(questions: string[], facts: QuoteScopeFact[], latest: string): string[] {
  const painting = /tintegg|pittur|pareti/i.test(latest);
  return questions.filter(q => !facts.some(f => f.state !== "included" && topics.find(([topic]) => topic === f.topic)![1].test(q) && /vuoi|desideri|includ|tintegg|rifa|interven|lavor/i.test(q)))
    .map(q => painting && /larghezza/i.test(q) && /apertur|porte|finestre/i.test(q) && !/altezza|superficie|m²|mq/i.test(q)
      ? "Quali sono larghezza e altezza di ciascuna porta e finestra da detrarre, oppure la loro superficie complessiva in m²?" : q);
}

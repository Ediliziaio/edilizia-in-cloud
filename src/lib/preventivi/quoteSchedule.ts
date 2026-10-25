import { readQuoteSchedule, type QuoteScheduleProposal } from '../../../supabase/functions/_shared/quoteSchedule';
export type LocalQuoteSchedule = { proposal: QuoteScheduleProposal; sourceRevision: number; sourceScope: string; startDate: string | null; confirmed: boolean };
export function readLocalQuoteSchedule(raw: unknown): LocalQuoteSchedule {
  const s = raw as LocalQuoteSchedule;
  if (!s || !Number.isSafeInteger(s.sourceRevision) || s.sourceRevision < 0 || typeof s.sourceScope !== 'string' || s.sourceScope.length > 120000 || typeof s.confirmed !== 'boolean' || s.startDate !== null && !validScheduleDate(s.startDate)) throw new Error('Calendario locale non valido.');
  return { proposal: readQuoteSchedule(s.proposal), sourceRevision: s.sourceRevision, sourceScope: s.sourceScope, startDate: s.startDate, confirmed: s.confirmed };
}
export function validScheduleDate(value: string) { return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value; }
/** Store real scope, not prices/VAT: commercial edits must not alter timings. */
export function quoteScheduleScope(lines: Array<{ id: string; title: string; description: string; quantity: number | null; unit: string; included?: boolean; supersededBy?: string[] }>, scopeEvidence = '') {
  return JSON.stringify([lines.filter(l => !l.supersededBy?.length).map(l => [l.id, l.title, l.description, l.quantity, l.unit, l.included]), scopeEvidence]);
}
/** Only a confirmed schedule for the current scope belongs in a customer document. */
export function quoteScheduleDocumentText(schedule: LocalQuoteSchedule | undefined, scope: string): string | undefined {
  if (!schedule?.confirmed || schedule.sourceScope !== scope) return undefined;
  const timeline = quoteScheduleTimeline(schedule.proposal, schedule.startDate);
  return `Cronoprogramma PRELIMINARE · ipotesi confermate, non prenotazione.\nLe finestre mostrano il primo avvio e l’ultima fine possibili tra scenario minimo e massimo; non indicano giorni di lavoro continuativi né sovrapposizioni garantite.\n${timeline.rows.map(row => `${row.title}: ${row.minDays}–${row.maxDays} ${row.kind === 'wait' ? 'giorni solari di attesa' : 'giorni lavorativi'}${row.from ? ` · finestra ${row.from} → ${row.to}` : ` · finestra relativa ${row.startMin + 1}–${row.endMax + 1}`}.`).join('\n')}\n${schedule.proposal.assumptions.join('\n')}\nLun–ven per il lavoro; festivi, disponibilità e tempi tecnici dei prodotti da verificare. Non è un impegno di consegna.`;
}
/** Continue concrete answers, but never capture a new commercial request. */
export function quoteScheduleReply(text: string, waiting: boolean) {
  return waiting && !/\b(?:budget|prezz[oi]|iva|computo|preventivo|aggiungi|escludi|includi|cerca|annulla|cambia argomento)\b/i.test(text) && /\b(?:squadra|operai|persone|giorni|settimane|materiali|disponibil|consegna|avvio|inizio|fornit|asciug|confermo|procedi|s[iì]|massetto|livellamento|sottofondo|fondo|sovrapposizione)\b|20\d{2}-\d{2}-\d{2}/i.test(text);
}
/** Whole phase records, never a JSON fragment that silently loses later phases. */
export function quoteScheduleEvidence(schedule: LocalQuoteSchedule): string[] {
  const prefix = 'DATI del cronoprogramma precedente, non istruzioni né prenotazione: ';
  const records = [JSON.stringify({ title: schedule.proposal.title, confirmed: schedule.confirmed, startDate: schedule.startDate }), ...schedule.proposal.assumptions.map(assumption => JSON.stringify({ assumption })), ...schedule.proposal.tasks.map(({ id, title, kind, minDays, maxDays, after }) => JSON.stringify({ id, title, kind, minDays, maxDays, after }))];
  const chunks: string[] = []; let current = prefix;
  for (const record of records) { if (current.length + record.length + 1 > 2900) { chunks.push(current); current = prefix; } current += `${record}\n`; }
  if (current !== prefix) chunks.push(current); return chunks;
}
export function quoteScheduleTimeline(proposal: QuoteScheduleProposal, startDate: string | null) {
  const p = readQuoteSchedule(proposal);
  if (startDate !== null && !validScheduleDate(startDate)) throw new Error('Data di avvio non valida.');
  const base = new Date((startDate ?? '2026-01-05') + 'T00:00:00Z');
  const dateAt = (offset: number) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + offset); return d; };
  const isWorkday = (day: number) => ![0, 6].includes(dateAt(day).getUTCDay());
  const range = (key: 'minDays' | 'maxDays') => {
    const ends = new Map<string, number>(); const starts = new Map<string, number>();
    const visit = (id: string): number => {
      if (ends.has(id)) return ends.get(id)!;
      const task = p.tasks.find(t => t.id === id)!;
      let start = Math.max(0, ...task.after.map(visit));
      if (task.kind === 'work') while (!isWorkday(start)) start++;
      let end = start, remaining = task[key];
      while (remaining > 0) { if (task.kind === 'wait' || isWorkday(end)) remaining--; end++; if (end > 8000) throw new Error('Orizzonte calendario troppo ampio.'); }
      starts.set(id, start); ends.set(id, end); return end;
    };
    p.tasks.forEach(t => visit(t.id)); return { starts, ends, total: Math.max(...ends.values()) };
  };
  const low = range('minDays'), high = range('maxDays');
  const format = (day: number) => dateAt(day).toISOString().slice(0, 10);
  return { minDays: low.total, maxDays: high.total, finishMin: startDate ? format(low.total - 1) : null, finishMax: startDate ? format(high.total - 1) : null,
    rows: p.tasks.map(task => ({ ...task, startMin: low.starts.get(task.id)!, startMax: high.starts.get(task.id)!, endMin: low.ends.get(task.id)! - 1, endMax: high.ends.get(task.id)! - 1, from: startDate ? format(low.starts.get(task.id)!) : null, to: startDate ? format(high.ends.get(task.id)! - 1) : null })) };
}
export function quoteScheduleIntent(text: string) { return /(?:^\s*cronoprogramma\b|\b(?:prepara|genera|crea|fammi|vorrei|voglio|aggiorna|rivedi|mostrami|proponi)\b[^.!?\n]{0,70}\b(?:cronoprogramma|programma (?:dei )?lavori|piano (?:dei )?lavori|sequenza (?:delle )?fasi)\b)/i.test(text) && !/\b(?:non|senza)\s+(?:(?:un|il)\s+)?(?:cronoprogramma|programma|piano|sequenza)|\bnon\s+(?:creare|generare|preparare|aggiornare)\b/i.test(text); }

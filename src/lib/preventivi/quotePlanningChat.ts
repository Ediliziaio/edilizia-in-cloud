import { calculatePlanningScenario, readPlanningScenario, syntheticPlanningScenario, type PlanningScenario } from './quotePlanningScenario';

/** Route only explicit scenario requests, never commercial edits or quoted file content. */
export function planningChatIntent(text: string, active = false): boolean {
  if (text.length > 3000 || /```|\[DOCUMENTO|<document|^\s*>/i.test(text)) return false;
  if (/\b(?:non|senza)\s+(?:simulare|simulazioni|scenari|trasferte)\b/i.test(text)) return false;
  if (/\b(?:prezzo|iva|fattura|sconto|preventivo|computo|aggiungi voce|escludi voce)\b/i.test(text)) return false;
  return /\b(?:scenari? (?:di cantiere|trasferte)|simula (?:le |la )?trasfert[ae]|esempio trasferte|capacit[aà] (?:della |di )?squadra)\b/i.test(text)
    || /\b(?:viaggio|trasferta|arrivare in cantiere)\b/i.test(text) && /\b(?:minuti|min|ore|ora|km|quanto|calcola|simula)\b/i.test(text)
    || /\b(?:finire|terminare|consegnare)\b.+\b(?:entro|in un mese)\b/i.test(text)
    || active && /^(?:confronta scenari|chiudi scenari|(?:squadra|carico|avvio|inizio|scadenza|andata|ritorno|giornata|pausa|preparazione)\s*:|(?:partiamo dalla sede|siamo gi[aà] in cantiere)|(?:(?:siamo|ho|abbiamo|una squadra di)\s+)?\d+\s+(?:operai|persone)\b|(?:iniziamo|partiamo|finiamo|consegniamo)\s+(?:il|entro)\s+20)/i.test(text);
}

const number = (text: string) => Number(text.replace(',', '.'));
const dayText = (iso: string | null) => iso ? iso.split('-').reverse().join('/') : 'da definire';
export function planningChatSummary(scenario: PlanningScenario): string {
  const r = calculatePlanningScenario(scenario);
  if (r.status === 'invalid') return 'I dati dello scenario non sono validi: correggili nei dettagli. Il preventivo è invariato.';
  if (r.status === 'missing' || !r.capacity) return 'Per calcolare la fattibilità servono le ore-persona delle lavorazioni e le disponibilità. Inseriscile nella scheda qui sotto: non le ricavo dal prezzo del preventivo. Squadra e viaggio sono ipotesi da verificare.';
  const capacity = r.capacity.nominalCrewPersonHoursPerDay.toLocaleString('it-IT', { maximumFractionDigits: 2 });
  return `**Scenario locale · ${scenario.source === 'synthetic' ? 'esempio sintetico' : 'ipotesi da verificare'}**\n\nCapacità nominale: **${capacity} ore-persona/giorno**. ${r.finishDate ? `Fine simulata: **${dayText(r.finishDate)}**.` : 'Il lavoro non termina nell’orizzonte simulato.'} ${r.meetsDeadline == null ? 'Scadenza da definire.' : r.meetsDeadline ? 'La scadenza è rispettata nelle ipotesi inserite, non è una promessa.' : 'La scadenza non è rispettata da questo scenario.'}\n\nConfronta le alternative nella scheda. Competenze, consegne e interferenze possono limitare il beneficio di persone aggiuntive. Nessuna voce o assegnazione modificata.`;
}

/** Small deterministic grammar: unsupported prose remains a question, not invented data. */
export function applyPlanningChatCommand(previous: PlanningScenario, text: string): { scenario: PlanningScenario; reply: string; changed: boolean } {
  if (/^esempio trasferte 360 ore[.!]?$/i.test(text.trim())) {
    const scenario = syntheticPlanningScenario();
    return { scenario, reply: planningChatSummary(scenario), changed: true };
  }
  if (/\b(?:non|forse|oppure|anzich[eé])\b|\?/i.test(text)) return { scenario: previous, changed: false, reply: 'È una domanda o una scelta ancora aperta: non cambio i dati dello scenario. Usa le scelte nella scheda oppure dichiara i valori da simulare.' };
  const s = structuredClone(previous); let changed = false;
  const set = (fn: () => void) => { fn(); changed = true; };
  // Require explicit person-hours; simple "hours" could mean hours per worker.
  const workload = /\bcarico\s*:\s*(\d+(?:[.,]\d+)?)\s*ore[- ]persona\b/i.exec(text);
  if (workload) {
    if (s.tasks.length !== 1 || s.tasks[0].kind !== 'work') return { scenario: previous, changed: false, reply: 'Ci sono più fasi: modifica le ore della singola lavorazione nei dettagli. Non sostituisco la sequenza con un carico globale.' };
    const task = s.tasks[0];
    set(() => { s.tasks[0] = { ...task, personHours: number(workload[1]) }; });
  }
  const crew = /^(?:(?:squadra\s*:|siamo|ho|abbiamo|una squadra di)\s*)?(\d+)\s*(?:persone|operai)\b/i.exec(text.trim());
  if (crew) {
    const count = Number(crew[1]);
    if (count < 1 || count > 32) return { scenario: previous, changed: false, reply: 'Usa da 1 a 32 persone per questo scenario locale. Nessuna modifica applicata.' };
    // Never erase skills or individual calendars of a heterogeneous workforce.
    const first = s.workers[0] ?? s.additionalWorker;
    if (!first || s.workers.some(w => JSON.stringify([w.skills, w.availableFrom, w.availableThrough, w.unavailableDates, w.windowMinutesByDate]) !== JSON.stringify([first.skills, first.availableFrom, first.availableThrough, first.unavailableDates, first.windowMinutesByDate])))
      return { scenario: previous, changed: false, reply: 'La squadra ha competenze o disponibilità diverse: modifica le singole persone nei dettagli, senza sostituirle con lavoratori generici.' };
    set(() => { s.workers = Array.from({ length: count }, (_, i) => s.workers[i] ?? { ...structuredClone(first), id: `chat-worker-${i + 1}`, label: `Persona ${i + 1} (ipotesi)` }); });
  }
  for (const [key, expression] of [
    ['startDate', /\b(?:(?:avvio|inizio)\s*:|(?:iniziamo|partiamo)\s+il)\s*(20\d{2}-\d{2}-\d{2})\b/i],
    ['deadlineDate', /\b(?:scadenza\s*:|(?:finiamo|consegniamo|finire)\s+entro)\s*(20\d{2}-\d{2}-\d{2})\b/i],
  ] as const) { const match = expression.exec(text); if (match) set(() => { s[key] = match[1]; }); }
  for (const [direction, minuteKey, kmKey] of [['andata', 'outboundMinutes', 'outboundKm'], ['ritorno', 'returnMinutes', 'returnKm']] as const) {
    const minutes = new RegExp(`\\b${direction}\\s*:?\\s*(\\d+(?:[.,]\\d+)?)\\s*(minuti|min|ore|ora|h)\\b`, 'i').exec(text)
      ?? new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(minuti|min|ore|ora|h)\\s+(?:di |all['’])?${direction}\\b`, 'i').exec(text);
    const distance = new RegExp(`\\b${direction}\\s*:?\\s*(\\d+(?:[.,]\\d+)?)\\s*km\\b`, 'i').exec(text);
    if (minutes) set(() => { s.travel[minuteKey] = number(minutes[1]) * (/^(?:ore|ora|h)$/i.test(minutes[2]) ? 60 : 1); });
    else if (new RegExp(`\\bun['’ ]ora\\s+(?:di |all['’])?${direction}\\b`, 'i').test(text)) set(() => { s.travel[minuteKey] = 60; });
    if (distance) set(() => { s.travel[kmKey] = number(distance[1]); });
  }
  const day = /\bgiornata\s*:\s*(\d+(?:[.,]\d+)?)\s*ore\b/i.exec(text);
  const pause = /\bpausa\s*:\s*(\d+)\s*(?:minuti|min)\b/i.exec(text);
  const setup = /\bpreparazione\s*:\s*(\d+)\s*(?:minuti|min)\b/i.exec(text);
  if (day) set(() => { s.window.minutes = number(day[1]) * 60; });
  if (pause) set(() => { s.window.breakMinutes = Number(pause[1]); });
  if (setup) set(() => { s.window.setupMinutes = Number(setup[1]); });
  if (/\bpartiamo dalla sede\b/i.test(text) && !/\bnon\b/i.test(text)) set(() => { s.window.reference = 'depot'; });
  if (/\bsiamo gi[aà] in cantiere\b/i.test(text) && !/\bnon\b/i.test(text)) set(() => { s.window.reference = 'site'; });
  if (changed) {
    try {
      const scenario = readPlanningScenario(s)!;
      return { scenario, reply: planningChatSummary(scenario), changed: true };
    } catch { return { scenario: previous, changed: false, reply: 'Dati non applicati: controlla valori, date, pause e limiti della squadra. Lo scenario precedente è conservato.' }; }
  }
  const reply = /\b(?:un mese|alle? 8|\d+\s*km)\b/i.test(text)
    ? 'Chiariamo la finestra: alle 8 siete già in cantiere o partite dalla sede? Per «un mese» indica una data precisa. Inserisci andata e ritorno separatamente: non presumo tempi dai chilometri.'
    : planningChatSummary(s);
  return { scenario: previous, changed: false, reply };
}

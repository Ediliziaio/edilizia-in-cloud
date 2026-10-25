/** Demo-only capabilities. Never mix indicative budgets with approved quote rows. */
export const QUOTE_ADVANCED_MODELS = ['anthropic/claude-sonnet-5.5', 'openai/gpt-6.1-sol'] as const;
export type QuoteAdvancedModel = typeof QUOTE_ADVANCED_MODELS[number];
export type QuoteVision = { attachmentId: string; page: number; dataUrl: string };
export type QuoteAdvanced = { model: QuoteAdvancedModel; mode: 'conversation' | 'budget' | 'schedule'; vision?: QuoteVision };
export type PreliminaryQuoteBudget = { scope: string; currency: 'EUR'; assumptions: string[]; exclusions: string[]; groups: Array<{ label: string; low: number; high: number; basis: string }> };
const obj = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Formato avanzato non valido.'); return v as Record<string, unknown>; };
const text = (v: unknown, max: number) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error('Dato avanzato mancante o troppo lungo.'); return v.trim(); };
const texts = (v: unknown, max: number) => { if (!Array.isArray(v) || v.length > max) throw new Error('Elenco non valido.'); return v.map(x => text(x, 500)); };
export function readQuoteAdvanced(v: unknown): QuoteAdvanced {
  const a = obj(v);
  if (!QUOTE_ADVANCED_MODELS.includes(a.model as QuoteAdvancedModel) || !['conversation', 'budget', 'schedule'].includes(String(a.mode))) throw new Error('Modello o modalità non consentiti.');
  let vision: QuoteVision | undefined;
  if (a.vision != null) {
    const p = obj(a.vision); const attachmentId = text(p.attachmentId, 64);
    if (!/^[a-f\d]{64}$/.test(attachmentId) || !Number.isSafeInteger(p.page) || Number(p.page) < 1 || Number(p.page) > 20) throw new Error('Provenienza immagine non valida.');
    const dataUrl = text(p.dataUrl, 180_000);
    const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match || match[2].length % 4 !== 0) throw new Error('Usa una sola immagine PNG/JPEG locale, non URL remoti.');
    const bytes = atob(match[2]);
    if (bytes.length < 32 || !(match[1] === 'jpeg' ? bytes.charCodeAt(0) === 255 && bytes.charCodeAt(1) === 216 && bytes.charCodeAt(2) === 255 : bytes.slice(0, 8) === '\x89PNG\r\n\x1a\n')) throw new Error('Firma immagine non valida.');
    vision = { attachmentId, page: Number(p.page), dataUrl };
  }
  return { model: a.model as QuoteAdvancedModel, mode: a.mode as QuoteAdvanced['mode'], ...(vision ? { vision } : {}) };
}
export function readPreliminaryQuoteBudget(v: unknown): PreliminaryQuoteBudget {
  const b = obj(v);
  if (b.currency !== 'EUR' || !Array.isArray(b.groups) || !b.groups.length || b.groups.length > 16) throw new Error('Budget indicativo non valido.');
  const groups = b.groups.map(v => {
    const g = obj(v);
    if (typeof g.low !== 'number' || typeof g.high !== 'number' || ![g.low, g.high].every(n => Number.isFinite(n) && n > 0 && n <= 10_000_000) || g.high < g.low) throw new Error('Intervallo del budget non valido.');
    return { label: text(g.label, 160), low: g.low, high: g.high, basis: text(g.basis, 600) };
  });
  if (new Set(groups.map(g => g.label.toLocaleLowerCase('it'))).size !== groups.length) throw new Error('Capitoli del budget duplicati.');
  const assumptions = texts(b.assumptions, 8);
  if (!assumptions.length) throw new Error('Il budget deve dichiarare ipotesi e limiti.');
  return { scope: text(b.scope, 500), currency: 'EUR', assumptions, exclusions: texts(b.exclusions, 8), groups };
}
export function preliminaryQuoteBudgetTotals(b: PreliminaryQuoteBudget) {
  const valid = readPreliminaryQuoteBudget(b);
  const sum = (key: 'low' | 'high') => valid.groups.reduce((n, g) => n + Math.round(g[key] * 100), 0) / 100;
  return { low: sum('low'), high: sum('high') };
}
export const preliminaryQuoteBudgetSchema = {
  type: 'object', additionalProperties: false, required: ['scope', 'currency', 'assumptions', 'exclusions', 'groups'],
  properties: {
    scope: { type: 'string', minLength: 1, maxLength: 500 }, currency: { type: 'string', enum: ['EUR'] },
    assumptions: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 500 } },
    exclusions: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 500 } },
    groups: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'object', additionalProperties: false, required: ['label', 'low', 'high', 'basis'], properties: {
      label: { type: 'string', minLength: 1, maxLength: 160 }, low: { type: 'number', exclusiveMinimum: 0, maximum: 10_000_000 }, high: { type: 'number', exclusiveMinimum: 0, maximum: 10_000_000 }, basis: { type: 'string', minLength: 1, maxLength: 600 },
    } } },
  },
};
export const QUOTE_BUDGET_PROMPT = `MODALITÀ BUDGET PRELIMINARE, NON COMPUTO VERIFICATO. In questo turno non cambiare righe, titolo, quantità confermate o inclusioni: proposals/excludeIds/searches vuoti. In preliminaryBudget puoi proporre intervalli indicativi NETTI IVA ESCLUSA in EUR per capitoli non sovrapposti, separati da qualunque totale verificato. Sono stime dalla conoscenza generale del modello, NON tariffe regionali verificate, offerte di fornitori o costi HR reali. Non inventare fonti, codici, ricerche o conferme. Ogni capitolo dichiara basis, ambito e componenti compresi; indica in assumptions dati di partenza e ipotesi esplicite (mai misure lette con certezza da immagini), in exclusions ciò che resta fuori.
DARE SUBITO UNO SCENARIO UTILE: quando tipo di lavoro e ambito sono sufficientemente chiari (es. bagno completo, sostituzione serramenti o rinnovo appartamento), non aspettare tutte le finiture o tutte le misure per proporre un primo intervallo. Puoi usare un caso di riferimento esplicitamente IPOTETICO, descrivendo dimensioni, fascia di finitura, accessibilità e località assunte in assumptions; quelle ipotesi NON entrano nelle quantità, nella memoria confermata o nel computo. Il budget obiettivo del cliente non prova il prezzo né la fattibilità: non ripartirlo per far tornare esattamente il totale. Se l’IVA del budget non è specificata, puoi comunque mostrare lo scenario NETTO con IVA esclusa e chiedere una sola conferma su questo punto, senza convertire arbitrariamente il budget dichiarato.
Restituisci preliminaryBudget:null solo se non è chiaro quale intervento valutare, se l’utente vieta ipotesi o stime, oppure se nessun intervallo ragionevole è motivabile. Per strutture, bonifiche, progetti complessi e appalti pubblici non inferire dimensionamenti, requisiti o conformità dai soli mq: chiedi il dato/elaborato realmente bloccante, non un questionario. Non dichiarare un prezzo regionale verificato in questa modalità.
Evita doppi conteggi fra fornitura, posa, impianti, smaltimento e margini. I totali sono calcolati dal software, non scriverli nella prosa. Un budget non è un prezzo contrattuale. Non riusare il parziale verificato come prezzo totale del progetto. Chiedi al massimo UNA decisione prioritaria e non ripeterla nel message e in questions. Dopo il primo scenario proponi scelte per correggere le ipotesi, ridurre/estendere l’ambito o passare al computo verificato; una scelta non autorizza inclusioni economiche.`;

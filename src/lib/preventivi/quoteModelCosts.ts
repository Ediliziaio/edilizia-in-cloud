/** Public catalogue audit only: no API key, prompts, images or inference calls. */
export const QUOTE_COST_CATALOGUE_URL = 'https://openrouter.ai/api/v1/models';
export const QUOTE_COST_MODELS = [
  'anthropic/claude-haiku-4.5', 'anthropic/claude-haiku-5.5',
  'anthropic/claude-sonnet-5.5', 'openai/gpt-6.1-sol',
  'openai/gpt-6-luna', 'anthropic/claude-opus-5.5', 'openai/gpt-6-astra',
] as const;
type Rate = { input: number | null; output: number | null };
export type QuoteModelCost = {
  id: string; name: string; base: Rate;
  tiers: Array<Rate & { minInput: number }>;
  imageInput: boolean; structuredOutput: boolean; context: number | null;
  tierPricingKnown: boolean;
};
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
function positiveNumber(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number' || typeof v === 'string' && !v.trim()) return null;
  const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null;
}
function rate(v: unknown): Rate {
  const p = record(v);
  return { input: positiveNumber(p.prompt), output: positiveNumber(p.completion) };
}
export function readQuoteModelCosts(value: unknown): QuoteModelCost[] {
  const data = record(value).data;
  if (!Array.isArray(data) || data.length > 10_000) throw new Error('Catalogo modelli non verificabile.');
  const rows = new Map<string, QuoteModelCost>();
  for (const raw of data) {
    const m = record(raw);
    if (typeof m.id !== 'string' || !QUOTE_COST_MODELS.some(id => id === m.id)) continue;
    if (rows.has(m.id)) throw new Error('Identificativo modello duplicato nel catalogo.');
    const p = record(m.pricing), arch = record(m.architecture);
    const overrides = p.overrides == null ? [] : p.overrides;
    let tierPricingKnown = Array.isArray(overrides) && overrides.length <= 20;
    const tiers: QuoteModelCost['tiers'] = [];
    if (tierPricingKnown) for (const rawTier of overrides as unknown[]) {
      const t = record(rawTier), minInput = positiveNumber(t.min_prompt_tokens);
      const rates = rate(t);
      if (minInput == null || !Number.isSafeInteger(minInput) || !minInput || tiers.some(x => x.minInput === minInput) || rates.input == null || rates.output == null) { tierPricingKnown = false; break; }
      tiers.push({ minInput, ...rates });
    }
    rows.set(m.id, {
      id: m.id, name: typeof m.name === 'string' ? m.name.slice(0, 160) : m.id,
      base: rate(p), tiers: tiers.sort((a, b) => a.minInput - b.minInput), tierPricingKnown,
      imageInput: Array.isArray(arch.input_modalities) && arch.input_modalities.includes('image'),
      structuredOutput: Array.isArray(m.supported_parameters) && m.supported_parameters.includes('structured_outputs'),
      context: positiveNumber(m.context_length),
    });
  }
  return QUOTE_COST_MODELS.flatMap(id => rows.has(id) ? [rows.get(id)!] : []);
}
/** completionTokens includes ALL billed output, including reasoning. Never add it twice. */
export function quoteModelTokenEstimate(model: QuoteModelCost, inputTokens: number, completionTokens: number): number | null {
  if (![inputTokens, completionTokens].every(n => Number.isSafeInteger(n) && n >= 0) || !model.tierPricingKnown) return null;
  if (model.context != null && inputTokens + completionTokens > model.context) return null;
  const tier = [...model.tiers].reverse().find(t => inputTokens >= t.minInput) ?? model.base;
  if (tier.input == null || tier.output == null) return null;
  const usd = inputTokens * tier.input + completionTokens * tier.output;
  return Number.isFinite(usd) ? usd : null;
}
export async function fetchQuoteModelCosts(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<QuoteModelCost[]> {
  // Fixed public destination; no bearer token, cookies, project context or retries.
  const response = await fetcher(QUOTE_COST_CATALOGUE_URL, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), credentials: 'omit', redirect: 'error', cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error('Catalogo pubblico OpenRouter non disponibile. Nessun prezzo assunto.');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 6_000_000) { await reader.cancel(); throw new Error('Catalogo troppo grande.'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return readQuoteModelCosts(JSON.parse(text));
  } finally { reader.releaseLock(); }
}
export function quoteModelCostText(models: QuoteModelCost[]): string {
  const dollars = (n: number | null) => n == null ? 'non disponibile' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 6 })} USD`;
  const profiles = [
    ['Bagno 12 m²', 8_000, 3_000], ['Campo da tennis', 12_000, 5_000], ['Appartamento', 20_000, 6_000],
  ] as const;
  const lines = models.map(m => {
    const scenarios = profiles.map(([label, input, output]) => `${label}: ${dollars(quoteModelTokenEstimate(m, input, output))}`).join(' · ');
    return `**${m.name}**\n${m.id}\nInput / output per milione di token: ${dollars(m.base.input == null ? null : m.base.input * 1_000_000)} / ${dollars(m.base.output == null ? null : m.base.output * 1_000_000)}. Immagini: ${m.imageInput ? 'supportate dal modello' : 'non confermate'}.\n${scenarios}${m.tiers.length ? '\nAttenzione: tariffe diverse oltre le soglie di contesto del catalogo.' : ''}${!m.tierPricingKnown ? '\nScaglioni non verificabili: stima disabilitata.' : ''}`;
  });
  const missing = QUOTE_COST_MODELS.filter(id => !models.some(m => m.id === id));
  return `**Costi OpenRouter · catalogo pubblico appena consultato**\nNon è una chiamata AI e non cambia il modello della chat. Presenza nel catalogo non prova l’accesso del tuo account.\n\n${lines.join('\n\n')}${missing.length ? `\n\nModelli non restituiti: ${missing.join(', ')}. Nessun prezzo inventato.` : ''}\n\n**Simulazioni di costo, non preventivi generati**\nBagno: 8.000 input + 3.000 output; tennis: 12.000 + 5.000; appartamento: 20.000 + 6.000. Sono ipotesi di una singola richiesta, senza cache: output comprensivo del ragionamento. L’immagine va conteggiata nei token input; qui il suo peso reale non è misurato. Una conversazione può richiedere più chiamate e reinviare contesto. Non sono costi totali garantiti.\n\nImporti USD di inferenza, esclusi IVA, cambio, strumenti e commissioni d’acquisto crediti. Standard: 5,5% all’acquisto dei crediti, non su ogni richiesta; Business: 8%. Costo effettivo da verificare nella ricevuta provider, mai dedotto dal solo testo visibile.\n\nFonte tariffe: ${QUOTE_COST_CATALOGUE_URL}\nCommissioni: https://openrouter.ai/pricing\nPer confrontare la qualità servono gli stessi casi e il modello effettivamente restituito: questa lettura dei prezzi non è un benchmark GPT.`;
}

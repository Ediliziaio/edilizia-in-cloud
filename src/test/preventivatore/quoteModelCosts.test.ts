import { describe, expect, it } from 'vitest';
import { fetchQuoteModelCosts, QUOTE_COST_CATALOGUE_URL, quoteModelCostText, quoteModelTokenEstimate, readQuoteModelCosts } from '@/lib/preventivi/quoteModelCosts';

const model = (id = 'anthropic/claude-sonnet-5.5', pricing: unknown = { prompt: '0.000002', completion: '0.00001' }) => ({ id, name: id, pricing, context_length: 1_000_000, architecture: { input_modalities: ['text', 'image'] }, supported_parameters: ['structured_outputs'] });
describe('public quote model cost comparison (never inference)', () => {
  it('uses exact IDs, not substring aliases or Pro/Flex variants', () => {
    const rows = readQuoteModelCosts({ data: [model(), model('anthropic/claude-sonnet-5.5:free'), model('openai/gpt-6.1-sol-pro')] });
    expect(rows).toHaveLength(1); expect(rows[0].imageInput).toBe(true);
  });
  it('rejects duplicate rate entries rather than silently choosing one', () => {
    expect(() => readQuoteModelCosts({ data: [model(), model()] })).toThrow(/duplicato/);
  });
  it('calculates three hypothetical token profiles, not construction prices', () => {
    const m = readQuoteModelCosts({ data: [model()] })[0];
    expect(quoteModelTokenEstimate(m, 8_000, 3_000)).toBeCloseTo(.046);
    expect(quoteModelTokenEstimate(m, 12_000, 5_000)).toBeCloseTo(.074);
    expect(quoteModelTokenEstimate(m, 20_000, 6_000)).toBeCloseTo(.10);
  });
  it.each([null, undefined, '', '  ', 'not-a-price', '-1', Infinity, false])('never treats missing/invalid pricing %s as free', value => {
    const m = readQuoteModelCosts({ data: [model(undefined, { prompt: value, completion: '0.00001' })] })[0];
    expect(quoteModelTokenEstimate(m, 8_000, 3_000)).toBeNull();
  });
  it('accepts an explicitly zero rate', () => {
    const m = readQuoteModelCosts({ data: [model(undefined, { prompt: '0', completion: '0' })] })[0];
    expect(quoteModelTokenEstimate(m, 8_000, 3_000)).toBe(0);
  });
  it('applies whole-request long-context override at its threshold', () => {
    const m = readQuoteModelCosts({ data: [model('openai/gpt-6.1-sol', { prompt: '.000002', completion: '.00001', overrides: [{ min_prompt_tokens: 272_000, prompt: '.000004', completion: '.000015' }] })] })[0];
    expect(quoteModelTokenEstimate(m, 271_999, 2_000)).toBeCloseTo(.563998);
    expect(quoteModelTokenEstimate(m, 272_000, 2_000)).toBeCloseTo(1.118);
  });
  it('fails closed when an override is malformed', () => {
    const m = readQuoteModelCosts({ data: [model(undefined, { prompt: '.000002', completion: '.00001', overrides: [{ min_prompt_tokens: 100_000 }] })] })[0];
    expect(quoteModelTokenEstimate(m, 8_000, 3_000)).toBeNull();
  });
  it.each([[-1, 100], [NaN, 100], [1.5, 100], [10, Infinity], [990_000, 20_000]])('rejects impossible token counts %s/%s', (input, output) => {
    const m = readQuoteModelCosts({ data: [model()] })[0];
    expect(quoteModelTokenEstimate(m, input, output)).toBeNull();
  });
  it('never sends credentials or project data to the public catalogue', async () => {
    const calls: Array<[unknown, RequestInit | undefined]> = [];
    const rows = await fetchQuoteModelCosts(new AbortController().signal, (async (url, init) => { calls.push([url, init]); return new Response(JSON.stringify({ data: [model()] })); }) as typeof fetch);
    expect(rows).toHaveLength(1); expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(QUOTE_COST_CATALOGUE_URL);
    expect(calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
    expect(calls[0][1]?.headers).toBeUndefined(); expect(calls[0][1]?.body).toBeUndefined();
  });
  it('does not retry provider or catalogue failure', async () => {
    let calls = 0;
    await expect(fetchQuoteModelCosts(new AbortController().signal, (async () => { calls++; return new Response('', { status: 503 }); }) as typeof fetch)).rejects.toThrow(/non disponibile/);
    expect(calls).toBe(1);
  });
  it('separates estimate, real usage, credit fees and untested GPT quality', () => {
    const text = quoteModelCostText(readQuoteModelCosts({ data: [model()] }));
    expect(text).toContain('non preventivi generati'); expect(text).toContain('non su ogni richiesta');
    expect(text).toContain('non è un benchmark GPT'); expect(text).toContain('output comprensivo del ragionamento');
    expect(text).toContain('Modelli non restituiti'); expect(text).toContain('peso reale non è misurato');
  });
});

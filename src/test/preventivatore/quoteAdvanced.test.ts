import { describe, expect, it, vi } from 'vitest';
import { readQuoteAdvanced, readPreliminaryQuoteBudget, preliminaryQuoteBudgetTotals, type PreliminaryQuoteBudget } from '../../../supabase/functions/_shared/quoteAdvanced';
import { readQuoteChatRequest, readQuoteChatResult, runQuoteChat, quoteChatResponseFormat, type QuoteChatTurn, type QuoteChatResult } from '../../../supabase/functions/_shared/quoteConversation';
import { quoteBenchmarkCases } from '../../../supabase/functions/_shared/quoteModelBenchmark';
import { readLocalQuoteSnapshot } from '@/lib/preventivi/localQuoteMemory';
const base = () => quoteBenchmarkCases()[0].request;
const advanced = { model: 'anthropic/claude-sonnet-5.5', mode: 'budget' };
const budget: PreliminaryQuoteBudget = { scope: 'Bagno 12 m², ipotesi sintetica', currency: 'EUR', assumptions: ['Scenario di test, non una tariffa regionale'], exclusions: ['IVA e opere strutturali'], groups: [{ label: 'Demolizioni', low: 100.105, high: 200.105, basis: 'Importo sintetico per verificare il software, non un costo reale.' }, { label: 'Impianti', low: 300, high: 500, basis: 'Dati sintetici non riutilizzabili come preventivo.' }] };
const turn = (): QuoteChatTurn => ({ version: 1, title: '', message: 'Budget da verificare', brief: '', questions: [], warnings: [], searches: [], proposals: [], excludeIds: [], choices: [], preliminaryBudget: budget });
describe('Demo2 advanced model, visual and preliminary budget boundaries', () => {
  it.each(['anthropic/claude-sonnet-5.5', 'openai/gpt-6.1-sol'])('accepts exact model %s', model => {
    expect(readQuoteChatRequest({ ...base(), advanced: { ...advanced, model } }).advanced?.model).toBe(model);
    expect(readQuoteChatRequest({ ...base(), modelTest: { model, caseId: 'opposite_room_decisions' } }).modelTest?.model).toBe(model);
  });
  it.each(['openai/gpt-6.1-sol-pro', 'any/model', 'anthropic/claude-haiku-4.5'])('rejects arbitrary advanced override %s', model => {
    expect(() => readQuoteAdvanced({ ...advanced, model })).toThrow();
  });
  it('never combines fixed model fixtures with a real project', () => {
    expect(() => readQuoteChatRequest({ ...base(), advanced, modelTest: { model: advanced.model, caseId: 'opposite_room_decisions' } })).toThrow(/mescolati/);
  });
  it.each(['https://example.com/plan.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,aGVsbG8='])('rejects remote URLs, active formats and false MIME %s', dataUrl => {
    expect(() => readQuoteAdvanced({ ...advanced, vision: { attachmentId: 'a'.repeat(64), page: 1, dataUrl } })).toThrow();
  });
  it('requires vision to match the current attachment and page', () => {
    const vision = { attachmentId: 'a'.repeat(64), page: 1, dataUrl: 'data:image/jpeg;base64,' + btoa('\xff\xd8\xff' + 'x'.repeat(40)) };
    expect(readQuoteAdvanced({ ...advanced, vision }).vision).toEqual(vision);
    expect(() => readQuoteChatRequest({ ...base(), advanced: { ...advanced, vision } })).toThrow(/non coerenti/);
  });
  it('computes money in software with row cent rounding, ignoring model totals', () => {
    expect(preliminaryQuoteBudgetTotals(readPreliminaryQuoteBudget({ ...budget, total: -999 }))).toEqual({ low: 400.11, high: 700.11 });
  });
  it.each([{ groups: [] }, { groups: [{ ...budget.groups[0], low: 0 }] }, { groups: [{ ...budget.groups[0], high: -10 }] }, { groups: [{ ...budget.groups[0], low: NaN }] }, { assumptions: [] }, { currency: 'USD' }])('rejects incomplete or fabricated budget structure', patch => {
    expect(() => readPreliminaryQuoteBudget({ ...budget, ...patch })).toThrow();
  });
  it('budget mode cannot run discovery or change draft lines, even if the provider proposes them', async () => {
    const request = readQuoteChatRequest({ ...base(), advanced });
    const search = vi.fn(); const complete = vi.fn(async () => ({ content: JSON.stringify({ ...turn(), proposals: [{ id: 'injected', title: 'Not authorized', description: '', unit: 'cad', quantity: 1, quantityBasis: 'test', referenceId: null }], searches: ['test'] }), model: advanced.model }));
    const result = await runQuoteChat(request, { complete, search, decode: JSON.parse });
    expect(result.turn.proposals).toEqual([]); expect(result.turn.excludeIds).toEqual([]); expect(result.turn.searches).toEqual([]); expect(search).not.toHaveBeenCalled();
    expect(result.turn.preliminaryBudget).toEqual(readPreliminaryQuoteBudget(budget));
    const schema = quoteChatResponseFormat(request).json_schema.schema;
    expect(schema.required).toContain('preliminaryBudget'); expect(schema.properties.proposals.maxItems).toBe(0); expect(schema.properties.searches.maxItems).toBe(0);
  });
  it('ordinary conversation strips any unrequested AI budget', async () => {
    const result = await runQuoteChat(base(), { complete: async () => ({ content: JSON.stringify(turn()), model: advanced.model }), search: async () => [], decode: JSON.parse });
    expect(result.turn.preliminaryBudget).toBeUndefined();
  });
  it('validates provider cost receipts rather than assuming missing cost zero', () => {
    const response: QuoteChatResult = { version: 1, turnId: base().turnId, revision: 1, model: advanced.model, simulated: false, references: [], turn: turn(), usage: { calls: 1, inputTokens: 1000, outputTokens: 500, costUsd: null, visionUsed: true } };
    expect(readQuoteChatResult(response).usage?.costUsd).toBeNull();
    expect(() => readQuoteChatResult({ ...response, usage: { ...response.usage, costUsd: -1 } })).toThrow();
  });
  it('persists the estimate separately; never imports estimates as line prices or image data', () => {
    const snapshot = readLocalQuoteSnapshot({ version: 1, document: { title: 'Test', revision: 2, lines: [] }, messages: [{ role: 'assistant', text: 'Budget di test', preliminaryBudget: budget, budgetRevision: 2, budgetModel: advanced.model }], input: '', sessionId: base().sessionId, sourceId: null, model: null, preferredModel: advanced.model, budgetFollowUp: true, interrupted: false, plan: null, rooms: [], selectedRoom: null, rectangle: null });
    expect(snapshot.document.lines).toEqual([]); expect(snapshot.messages[0].preliminaryBudget?.groups).toHaveLength(2); expect(snapshot.budgetFollowUp).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('data:image');
  });
  it('keeps a budget even after its original chat message leaves the 50-message window', () => {
    const savedBudget = { preliminaryBudget: budget, budgetRevision: 2, budgetModel: advanced.model };
    const snapshot = readLocalQuoteSnapshot({ version: 1, document: { title: 'Test', revision: 3, lines: [] }, messages: Array.from({ length: 50 }, () => ({ role: 'user', text: 'Altro messaggio' })), savedBudget, input: '', sessionId: base().sessionId, sourceId: null, model: null, interrupted: false, plan: null, rooms: [], selectedRoom: null, rectangle: null });
    expect(snapshot.messages.every(m => !m.preliminaryBudget)).toBe(true); expect(snapshot.savedBudget).toEqual(savedBudget);
    expect(snapshot.savedBudget?.budgetRevision).not.toBe(snapshot.document.revision); // remains visible but stale
  });
});

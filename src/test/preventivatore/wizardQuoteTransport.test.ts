import { describe, expect, it, vi } from 'vitest';
import { createWizardQuoteChatTransport } from '@/lib/preventivi/wizardQuoteTransport';
import type { QuoteChatRequest, QuoteChatResult } from '../../../supabase/functions/_shared/quoteConversation';

const demoId = 'd2000000-0000-4000-a000-000000000002';
const tenantId = 'b2000000-0000-4000-a000-000000000002';
const request = (companyId: string): QuoteChatRequest => ({ version: 1, companyId, sessionId: tenantId, turnId: tenantId,
  revision: 0, sourceId: null, lines: [], messages: [{ role: 'user', text: 'Chiedimi quali opere desidero' }] });
const result: QuoteChatResult = { version: 1, turnId: tenantId, revision: 0, model: 'test', simulated: false, references: [],
  turn: { version: 1, title: '', message: 'Quali opere?', proposals: [], questions: [], searches: [], warnings: [] } };
const setup = () => ({ companyId: tenantId, dev: false, hostname: 'app.example', productionEnabled: 'true' as unknown,
  backendUrl: 'https://configured-backend.example', localEndpoint: 'http://127.0.0.1:8081/functions/v1/ai-preventivo-conversazione',
  getToken: vi.fn(async () => 'synthetic-jwt'), publishableKey: 'synthetic-publishable',
  fetch: vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(result))) });
const signal = () => new AbortController().signal;

describe('Wizard network routing independent from the local simulation', () => {
  it.each([undefined, false, true, 'false', 'TRUE', '1'])('keeps production off without the exact rollout flag: %s', async productionEnabled => {
    const options = { ...setup(), productionEnabled };
    await expect(createWizardQuoteChatTransport(options)(request(tenantId), signal())).rejects.toThrow('non ancora abilitata');
    expect(options.getToken).not.toHaveBeenCalled(); expect(options.fetch).not.toHaveBeenCalled();
  });
  it.each([
    [false, 'app.example', tenantId], [true, 'localhost', tenantId], [false, 'app.example', demoId],
  ])('routes an explicitly enabled wizard to its configured backend (dev %s, host %s)', async (dev, hostname, companyId) => {
    const options = { ...setup(), dev, hostname, companyId };
    expect(await createWizardQuoteChatTransport(options)(request(companyId), signal())).toEqual(result);
    expect(options.fetch.mock.calls[0][0]).toBe('https://configured-backend.example/functions/v1/ai-preventivo-conversazione');
    expect(options.fetch).toHaveBeenCalledOnce();
  });
  it('keeps the existing local demo on the explicit proxy even when production is enabled', async () => {
    const options = { ...setup(), dev: true, hostname: 'localhost', companyId: demoId };
    await createWizardQuoteChatTransport(options)(request(demoId), signal());
    expect(options.fetch.mock.calls[0][0]).toBe(options.localEndpoint);
    expect(options.fetch).toHaveBeenCalledOnce();
  });
  it('never falls back from a failed local proxy to production', async () => {
    const options = { ...setup(), dev: true, hostname: 'localhost', companyId: demoId };
    options.fetch.mockRejectedValue(new Error('Proxy unavailable'));
    await expect(createWizardQuoteChatTransport(options)(request(demoId), signal())).rejects.toThrow('Proxy unavailable');
    expect(options.fetch).toHaveBeenCalledOnce(); expect(options.fetch.mock.calls[0][0]).toBe(options.localEndpoint);
  });
  it('does not use the local endpoint as a production destination', async () => {
    const options = { ...setup(), localEndpoint: 'https://untrusted.example/functions/v1/ai-preventivo-conversazione' };
    await createWizardQuoteChatTransport(options)(request(tenantId), signal());
    expect(options.fetch.mock.calls[0][0]).toBe('https://configured-backend.example/functions/v1/ai-preventivo-conversazione');
  });
  it('blocks another tenant before token lookup or network', async () => {
    const options = setup();
    await expect(createWizardQuoteChatTransport(options)(request(demoId), signal())).rejects.toThrow('Azienda');
    expect(options.getToken).not.toHaveBeenCalled(); expect(options.fetch).not.toHaveBeenCalled();
  });
});

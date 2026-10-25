import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQuoteCadReader } from '@/lib/preventivi/quoteCadTransport';
const companyId = 'a1000000-0000-4000-a000-000000000001';
const file = { size: 6, name: 'test.dwg', slice: () => ({ arrayBuffer: async () => new TextEncoder().encode('AC1032').buffer }) } as unknown as File;
const setup = () => ({ companyId, dev: false, hostname: 'app.example', enabled: 'true', endpoint: 'https://cad.example/v1/read', getToken: vi.fn(async () => 'synthetic-jwt') });
afterEach(() => vi.unstubAllGlobals());
describe('Trasporto CAD di produzione opt-in', () => {
  it.each([undefined, true, false, 'false', '1'])('resta spento senza il flag esatto: %s', async enabled => {
    const options = { ...setup(), enabled }; const call = vi.fn(); vi.stubGlobal('fetch', call);
    await expect(createQuoteCadReader(options)(file, new AbortController().signal)).rejects.toThrow('non ancora attiva'); expect(call).not.toHaveBeenCalled(); expect(options.getToken).not.toHaveBeenCalled();
  });
  it.each(['http://cad.example/v1/read', 'https://u:p@cad.example/v1/read', 'https://cad.example/v1/read?key=x', 'https://cad.example/other'])('rifiuta URL non ammessi: %s', async endpoint => {
    const options = { ...setup(), endpoint }; await expect(createQuoteCadReader(options)(file, new AbortController().signal)).rejects.toThrow('Configurazione'); expect(options.getToken).not.toHaveBeenCalled();
  });
  it('non invia il file senza sessione o se annullato durante il recupero', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call); const options = setup();
    await expect(createQuoteCadReader({ ...options, getToken: async () => null })(file, new AbortController().signal)).rejects.toThrow('Accedi');
    const ctrl = new AbortController(); await expect(createQuoteCadReader({ ...options, getToken: async () => { ctrl.abort(); return 'jwt'; } })(file, ctrl.signal)).rejects.toThrow(); expect(call).not.toHaveBeenCalled();
  });
  it('invia il file solo al convertitore configurato, con sessione e contesto aziendale', async () => {
    const call = vi.fn(async (_url: string, options: RequestInit) => { const h = options.headers as Record<string, string>; return new Response(JSON.stringify({ companyId, requestId: h['X-Quote-Cad-Request'], reading: { version: 1, engine: 'LibreDWG', id: 'c'.repeat(64), name: 'test.dwg', size: 6, units: null, entities: 1, inserts: 0, dimensions: 0, layers: [], texts: [], totalTexts: 0, omittedTexts: 0, partial: false, mixedStates: false, pdfImported: false, externalReferences: 0, processedBy: 'service' } })); });
    vi.stubGlobal('fetch', call); await createQuoteCadReader(setup())(file, new AbortController().signal);
    expect(call).toHaveBeenCalledOnce(); expect(call.mock.calls[0]).toMatchObject(['https://cad.example/v1/read', { redirect: 'error', credentials: 'omit', body: file, headers: { Authorization: 'Bearer synthetic-jwt', 'X-Quote-Company': companyId, 'X-Quote-File-Size': '6' } }]);
  });
});

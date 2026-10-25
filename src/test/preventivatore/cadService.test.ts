import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createCadHandler } from '../../../services/cad/handler.mts';
import { createCadAuthorizer, CadAccessError } from '../../../services/cad/authorization.mts';
import { readQuoteCadAccess } from '../../../supabase/functions/_shared/quoteCadAccess';
import type { QuoteCadReading } from '@/lib/preventivi/quoteCad';
const companyId = 'a1000000-0000-4000-a000-000000000001', requestId = 'a1000000-0000-4000-a000-000000000002', userId = 'a1000000-0000-4000-a000-000000000003';
const grant = { companyId, requestId, userId };
const reading: QuoteCadReading = { version: 1, id: 'c'.repeat(64), name: 'test.dwg', size: 6, engine: 'LibreDWG', units: null, entities: 1, inserts: 0, dimensions: 0, layers: [], texts: [], totalTexts: 0, omittedTexts: 0, partial: false, mixedStates: false, pdfImported: false, externalReferences: 0 };
function pair(headers: Record<string, string> = {}, method = 'POST') {
  const req = Object.assign(Readable.from([Buffer.from('AC1032')]), { url: '/v1/read', method, headers: { origin: 'https://app.example', authorization: 'Bearer synthetic-jwt-long', 'x-quote-company': companyId, 'x-quote-cad-request': requestId, 'x-quote-file-size': '6', 'content-type': 'application/octet-stream', ...headers } }) as unknown as IncomingMessage;
  const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, statusCode: 0, body: '', headers: new Map<string, string>(), setHeader(k: string, v: string) { this.headers.set(k, v); }, end(text = '') { this.body = text; this.writableEnded = true; } });
  return { req, res, response: res as unknown as ServerResponse };
}
const setup = () => ({ origins: ['https://app.example'], authorize: vi.fn(async () => grant), convert: vi.fn(async () => reading) });
describe('Servizio CAD separato: accesso prima del file', () => {
  it.each([['origin', 'https://other.example'], ['x-quote-company', 'other'], ['x-quote-file-size', '999999999'], ['content-type', 'text/plain']])('blocca %s=%s prima della conversione', async (key, value) => {
    const deps = setup(), p = pair({ [key]: value }); await createCadHandler(deps)(p.req, p.response);
    expect(p.res.statusCode).toBeGreaterThanOrEqual(400); expect(deps.authorize).not.toHaveBeenCalled(); expect(deps.convert).not.toHaveBeenCalled();
  });
  it.each([401, 402, 403, 429])('rifiuta l’accesso %s senza leggere o addebitare AI', async status => {
    const deps = setup(); deps.authorize.mockRejectedValue(new CadAccessError(status)); const p = pair(); await createCadHandler(deps)(p.req, p.response);
    expect(p.res.statusCode).toBe(status); expect(deps.convert).not.toHaveBeenCalled(); expect(p.res.body).not.toContain('synthetic-jwt');
  });
  it('restituisce la stessa azienda e richiesta, dichiarando il trattamento server', async () => {
    const deps = setup(), p = pair(); await createCadHandler(deps)(p.req, p.response);
    expect(p.res.statusCode).toBe(200); expect(JSON.parse(p.res.body)).toMatchObject({ companyId, requestId, reading: { processedBy: 'service' } });
    expect(deps.authorize.mock.invocationCallOrder[0]).toBeLessThan(deps.convert.mock.invocationCallOrder[0]);
  });
  it('impedisce il cambio azienda nella risposta di autorizzazione', async () => {
    const deps = setup(); deps.authorize.mockResolvedValue({ ...grant, companyId: userId }); const p = pair(); await createCadHandler(deps)(p.req, p.response);
    expect(p.res.statusCode).toBe(403); expect(deps.convert).not.toHaveBeenCalled();
  });
  it('limita le conversioni per coppia azienda/utente e recupera dopo la finestra', async () => {
    let now = 1000; const deps = { ...setup(), now: () => now }; const handle = createCadHandler(deps);
    for (let i = 0; i < 3; i++) { const p = pair(); await handle(p.req, p.response); expect(p.res.statusCode).toBe(200); }
    const limited = pair(); await handle(limited.req, limited.response); expect(limited.res.statusCode).toBe(429); expect(deps.convert).toHaveBeenCalledTimes(3);
    now += 300001; const next = pair(); await handle(next.req, next.response); expect(next.res.statusCode).toBe(200);
  });
  it('limita a una conversione concorrente, senza coda illimitata', async () => {
    let resolve!: (value: typeof grant) => void;
    const deps = setup(); deps.authorize.mockImplementation(() => new Promise(r => { resolve = r; }));
    const handle = createCadHandler(deps), first = pair(), pending = handle(first.req, first.response), second = pair();
    await handle(second.req, second.response); expect(second.res.statusCode).toBe(429); resolve(grant); await pending; expect(first.res.statusCode).toBe(200);
  });
  it('rifiuta una dimensione diversa da quella dichiarata e libera il worker', async () => {
    const deps = setup(); deps.convert.mockResolvedValueOnce({ ...reading, size: 7 }); const handle = createCadHandler(deps), p = pair(); await handle(p.req, p.response); expect(p.res.statusCode).toBe(503);
    const next = pair(); await handle(next.req, next.response); expect(next.res.statusCode).toBe(200);
  });
});
describe('Autorizzazione CAD sul backend esistente', () => {
  it('usa solo l’endpoint fisso e la sessione verificabile, senza provider AI', async () => {
    const call = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...grant, allowed: true, maxBytes: 64 * 1024 * 1024 })));
    expect(await createCadAuthorizer('https://backend.example', 'publishable', call)('Bearer synthetic-jwt-long', companyId, requestId, 6, new AbortController().signal)).toEqual(grant);
    expect(call.mock.calls[0]).toMatchObject(['https://backend.example/functions/v1/ai-preventivo-conversazione/cad-access', { redirect: 'error', credentials: 'omit', headers: { apikey: 'publishable' } }]);
  });
  it.each(['http://remote.example', 'https://user:password@backend.example', 'https://backend.example/?key=x', 'https://backend.example/other'])('non accetta un upstream arbitrario: %s', url => {
    expect(() => createCadAuthorizer(url, 'publishable', vi.fn())).toThrow();
  });
  it('non si fida di un grant per un altro file o utente mancante', async () => {
    const call = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...grant, requestId: userId, allowed: true, maxBytes: 64 * 1024 * 1024 })));
    await expect(createCadAuthorizer('https://backend.example', 'publishable', call)('Bearer synthetic-jwt-long', companyId, requestId, 6, new AbortController().signal)).rejects.toThrow();
  });
  it('valida metadati ridotti, non accetta file o URL esterni nel gate', () => {
    const request = { companyId, requestId, fileSize: 6 }; expect(readQuoteCadAccess(request)).toEqual(request);
    for (const patch of [{ fileSize: 0 }, { fileSize: 70_000_000 }, { url: 'https://attacker.example/file' }, { data: 'AC1032' }]) expect(() => readQuoteCadAccess({ ...request, ...patch })).toThrow();
  });
});

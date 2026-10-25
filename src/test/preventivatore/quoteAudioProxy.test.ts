import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';
import { localQuoteChatProxy } from '../../../dev/preventivatore-ai/chatProxyPlugin.mts';
describe('Proxy Demo2: subroute audio senza ampliare le destinazioni', () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => { vi.stubGlobal('fetch', fetcher); vi.stubEnv('QUOTE_CHAT_LOCAL_UPSTREAM', ''); fetcher.mockReset(); fetcher.mockImplementation(async () => new Response('{}', { status: 200 })); });
  afterEach(() => vi.unstubAllEnvs());
  const call = async (path: string, value: unknown = { companyId: 'd2000000-0000-4000-a000-000000000002' }, origin = 'http://127.0.0.1:8081') => {
    let handle!: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
    const plugin = localQuoteChatProxy({ allowDemoRemote: true });
    const configure = plugin.configureServer as (server: ViteDevServer) => void;
    configure({ middlewares: { use: (_route: string, handler: typeof handle) => { handle = handler; } } } as ViteDevServer);
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(value))]), { url: path, method: 'POST', headers: { host: '127.0.0.1:8081', origin, authorization: 'Bearer user-test-session', apikey: 'public-test-key' }, socket: { remoteAddress: '127.0.0.1' } });
    const res = Object.assign(new EventEmitter(), { statusCode: 0, writableEnded: false, destroyed: false, setHeader: vi.fn(), end: vi.fn() });
    await handle(req as unknown as IncomingMessage, res as unknown as ServerResponse); return res.statusCode;
  };
  it('inoltra soltanto /audio allo stesso endpoint approvato', async () => { expect(await call('/audio')).toBe(200); expect(String(fetcher.mock.calls[0][0])).toBe('https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/ai-preventivo-conversazione/audio'); });
  it('la conversazione normale conserva la destinazione precedente', async () => { expect(await call('/')).toBe(200); expect(String(fetcher.mock.calls[0][0])).not.toContain('/audio'); });
  it('rifiuta subroute arbitrarie, altra azienda e origine estranea', async () => { expect(await call('/other')).toBe(404); expect(await call('/audio', { companyId: 'another-company' })).toBe(403); expect(await call('/audio', undefined, 'https://example.com')).toBe(403); expect(fetcher).not.toHaveBeenCalled(); });
  it('l’audio ha un tetto distinto dalla conversazione', async () => { expect(await call('/', { companyId: 'd2000000-0000-4000-a000-000000000002', padding: 'a'.repeat(650_000) })).toBe(413); expect(await call('/audio', { companyId: 'd2000000-0000-4000-a000-000000000002', padding: 'a'.repeat(650_000) })).toBe(200); expect(await call('/audio', { companyId: 'd2000000-0000-4000-a000-000000000002', padding: 'a'.repeat(2_850_000) })).toBe(413); expect(fetcher).toHaveBeenCalledOnce(); });
});

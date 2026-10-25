/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CAD_MAX_BYTES, readQuoteCad, type QuoteCadReading } from '../../src/lib/preventivi/quoteCad.ts';
import { readQuoteCadAccess } from '../../supabase/functions/_shared/quoteCadAccess.ts';
import { CadAccessError, type CadGrant } from './authorization.mts';
type Dependencies = {
  origins: string[];
  authorize: (authorization: string, companyId: string, requestId: string, size: number, signal: AbortSignal) => Promise<CadGrant>;
  convert: (stream: AsyncIterable<Uint8Array>, name: string, signal: AbortSignal) => Promise<QuoteCadReading>;
  now?: () => number;
};
/** Single-worker admission. No unbounded queue, persistent originals or logs.
 * Multi-replica rollout requires a shared quota/queue, not duplicated maps. */
export function createCadHandler(deps: Dependencies) {
  const origins = new Set(deps.origins.map(s => { const u = new URL(s); if (u.origin !== s || u.protocol !== 'https:') throw new Error('Explicit HTTPS app origin required'); return s; }));
  if (!origins.size) throw new Error('CAD origins missing');
  const quota = new Map<string, { end: number; count: number }>();
  let active = false;
  let admission = { end: 0, count: 0 };
  let abortActive: (() => void) | undefined;
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    const reply = (status: number, value?: unknown) => { if (res.destroyed) return; res.statusCode = status; res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Type', 'application/json'); res.end(value === undefined ? undefined : JSON.stringify(value)); };
    if (req.url === '/health' && req.method === 'GET') return reply(200, { service: 'quote-cad', ready: true });
    if (!origin || !origins.has(origin)) return reply(403, { error: 'Origine non consentita.' });
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    if (req.url !== '/v1/read') return reply(404);
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Quote-Company, X-Quote-Cad-Request, X-Quote-File-Name, X-Quote-File-Size'); return reply(204); }
    if (req.method !== 'POST') return reply(405);
    if (req.headers['content-type'] !== 'application/octet-stream') return reply(415);
    let scope;
    try {
      scope = readQuoteCadAccess({ companyId: req.headers['x-quote-company'], requestId: req.headers['x-quote-cad-request'], fileSize: Number(req.headers['x-quote-file-size'] ?? req.headers['content-length']) });
      if (req.headers['content-length'] !== undefined && Number(req.headers['content-length']) !== scope.fileSize) throw new Error('length');
    }
    catch { return reply(413, { error: 'DWG vuoto o oltre 64 MB.' }); }
    if (active) return reply(429, { error: 'Convertitore occupato. Riprova più tardi.' });
    const now = (deps.now ?? Date.now)();
    if (admission.end <= now) admission = { end: now + 60_000, count: 0 };
    if (++admission.count > 60) return reply(429, { error: 'Troppe richieste al convertitore.' });
    active = true;
    const controller = new AbortController(), closed = () => { if (!res.writableEnded) controller.abort(); };
    abortActive = () => { controller.abort(); req.destroy(); };
    const timer = setTimeout(() => { controller.abort(); req.destroy(); }, 240_000); res.on('close', closed);
    try {
      const grant = await deps.authorize(req.headers.authorization ?? '', scope.companyId, scope.requestId, scope.fileSize, controller.signal);
      // Also constrain injected adapters; an authorization response cannot
      // retarget the uploaded document to another tenant or request.
      if (grant.companyId !== scope.companyId || grant.requestId !== scope.requestId) throw new CadAccessError(403);
      const now = (deps.now ?? Date.now)();
      for (const [key, value] of quota) if (value.end <= now) quota.delete(key);
      const key = `${grant.companyId}:${grant.userId}`, current = quota.get(key) ?? { end: now + 5 * 60_000, count: 0 };
      if (current.count >= 3 || quota.size >= 1000 && !quota.has(key)) return reply(429, { error: 'Limite temporaneo di conversione raggiunto.' });
      current.count++; quota.set(key, current);
      let name = 'disegno.dwg'; try { name = decodeURIComponent(String(req.headers['x-quote-file-name'] ?? name)); } catch { /* neutral name */ }
      const reading = readQuoteCad(await deps.convert(req, name, controller.signal));
      controller.signal.throwIfAborted();
      if (reading.size !== scope.fileSize || reading.size > CAD_MAX_BYTES) throw new Error('CAD body length mismatch');
      reply(200, { companyId: grant.companyId, requestId: grant.requestId, reading: { ...reading, processedBy: 'service' } });
    } catch (e) { reply(e instanceof CadAccessError ? e.status : 503, { error: 'Lettura CAD non disponibile o non autorizzata. Nessuna chiamata AI eseguita.' }); }
    finally { clearTimeout(timer); res.off('close', closed); active = false; abortActive = undefined; }
  };
  return Object.assign(handle, { stop: () => abortActive?.() });
}

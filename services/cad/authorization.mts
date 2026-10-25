export type CadGrant = { companyId: string; requestId: string; userId: string };
export class CadAccessError extends Error { status: number; constructor(status: number) { super('CAD access denied'); this.status = status; } }
/** Delegate to the application's existing membership, role and payment gates.
 * No service_role, JWT decoding shortcuts or client-supplied upstream URLs. */
export function createCadAuthorizer(backend: string, publishableKey: string, call: typeof fetch = fetch) {
  const url = new URL(backend);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname) || !publishableKey || /[\r\n]/.test(publishableKey)) throw new Error('CAD backend configuration invalid');
  url.pathname = '/functions/v1/ai-preventivo-conversazione/cad-access';
  return async (authorization: string, companyId: string, requestId: string, fileSize: number, signal: AbortSignal): Promise<CadGrant> => {
    if (!/^Bearer [^\s]{10,8192}$/.test(authorization)) throw new CadAccessError(401);
    const response = await call(url.href, { method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), redirect: 'error', credentials: 'omit',
      headers: { Authorization: authorization, apikey: publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, requestId, fileSize }) });
    if (!response.ok) { await response.body?.cancel(); throw new CadAccessError([401, 402, 403, 429].includes(response.status) ? response.status : 503); }
    const reader = response.body?.getReader(); if (!reader) throw new CadAccessError(503);
    let text = '', bytes = 0; const decoder = new TextDecoder();
    try { while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 16_000) { await reader.cancel(); throw new CadAccessError(503); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); }
    finally { reader.releaseLock(); }
    const r = JSON.parse(text);
    if (r.allowed !== true || r.companyId !== companyId || r.requestId !== requestId || typeof r.userId !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(r.userId) || r.maxBytes !== 64 * 1024 * 1024) throw new CadAccessError(403);
    signal.throwIfAborted(); return { companyId, requestId, userId: r.userId };
  };
}

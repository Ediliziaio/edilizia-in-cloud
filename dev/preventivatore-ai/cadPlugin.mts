import type { Plugin } from 'vite';
import { localPlanRequestAllowed } from './planOcrPlugin.mts';
import { CAD_MAX_BYTES } from '../../src/lib/preventivi/quoteCad.ts';
import { convertCad } from '../../services/cad/converter.mts';
/** Loopback-only prototype; production uses the authenticated dedicated service. */
export function localCadPlugin(): Plugin {
  let active = false;
  return { name: 'local-private-cad', apply: 'serve', configureServer(server) {
    server.middlewares.use('/__quote-lab/cad', async (req, res) => {
      const reply = (status: number, value: unknown) => { if (res.destroyed) return; res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(value)); };
      if (!localPlanRequestAllowed(req)) return reply(403, { error: 'Conversione solo dalla pagina locale.' });
      if (req.method !== 'POST') return reply(405, { error: 'Usa POST.' });
      const companyId = req.headers['x-quote-company'], requestId = req.headers['x-quote-cad-request'];
      const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
      if (typeof companyId !== 'string' || !uuid.test(companyId) || typeof requestId !== 'string' || !uuid.test(requestId)) return reply(400, { error: 'Azienda o richiesta CAD non valida.' });
      if (req.headers['content-type'] !== 'application/octet-stream') return reply(415, { error: 'Formato richiesta non valido.' });
      if (Number(req.headers['content-length'] ?? 0) > CAD_MAX_BYTES) return reply(413, { error: 'DWG oltre 64 MB.' });
      if (active) return reply(429, { error: 'Conversione già in corso.' });
      active = true;
      const ctrl = new AbortController(), timer = setTimeout(() => { ctrl.abort(); req.destroy(); }, 240_000);
      const close = () => { if (!res.writableEnded) ctrl.abort(); }; res.on('close', close);
      try {
        let name = 'disegno.dwg'; try { name = decodeURIComponent(String(req.headers['x-quote-file-name'] ?? name)); } catch { /* neutral name */ }
        const reading = await convertCad(req, name, ctrl.signal);
        ctrl.signal.throwIfAborted(); reply(200, { companyId, requestId, reading });
      } catch (e) {
        reply((e as NodeJS.ErrnoException).code === 'ENOENT' ? 503 : 422, { error: 'Conversione CAD non disponibile, non riuscita o oltre i limiti. Nessun invio AI.' });
      } finally { clearTimeout(timer); res.off('close', close); active = false; }
    });
  } };
}

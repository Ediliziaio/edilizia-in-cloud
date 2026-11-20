import type { IncomingMessage, ServerResponse } from 'node:http';
import { localPlanRequestAllowed } from './planOcrPlugin.mts';
import { convertDwgToDxf } from '../../services/cad/dxfConverter.mts';
import { MAX_DWG_BYTE, UUID_CAD } from '../../src/lib/distinta/cad/protocolloDwg.ts';

export function createLocalDxfHandler(lease: { acquire: () => boolean; release: () => void }, convert = convertDwgToDxf) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const reply = (status: number, error: string) => {
      if (res.destroyed) return;
      res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify({ error }));
    };
    if (!localPlanRequestAllowed(req)) return reply(403, 'Conversione disponibile solo dalla pagina locale.');
    if (req.method !== 'POST') return reply(405, 'Usa POST.');
    const company = req.headers['x-eic-cad-company'], request = req.headers['x-eic-cad-request'];
    const size = Number(req.headers['x-eic-cad-size']);
    if (typeof company !== 'string' || !UUID_CAD.test(company) || typeof request !== 'string' || !UUID_CAD.test(request)) return reply(400, 'Azienda o richiesta CAD non valida.');
    if (req.headers['content-type'] !== 'application/octet-stream') return reply(415, 'Formato richiesta non valido.');
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_DWG_BYTE || Number(req.headers['content-length'] ?? size) !== size) return reply(413, 'DWG vuoto, oltre 64 MB o dimensione non valida.');
    if (!lease.acquire()) return reply(429, 'È già in corso una conversione CAD.');
    const ctrl = new AbortController();
    const timer = setTimeout(() => { ctrl.abort(); req.destroy(); }, 240_000);
    const close = () => { if (!res.writableEnded) ctrl.abort(); }; res.on('close', close);
    try {
      const result = await convert(req, ctrl.signal);
      ctrl.signal.throwIfAborted();
      if (result.dimensioneOriginale !== size) return reply(422, 'Il DWG ricevuto è incompleto.');
      res.statusCode = 200; res.setHeader('Content-Type', 'application/dxf'); res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', result.bytes.length); res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Eic-Cad-Company', company); res.setHeader('X-Eic-Cad-Request', request);
      res.setHeader('X-Eic-Cad-Input-Size', size); res.setHeader('X-Eic-Cad-Sha256', result.sha256Originale);
      res.setHeader('X-Eic-Cad-Engine', result.motore); res.setHeader('X-Eic-Cad-Warnings', result.segnalazioni ? '1' : '0');
      res.end(result.bytes);
    } catch (e) {
      if (!ctrl.signal.aborted) reply((e as NodeJS.ErrnoException).code === 'ENOENT' ? 503 : 422,
        (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'Motore DWG locale non disponibile.' : 'DWG non convertito: file non supportato, incompleto o oltre i limiti. Nessuna chiamata AI.');
    } finally { clearTimeout(timer); res.off('close', close); lease.release(); }
  };
}

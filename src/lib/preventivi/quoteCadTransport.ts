import { postQuoteCad, readCadLocally, type QuoteCadReading } from './quoteCad';
export type QuoteCadReader = (file: File, signal: AbortSignal) => Promise<QuoteCadReading>;
/** Captures the wizard's company and identity getter, never a company from the file. */
export function createQuoteCadReader(options: { companyId: string; dev: boolean; hostname: string; enabled: unknown; endpoint: unknown; getToken: () => Promise<string | null> }): QuoteCadReader {
  if (options.dev && ['localhost', '127.0.0.1', '[::1]'].includes(options.hostname)) return (file, signal) => readCadLocally(file, options.companyId, signal);
  return async (file, signal) => {
    if (options.enabled !== 'true' || typeof options.endpoint !== 'string') throw new Error('Conversione DWG non ancora attiva. La bozza è conservata.');
    let url: URL;
    try { url = new URL(options.endpoint); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/v1/read') throw new Error(); }
    catch { throw new Error('Configurazione del convertitore DWG non valida.'); }
    signal.throwIfAborted(); const token = await options.getToken(); signal.throwIfAborted();
    if (!token) throw new Error('Accedi nuovamente prima di inviare il disegno al convertitore.');
    const reading = await postQuoteCad(file, options.companyId, signal, url.href, { Authorization: `Bearer ${token}` });
    if (reading.processedBy !== 'service') throw new Error('Provenienza della conversione non verificabile.');
    return reading;
  };
}

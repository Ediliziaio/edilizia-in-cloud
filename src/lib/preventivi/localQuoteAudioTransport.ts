import { readQuoteAudioRequest, readQuoteAudioResult, QUOTE_AUDIO_MAX_BYTES } from '../../../supabase/functions/_shared/quoteAudio';
import { configuredQuoteEndpoint, quoteResponseText } from './quoteTransportEndpoint';
/** Audio uses the same authenticated loopback proxy, never a provider key in the app. */
export function createLocalQuoteAudioTransport(options: { endpoint: string; companyId: string; getToken: () => Promise<string | null>; publishableKey: string; fetch?: typeof fetch }) {
  const url = new URL(options.endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/functions/v1/ai-preventivo-conversazione' || options.companyId !== 'd2000000-0000-4000-a000-000000000002') throw new Error('Trascrizione riservata alla demo locale.');
  return audioTransport(url, options);
}

export function createQuoteAudioTransport(options: {backendUrl: string; companyId: string; getToken: () => Promise<string|null>; publishableKey:string; fetch?: typeof fetch}) {
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(options.companyId)) throw new Error('Azienda audio non valida.');
  return audioTransport(configuredQuoteEndpoint(options.backendUrl), options);
}

function audioTransport(url: URL, options: {companyId:string; getToken:()=>Promise<string|null>; publishableKey:string; fetch?:typeof fetch}) {
  url.pathname += '/audio';
  const sessionId = crypto.randomUUID();
  const cache = new WeakMap<Blob, Promise<string>>();
  return (blob: Blob, signal: AbortSignal): Promise<string> => {
    signal.throwIfAborted();
    const cached = cache.get(blob); if (cached) return cached;
    const operation = (async () => {
      const type = blob.type.split(';')[0].toLowerCase();
      const mime = type === 'audio/x-wav' || type === 'audio/wave' ? 'audio/wav' : type === 'audio/x-m4a' ? 'audio/mp4' : type;
      if (!blob.size || blob.size > QUOTE_AUDIO_MAX_BYTES) throw new Error('Audio vuoto o oltre 2 MB. Registra un messaggio più breve.');
      const bytes = new Uint8Array(await blob.arrayBuffer()); signal.throwIfAborted();
      let binary = ''; for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
      const request = readQuoteAudioRequest({ version: 1, companyId: options.companyId, sessionId, turnId: crypto.randomUUID(), audio: { mime, base64: btoa(binary) } });
      const token = await options.getToken(); signal.throwIfAborted();
      if (!token) throw new Error('Accedi nuovamente prima di trascrivere. Nessun audio inviato.');
      const ctrl = new AbortController(); const abort = () => ctrl.abort(signal.reason); signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(() => ctrl.abort(), 80_000);
      try {
        const response = await (options.fetch ?? fetch)(url.href, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: options.publishableKey }, body: JSON.stringify(request), signal: ctrl.signal });
        if (!response.ok) throw new Error(response.status === 503 ? 'Trascrizione non configurata sul server. La registrazione resta disponibile.' : response.status === 401 ? 'Sessione scaduta: accedi nuovamente.' : response.status === 402 ? 'I crediti AI dell’azienda o il metodo di pagamento sono da verificare: nessun audio trascritto e nessun addebito. La registrazione resta disponibile.'
 : response.status === 429 ? 'Troppe trascrizioni ravvicinate. Attendi qualche istante: la registrazione resta disponibile e nessun addebito è stato fatto.' : response.status === 409 ? 'Questa registrazione è già stata elaborata o il suo esito è incerto. Non ripeto la chiamata: recupera il testo ricevuto oppure registra un nuovo audio.' : `Trascrizione non completata (${response.status}). Nessun nuovo tentativo automatico: la registrazione resta disponibile.`);
        const text = await quoteResponseText(response, 25000, ctrl.signal); ctrl.signal.throwIfAborted();
        if (text.length > 25000) throw new Error('Risposta audio troppo grande.');
        const result = readQuoteAudioResult(JSON.parse(text));
        if (result.turnId !== request.turnId) throw new Error('Trascrizione non riferita alla registrazione corrente.');
        return result.text;
      } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
    })();
    // Retain both successful and uncertain outcomes: do not silently retry a paid recording.
    cache.set(blob, operation); return operation;
  };
}

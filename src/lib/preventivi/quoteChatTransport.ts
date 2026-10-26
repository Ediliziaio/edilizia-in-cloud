import { readQuoteChatRequest, readQuoteChatResult } from '../../../supabase/functions/_shared/quoteConversation';
import { publicQuoteFailure, type QuoteFailureCode } from '../../../supabase/functions/_shared/quoteFailure';
import type { QuoteChatTransport } from './quoteChatDocument';
import { configuredQuoteEndpoint, quoteResponseText } from './quoteTransportEndpoint';
import { readQuoteStream } from './quoteStream';
import { segnalaBloccoDaRisposta } from '../creditoEsaurito';

export type QuoteChatTransportOptions = {
  backendUrl: string; companyId: string;
  getToken: () => Promise<string | null>; publishableKey: string;
  fetch?: typeof fetch; unavailableMessage?: string;
};

const knownFailures: QuoteFailureCode[] = ['AI_COMPANY_CREDIT', 'AI_BILLING_UNAVAILABLE', 'AI_PROVIDER_CREDIT', 'AI_REQUEST_UNCERTAIN', 'AI_TIMEOUT', 'AI_TURN_LIMIT'];
async function responseFailure(response: Response, signal: AbortSignal, unavailable?: string): Promise<Error> {
  let code: unknown;
  try {
    const body: unknown = JSON.parse(await quoteResponseText(response, 16_000, signal));
    code = (body as { code?: unknown })?.code;
    // Questo trasporto non passa dal client Supabase: la finestra di ricarica la apriamo noi, come per ogni altra funzione.
    if (response.status === 402) segnalaBloccoDaRisposta(402, body);
  }
  catch { signal.throwIfAborted(); /* Never display arbitrary server/provider prose. */ }
  if (knownFailures.includes(code as QuoteFailureCode)) {
    const failure = publicQuoteFailure(code);
    return Object.assign(new Error(failure.message), { code: failure.code });
  }
  const message = response.status === 503 || response.status === 404 ? unavailable ?? 'Servizio AI non disponibile. Bozza intatta; nessun nuovo tentativo automatico.'
    : response.status === 402 ? code === 'payment_method_required'
      ? 'Credito o metodo di pagamento aziendale da verificare. Nessuna proposta applicata.'
      : 'Disponibilità del servizio AI e crediti da verificare. Bozza intatta; nessun nuovo tentativo automatico.'
    : response.status === 401 ? 'Sessione AI scaduta (401): accedi nuovamente. Nessuna modifica alle voci.'
    : response.status === 403 ? 'Non hai il permesso per usare l’AI su questo preventivo. Nessuna proposta applicata.'
    : response.status === 429 ? 'Servizio AI temporaneamente al limite (429). Riprova più tardi; nessuna modifica alle voci.'
    : response.status === 502 ? 'Il servizio AI ha interrotto la conversazione o restituito una risposta non verificabile (502). Bozza intatta; nessun nuovo tentativo automatico. Puoi riprovare con un solo gruppo di voci.'
    : 'Risposta AI non disponibile (' + response.status + '). Nessuna modifica alle voci.';
  return new Error(message);
}

/** Client binding is defense in depth, never a replacement for server tenant,
 * permission and payment checks. No provider keys, redirects or automatic retry.
 */
export function createQuoteChatTransport(options: QuoteChatTransportOptions): QuoteChatTransport {
  const url = configuredQuoteEndpoint(options.backendUrl);
  if (!options.companyId || !options.publishableKey) throw new Error('Azienda o configurazione AI mancante.');
  return async (raw, signal, onProgress) => {
    signal.throwIfAborted();
    const request = readQuoteChatRequest(raw);
    if (request.companyId !== options.companyId) throw new Error('Azienda della richiesta AI non coerente con il preventivo.');
    const token = await options.getToken();
    signal.throwIfAborted();
    if (!token) throw new Error('Accedi nuovamente prima di usare la chat AI.');
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Chat AI oltre il tempo massimo', 'TimeoutError')), 90_000);
    try {
      const res = await (options.fetch ?? fetch)(url.href, { method: 'POST', redirect: 'error', credentials: 'omit', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + token, apikey: options.publishableKey, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(request) });
      if (!res.ok) throw await responseFailure(res, controller.signal, options.unavailableMessage);
      const rawResult = res.headers.get('content-type')?.includes('text/event-stream')
        ? await readQuoteStream(res, request, controller.signal, onProgress)
        : JSON.parse(await quoteResponseText(res, 400_000, controller.signal));
      controller.signal.throwIfAborted();
      const result = readQuoteChatResult(rawResult);
      signal.throwIfAborted();
      if (result.turnId !== request.turnId || result.revision !== request.revision || result.simulated) throw new Error('Risposta non riferita al turno corrente.');
      if (request.advanced && (result.model !== request.advanced.model || !result.usage || result.usage.visionUsed !== !!request.advanced.vision)) throw new Error('Modello o riscontro della lettura visiva non verificabile. Bozza invariata.');
      return result;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  };
}

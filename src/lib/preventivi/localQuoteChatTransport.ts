import { readQuoteChatRequest } from '../../../supabase/functions/_shared/quoteConversation';
import type { QuoteChatTransport } from './quoteChatDocument';
import { createQuoteChatTransport } from './quoteChatTransport';
import { localQuoteEndpoint } from './quoteTransportEndpoint';

/** The laboratory stays isolated even when the production transport exists. */
export function createLocalQuoteChatTransport(options: { endpoint: string; getToken: () => Promise<string | null>; publishableKey: string; fetch?: typeof fetch }): QuoteChatTransport {
  const url = localQuoteEndpoint(options.endpoint);
  const run = createQuoteChatTransport({ ...options, backendUrl: url.origin, companyId: 'd2000000-0000-4000-a000-000000000002',
    unavailableMessage: 'Backend AI locale non attivo. Nessuna proposta applicata.' });
  return async (raw, signal, progress) => {
    signal.throwIfAborted();
    const request = readQuoteChatRequest(raw);
    if (request.companyId !== 'd2000000-0000-4000-a000-000000000002') throw new Error('Prova riservata a Demo Azienda 2.');
    return run(request, signal, progress);
  };
}

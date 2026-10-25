import { consentiSimulazionePreventivoAi } from './localSimulation';
import { createLocalQuoteChatTransport } from './localQuoteChatTransport';
import { createQuoteChatTransport, type QuoteChatTransportOptions } from './quoteChatTransport';
import type { QuoteChatTransport } from './quoteChatDocument';

type Options = QuoteChatTransportOptions & {
  dev: boolean; hostname: string; localEndpoint: string;
  productionEnabled: unknown;
};

/** Wizard and lab share a protocol, not an implicit network fallback.
 * The client flag is only rollout UX; authorization still belongs to the server.
 */
export function createWizardQuoteChatTransport(options: Options): QuoteChatTransport {
  if (consentiSimulazionePreventivoAi(options.dev, options.hostname, options.companyId)) {
    return createLocalQuoteChatTransport({ endpoint: options.localEndpoint,
      getToken: options.getToken, publishableKey: options.publishableKey, fetch: options.fetch });
  }
  if (options.productionEnabled !== 'true') return async (_request, signal) => {
    signal.throwIfAborted();
    throw new Error('Chat AI non ancora abilitata in questo ambiente. Il preventivo originale resta modificabile.');
  };
  return createQuoteChatTransport(options);
}

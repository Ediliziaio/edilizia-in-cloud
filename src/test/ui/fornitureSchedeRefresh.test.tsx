import { act, cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { FinancialRefreshBridge } from '@/components/orders/FinancialRefreshBridge';
import { refreshMaterialQueries } from '@/lib/orders/refreshMaterialQueries';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ effectiveCompany: null }) }));

const channels: Array<{ onmessage: ((event: { data: unknown }) => void) | null }> = [];
const post = vi.fn();
afterEach(() => { cleanup(); vi.unstubAllGlobals(); channels.length = 0; post.mockClear(); });
it('propaga un salvataggio alle altre schede senza rimbalzi o dati personali', () => {
  class Channel {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    constructor() { channels.push(this); }
    postMessage(data: unknown) { post(data); }
    close() {}
  }
  vi.stubGlobal('BroadcastChannel', Channel);
  const client = new QueryClient();
  client.setQueryData(['materiali-per-fase', 'commessa'], ['vecchio']);
  client.setQueryData(['ddt-fatture-collegate', 'ddt'], []);
  client.setQueryData(['calendar'], []);
  render(<QueryClientProvider client={client}><FinancialRefreshBridge /></QueryClientProvider>);
  act(() => channels[0].onmessage?.({ data: { event: 'purchasing' } }));
  expect(client.getQueryState(['materiali-per-fase', 'commessa'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['ddt-fatture-collegate', 'ddt'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['calendar'])?.isInvalidated).toBe(false);
  expect(post).not.toHaveBeenCalled();
  refreshMaterialQueries(client);
  expect(post).toHaveBeenCalledExactlyOnceWith({ event: 'purchasing' });
  client.clear();
});

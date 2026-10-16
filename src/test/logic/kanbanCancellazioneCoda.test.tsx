import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

// Regressione riprodotta in audit: rete simulata, nessun accesso a Supabase.
const audit = vi.hoisted(() => ({ signals: [] as AbortSignal[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: () => ({ abortSignal: (signal: AbortSignal) => {
    audit.signals.push(signal);
    return new Promise<{data: null; error: Error}>(resolve => {
      signal.addEventListener('abort', () => resolve({data: null, error: new Error('abort simulato')}));
    });
  } }),
} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({effectiveCompany: {id: 'audit-company'}}) }));
import { useStageOpportunities } from '@/hooks/useOpportunitiesData';
import { withHeavyDatabaseRead } from '@/lib/limitHeavyReads';

afterEach(() => { cleanup(); vi.useRealTimers(); });
it('annulla le ricerche obsolete e non ritarda la lettura commessa dopo venti cambi filtro', async () => {
  vi.useFakeTimers();
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const wrapper = ({children}: {children: ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({term}: {term: string}) => useStageOpportunities({
    pipelineId: 'audit-pipeline', stageId: 'audit-stage', filtri: {cerca: term},
    sortField: 'created_at', sortDir: 'desc',
  }), {wrapper, initialProps: {term: 'filtro-0'}});
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  for (let i = 1; i < 20; i++) {
    hook.rerender({term: `filtro-${i}`});
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  }
  expect(audit.signals).toHaveLength(20);
  expect(audit.signals.slice(0, -1).every(signal => signal.aborted)).toBe(true);
  hook.unmount();
  expect(audit.signals.every(signal => signal.aborted)).toBe(true);
  let startedAt: number | null = null;
  const requestedAt = Date.now();
  const currentRead = withHeavyDatabaseRead(() => {
    startedAt = Date.now();
    return Promise.resolve('lettura commessa simulata');
  }, 'commessa audit', 1000);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await expect(currentRead).resolves.toBe('lettura commessa simulata');
  expect(audit.signals).toHaveLength(20);
  expect(startedAt! - requestedAt).toBe(0);
  client.clear();
});

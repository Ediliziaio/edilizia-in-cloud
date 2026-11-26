import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { GareJobSession } from './GareJobSession';

const mock = vi.hoisted(() => ({ ai: vi.fn() }));
vi.mock('../WorkspaceContext', () => ({
  useWorkspace: () => ({ api: mock, member: { company_id: 'demo-2' } }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let cache: QueryClient;

function mount() {
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<QueryClientProvider client={cache}><GareJobSession /></QueryClientProvider>));
}

async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  cache?.clear();
  document.body.replaceChildren();
  mock.ai.mockReset();
});

it('se il servizio manca mostra il collegamento in attesa e permette una nuova verifica', async () => {
  mock.ai.mockRejectedValueOnce(Error('Elaborazioni Gare indisponibili'));
  mount();
  await settle();
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Elaborazioni automatiche da collegare');
  mock.ai.mockResolvedValue({ available: true });
  act(() => document.querySelector<HTMLButtonElement>('button')!.click());
  await settle();
  expect(mock.ai).toHaveBeenLastCalledWith('status');
  expect(document.querySelector('[role="status"]')).toBeNull();
});

it('se il motore AI risponde indisponibile mantiene l’avviso', async () => {
  mock.ai.mockResolvedValue({ available: false });
  mount();
  await settle();
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Gare, fascicolo e documenti disponibili');
});

it('con il servizio disponibile mostra direttamente il fascicolo', async () => {
  mock.ai.mockResolvedValue({ available: true });
  mount();
  await settle();
  expect(document.querySelector('[role="status"]')).toBeNull();
});

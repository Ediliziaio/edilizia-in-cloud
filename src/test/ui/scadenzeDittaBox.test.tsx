/**
 * Il riquadro delle scadenze della ditta in Attività: c'è solo quando serve.
 *
 * Tre modi di sbagliare, tutti e tre fermati qui: mostrarlo a chi poi trova una
 * porta chiusa, mostrarlo quando non c'è niente da fare, e portare da qualche
 * altra parte invece che sulla pagina delle carte.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScadenzeDittaBox } from '@/components/documentiAzienda/ScadenzeDittaBox';

const stato = vi.hoisted(() => ({
  permessi: { isAdmin: true, canViewSettingsProfile: true } as Record<string, boolean>,
  righe: [] as Array<{ stato: string }>,
  letture: [] as unknown[][][],
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ effectiveCompany: { id: 'azienda' } }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => stato.permessi }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabella: string) => {
      const ops: unknown[][] = [['from', tabella]];
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in']) {
        q[m] = (...a: unknown[]) => { ops.push([m, ...a]); return q; };
      }
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        stato.letture.push(ops);
        return Promise.resolve({ data: stato.righe, error: null }).then(ok, ko);
      };
      return q;
    },
  },
}));

const mostra = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ScadenzeDittaBox />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  stato.permessi = { isAdmin: true, canViewSettingsProfile: true };
  stato.righe = [];
  stato.letture = [];
});
afterEach(cleanup);

describe('riquadro «Carte della ditta» in Attività', () => {
  it('con carte scadute: una riga che porta alla pagina delle carte', async () => {
    stato.righe = [{ stato: 'scaduto' }, { stato: 'scaduto' }, { stato: 'in_scadenza' }];
    mostra();
    expect(await screen.findByText('2 carte scadute · 1 in scadenza')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/azienda/impostazioni/documenti-azienda');
  });

  it('con tutto in regola non occupa posto', async () => {
    stato.righe = [];
    const { container } = mostra();
    await waitFor(() => expect(stato.letture.length).toBeGreaterThan(0));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('chi non può aprire le impostazioni non la vede, e non la chiede nemmeno', async () => {
    stato.permessi = { isAdmin: false, canViewSettingsProfile: false };
    stato.righe = [{ stato: 'scaduto' }];
    const { container } = mostra();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(stato.letture).toHaveLength(0);
  });

  it('legge solo lo stato, e solo le carte che contano', async () => {
    stato.righe = [{ stato: 'in_scadenza' }];
    mostra();
    await waitFor(() => expect(stato.letture.length).toBeGreaterThan(0));
    const ops = stato.letture[0];
    expect(ops[0]).toEqual(['from', 'azienda_documenti_stato']);
    expect(ops).toContainEqual(['select', 'stato']);
    expect(ops).toContainEqual(['in', 'stato', ['scaduto', 'in_scadenza']]);
  });
});

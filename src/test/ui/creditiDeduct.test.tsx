import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreditsHistory } from '@/components/credits/CreditsHistory';
const stato = vi.hoisted(() => ({ amount: 1, error: null as Error | null }));
afterEach(() => { cleanup(); stato.amount = 1; stato.error = null; });
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ effectiveCompany: { id: 'demo' } }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
 const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, gte: () => q,
 then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: stato.error, data: [{ id: 'mov', type: 'deduct', amount_eur: stato.amount, created_at: '2026-11-05T09:00:00Z', description: 'Consumo demo' }] }).then(resolve) };
 return q;
} } }));
it('BUG-16: un deduct è presentato come consumo con segno negativo', async () => {
 render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CreditsHistory /></QueryClientProvider>);
 expect(await screen.findByText('Consumo demo')).toBeInTheDocument();
 expect(screen.getByText('Detrazione')).toBeInTheDocument();
 expect(screen.getByText(/Speso/).textContent).toMatch(/Speso.*1[,.]00.*Ricaricato.*0[,.]00/);
});

it('mostra un addebito frazionario senza arrotondarlo a zero', async () => {
 stato.amount = 0.001;
 render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CreditsHistory /></QueryClientProvider>);
 expect(await screen.findByText('-0,001000 €')).toBeInTheDocument();
 expect(screen.getByRole('combobox', {name:'Tipo movimento'})).toBeInTheDocument();
});
it('distingue un errore di lettura da uno storico vuoto', async () => {
 stato.error = new Error('Lettura fallita');
 render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CreditsHistory /></QueryClientProvider>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Impossibile caricare');
 expect(screen.queryByText('Nessun movimento registrato per i filtri selezionati.')).not.toBeInTheDocument();
});

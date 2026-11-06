import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EditorOrdineSection } from '@/pages/azienda/fatturazione/editor/EditorOrdineSection';
const mocks = vi.hoisted(() => ({ link: vi.fn(), links: [] as Array<{ ordine_id: string; ordine: { id: string; order_code: string; description: string; total_amount: number } }> }));
vi.mock('@/hooks/useEffectiveCompanyId', () => ({ useEffectiveCompanyId: () => 'azienda' }));
vi.mock('@/hooks/billing/useFatturaOrdineLink', () => ({
  useOrdiniByFattura: () => ({ data: mocks.links, isLoading: false }),
  useLinkFatturaOrdine: () => ({ mutate: mocks.link }),
  useUnlinkFatturaOrdine: () => ({ mutate: vi.fn() }),
  useSearchOrders: () => ({ data: [] as never[] }),
}));
beforeEach(() => { mocks.links = []; mocks.link.mockClear(); });
function mount(ordine_id?: string, url='/') {
  return render(<MemoryRouter initialEntries={[url]}><EditorOrdineSection state={{ id: 'ddt', ordine_id }} dispatch={vi.fn()} /></MemoryRouter>);
}
describe('commessa di origine del DDT', () => {
  it('mostra il collegamento diretto anche senza riga nella tabella ponte', () => {
    mount('commessa');
    expect(screen.getByRole('link', { name: 'Apri la commessa di origine' })).toHaveAttribute('href', '/azienda/ordini/commessa');
    expect(screen.getByRole('button', { name: 'Collega altro ordine' })).toBeInTheDocument();
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it('non ricrea automaticamente un collegamento diretto già presente', () => {
    mount('commessa', '/?ordine_link=commessa');
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it('non duplica la commessa presente in entrambe le fonti', () => {
    mocks.links = [{ ordine_id: 'commessa', ordine: { id: 'commessa', order_code: 'ORD-1', description: 'Lavori', total_amount: 100 } }];
    mount('commessa');
    expect(screen.queryByText('Apri la commessa di origine')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Apri la commessa collegata' })).toBeInTheDocument();
  });
  it('consente il collegamento quando il documento ne è privo', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Collega un ordine' })).toBeInTheDocument();
  });
});

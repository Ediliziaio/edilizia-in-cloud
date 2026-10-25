import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiSerramentiDraftDialog } from '@/components/serramenti/AiSerramentiDraftDialog';
import type { SrProgettoDetail } from '@/types/serramenti';
import type { SrAiDraftItem, SrAiDraftResult } from '@/lib/serramenti/aiDraft';
const state = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@/lib/serramenti/aiDraft', () => ({ generateSerramentiAiDraft: state.generate, fileToDraftImage: vi.fn() }));
const item: SrAiDraftItem = { id: 'window', tipologia: 'finestra', tipologia_label: 'Finestra PVC', ambiente: 'Camera', quantita: 3, larghezza_mm: 1200, altezza_mm: 1400, prezzo_unitario: 100, prezzo_totale: 1,
  materiale: 'pvc', serie: null, vetro: null, apertura: null, colore_interno: null, colore_esterno: null, family_id: null, family_nome: null, listino_voce_id: null, supplier_catalog_id: null, supplier_product_line_id: null, note: null, confidence: 1, missing_fields: [], warnings: [] };
const result = (items = [item]): SrAiDraftResult => ({ items, warnings: [], questions: [], summary: 'Prova' });
const props = () => ({ open: true, onOpenChange: vi.fn(), progettoId: 'project', detail: { progetto: { cliente_nome: 'Sintetico' } } as SrProgettoDetail, onApproveItem: vi.fn(async () => {}), approving: false });
async function generate() { fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Tre finestre PVC 120x140' } }); fireEvent.click(screen.getByRole('button', { name: 'Analizza e prepara bozza' })); }
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('native Serramenti AI race protection', () => {
  it('recalculates totals and prevents rapid duplicate approvals and closing mid-insert', async () => {
    state.generate.mockResolvedValue(result()); const p = props(); let finish: () => void = () => {};
    p.onApproveItem.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<AiSerramentiDraftDialog {...p} />); await generate(); const button = await screen.findByRole('button', { name: 'Approva e inserisci' });
    act(() => { button.click(); button.click(); }); expect(p.onApproveItem).toHaveBeenCalledTimes(1); expect(p.onApproveItem).toHaveBeenCalledWith(expect.objectContaining({ prezzo_totale: 300 }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Chiudi' })[0]); expect(p.onOpenChange).not.toHaveBeenCalled();
    await act(async () => finish()); expect(await screen.findByRole('button', { name: 'Inserita nel preventivo' })).toBeDisabled();
  });
  it('blocks incomplete fields even if AI reports a complete high-confidence row', async () => {
    state.generate.mockResolvedValue(result([{ ...item, quantita: 0, prezzo_unitario: null }])); render(<AiSerramentiDraftDialog {...props()} />); await generate();
    expect(await screen.findByRole('button', { name: 'Completa prima di inserire' })).toBeDisabled(); expect(screen.getByText(/Quantità intera positiva/)).toBeInTheDocument();
  });
  it('ignores a late analysis after closing rather than displaying stale suggestions', async () => {
    let finish: (r: SrAiDraftResult) => void = () => {}; state.generate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const p = props(); render(<AiSerramentiDraftDialog {...p} />); await generate(); await waitFor(() => expect(state.generate).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole('button', { name: 'Chiudi' })[0]); await act(async () => finish(result()));
    expect(screen.queryByText('Bozza da verificare')).not.toBeInTheDocument(); expect(p.onApproveItem).not.toHaveBeenCalled();
  });
});

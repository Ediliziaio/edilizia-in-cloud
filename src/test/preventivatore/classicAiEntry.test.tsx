import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClassicWizardAiEntry from '@/components/quotes/ClassicWizardAiEntry';
import type { QuoteWizardAiDialogProps } from '@/components/quotes/QuoteWizardAiDialog';
import type { QuoteLivePreviewProps } from '@/components/quotes/QuoteLivePreviewPanel';
import type { QuoteDraft } from '@/lib/preventivi/quoteDraft';
const state = vi.hoisted(() => ({ preview: vi.fn(), seed: vi.fn() }));
vi.mock('@/components/quotes/QuoteLivePreviewPanel', () => ({ QuoteLivePreviewPanel: (props: QuoteLivePreviewProps) => { state.preview(props); return <p>Anteprima classica</p>; } }));
vi.mock('@/components/quotes/QuoteWizardAiDialog', () => ({ default: (props: QuoteWizardAiDialogProps) => { state.seed(props.document); return <section role="dialog">{props.preview(props.document, {})}<button onClick={() => props.onOpenChange(false)}>Scarta prova</button></section>; }, QuoteWizardAiIssue: (): null => null }));
const draft: QuoteDraft = { title: 'Offerta sintetica', prezzoManuale: 12000, prezzoManualeIvaPct: null, items: [{ client_temp_id: 'row', name: 'Lavorazione', description: 'Confermata', quantity: 1, unit_price: 100, unit_of_measure: 'cad', item_type: 'service', item_category: 'posa', vat_rate: 22, discount_percent: 0, prezzo_acquisto: 0, mostra_nel_pdf: true, is_optional: false, sort_order: 0 }] };
const props = { companyId: 'demo', draft, defaultVat: 22, preview: { template: {} } as QuoteLivePreviewProps, onApply: vi.fn() };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('classic AI entry uses the already selected native wizard', () => {
  it('keeps local-only original row identities stable when reopening the same quote', () => {
    const withoutId = { ...draft, items: draft.items!.map(item => ({ ...item, client_temp_id: undefined, id: undefined })) };
    render(<ClassicWizardAiEntry {...props} draft={withoutId} autoOpen />);
    const first = state.seed.mock.calls.at(-1)![0];
    fireEvent.click(screen.getByRole('button', { name: 'Scarta prova' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lavora al preventivo con Silvio AI' }));
    expect(state.seed.mock.calls.at(-1)![0]).toEqual(first);
    expect(withoutId.items[0].client_temp_id).toBeUndefined(); expect(props.onApply).not.toHaveBeenCalled();
  });
  it('opens only on demand in the ordinary quote flow', () => {
    render(<ClassicWizardAiEntry {...props} />); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lavora al preventivo con Silvio AI' })); expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(props.onApply).not.toHaveBeenCalled();
  });
  it('consumes AI entry intent once so returning to the products step does not reopen it', () => {
    function Harness() {
      const [opened, consume] = useState(false), [mounted, setMounted] = useState(true);
      return <><button onClick={() => setMounted(value => !value)}>Cambia passo</button>{mounted && <ClassicWizardAiEntry {...props} autoOpen={!opened} onAutoOpened={() => consume(true)} />}</>;
    }
    render(<Harness />); expect(screen.getByRole('dialog')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Scarta prova' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambia passo' })); fireEvent.click(screen.getByRole('button', { name: 'Cambia passo' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(props.onApply).not.toHaveBeenCalled();
  });
  it('does not display a fixed price as tax-free when only the manual VAT is missing', () => {
    render(<ClassicWizardAiEntry {...props} autoOpen />);
    expect(state.preview).toHaveBeenLastCalledWith(expect.objectContaining({ taxPending: true, manualPrice: true }));
  });
});

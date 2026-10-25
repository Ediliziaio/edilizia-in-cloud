import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { TooltipProvider } from '@/components/ui/tooltip';
import VoceRow from '@/components/bagni/ComputoEditor/VoceRow';
import { ComputoReviewContext } from '@/components/bagni/ComputoEditor/ComputoReviewContext';
import { QuoteBagniPreview } from '@/components/quotes/dev/QuoteBagniPreview';
import { bagniEditorRows, type LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
const company = 'd2000000-0000-4000-a000-000000000002';
const draft: LocalBagniDraft = { modelId: 'completo', clientName: 'Test locale', iva: null, rows: [] };
const proposal = { id: 'floor', title: 'Posa gres', description: '', quantity: null as number | null, unit: 'm²', quantityBasis: 'Da confermare', referenceId: null as string | null };
const doc: ChatDocument = { title: 'Bagno', revision: 1, lines: [{ ...proposal, original: proposal, price: null, manual: false, included: false, reference: null }] };
afterEach(cleanup);
describe('Controlli nativi Bagni in modalità revisione, senza cambiare il wizard', () => {
  it('mostra vuoti i dati mancanti e impedisce la conferma prematura', () => {
    const onChange = vi.fn(); const toggle = vi.fn();
    render(<TooltipProvider><ComputoReviewContext.Provider value={{ included: new Set(), toggle }}><DndContext><SortableContext items={['floor']}>
      <VoceRow voce={bagniEditorRows(doc, company, draft)[0]} onChange={onChange} onDelete={vi.fn()} onDuplicate={vi.fn()} showMargine={false} conCosti={false} />
    </SortableContext></DndContext></ComputoReviewContext.Provider></TooltipProvider>);
    expect(screen.getByRole('spinbutton', { name: 'Quantità Posa gres' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: 'Prezzo Posa gres' })).toHaveValue(null);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText('Da completare')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Prezzo Posa gres' }), { target: { value: '38' } });
    expect(onChange).toHaveBeenCalledWith({ prezzo_unitario: 38 });
  });
  it('lascia il comportamento del wizard invariato fuori dal contesto locale', () => {
    render(<TooltipProvider><DndContext><SortableContext items={['floor']}><VoceRow voce={bagniEditorRows(doc, company)[0]} onChange={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} showMargine={false} conCosti={false} /></SortableContext></DndContext></TooltipProvider>);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton').every(input => (input as HTMLInputElement).value === '0')).toBe(true);
  });
  it('non spaccia IVA sconosciuta per aliquota zero e conserva i centesimi', () => {
    const ready = { ...doc, lines: [{ ...doc.lines[0], quantity: 14, price: 38, included: true }] };
    const { rerender } = render(<QuoteBagniPreview document={ready} draft={draft} companyId={company} companyName="Demo 2" />);
    expect(screen.getByText('Parziale netto · IVA da definire')).toBeInTheDocument();
    expect(screen.queryByText('IVA 0%')).not.toBeInTheDocument();
    rerender(<QuoteBagniPreview document={ready} draft={{ ...draft, iva: 10 }} companyId={company} companyName="Demo 2" />);
    expect(screen.getByText('€ 585,20')).toBeInTheDocument();
    expect(screen.getByText('€ 53,20')).toBeInTheDocument();
  });
});

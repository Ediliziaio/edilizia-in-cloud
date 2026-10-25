import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { QuoteDraft } from '@/lib/preventivi/quoteDraft';
import type { QuoteChatTransport } from '@/lib/preventivi/quoteChatDocument';
import { applyBagniEditorRows, bagniEditorRows, type LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
vi.mock('@/components/quotes/dev/QuoteBagniEditor', () => ({ default: ({ document, draft, companyId, onChange, onBack }: {
  document: ChatDocument; draft: LocalBagniDraft; companyId: string; onChange: (v: ReturnType<typeof applyBagniEditorRows>) => void; onBack: () => void;
}) => <div><button onClick={() => {
  const next = applyBagniEditorRows(document, bagniEditorRows(document, companyId, draft).map(row => ({ ...row, quantita: 14, prezzo_unitario: 38 })), companyId, { ...draft, iva: 10 });
  onChange(applyBagniEditorRows(next.document, bagniEditorRows(next.document, companyId, next.draft), companyId, next.draft, { id: next.document.lines[0].id, included: true }));
}}>Modifica nel computo Bagni</button><button onClick={onBack}>Riprendi chat Bagni</button></div> }));
vi.mock('@/lib/prezzario/queries', () => ({ usePrezzarioFonti: () => ({ data: [] as never[], isFetching: false, error: null as Error | null }) }));
// The real editor's save guard and adapters are tested separately; here test its ownership boundary.
vi.mock('@/pages/azienda/marketing/QuoteBuilder', () => ({ default: ({ localEditor }: { localEditor: { initial: QuoteDraft; onChange: (d: QuoteDraft) => void; onBack: () => void } }) => <div>
  <button onClick={() => localEditor.onChange({ ...localEditor.initial, title: 'Bagno modificato in editor', clientName: 'Cliente sintetico', items: localEditor.initial.items!.map(item => ({ ...item, name: 'Posa gres aggiornata', unit_price: 38, ai_missing_price: false, is_optional: false })) })}>Modifica nell’editor</button>
  <button onClick={localEditor.onBack}>Riprendi chat</button>
</div> }));
import Workspace from '@/components/quotes/dev/QuoteAssistedWorkspace';
afterEach(cleanup);
describe('Flusso scelto prima della chat → voci live → editor → chat', () => {
  it('invia i prezzi e le quantità attuali del computo Bagni al turno successivo', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async request => ({ version: 1, revision: request.revision, turnId: request.turnId, model: 'test', simulated: false, references: [], turn: {
      version: 1, title: 'Bagno prova', message: 'Proposta da completare.', questions: [], warnings: [], searches: [], proposals: request.lines.length ? [] : [{ id: 'floor', title: 'Posa gres bagno', description: 'Sola posa', quantity: 12, unit: 'm²', quantityBasis: 'Utente', referenceId: null }],
    } }));
    render(<Workspace companyId="d2000000-0000-4000-a000-000000000002" flow="bagni:completo" simulated={false} transport={call} onBack={vi.fn()} />);
    const send = (text: string) => { fireEvent.change(screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' }), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Invia messaggio' })); };
    send('Sola posa pavimento bagno, 12 mq, impianti esclusi. Soffitto e terrazzi esclusi.');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Voci del preventivo' })).toHaveTextContent('1'));
    fireEvent.click(screen.getByRole('button', { name: 'Continua nel computo Bagni ↗' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Modifica nel computo Bagni' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Modifica nel computo Bagni' }));
    fireEvent.click(screen.getByRole('button', { name: 'Riprendi chat Bagni' }));
    expect(screen.getByText('€ 585,20')).toBeInTheDocument();
    send('Senza modificare le voci, riepiloga i dati attuali.');
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(call.mock.calls[1][0].lines[0]).toMatchObject({ quantity: 14 });
    expect(call.mock.calls[1][0].context?.brief).toContain('prezzo unitario attuale 38 EUR');
    expect(call.mock.calls[1][0].context?.brief).toContain('IVA 10%');
    expect(call.mock.calls[1][0].context?.protectedLineIds).toContain('floor');
    expect(call.mock.calls[1][0].context?.roomDecisions).toEqual(expect.arrayContaining([expect.objectContaining({ room: 'terrazzi', work: 'ambito', state: 'excluded' })]));
    await waitFor(() => expect(screen.getByLabelText('Valori del computo al momento della risposta')).toHaveTextContent('38,00'));
  });
  it('non propone modelli in chat e sincronizza le modifiche prima del turno successivo', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async request => ({ version: 1, revision: request.revision, turnId: request.turnId, model: 'test', simulated: false, references: [], turn: {
      version: 1, title: 'Bagno prova', message: 'Proposta pronta, prezzo da definire.', questions: [], warnings: [], searches: [], proposals: request.lines.length ? [] : [{ id: 'floor', title: 'Posa gres', description: 'Sola posa', quantity: 12, unit: 'm²', quantityBasis: 'Dichiarazione utente', referenceId: null }],
    } }));
    render(<Workspace companyId="d2000000-0000-4000-a000-000000000002" flow="classico" simulated={false} transport={call} onBack={vi.fn()} />);
    expect(screen.queryByRole('region', { name: 'Modello del preventivo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambia modello' })).not.toBeInTheDocument();
    const send = (text: string) => { fireEvent.change(screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' }), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Invia messaggio' })); };
    send('Sola posa pavimento bagno, 12 mq netti, prezzo da definire');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Proposte non incluse nel parziale' })).toHaveTextContent('Posa gres'));
    expect(screen.getByRole('table')).not.toHaveTextContent('Posa gres');
    fireEvent.click(screen.getByRole('button', { name: 'Continua nell’editor classico ↗' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Modifica nell’editor' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Modifica nell’editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Riprendi chat' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bagno modificato in editor');
    expect(within(screen.getByRole('table')).getByText('Posa gres aggiornata')).toBeInTheDocument();
    expect(screen.getByTestId('live-quote-total')).toHaveTextContent('456,00');
    send('Conserva le mie modifiche. Quale informazione manca?');
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(call.mock.calls[1][0].lines[0]).toMatchObject({ title: 'Posa gres aggiornata', quantity: 12 });
    expect(call.mock.calls[1][0].context?.protectedLineIds).toContain('floor');
  });
});

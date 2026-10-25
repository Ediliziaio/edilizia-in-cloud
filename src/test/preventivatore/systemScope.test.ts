import { describe, expect, it } from 'vitest';
import { updateQuoteScopeFacts, refreshQuoteScopeFacts } from '../../../supabase/functions/_shared/quoteScopeMemory';
import { updateQuoteRoomDecisions, refreshQuoteRoomDecisions, quoteRoomProposalBlocked } from '../../../supabase/functions/_shared/quoteRoomMemory';
import type { QuoteChatProposal } from '../../../supabase/functions/_shared/quoteConversation';
const row = (title: string): QuoteChatProposal => ({ id: 'test', title, description: '', unit: '', quantity: null, quantityBasis: '', referenceId: null });
describe('electrical, plumbing and heating scope must not broaden each other', () => {
  it('heating exclusion does not exclude electrical or plumbing', () => {
    const text = 'Serramenti, impianto termico, terrazzi, giardino e opere strutturali esclusi';
    const memory = updateQuoteRoomDecisions([], text).decisions;
    expect(memory).not.toContainEqual(expect.objectContaining({ work: 'impianti' }));
    expect(memory).toContainEqual(expect.objectContaining({ work: 'impianto_termico', state: 'excluded' }));
    expect(quoteRoomProposalBlocked(row('Rifacimento impianto elettrico'), memory)).toBe(false);
    expect(quoteRoomProposalBlocked(row('Rifacimento impianto idrico'), memory)).toBe(false);
    expect(quoteRoomProposalBlocked(row('Rifacimento impianto termico'), memory)).toBe(true);
  });
  it('exclusion of all systems still applies to each subtype', () => {
    const memory = updateQuoteRoomDecisions([], 'Impianti esclusi').decisions;
    for (const title of ['Impianto termico', 'Impianto elettrico', 'Impianto idrico']) expect(quoteRoomProposalBlocked(row(title), memory)).toBe(true);
  });
  it('a specific explicit exception can reopen electrical without reopening heating', () => {
    const memory = updateQuoteRoomDecisions(updateQuoteRoomDecisions([], 'Impianti esclusi').decisions, 'Includi impianto elettrico').decisions;
    expect(quoteRoomProposalBlocked(row('Impianto elettrico'), memory)).toBe(false); expect(quoteRoomProposalBlocked(row('Impianto termico'), memory)).toBe(true);
  });
  it('upgrades old incorrectly broadened evidence without losing other exclusions', () => {
    const evidence = 'Serramenti, impianto termico, terrazzi e opere strutturali esclusi';
    const memory = refreshQuoteRoomDecisions([{ room: '*', work: 'impianti', state: 'excluded', evidence }, { room: '*', work: 'serramenti', state: 'excluded', evidence }]);
    expect(memory).not.toContainEqual(expect.objectContaining({ work: 'impianti' }));
    expect(memory).toContainEqual(expect.objectContaining({ work: 'impianto_termico' })); expect(memory).toContainEqual(expect.objectContaining({ work: 'serramenti' }));
    expect(refreshQuoteScopeFacts([{ topic: 'impianti', state: 'excluded', evidence }])).toEqual([expect.objectContaining({ topic: 'impianto_termico' })]);
  });
  it('keeps global legacy facts specific too and does not mistake thermal insulation for heating', () => {
    expect(updateQuoteScopeFacts([], 'Impianto termico escluso')).toEqual([expect.objectContaining({ topic: 'impianto_termico' })]);
    expect(updateQuoteRoomDecisions([], 'Isolamento termico escluso').decisions).toEqual([]);
  });
  it('preserving existing rows does not preserve the physical systems named later in the clause', () => {
    const message = 'Includi impianto elettrico; includi impianto idrico; impianto termico escluso. Conserva le sei righe esistenti e aggiungi soltanto due righe per il rifacimento elettrico e idrico';
    const memory = updateQuoteRoomDecisions([], message).decisions;
    for (const work of ['impianto_elettrico', 'impianto_idrico']) expect(memory).toContainEqual(expect.objectContaining({ work, state: 'included' }));
    expect(memory).not.toContainEqual(expect.objectContaining({ state: 'preserved' }));
    const evidence = 'Conserva le sei righe esistenti e aggiungi due righe per elettrico e idrico';
    expect(refreshQuoteRoomDecisions([{ room: '*', work: 'impianto_elettrico', state: 'preserved', evidence }])).toEqual([]);
    expect(refreshQuoteScopeFacts([{ topic: 'impianto_elettrico', state: 'preserved', evidence }])).toEqual([]);
  });
});

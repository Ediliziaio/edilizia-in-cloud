import { describe, expect, it } from 'vitest';
import { refreshQuoteScopeFacts, updateQuoteScopeFacts, quoteTurnIsExplanationOnly } from '../../../supabase/functions/_shared/quoteScopeMemory';
import { refreshQuoteRoomDecisions, updateQuoteRoomDecisions, quoteRoomProposalBlocked } from '../../../supabase/functions/_shared/quoteRoomMemory';
const proposal = (title: string) => ({ id: 'work', title, description: '', unit: 'm²', quantity: 12, quantityBasis: 'Test', referenceId: null as string | null });
describe('Una restrizione si applica alla lavorazione, non alla stanza citata', () => {
  it('non interpreta soffitto e terrazzi come il soffitto dei terrazzi', () => {
    const result = updateQuoteRoomDecisions([], 'Soffitto e terrazzi esclusi');
    expect(result.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ room: '*', work: 'soffitto', state: 'excluded' }),
      expect.objectContaining({ room: 'terrazzi', work: 'ambito', state: 'excluded' }),
    ]));
    expect(result.decisions.some(d => d.room === 'terrazzi' && d.work === 'soffitto')).toBe(false);
    expect(refreshQuoteRoomDecisions([{ room: 'terrazzi', work: 'soffitto', state: 'excluded', evidence: 'Soffitto e terrazzi esclusi' }])).toEqual(expect.arrayContaining([
      expect.objectContaining({ room: 'terrazzi', work: 'ambito', state: 'excluded' }),
      expect.objectContaining({ room: '*', work: 'soffitto', state: 'excluded' }),
    ]));
    expect(quoteTurnIsExplanationOnly('Senza modificare le voci, riepiloga le scelte')).toBe(true);
  });
  it.each([
    'Rinnovo bagno: sola posa pavimento gres, 12 m² netti confermati dall’utente, demolizione e impianti esclusi',
    'Rifai il pavimento del bagno, impianti esclusi',
    'Bagno: posa pavimento da 12 mq, demolizione esclusa',
  ])('non blocca il pavimento o tutto il bagno: %s', text => {
    const { decisions } = updateQuoteRoomDecisions([], text);
    expect(decisions.some(d => d.work === 'ambito' && d.state === 'excluded')).toBe(false);
    expect(quoteRoomProposalBlocked(proposal('Bagno · Posa pavimento'), decisions)).toBe(false);
    expect(quoteRoomProposalBlocked(proposal(text.includes('impianti') ? 'Bagno · Impianti' : 'Bagno · Demolizione'), decisions)).toBe(true);
    expect(quoteRoomProposalBlocked(proposal('Camera · Impianti'), decisions)).toBe(false);
  });
  it.each(['Impianti del bagno esclusi', 'Non rifare gli impianti del bagno', 'Soffitto bagno escluso'])('una specifica opera non esclude tutta la stanza: %s', text => {
    expect(updateQuoteScopeFacts([], text).some(f => f.topic === 'bagno')).toBe(false);
    expect(updateQuoteRoomDecisions([], text).decisions.every(d => d.work !== 'ambito')).toBe(true);
  });
  it('mantiene una lista globale esplicita come lista globale', () => {
    const text = 'Impianti, soffitto, bagno e terrazzi esclusi';
    expect(updateQuoteScopeFacts([], text).map(f => f.topic)).toEqual(expect.arrayContaining(['impianti', 'soffitto', 'bagno', 'terrazzi']));
    expect(updateQuoteRoomDecisions([], text).decisions).toEqual(expect.arrayContaining([expect.objectContaining({ room: 'bagno', work: 'ambito', state: 'excluded' })]));
  });
  it('ripara le vecchie false esclusioni senza eliminare quelle esplicite', () => {
    const evidence = 'Rinnovo bagno: sola posa pavimento gres, demolizione e impianti esclusi';
    expect(refreshQuoteScopeFacts([{ topic: 'bagno', state: 'excluded', evidence }, { topic: 'terrazzi', state: 'excluded', evidence: 'Terrazzi esclusi' }]).map(f => f.topic)).toEqual(['terrazzi']);
    const refreshed = refreshQuoteRoomDecisions([{ room: 'bagno', work: 'pavimento', state: 'excluded', evidence }, { room: 'bagno', work: 'ambito', state: 'excluded', evidence }, { room: 'terrazzi', work: 'ambito', state: 'excluded', evidence: 'Terrazzi esclusi' }]);
    expect(refreshed).toEqual([expect.objectContaining({ room: 'terrazzi', work: 'ambito' })]);
  });
});

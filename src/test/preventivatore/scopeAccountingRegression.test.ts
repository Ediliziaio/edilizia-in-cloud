import { describe, expect, it } from 'vitest';
import { updateQuoteScopeFacts, refreshQuoteScopeFacts } from '../../../supabase/functions/_shared/quoteScopeMemory';
import { updateQuoteRoomDecisions, refreshQuoteRoomDecisions, type QuoteRoomDecision } from '../../../supabase/functions/_shared/quoteRoomMemory';
import { buildQuoteChatContext } from '@/lib/preventivi/quoteChatContext';
import { localSnapshot } from './localPlanFixtures';
const economic = [
  'Cerca riferimenti per le tinteggiature: pittura lavabile su pareti interne e soffitto, preparazione supporti distinta se esclusa',
  'Preparazione supporti e formazione del letto di posa esclusi dal codice del pavimento (quantità null, nessuna demolizione del massetto autorizzata)',
  'La preparazione delle pareti è esclusa dal prezzo della tinteggiatura',
  'Pavimento escluso dal totale del preventivo finché non confermo il prezzo',
  'Demolizione del massetto esclusa',
];
describe('Esclusione dal prezzo non significa esclusione fisica dei lavori', () => {
  it.each(economic)('non crea una decisione di ambito da %s', evidence => {
    expect(updateQuoteScopeFacts([], evidence)).toEqual([]);
    expect(updateQuoteRoomDecisions([], evidence).decisions).toEqual([]);
  });
  it('rimuove solo false decisioni economiche già salvate e mantiene le scelte reali', () => {
    const real: QuoteRoomDecision = { room: '*', work: 'serramenti', state: 'preserved', evidence: 'Serramenti da conservare' };
    expect(refreshQuoteRoomDecisions([{ room: '*', work: 'pavimento', state: 'excluded', evidence: economic[1] }, real])).toEqual([real]);
    expect(refreshQuoteScopeFacts([{ topic: 'soffitto', state: 'excluded', evidence: economic[0] }])).toEqual([]);
  });
  it('non cancella una vera esclusione quando arriva una precisazione sul prezzo', () => {
    const before = updateQuoteRoomDecisions([], 'Pavimento cucina escluso').decisions;
    expect(updateQuoteRoomDecisions(before, economic[1]).decisions).toEqual(before);
    expect(updateQuoteRoomDecisions([], 'Soffitto bagno escluso; includi pavimento bagno').decisions).toMatchObject([
      { room: 'bagno', work: 'soffitto', state: 'excluded' }, { room: 'bagno', work: 'pavimento', state: 'included' },
    ]);
  });
  it('non trasmette vecchie esclusioni economiche all’endpoint precedente', () => {
    const context = buildQuoteChatContext(localSnapshot().document, '', null, [], null, null, [{ topic: 'soffitto', state: 'excluded', evidence: economic[0] }]);
    expect(context.scopeFacts).toEqual([]);
  });
});

import { expect, it } from 'vitest';
import { quoteCompletionReview } from '@/lib/preventivi/quoteCompletionReview';
import { localSnapshot } from './localPlanFixtures';
it('segnala trasporto duplicato, componenti da controllare e quantità mancanti senza mutare il computo', () => {
  const d = localSnapshot().document; d.title = 'Bagno completo';
  const row = d.lines[0]; d.lines = [{ ...row, id: 'demolizione', title: 'Rimozione pavimento', reference: { id: 'r', sourceId: 's', code: 'test', sourceName: 'test', unit: 'm²', price: 10, description: 'Incluso: carico e trasporto. Escluso: oneri smaltimento.' } }, { ...row, id: 'rifiuti', title: 'Trasporto e conferimento rifiuti', quantity: null, price: null }, { ...row, id: 'wc', title: 'Fornitura WC' }];
  const before = JSON.stringify(d), result = quoteCompletionReview(d);
  expect(result).toContain('Possibile doppio trasporto'); expect(result).toContain('Rubinetteria'); expect(result).toContain('cassetta'); expect(result).toContain('Non valgono zero'); expect(JSON.stringify(d)).toBe(before);
});

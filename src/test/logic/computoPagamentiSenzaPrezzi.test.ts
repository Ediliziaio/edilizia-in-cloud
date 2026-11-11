import { expect, it } from 'vitest';
import { testoPianoPagamenti } from '@/lib/computo/pianoPagamentiPdf';

const rate = [{ descrizione: 'Acconto', quando: 'Alla firma', percentuale: 30, importo: 237.17, imponibile: 194.4, termine: '' }];

it('BUG-35: non espone rate economiche quando gli importi sono nascosti', () => {
  expect(testoPianoPagamenti(rate, true, false)).toBe('');
});
it('mantiene netto e lordo nelle stampe con importi', () => {
  expect(testoPianoPagamenti(rate, true)).toContain('194,40');
  expect(testoPianoPagamenti(rate, true)).toContain('237,17');
});
it('una rata a misura non promette un importo, e la ritenuta si legge per esteso', () => {
  const testo = testoPianoPagamenti(
    [{ descrizione: '1° SAL', quando: 'Al SAL 1', termine: 'a 45 giorni data fattura', percentuale: null, importo: null, aMisura: true, quotaIndicativa: 35 }],
    true, true, { percentuale: 5, totale: 71380.18, svincolo: 'al collaudo' },
  );
  expect(testo).toContain("a misura sull'avanzamento dei lavori (quota indicativa 35%)");
  expect(testo).toContain('a 45 giorni data fattura');
  expect(testo).toContain('ritenuta a garanzia del 5%');
  expect(testo).toContain('71.380,18');
});

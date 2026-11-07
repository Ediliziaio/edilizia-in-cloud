import { expect, it } from 'vitest';
import { testoPianoPagamenti } from '@/lib/computo/pianoPagamentiPdf';
const rate = [{ descrizione: 'Acconto', quando: 'Alla firma', percentuale: 30, importo: 194.4, importoIvato: 237.17, termine: '' }];
it('BUG-35: non espone rate economiche quando gli importi sono nascosti', () => {
  expect(testoPianoPagamenti(rate, true, false)).toBe('');
});
it('mantiene netto e lordo nelle stampe con importi', () => {
  expect(testoPianoPagamenti(rate, true)).toContain('194,40');
  expect(testoPianoPagamenti(rate, true)).toContain('237,17');
});

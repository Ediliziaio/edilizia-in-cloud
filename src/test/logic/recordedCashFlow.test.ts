import { describe, expect, it } from 'vitest';
import { recordedCashFlow } from '@/lib/controlloGestione/recordedCashFlow';
const row = { id: '1', direction: 'entrata', amount: 100, entry_date: '2025-02-01', category: 'Incassi fatture' };
describe('Flusso di cassa registrato', () => {
  it('usa la data effettiva e non inventa il saldo iniziale', () => {
    const result = recordedCashFlow([row, { ...row, id: '2', direction: 'uscita', amount: 20 }], 2025);
    expect(result).toMatchObject({ income: 100, expense: 20, net: 80, count: 2, invalid: 0 });
    expect(result.months[1]).toMatchObject({ income: 100, expense: 20, net: 80 });
    expect(result).not.toHaveProperty('openingBalance');
  });
  it('deduplica la stessa prima nota ma non pagamenti distinti di pari importo', () => {
    expect(recordedCashFlow([row, row, { ...row, id: '2' }], 2025).income).toBe(200);
  });
  it('non conta pagamenti di altri anni', () => {
    expect(recordedCashFlow([row, { ...row, id: 'next', entry_date: '2026-02-01' }], 2025).count).toBe(1);
  });
  it('somma in centesimi senza falsi -0.00001 euro', () => {
    expect(recordedCashFlow([{ ...row, amount: .1 }, { ...row, id: '2', amount: .2 },
      { ...row, id: '3', direction: 'uscita', amount: .3 }], 2025).net).toBe(0);
  });
  it('dati invalidi restano da verificare, non diventano contante inventato', () => {
    expect(recordedCashFlow([{ ...row, entry_date: '2025-02-30' }, { ...row, id: '2', amount: NaN },
      { ...row, id: '3', direction: 'errata' }, { ...row, id: '4', amount: -1 }], 2025))
      .toMatchObject({ count: 0, net: 0, invalid: 4 });
  });
  it('gestisce l’anno bisestile e mesi vuoti', () => {
    const result = recordedCashFlow([{ ...row, entry_date: '2024-02-29' }], 2024);
    expect(result.months).toHaveLength(12);
    expect(result.count).toBe(1);
    expect(result.months[11].net).toBe(0);
  });
});

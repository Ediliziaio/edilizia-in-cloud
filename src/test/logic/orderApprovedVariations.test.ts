import { describe, expect, it } from 'vitest';
import { agreedContractValue, variationStatusLabel } from '@/lib/orders/contractValue';
import { calculateCollectedGrossFromInstallments } from '@/lib/commissions';

describe('contratto e varianti: stesso imponibile per margini e incassi', () => {
  it('la timeline non chiama rifiutata una variante approvata o annullata', () => {
    expect(variationStatusLabel('approvato')).toBe('Approvata');
    expect(variationStatusLabel('annullato')).toBe('Annullata');
    expect(variationStatusLabel('rifiutato')).toBe('Rifiutata');
  });
  it('include solo le variazioni approvate', () => {
    expect(agreedContractValue(86000, [
      { status: 'approvato', impatto_economico: '3500' },
      { status: 'in_attesa', impatto_economico: 9000 },
      { status: 'rifiutato', impatto_economico: 2000 },
    ])).toBe(89500);
  });
  it('non perde il saldo della variante quando si incassa la rata finale', () => {
    const totalAmount = agreedContractValue(86000, [{ status: 'approvato', impatto_economico: 3500 }]);
    const installments = [
      { position: 0, type: 'deposit', amount: 29535, is_paid: true },
      { position: 1, type: 'deposit', amount: 39380, is_paid: true },
      { position: 2, type: 'balance', amount: 29535, is_paid: false },
    ];
    const collected=calculateCollectedGrossFromInstallments({ installments, totalAmount, vatRate: 10, financingCost: 0 });
    expect(collected).toBe(68915);
    expect(Math.round(totalAmount * 1.1 - collected)).toBe(29535);
    expect(calculateCollectedGrossFromInstallments({ installments: installments.map(i=>({...i,is_paid:true})), totalAmount, vatRate: 10, financingCost: 0 })).toBeCloseTo(98450, 2);
  });
  it('gestisce riduzioni approvate e centesimi senza contaminare il contratto base', () => {
    expect(agreedContractValue(1000, [{ status: 'approvato', impatto_economico: -100.35 }])).toBe(899.65);
    expect(agreedContractValue(1000, [])).toBe(1000);
  });
});

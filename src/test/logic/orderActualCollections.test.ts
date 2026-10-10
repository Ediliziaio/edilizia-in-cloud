import { describe, expect, it } from 'vitest';
import { calculateCollectedGrossFromInstallments as collected } from '@/lib/commissions';

describe('actual job cash and multi-SAL plans', () => {
  const base = { totalAmount: 100000, vatRate: 10 };
  it('counts each intermediate balance at its own amount, only the last by difference', () => {
    expect(collected({ ...base, installments: [
      { position: 0, type: 'deposit', amount: 33000, is_paid: true },
      { position: 1, type: 'balance', amount: 44000, is_paid: true },
      { position: 2, type: 'balance', amount: 33000, is_paid: true },
    ] })).toBe(110000);
  });
  it('uses position rather than array order and does not infer an unpaid final SAL', () => {
    expect(collected({ ...base, installments: [
      { position: 2, type: 'balance', amount: 33000, is_paid: false },
      { position: 0, type: 'deposit', amount: 33000, is_paid: true },
      { position: 1, type: 'balance', amount: 44000, is_paid: true },
    ] })).toBe(77000);
  });
  it('includes actual partial invoice cash even though the installment is not fully paid', () => {
    expect(collected({ ...base, installments: [
      { type: 'deposit', amount: 6039, is_paid: true, fattura: { id: 'a', importo_pagato: '6039' } },
      { type: 'balance', amount: 5636.4, is_paid: false, fattura: { id: 'b', importo_pagato: '5636.40' } },
    ] })).toBe(11675.40);
  });
  it('keeps an explicit zero authoritative and counts a linked invoice only once', () => {
    expect(collected({ ...base, installments: [
      { type: 'deposit', amount: 1000, is_paid: true, fattura: { importo_pagato: 0 } },
      { type: 'balance', amount: 1000, is_paid: false, fattura: { id: 'same', importo_pagato: 700 } },
      { type: 'balance', amount: 1000, is_paid: false, fattura: { id: 'same', importo_pagato: 700 } },
    ] })).toBe(700);
  });
  it('keeps legacy financing inclusion opt-in and rounds cent amounts', () => {
    const installments = [{ type: 'deposit', amount: .1, is_paid: true }, { type: 'financing', amount: .2, is_paid: true }];
    expect(collected({ ...base, installments })).toBe(.1);
    expect(collected({ ...base, installments, includeFinancing: true })).toBe(.3);
  });
});

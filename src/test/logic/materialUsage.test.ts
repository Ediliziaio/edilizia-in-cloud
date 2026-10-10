import { describe, it, expect } from 'vitest';
import { materialUsage, type MaterialMovement } from '@/lib/orders/materialUsage';
const move = (id: string, quantity: number, movement_type = 'scarico', unit_cost: number | null = 10): MaterialMovement => ({ id, stock_item_id: 'cement', quantity, movement_type, unit_cost });
const report = (stato = 'approvato', extra = {}) => ({ id: 'report', stato, materiali_usati: [{ stock_item_id: 'cement', quantita: 7, unita: 'sacchi', ...extra }] });
const names = { cement: 'Cemento 25 kg' };
describe('physical material usage', () => {
  it('does not mistake a warehouse withdrawal for consumption', () => {
    expect(materialUsage([move('out', 10)], [], names).rows[0]).toMatchObject({ delivered: 10, used: 0, remaining: 10 });
  });
  it('balances delivered, approved usage and return without adding procurement costs', () => {
    expect(materialUsage([move('out', 10), move('return', 3, 'carico')], [report()], names).rows[0])
      .toMatchObject({ used: 7, returned: 3, remaining: 0, estimatedUsedValue: 70, review: false });
  });
  it('deduplicates rows and ignores unapproved reports', () => {
    const out = move('out', 10); const r = report();
    expect(materialUsage([out, out], [r, r, { ...report('inviato'), id: 'pending' }], names).rows[0].used).toBe(7);
  });
  it('flags over-consumption rather than hiding a negative balance', () => {
    expect(materialUsage([move('out', 5)], [report()], names).rows[0]).toMatchObject({ remaining: -2, review: true, estimatedUsedValue: null });
  });
  it('does not guess SKU identities by name', () => {
    const result = materialUsage([], [{ id: 'r', stato: 'approvato', materiali_usati: [{ nome: 'Cemento', quantita: 5 }] }], names);
    expect(result).toEqual({ rows: [], unlinked: 1 });
  });
  it('uses delivery cost snapshots, not current stock prices', () => {
    expect(materialUsage([move('a', 5, 'scarico', 8), move('b', 5, 'scarico', 12)], [report()], names).rows[0].estimatedUsedValue).toBe(70);
  });
  it('does not invent costs when a snapshot is missing', () => {
    expect(materialUsage([move('out', 10, 'scarico', null)], [report()], names).rows[0].estimatedUsedValue).toBeNull();
  });
  it('flags mixed units, invalid quantities and absent stock identities', () => {
    expect(materialUsage([move('out', 10), move('bad', -1)], [report(), { ...report('approvato', { unita: 'kg', quantita: 1 }), id: 'r2' }], names).rows[0].review).toBe(true);
    expect(materialUsage([move('out', 10)], [], {}).rows[0].review).toBe(true);
  });
});

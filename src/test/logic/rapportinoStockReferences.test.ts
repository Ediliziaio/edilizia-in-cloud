import { describe, expect, it } from 'vitest';
import { buildRapportinoMaterials, restoreRapportinoMaterials } from '@/lib/campo/rapportinoMaterials';
describe('report material identities', () => {
  it('preserves different SKUs on the same bill-of-quantities line when reopened', () => {
    const materials = [
      { nome: 'Cemento', quantita: 3, unita: 'sacchi', order_item_id: 'parent', stock_item_id: 'cement', fase_id: 'phase' },
      { nome: 'Malta', quantita: 2, unita: 'sacchi', order_item_id: 'parent', stock_item_id: 'mortar', fase_id: 'phase' },
    ];
    const restored = restoreRapportinoMaterials(materials);
    expect(Object.keys(restored)).toHaveLength(2);
    expect(buildRapportinoMaterials(restored, ['phase'])).toEqual(materials.map(m => ({ ...m, da_furgone: false })));
  });
  it('retains an explicit stock identity without inventing an order-line identity', () => {
    const restored = restoreRapportinoMaterials([{ nome: 'Colla', quantita: 2, unita: 'kg', stock_item_id: 'glue' }]);
    expect(buildRapportinoMaterials(restored)).toEqual([{ nome: 'Colla', quantita: 2, unita: 'kg', stock_item_id: 'glue', da_furgone: false }]);
  });
  it('does not silently turn a zero reported quantity into a consumed unit', () => {
    const restored = restoreRapportinoMaterials([{ nome: 'Colla', quantita: 0, unita: 'kg' }]);
    expect(() => buildRapportinoMaterials(restored)).toThrow(/quantità/);
  });
  it('keeps legacy order-line selection compatible and does not guess SKU from its name', () => {
    expect(buildRapportinoMaterials({ article: { nome: 'Cemento', quantita: 2, unita: 'sacchi' } })[0])
      .toEqual({ nome: 'Cemento', quantita: 2, unita: 'sacchi', order_item_id: 'article', da_furgone: false });
  });
});

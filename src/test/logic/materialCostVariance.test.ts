import { describe, expect, it } from 'vitest';
import { materialCostVariance } from '@/lib/orders/materialCostVariance';
describe('Scostamento materiali con magazzino', () => {
  it.each([[20555,20030,525],[24727.5,24390,337.5],[17985,17760,225]])('non dichiara risparmio per materiale da scorta', (planned,purchases,warehouse) => {
    expect(materialCostVariance(planned,purchases,warehouse)).toEqual({recorded:planned,amount:0,percent:0});
  });
  it('gestisce una commessa alimentata solo dal magazzino', () => {
    expect(materialCostVariance(100,0,120)).toEqual({recorded:120,amount:20,percent:20});
  });
  it('non divide per zero senza un budget', () => {
    expect(materialCostVariance(0,0,120).percent).toBe(0);
  });
});

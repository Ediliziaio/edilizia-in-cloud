import { describe, it, expect } from 'vitest';
import { nativePdfSnapshot } from '../../../supabase/functions/_shared/nativePdfSnapshot';

describe('native PDF stored snapshots', () => {
  it('reads historical totals and VAT without touching original documents', () => {
    const source = { righe: [{ totale: 122, iva: 22 }], riepilogo_iva: [{ aliquota_iva: '22', imposta: 22 }], totale_documento: 122 };
    expect(nativePdfSnapshot(source).righe[0]).toMatchObject({ totale_riga: 122, imposta: 22 });
    expect(nativePdfSnapshot(source).riepilogo_iva[0].aliquota).toBe('22');
    expect(source.righe[0]).not.toHaveProperty('totale_riga');
    expect(nativePdfSnapshot(source).totale_documento).toBe(122);
  });
  it('preserves canonical zero and does not recalculate issued VAT', () => {
    const result = nativePdfSnapshot({ righe: [{ totale_riga: 0, totale: 122, imposta: 0, iva: 22 }], riepilogo_iva: [{ aliquota: '0', aliquota_iva: '22', imposta: 4825.98 }] });
    expect(result.righe[0].totale_riga).toBe(0);
    expect(result.righe[0].imposta).toBe(0);
    expect(result.riepilogo_iva[0]).toMatchObject({ aliquota: '0', imposta: 4825.98 });
  });
  it('handles null and missing collections', () => {
    expect(nativePdfSnapshot({ righe: null, riepilogo_iva: null })).toMatchObject({ righe: [], riepilogo_iva: [] });
  });
});

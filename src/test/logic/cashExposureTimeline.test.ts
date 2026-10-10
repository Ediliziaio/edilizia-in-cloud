import { describe, expect, it } from 'vitest';
import { cashExposureTimeline } from '@/lib/orders/cashExposureTimeline';
describe('Esposizione giornaliera verificabile', () => {
  it('il picco non dipende dall’ordine arbitrario degli eventi nello stesso giorno', () => {
    const events = [{ date: '2025-02-01', in: 0, out: 100 }, { date: '2025-02-01', in: 80, out: 0 }];
    const forward = cashExposureTimeline(events, '2025-03-01');
    expect(forward.picco).toEqual({ value: -20, date: '2025-02-01' });
    expect(cashExposureTimeline([...events].reverse(), '2025-03-01')).toEqual(forward);
  });
  it('le commesse oltre 36 mesi non perdono gli ultimi pagamenti', () => {
    const result = cashExposureTimeline([{ date: '2020-01-01', in: 100, out: 0 }, { date: '2026-10-01', in: 50, out: 0 }], '2026-10-10');
    expect(result.serieMensile).toHaveLength(24);
    expect(result.serieMensile.at(-1)).toMatchObject({ ym: '2026-10', saldo: 150, entrate: 50 });
    expect(result.serieMensile[0].saldo).toBe(100);
  });
  it('saldi e flussi sono esatti al centesimo', () => {
    const result = cashExposureTimeline([{ date: '2025-01-01', in: .1, out: 0 }, { date: '2025-01-02', in: .2, out: .3 }], '2025-02-01');
    expect(result.saldoOggi).toBe(0);
    expect(result.serieMensile.at(-1)?.saldo).toBe(0);
  });
});

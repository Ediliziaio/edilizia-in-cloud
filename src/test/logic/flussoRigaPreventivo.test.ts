import { describe, it, expect } from 'vitest';
import { segmentoRiga } from '../../../supabase/functions/_shared/flussoRigaPreventivo';

describe('Voce preventivo multipagina senza tagli', () => {
  it('conserva tutte le righe anche con un elemento più lungo di due pagine', () => {
    const righe = Array.from({length: 180}, (_, i) => ({ id: i, h: i % 3 ? 10.2 : 12.4 }));
    const lette: number[] = [];
    let offset = 0;
    while (offset < righe.length) {
      const segmento = righe.slice(offset);
      const n = segmentoRiga(segmento.map(r => r.h), offset ? 640 : 95, 9, 32);
      expect(n).toBeGreaterThan(0);
      expect(18 + segmento.slice(0, n).reduce((s,r) => s+r.h,0)).toBeLessThanOrEqual(offset ? 640 : 95);
      lette.push(...segmento.slice(0,n).map(r=>r.id));
      offset += n;
    }
    expect(lette).toEqual(righe.map(r=>r.id));
  });
  it('chiede una nuova pagina prima di invadere il footer', () => {
    expect(segmentoRiga([12,12], 29, 9, 32)).toBe(0);
    expect(segmentoRiga([12,12], 42, 9, 32)).toBe(2);
  });
  it('rifiuta altezze non finite', () => expect(() => segmentoRiga([NaN],100,9)).toThrow());
});

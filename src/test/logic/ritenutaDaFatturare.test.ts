import {expect,it} from 'vitest';
import {ritenutaAncoraDaFatturare} from '@/lib/orders/ritenutaDaFatturare';
it('fattura unica già completa: lo svincolo non deve proporre una seconda fattura',()=>{
 expect(ritenutaAncoraDaFatturare(100,0,1000,1000)).toBe(0);
});
it('propone solo la garanzia non ancora fatturata, al netto di eventuali svincoli già documentati in fattura',()=>{
 expect(ritenutaAncoraDaFatturare(100,0,1000,900)).toBe(100);
 expect(ritenutaAncoraDaFatturare(100,30,1000,930)).toBe(70);
 expect(ritenutaAncoraDaFatturare(100,0,1000,990)).toBe(10);
});

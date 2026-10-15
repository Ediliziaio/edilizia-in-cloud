import { describe, expect, it } from 'vitest';
import { prezziPerImport } from '@/lib/catalogo/prezziImport';
describe('Prezzi importati senza confondere acquisto e vendita', () => {
  const riga = { name:'Collante', cost:39.935, base_price:60, list_price:65, costo_orario:25, prezzo_orario:40, vat_rate:22 };
  it('mantiene i costi e omette ogni prezzo di vendita senza azzerarlo', () => {
    expect(prezziPerImport(riga,false)).toEqual({...riga,base_price:null,list_price:null,prezzo_orario:null});
    expect(riga.base_price).toBe(60);
  });
  it('importa la vendita solo con scelta esplicita, senza calcolarla dal costo', () => {
    expect(prezziPerImport(riga,true)).toEqual(riga);
    expect(prezziPerImport({cost:100},true)).not.toHaveProperty('list_price');
  });
  it('preserva un costo zero senza convertirlo in valore assente', () => {
    expect(prezziPerImport({cost:0},false).cost).toBe(0);
  });
});

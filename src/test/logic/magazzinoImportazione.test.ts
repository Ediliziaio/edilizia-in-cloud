import { describe, expect, it } from 'vitest';
import { numeroImportazioneMagazzino } from '@/lib/magazzino/numeriImportazione';
import { warehouseResponseVerified } from '@/lib/magazzino/protocolloMovimenti';
describe('Importazione numeri senza moltiplicazioni silenziose',()=>{
 it.each([['12.5',12.5],['12,5',12.5],['1.234,56',1234.56],['0',0],[' 2,75 ',2.75],['1.234',1.234]])('%s conserva il valore %s',(input,value)=>expect(numeroImportazioneMagazzino(input)).toBe(value));
 it.each(['','Infinity','NaN','-1','12x','1,2,3','1.23,45','1e3'])('rifiuta %s',input=>expect(numeroImportazioneMagazzino(input)).toBeNull());
});
it.each(['carico','uscita','reso','transfer','inventory-count','inventory-apply','import','reorder'])('una risposta vuota non conferma %s',operation=>expect(warehouseResponseVerified(operation,{})).toBe(false));

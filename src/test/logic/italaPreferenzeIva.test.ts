import {describe,it,expect} from 'vitest';
import {preferredBillingProvider} from '../../../supabase/functions/_shared/billingProviderPreference';
import {riepilogoPerTrattamentoIva} from '@/lib/fatturazione/riepilogoIva';
describe('Servizio centrale e programma del cliente',()=>{
 it('usa ITALA quando non è disponibile un collegamento diretto',()=>expect(preferredBillingProvider([{provider:'itala',is_active:true},{provider:'fattureincloud',is_active:false}])).toBe('itala'));
 it('preferisce Fatture in Cloud al fallback, anche se ITALA era principale',()=>expect(preferredBillingProvider([{provider:'itala',is_active:true,is_primary:true},{provider:'fattureincloud',is_active:true}])).toBe('fattureincloud'));
 it('rispetta un altro programma diretto già scelto dal cliente',()=>expect(preferredBillingProvider([{provider:'itala',is_active:true},{provider:'aruba',is_active:true,is_primary:true},{provider:'fattureincloud',is_active:true}])).toBe('aruba'));
 it('non sceglie un collegamento disattivato',()=>expect(preferredBillingProvider([{provider:'itala',is_active:false}])).toBeNull());
});
describe('Divisione IVA e operazioni senza addebito',()=>{
 it('tiene distinte aliquote, esenti, non imponibili e reverse charge con note di credito',()=>{
  const result=riepilogoPerTrattamentoIva([{aliquota:'22',imponibile:100,iva:22},{aliquota:'22',imponibile:-10,iva:-2.2},{aliquota:'0',natura:'N4',imponibile:30,iva:0},{aliquota:'0',natura:'N2.2',imponibile:40,iva:0},{aliquota:'0',natura:'N6.3',imponibile:80,iva:0}]);
  expect(result).toHaveLength(4);
  expect(result[0]).toMatchObject({imponibile:90,iva:19.8});
  expect(result.slice(1).map(r=>r.natura)).toEqual(['N4','N2.2','N6.3']);
 });
});

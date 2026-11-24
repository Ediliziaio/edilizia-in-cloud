import { describe,it,expect } from 'vitest';
import { calculateEconomics,cents,decimal,type EconomicInput } from './economics';
const base:EconomicInput={items:[{label:'Lavori ribassabili',amount:'100000.00',discountable:true,industrial_cost:'70000'},{label:'Componente fuori ribasso confermata',amount:'5000',discountable:false,industrial_cost:'3000'}],discount:'10',rounding:'half_up',round_per_line:false,travel:'1000',guarantees:'500',preparation:'500',other_costs:'0',rule_source:'Disciplinare di prova, punto economico'};
describe('offerta economica deterministica',()=>{
 it('applica il ribasso solo alle voci configurate e separa i costi',()=>{const r=calculateEconomics(base);expect(r.offered).toBe('95000.00');expect(r.fixed).toBe('5000.00');expect(r.industrial_cost).toBe('75000.00');expect(r.margin).toBe('20000.00');});
 it('mantiene centesimi esatti anche oltre gli interi sicuri di JavaScript',()=>expect(decimal(cents('9007199254740993.01'))).toBe('9007199254740993.01'));
 it('distingue arrotondamento per voce e sul totale',()=>{const input={...base,discount:'50',items:[{label:'A',amount:'0.01',discountable:true,industrial_cost:'0'},{label:'B',amount:'0.01',discountable:true,industrial_cost:'0'}]};expect(calculateEconomics({...input,round_per_line:true}).offered).toBe('0.02');expect(calculateEconomics({...input,round_per_line:false}).offered).toBe('0.01');});
 it('non mostra un margine completo con costi mancanti',()=>expect(calculateEconomics({...base,travel:''}).margin).toBeNull());
 it('gestisce esplicitamente le regole di arrotondamento',()=>{const input={...base,items:[{label:'A',amount:'0.01',discountable:true,industrial_cost:'0'}],discount:'50'};expect(calculateEconomics({...input,rounding:'down'}).offered).toBe('0.00');expect(calculateEconomics({...input,rounding:'up'}).offered).toBe('0.01');});
 it.each(['-1','101','1e2','10.00001'])('rifiuta un ribasso non valido: %s',discount=>expect(()=>calculateEconomics({...base,discount})).toThrow());
 it('richiede le istruzioni della specifica gara',()=>expect(()=>calculateEconomics({...base,rule_source:''})).toThrow());
});

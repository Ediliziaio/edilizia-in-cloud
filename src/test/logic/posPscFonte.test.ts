import {describe,it,expect,vi}from 'vitest';
import {verificaFontePsc}from '../../../supabase/functions/_shared/posPscFonte';
const r={archivio:'sicurezza_documenti' as const,id:'a',company_id:'c',order_id:'o',titolo:'PSC A',file_name:'a.pdf',file_path:'c/documenti/o/a.pdf',data_documento:'2026-10-27',revisione:'02',sha256:'a'.repeat(64)};
function db(data:unknown,error:unknown=null){const q={select:vi.fn(),eq:vi.fn(),is:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data,error})};for(const k of ['select','eq','is']as const)q[k].mockReturnValue(q);return{from:vi.fn().mockReturnValue(q),q};}
describe('Fonte PSC verificata dal servizio',()=>{
 it('vincola lettura a azienda, commessa, tipo PSC e documento non personale',async()=>{const d=db(r);expect(await verificaFontePsc(d,'c','o',r)).toEqual(r);expect(d.q.eq.mock.calls).toEqual([['company_id','c'],['order_id','o'],['id','a'],['tipo','psc']]);expect(d.q.is).toHaveBeenCalledWith('subappaltatore_id',null);});
 it('respinge un riferimento di un’altra commessa prima di leggere',async()=>{const d=db(r);await expect(verificaFontePsc(d,'c','altro',r)).rejects.toThrow('non appartiene');expect(d.from).not.toHaveBeenCalled();});
 it('non usa un errore come assenza favorevole',async()=>{await expect(verificaFontePsc(db(null,{message:'unavailable'}),'c','o',r)).rejects.toThrow('non verificabile');});
 it('respinge fonte rimossa e metadati cambiati',async()=>{await expect(verificaFontePsc(db(null),'c','o',r)).rejects.toThrow('non più disponibile');await expect(verificaFontePsc(db({...r,titolo:'PSC cambiato'}),'c','o',r)).rejects.toThrow('cambiata');});
 it('confronta anche revisione e data del fascicolo',async()=>{const ref={...r,archivio:'sicurezza_fascicolo' as const};const d=db({...r,data_documento:undefined,data_rilascio:r.data_documento,revisione:'03'});await expect(verificaFontePsc(d,'c','o',ref)).rejects.toThrow('cambiata');});
});

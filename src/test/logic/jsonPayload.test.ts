import {expect,it} from 'vitest';
import {jsonPayload} from '@/lib/jsonPayload';
it('conserva configurazioni annidate e la serializzazione ordinaria dei campi opzionali',()=>{
 const input={title:'Demo',optional:undefined as undefined,date:new Date('2026-11-05T10:00:00Z'),items:[{active:false,amount:1.25}],empty:null as null};
 expect(jsonPayload(input)).toEqual({title:'Demo',date:'2026-11-05T10:00:00.000Z',items:[{active:false,amount:1.25}],empty:null as null});
 expect(input.date).toBeInstanceOf(Date);
});
it('rifiuta valori radice non serializzabili e riferimenti circolari',()=>{
 expect(()=>jsonPayload(undefined)).toThrow();const circular:{self?:unknown}={};circular.self=circular;expect(()=>jsonPayload(circular)).toThrow();
});

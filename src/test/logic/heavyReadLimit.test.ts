import {describe,it,expect,vi} from 'vitest';
import {createReadLimit} from '@/lib/limitHeavyReads';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
describe('concorrenza letture aggregate',()=>{
  it('non avvia più di due letture e riprende in ordine',async()=>{
    const run=createReadLimit(2),started:number[]=[],finish:Array<()=>void>=[];
    const tasks=[0,1,2,3].map(i=>run(()=>new Promise<number>(resolve=>{started.push(i);finish[i]=()=>resolve(i);})));
    await flush();expect(started).toEqual([0,1]);
    finish[0]();await flush();expect(started).toEqual([0,1,2]);
    finish[1]();await flush();expect(started).toEqual([0,1,2,3]);
    finish[2]();finish[3]();expect(await Promise.all(tasks)).toEqual([0,1,2,3]);
  });
  it('annulla una richiesta in attesa senza fare fetch',async()=>{
    const run=createReadLimit(1);let finish!:()=>void;
    const first=run(()=>new Promise<void>(resolve=>{finish=resolve;}));
    const controller=new AbortController(),fetch=vi.fn(()=>Promise.resolve(1));
    const second=run(fetch,controller.signal);const check=expect(second).rejects.toMatchObject({name:'AbortError'});
    controller.abort();await check;await flush();finish();await first;await flush();expect(fetch).not.toHaveBeenCalled();
  });
  it('un errore libera lo slot, non blocca la coda',async()=>{
    const run=createReadLimit(1);
    const fail=expect(run(()=>{throw new Error('errore');})).rejects.toThrow('errore');
    const next=run(()=>Promise.resolve(42));await fail;expect(await next).toBe(42);
  });
});

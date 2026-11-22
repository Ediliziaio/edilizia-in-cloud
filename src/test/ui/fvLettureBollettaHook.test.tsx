import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/fotovoltaico/lettureBolletta',()=>({leggiLettureBollettaFv:mocks.read}));
import {useLettureBollettaFv} from '@/hooks/useLettureBollettaFv';
const row={id:'job1',stato:'in_corso',scade_il:'2099-01-01T00:00:00Z'};
beforeEach(()=>{mocks.read.mockReset().mockResolvedValue([]);});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('riprende lo stato dal server a ogni riapertura, senza consumare crediti AI',async()=>{
 const accept=vi.fn();mocks.read.mockResolvedValue([row]);
 const first=renderHook(()=>useLettureBollettaFv('azienda-a','progetto-a',true,accept));
 await waitFor(()=>expect(first.result.current.jobs).toHaveLength(1));first.unmount();
 mocks.read.mockResolvedValue([{...row,stato:'completata'}]);
 renderHook(()=>useLettureBollettaFv('azienda-a','progetto-a',true,accept));
 await waitFor(()=>expect(accept).toHaveBeenLastCalledWith([expect.objectContaining({stato:'completata'})]));
 expect(mocks.read).toHaveBeenCalledTimes(2);
});
it('un cambio azienda o progetto annulla la lettura precedente e non mostra gli esiti del collega',async()=>{
 let resolveOld!:(rows:unknown[])=>void;
 mocks.read.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue([]);
 const accept=vi.fn();const h=renderHook(({company,project})=>useLettureBollettaFv(company,project,true,accept),{initialProps:{company:'a',project:'p1'}});
 const oldSignal=mocks.read.mock.calls[0][2] as AbortSignal;
 h.rerender({company:'b',project:'p2'});expect(oldSignal.aborted).toBe(true);expect(h.result.current.jobs).toEqual([]);
 await waitFor(()=>expect(accept).toHaveBeenCalledWith([]));
 await act(async()=>{resolveOld([row]);});
 expect(h.result.current.jobs).toEqual([]);expect(accept).not.toHaveBeenCalledWith([row]);
 expect(mocks.read).toHaveBeenLastCalledWith('b','p2',expect.any(AbortSignal));
});
it('interrompe il polling a risultato pronto e libera il timer alla chiusura',async()=>{
 vi.useFakeTimers();mocks.read.mockResolvedValueOnce([row]).mockResolvedValue([{...row,stato:'completata'}]);
 const h=renderHook(()=>useLettureBollettaFv('a','p1',true,()=>{}));
 await act(async()=>{await Promise.resolve();});
 await act(async()=>{await vi.advanceTimersByTimeAsync(3001);});
 expect(mocks.read).toHaveBeenCalledTimes(2);
 await act(async()=>{await vi.advanceTimersByTimeAsync(9000);});expect(mocks.read).toHaveBeenCalledTimes(2);
 h.unmount();expect(vi.getTimerCount()).toBe(0);
});
it('ritenta al ritorno della connessione e mantiene l’errore in italiano',async()=>{
 mocks.read.mockRejectedValueOnce(Error('Network error')).mockResolvedValue([]);
 const h=renderHook(()=>useLettureBollettaFv('a','p1',true,()=>{}));
 await waitFor(()=>expect(h.result.current.errore).toMatch(/Verifica la connessione/));
 act(()=>{window.dispatchEvent(new window.Event('online'));});
 await waitFor(()=>expect(h.result.current.errore).toBe(''));
 expect(mocks.read).toHaveBeenCalledTimes(2);
});

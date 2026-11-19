import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createFinancialLiveRefresh } from "@/lib/finance/financialLiveRefresh";
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
function setup(){
 const state={busy:false,active:true,visible:true,online:true,revision:'one'};
 const read=vi.fn(async()=>state.revision),refresh=vi.fn(async()=>{});
 const q=createFinancialLiveRefresh({busy:()=>state.busy,active:()=>state.active,visible:()=>state.visible,online:()=>state.online,fingerprint:read,refresh});
 return {state,read,refresh,q};
}
it("accorpa raffiche e non ricarica i dati quando l'impronta non cambia",async()=>{
 const {q,read,refresh,state}=setup();for(let n=0;n<30;n++)q.request();
 await vi.advanceTimersByTimeAsync(300);expect(read).toHaveBeenCalledOnce();expect(refresh).toHaveBeenCalledOnce();
 q.request();await vi.advanceTimersByTimeAsync(300);expect(read).toHaveBeenCalledTimes(2);expect(refresh).toHaveBeenCalledOnce();
 state.revision='two';q.request();await vi.advanceTimersByTimeAsync(300);expect(refresh).toHaveBeenCalledTimes(2);q.dispose();
});
it("aspetta fetch e salvataggi in corso senza sovrapporre letture",async()=>{
 const {q,state,read,refresh}=setup();state.busy=true;q.request();await vi.advanceTimersByTimeAsync(1200);
 expect(read).not.toHaveBeenCalled();state.busy=false;await vi.advanceTimersByTimeAsync(300);expect(refresh).toHaveBeenCalledOnce();q.dispose();
});
it("conserva un evento arrivato durante il refetch",async()=>{
 const {q,state,refresh}=setup();let end:()=>void;
 refresh.mockImplementationOnce(()=>new Promise<void>(resolve=>{end=resolve}));
 q.request();await vi.advanceTimersByTimeAsync(300);state.revision='two';q.request();
 end!();await vi.advanceTimersByTimeAsync(300);expect(refresh).toHaveBeenCalledTimes(2);q.dispose();
});
it.each(['visible','online','active'] as const)("non effettua richieste senza %s e recupera al ritorno",async field=>{
 const {q,state,read}=setup();state[field]=false;q.request();await vi.advanceTimersByTimeAsync(5000);expect(read).not.toHaveBeenCalled();
 state[field]=true;q.request();await vi.advanceTimersByTimeAsync(300);expect(read).toHaveBeenCalledOnce();q.dispose();
});
it("un errore di lettura o refetch non rende la revisione falsamente aggiornata",async()=>{
 const {q,read,refresh}=setup();read.mockRejectedValueOnce(new Error('offline'));
 q.request();await vi.advanceTimersByTimeAsync(300);expect(refresh).not.toHaveBeenCalled();
 refresh.mockRejectedValueOnce(new Error('lettura fallita'));q.request();await vi.advanceTimersByTimeAsync(600);
 q.request();await vi.advanceTimersByTimeAsync(1200);expect(refresh).toHaveBeenCalledTimes(2);q.dispose();
});
it("l'uscita dall'azienda impedisce anche il refetch da una richiesta già partita",async()=>{
 const {q,read,refresh}=setup();let end:(v:string)=>void;read.mockImplementationOnce(()=>new Promise<string>(resolve=>{end=resolve}));
 q.request();await vi.advanceTimersByTimeAsync(300);q.dispose();end!('two');await vi.advanceTimersByTimeAsync(1000);expect(refresh).not.toHaveBeenCalled();
});
